// ================================================================
// 💎 MERLIN MINES | SINGLE FILE BACKEND ENGINE (Production Ready)
// ================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const axios = require('axios'); // Requires: npm install axios

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

// Memory cache for OTPs and Active Matches (Temporary storage)
const activeOtps = new Map();
const activeMatches = new Map();

// ----------------------------------------------------------------
// 3. M-PESA UTILITY FUNCTIONS
// ----------------------------------------------------------------
// ==========================================
// 🔐 M-PESA TOKEN GENERATOR (HARDCODED FIX)
// ==========================================
async function getMpesaToken() {
    // 1. HARDCODE YOUR KEYS HERE (Inside the quotes)
    const consumer_key = '3I5pZPogbQuuGvFqebt4CHap1DOQvmanUHNvf7FJpoMU4M1O';
    const consumer_secret = 'BfGLUAVk013wAm1AP520oqkXe9kyMJtaJx9BLnRk0mEP9kFsMwVQxHlAZTIi9Tln';

    // 2. USE SANDBOX URL
    const url = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

    // 3. CREATE AUTH HEADER
    const auth = "Basic " + Buffer.from(consumer_key + ":" + consumer_secret).toString("base64");

    try {
        // 4. REQUEST THE TOKEN
        const response = await axios.get(url, {
            headers: { "Authorization": auth }
        });

        console.log("✅ TOKEN GENERATED:", response.data.access_token);
        return response.data.access_token;

    } catch (error) {
        console.error("❌ TOKEN FAILED:", error.response ? error.response.data : error.message);
        throw error;
    }
}


const getTimestamp = () => {
    const date = new Date();
    return date.toISOString().replace(/[^0-9]/g, '').slice(0, 14);
};

// ----------------------------------------------------------------
// 4. API ROUTES
// ----------------------------------------------------------------

// ➤ HEALTH CHECK
app.get('/', (req, res) => res.send('💎 MERLIN MINES ENGINE ONLINE'));

// ➤ AUTH: FORGOT PASSWORD (EMAIL)
app.post('/api/v1/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    try {
        // Check DB for user
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
// 🧹 PHONE SANITIZER HELPER
const formatPhoneNumber = (phone) => {
    // 1. Remove any spaces, plus signs, or special characters
    let cleaned = phone.toString().replace(/\D/g, '');

    // 2. If it starts with '0', replace with '254' (e.g., 0712 -> 254712)
    if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.substring(1);
    }
    
    // 3. If it starts with '7' or '1', add '254' (e.g., 712 -> 254712)
    if (cleaned.length === 9) {
        cleaned = '254' + cleaned;
    }

    return cleaned;
};

// ➤ PAYMENT: DUAL STK PUSH (The Combat Engine - Nuclear Fix)
app.post('/api/v1/payment/dual-stk', async (req, res) => {
    const { player1, player2, stakeAmount } = req.body;

    // 🧹 STEP 1: SANITIZE INPUTS (Auto-Correct)
    // Even if they typed "0722...", this converts it to "254722..."
    const p1Phone = formatPhoneNumber(player1.phone);
    const p2Phone = formatPhoneNumber(player2.phone);

    // 🛑 VALIDATION: Ensure they are valid Kenya numbers (12 digits)
    if (p1Phone.length !== 12 || p2Phone.length !== 12) {
        return res.status(400).json({ 
            success: false, 
            message: "Invalid Phone Number Format. Use 07... or 254..." 
        });
    }

    console.log(`🔌 PROCESSING MATCH: ${p1Phone} vs ${p2Phone}`);

    // 💰 STEP 2: CALCULATE TIERS & PAYOUTS (For Admin Panel)
    const stake = parseInt(stakeAmount);
    let tier = "BRONZE";
    if (stake === 100) tier = "SILVER";
    if (stake === 200) tier = "GOLD";

    const totalPot = stake * 2;
    const houseFee = totalPot * 0.20; // 20%
    const winnerPayout = totalPot * 0.80; // 80%

    // 🔐 STEP 3: PREPARE MPESA CONFIG (HARDCODED NUCLEAR FIX)
    // We bypass process.env to eliminate variable errors
    try {
        const token = await getMpesaToken();
        
        // ⚠️ HARDCODED SANDBOX VALUES (This Fixes "Wrong Credentials")
        const shortCode = "174379"; 
        const passkey = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
        
        // Inline Timestamp Generation (To ensure format is YYYYMMDDHHmmss)
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        
        const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
        const callbackUrl = `${process.env.APP_URL}/api/v1/payment/callback`;

        // 2. Define the STK Payload Builder
        const createStkPayload = (phone) => ({
            BusinessShortCode: shortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: stakeAmount,
            PartyA: phone,            // <--- USES CLEAN PHONE
            PartyB: shortCode,
            PhoneNumber: phone,       // <--- USES CLEAN PHONE
            CallBackURL: callbackUrl,
            AccountReference: "MERLIN_VS",
            TransactionDesc: "Combat Stake"
        });

        // 3. FIRE DUAL REQUESTS (Parallel Execution)
        const [p1Response, p2Response] = await Promise.all([
            axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', createStkPayload(p1Phone), { headers: { Authorization: `Bearer ${token}` } }),
            axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', createStkPayload(p2Phone), { headers: { Authorization: `Bearer ${token}` } })
        ]);

        // 4. Create Match ID
        const matchId = "MATCH_" + Date.now();
        
        // 5. SAVE TO DB (With Tier Info & Clean Phones)
        activeMatches.set(matchId, {
            status: "PENDING",
            tier: tier,               
            payout: winnerPayout,     
            revenue: houseFee,        
            p1: { phone: p1Phone, paid: false, reqId: p1Response.data.CheckoutRequestID }, 
            p2: { phone: p2Phone, paid: false, reqId: p2Response.data.CheckoutRequestID }, 
            stake: stakeAmount,
            winner: null
        });

        res.json({ success: true, matchId: matchId, message: "Tiered Match Initiated" });

    } catch (error) {
        console.error("STK Fail:", error.response ? error.response.data : error.message);
        // Even if Safaricom fails, we return 500 so the frontend knows
        res.status(500).json({ success: false, message: "M-Pesa Trigger Failed" });
    }
});


// =================================================================
// ➤ PAYMENT: CALLBACK HANDLER (The "Listener")
// =================================================================
app.post('/api/v1/payment/callback', (req, res) => {
    try {
        const callbackData = req.body.Body.stkCallback;
        console.log("💰 CALLBACK RECEIVED:", JSON.stringify(callbackData));

        // 1. EXTRACT CRITICAL DATA
        const checkoutReqId = callbackData.CheckoutRequestID;
        const resultCode = callbackData.ResultCode; // 0 = Success, 1032 = Cancelled

        // 2. FIND THE MATCH THIS PAYMENT BELONGS TO
        // We look through all active matches to find which one has this CheckoutID
        let targetMatchId = null;
        let playerKey = null; // 'p1' or 'p2'

        for (const [matchId, matchData] of activeMatches.entries()) {
            if (matchData.p1.reqId === checkoutReqId) {
                targetMatchId = matchId;
                playerKey = 'p1';
                break;
            }
            if (matchData.p2.reqId === checkoutReqId) {
                targetMatchId = matchId;
                playerKey = 'p2';
                break;
            }
        }

        if (targetMatchId && resultCode === 0) {
            // 3. MARK PLAYER AS PAID
            const match = activeMatches.get(targetMatchId);
            match[playerKey].paid = true;
            match[playerKey].receipt = callbackData.CallbackMetadata?.Item[1]?.Value; // Save M-Pesa Receipt
            
            // Check if BOTH are paid
            if (match.p1.paid && match.p2.paid) {
                match.status = "ACTIVE"; // Game is ready to start!
                console.log(`✅ MATCH ${targetMatchId} IS LIVE! BOTH PAID.`);
            } else {
                console.log(`⚠️ MATCH ${targetMatchId}: Player ${playerKey} Paid. Waiting for opponent.`);
            }

            activeMatches.set(targetMatchId, match); // Update Memory
        } else if (resultCode !== 0) {
            console.log(`❌ PAYMENT CANCELLED for ReqID: ${checkoutReqId}`);
        }

        res.json({ result: "processed" });

    } catch (error) {
        console.error("Callback Error:", error.message);
        res.json({ result: "error" });
    }
});


// =================================================================
// ➤ ADMIN DASHBOARD 
// =================================================================
// ➤ GAME LOGIC: RECEIVE WINNER (The Referee)
// ⚠️ UPDATED URL: Matches your Game Client exactly
app.post('/api/v1/game/end', (req, res) => {
    const { matchId, winner } = req.body; // Expects "p1" or "p2"

    console.log(`🏁 END MATCH REQUEST: ${matchId} | WINNER: ${winner}`);

    if (activeMatches.has(matchId)) {
        const match = activeMatches.get(matchId);
        
        // 1. UPDATE STATUS
        match.status = "COMPLETED";
        match.winner = winner; 
        
        // 2. SAVE UPDATE
        activeMatches.set(matchId, match);

        console.log(`✅ MATCH CLOSED. Winner: ${winner}`);
        res.json({ success: true, message: "Match Closed" });
    } else {
        console.log(`❌ MATCH NOT FOUND: ${matchId}`);
        res.status(404).json({ success: false, message: "Match ID not found" });
    }
});

// 🔒 STRICT ADMIN AUTH MIDDLEWARE
const authenticateAdmin = (req, res, next) => {
    const key = req.headers['x-master-key'] || req.query.key;
    
    // 1. PULL STRICTLY FROM RAILWAY
    const masterKey = process.env.MASTER_KEY;

    // 2. SAFETY CHECK: Did we forget to set it in Railway?
    if (!masterKey) {
        console.error("❌ CRITICAL: MASTER_KEY is missing in Railway Variables!");
        return res.status(500).json({ success: false, message: "Server Configuration Error" });
    }
    
    // 3. COMPARE: What you typed vs. The Railway Secret
    if (key !== masterKey) {
        return res.status(403).json({ success: false, message: "⛔ ACCESS DENIED: Invalid Key" });
    }

    next();
};

// 1. GET ALL MATCHES (For Admin Panel)
// 1. GET ALL MATCHES (For Admin Panel)
app.get('/api/v1/admin/matches', authenticateAdmin, (req, res) => {
    try {
        // Convert Map to Array for Frontend
        const matchList = Array.from(activeMatches.entries()).map(([id, data]) => ({
            // 🆔 ID & Time
            matchId: id,
            timestamp: new Date().toISOString(),

            // 📊 Status & Tier
            status: data.status || "PENDING",
            tier: data.tier || "BRONZE",

            // 👥 Players (Full Objects, so Admin can find .phone)
            p1: data.p1, 
            p2: data.p2,

            // 🏆 Results
            winner: data.winner,     // "p1" or "p2"
            
            // 💰 Money Stats
            payout: data.payout,     // (Liability)
            revenue: data.revenue    // (House Cut)
        }));
        
        res.json({ success: true, matches: matchList });
    } catch (error) {
        console.error("Admin Error:", error);
        res.status(500).json({ success: false, message: "Server Error Fetching Data" });
    }
});

// 2. FORCE CLEAR MATCHES (Reset Button)
app.post('/api/v1/admin/clear', authenticateAdmin, (req, res) => {
    activeMatches.clear();
    res.json({ success: true, message: "⚠️ ALL MATCH DATA CLEARED" });
});

// ----------------------------------------------------------------
// 5. SERVER START
// ----------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on Port ${PORT}`));
