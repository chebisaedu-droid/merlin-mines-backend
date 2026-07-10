// ================================================================
// 💎 MERLIN MINES | UNIFIED PRODUCTION ENGINE (Version 2.0)
// ================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs'); // Security: Hashing
const nodemailer = require('nodemailer');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // 🛒 SERVES YOUR SHOP FRONTEND

// ----------------------------------------------------------------
// 1. DATABASE CONNECTION & AUTO-INIT
// ----------------------------------------------------------------
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 🛠️ SELF-HEALING: Build Tables on Boot
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50),
                phone VARCHAR(20) UNIQUE,
                email VARCHAR(100) UNIQUE,
                password_hash TEXT,
                balance INTEGER DEFAULT 50,
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS matches (
                match_id VARCHAR(50) PRIMARY KEY,
                p1_phone VARCHAR(20),
                p2_phone VARCHAR(20),
                stake INTEGER,
                status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PAID, ACTIVE
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS payouts (
                id SERIAL PRIMARY KEY,
                user_email VARCHAR(100),
                amount INTEGER,
                status VARCHAR(20) DEFAULT 'PENDING',
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("✅ DATABASE TABLES INITIALIZED");
    } catch (err) {
        console.error("❌ DB INIT ERROR:", err);
    }
};
initDB();

// ----------------------------------------------------------------
// 2. EMAIL SYSTEM (Gmail)
// ----------------------------------------------------------------
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASS }
});
const activeOtps = new Map();

// ----------------------------------------------------------------
// 3. AUTHENTICATION ROUTES (PostgreSQL + Bcrypt)
// ----------------------------------------------------------------

// ➤ REGISTER
app.post('/api/v1/auth/register', async (req, res) => {
    const { name, phone, email, pass } = req.body;
    try {
        // Check existence
        const check = await pool.query('SELECT * FROM users WHERE email = $1 OR phone = $2', [email, phone]);
        if (check.rows.length > 0) return res.status(400).json({ success: false, message: "User already exists" });

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(pass, salt);

        // Save
        await pool.query(
            'INSERT INTO users (name, phone, email, password_hash) VALUES ($1, $2, $3, $4)',
            [name, phone, email, hash]
        );
        res.json({ success: true, message: "Account Created" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// ➤ LOGIN
app.post('/api/v1/auth/login', async (req, res) => {
    const { email, pass } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, message: "User not found" });

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(pass, user.password_hash);
        
        if (!isMatch) return res.status(400).json({ success: false, message: "Invalid Password" });

        // Return clean profile (no password)
        res.json({ success: true, user: { name: user.name, email: user.email, phone: user.phone, balance: user.balance } });
    } catch (err) {
        res.status(500).json({ success: false, message: "Login Failed" });
    }
});

// ➤ FORGOT PASSWORD (OTP)
app.post('/api/v1/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    activeOtps.set(email, { code: otp, expires: Date.now() + 600000 });

    try {
        await transporter.sendMail({
            from: `"ZX SECURITY" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "🔐 RESET CODE",
            text: `Your Code: ${otp}`
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// ➤ RESET PASSWORD
app.post('/api/v1/auth/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    const record = activeOtps.get(email);
    
    if (!record || record.code !== code || Date.now() > record.expires) {
        return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email]);
    activeOtps.delete(email);
    res.json({ success: true });
});

// ----------------------------------------------------------------
// 4. M-PESA DUAL STK ENGINE
// ----------------------------------------------------------------
const getMpesaToken = async () => {
    const auth = Buffer.from(`${process.env.MPESA_KEY}:${process.env.MPESA_SECRET}`).toString('base64');
    const { data } = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
        headers: { Authorization: `Basic ${auth}` }
    });
    return data.access_token;
};

// 🟢 STEP A: INITIATE DUAL PAYMENT
app.post('/api/v1/payment/dual-stk', async (req, res) => {
    const { player1, player2, stakeAmount } = req.body;
    const matchId = "MATCH_" + Date.now();
    const token = await getMpesaToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

    const stkPayload = (phone) => ({
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: 1, // Testing amount
        PartyA: phone,
        PartyB: process.env.MPESA_SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: `${process.env.APP_URL}/api/v1/payment/callback?match_id=${matchId}`,
        AccountReference: "MERLIN",
        TransactionDesc: "Stake"
    });

    try {
        // Save 'PENDING' match to DB first
        await pool.query(
            'INSERT INTO matches (match_id, p1_phone, p2_phone, stake, status) VALUES ($1, $2, $3, $4, $5)',
            [matchId, player1.phone, player2.phone, stakeAmount, 'PENDING']
        );

        // Fire Both STKs
        await Promise.all([
            axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', stkPayload(player1.phone), { headers: { Authorization: `Bearer ${token}` } }),
            axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', stkPayload(player2.phone), { headers: { Authorization: `Bearer ${token}` } })
        ]);

        res.json({ success: true, matchId });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "M-Pesa Trigger Failed" });
    }
});

// 🟢 STEP B: WEBHOOK CALLBACK (Updates DB)
app.post('/api/v1/payment/callback', async (req, res) => {
    const matchId = req.query.match_id;
    console.log(`💰 CALLBACK FOR ${matchId}`, req.body);
    
    // In production: Parse req.body.Body.stkCallback.ResultCode === 0 (Success)
    // For this prototype, we assume success if callback hits.
    
    // Update Match Status to PAID
    await pool.query("UPDATE matches SET status = 'PAID' WHERE match_id = $1", [matchId]);
    
    res.json({ result: "ok" });
});

// 🟢 STEP C: FRONTEND POLLING (Unblur Trigger)
app.get('/api/v1/match/status/:matchId', async (req, res) => {
    try {
        const result = await pool.query('SELECT status FROM matches WHERE match_id = $1', [req.params.matchId]);
        if(result.rows.length > 0) {
            res.json({ status: result.rows[0].status });
        } else {
            res.json({ status: 'UNKNOWN' });
        }
    } catch(err) { res.status(500).json({ status: 'ERROR' }); }
});

// ----------------------------------------------------------------
// 5. SERVER RUNTIME
// ----------------------------------------------------------------
const PORT = process.env.PORT || 3000;
// ----------------------------------------------------------------
// 6. ADMIN DASHBOARD & PAYOUT CONTROLS
// ----------------------------------------------------------------

// 🔒 SECURITY MIDDLEWARE
const authenticateAdmin = (req, res, next) => {
    const key = req.headers['x-master-key'] || req.query.key;
    if (key !== process.env.MASTER_KEY) {
        return res.status(403).json({ success: false, message: "⛔ ACCESS DENIED: INVALID KEY" });
    }
    next();
};

// 📊 GET LIVE STATS
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
        const userCount = await pool.query('SELECT COUNT(*) FROM users');
        const totalCash = await pool.query('SELECT SUM(balance) FROM users');
        const pendingPayouts = await pool.query("SELECT COUNT(*) FROM payouts WHERE status = 'PENDING'");
        
        res.json({
            success: true,
            stats: {
                active_users: parseInt(userCount.rows[0].count),
                total_assets_kes: parseInt(totalCash.rows[0].sum) || 0,
                pending_withdrawals: parseInt(pendingPayouts.rows[0].count)
            }
        });
    } catch (err) { res.status(500).json({ error: "Stats Error" }); }
});

// 📋 GET PENDING PAYOUTS
app.get('/api/admin/payouts', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM payouts WHERE status = 'PENDING' ORDER BY created_at DESC");
        res.json({ success: true, list: result.rows });
    } catch (err) { res.status(500).json({ error: "DB Error" }); }
});

// ✅ APPROVE PAYOUT (Mark as PAID)
app.post('/api/admin/approve-payout', authenticateAdmin, async (req, res) => {
    const { payoutId } = req.body;
    try {
        // Mark as PAID in DB
        await pool.query("UPDATE payouts SET status = 'PAID' WHERE id = $1", [payoutId]);
        res.json({ success: true, message: "Withdrawal Marked as PAID" });
    } catch (err) { res.status(500).json({ error: "Update Failed" }); }
});

// 📉 INITIATE WITHDRAWAL (From User/Shop)
app.post('/api/v1/trade/withdraw', async (req, res) => {
    const { email, amount } = req.body;
    try {
        // 1. Check Balance
        const userRes = await pool.query('SELECT balance FROM users WHERE email = $1', [email]);
        if(userRes.rows.length === 0) return res.status(404).json({message: "User not found"});
        
        const balance = userRes.rows[0].balance;
        if(balance < amount) return res.status(400).json({message: "Insufficient Funds"});

        // 2. Deduct Balance Immediately
        await pool.query('UPDATE users SET balance = balance - $1 WHERE email = $2', [amount, email]);

        // 3. Create Payout Record
        await pool.query('INSERT INTO payouts (user_email, amount) VALUES ($1, $2)', [email, amount]);

        res.json({ success: true, message: "Request Sent to Admin" });
    } catch (err) { res.status(500).json({ message: "Server Error" }); }
});

app.listen(PORT, () => console.log(`🚀 MERLIN ENGINE ACTIVE ON PORT ${PORT}`));
