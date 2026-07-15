// ================================================================
// 💎 MERLIN MINES | SINGLE FILE BACKEND ENGINE (Production Ready)
// ================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const axios = require('axios'); 

const app = express();
app.use(express.json());
app.use(cors());

// ----------------------------------------------------------------
// 1. DATABASE CONNECTION (PostgreSQL)
// ----------------------------------------------------------------
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Railway
});

// ----------------------------------------------------------------
// 2. EMAIL CONFIGURATION (Gmail)
// ----------------------------------------------------------------
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASS
    }
});

// Memory cache for OTPs
const activeOtps = new Map();

// ----------------------------------------------------------------
// 3. M-PESA UTILITY FUNCTIONS
// ----------------------------------------------------------------
async function getMpesaToken() {
    // ⚠️ HARDCODED CREDENTIALS (SANDBOX)
    const consumer_key = '3I5pZPogbQuuGvFqebt4CHap1DOQvmanUHNvf7FJpoMU4M1O';
    const consumer_secret = 'BfGLUAVk013wAm1AP520oqkXe9kyMJtaJx9BLnRk0mEP9kFsMwVQxHlAZTIi9Tln';
    const url = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
    const auth = "Basic " + Buffer.from(consumer_key + ":" + consumer_secret).toString("base64");

    try {
        const response = await axios.get(url, { headers: { "Authorization": auth } });
        console.log("✅ TOKEN GENERATED:", response.data.access_token);
        return response.data.access_token;
    } catch (error) {
        console.error("❌ TOKEN FAILED:", error.response ? error.response.data : error.message);
        throw error;
    }
}

// ----------------------------------------------------------------
// 4. API ROUTES
// ----------------------------------------------------------------

// ➤ HEALTH CHECK
app.get('/', (req, res) => res.send('💎 MERLIN MINES ENGINE ONLINE'));

// ➤ AUTH: FORGOT PASSWORD
app.post('/api/v1/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    try {
        const userCheck = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
        if (userCheck.rows.length === 0) return res.status(404).json({ success: false, message: "Email not found" });

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        activeOtps.set(email.toLowerCase(), { code: otpCode, expires: Date.now() + 600000 });

        await transporter.sendMail({
            from: `"ZX SECURITY" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "🔒 RESET CODE",
            text: `Your Security Code: ${otpCode}`
        });
        res.json({ success: true, message: "OTP Sent" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// ➤ AUTH: RESET PASSWORD
app.post('/api/v1/auth/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    const record = activeOtps.get(email.toLowerCase());
    if (!record || record.code !== code || Date.now() > record.expires) {
        return res.status(400).json({ success: false, message: "Invalid or Expired Code" });
    }
    try {
        await pool.query('UPDATE users SET pass = $1 WHERE LOWER(email) = LOWER($2)', [newPassword, email]);
        activeOtps.delete(email.toLowerCase());
        res.json({ success: true, message: "Password Updated" });
    } catch (error) {
        res.status(500).json({ success: false, message: "DB Update Failed" });
    }
});

// ➤ PAYMENT: DUAL STK PUSH (The Fixed Combat Engine)
app.post('/api/v1/payment/dual-stk', async (req, res) => {
    const { player1, player2, stakeAmount } = req.body;

    try {
        // 1. SETUP CREDENTIALS (HARDCODED SANDBOX)
        const token = await getMpesaToken();
        const shortCode = '174379'; 
        const passkey = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        const password = Buffer.from(shortCode + passkey + timestamp).toString('base64');
        
        // ⚠️ CONFIRMED URL
        const callbackUrl = 'https://merlin-backend-production.up.railway.app/api/v1/payment/callback'; 

        const createStkPayload = (phone) => ({
            BusinessShortCode: shortCode, 
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: "1", 
            PartyA: phone, 
            PartyB: shortCode, // ✅ Correct (Paybill)
            PhoneNumber: phone, 
            CallBackURL: callbackUrl,
            AccountReference: "MERLIN_VS",
            TransactionDesc: "Combat Stake"
        });

        // 2. FIRE REQUESTS
        console.log("🔥 FIRING DUAL STK...");
        const [p1Response, p2Response] = await Promise.all([
            axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', createStkPayload(player1.phone), { headers: { Authorization: `Bearer ${token}` } }),
            axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', createStkPayload(player2.phone), { headers: { Authorization: `Bearer ${token}` } })
        ]);

        console.log("✅ DUAL STK SUCCESS");
        res.json({ 
            message: "Combat Initiated", 
            p1: p1Response.data, 
            p2: p2Response.data 
        });

    } catch (error) {
        console.error("❌ STK ERROR:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Payment Failed", details: error.response ? error.response.data : error.message });
    }
});

// ➤ PAYMENT: CALLBACK HANDLER
app.post('/api/v1/payment/callback', (req, res) => {
    console.log("💰 M-Pesa Callback:", JSON.stringify(req.body));
    res.json({ result: "received" });
});

// ----------------------------------------------------------------
// 5. SERVER START
// ----------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on Port ${PORT}`));

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
        //  1. Check Balance
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

app.listen(PORT, () => console.log(`🚀 MERLIN ENGINE RUNNING ON PORT ${PORT}`));
