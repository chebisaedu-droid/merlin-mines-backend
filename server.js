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

// ➤ PAYMENT: DUAL STK PUSH (The Combat Engine)
app.post('/api/v1/payment/dual-stk', async (req, res) => {
    const { player1, player2, stakeAmount } = req.body;
    
    // 1. Prepare M-Pesa Config
    const token = await getMpesaToken();
    const timestamp = getTimestamp();
    const shortCode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
    const callbackUrl = `${process.env.APP_URL}/api/v1/payment/callback`;

    // 2. Define the STK Payload Builder
    const createStkPayload = (phone) => ({
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: stakeAmount,
        PartyA: phone,
        PartyB: shortCode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl,
        AccountReference: "MERLIN_VS",
        TransactionDesc: "Combat Stake"
    });

    try {
        // 3. FIRE DUAL REQUESTS (Parallel Execution)
        const [p1Response, p2Response] = await Promise.all([
            axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', createStkPayload(player1.phone), { headers: { Authorization: `Bearer ${token}` } }),
            axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', createStkPayload(player2.phone), { headers: { Authorization: `Bearer ${token}` } })
        ]);

        // 4. Create Match ID
        const matchId = "MATCH_" + Date.now();
        
        // Save initial state (In production, save this to DB)
        activeMatches.set(matchId, {
            p1: { phone: player1.phone, paid: false, reqId: p1Response.data.CheckoutRequestID },
            p2: { phone: player2.phone, paid: false, reqId: p2Response.data.CheckoutRequestID },
            stake: stakeAmount * 2
        });

        res.json({ success: true, matchId: matchId, message: "Dual STK Initiated" });

    } catch (error) {
        console.error("STK Fail:", error.response ? error.response.data : error.message);
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
// ➤ GAME LOGIC: RECEIVE MATCH RESULT
app.post('/api/v1/match/result', (req, res) => {
    const { matchId, winner } = req.body; // winner should be 'p1' or 'p2'

    if (!activeMatches.has(matchId)) {
        return res.status(404).json({ success: false, message: "Match not found" });
    }

    const match = activeMatches.get(matchId);
    
    // update the match state
    match.status = "COMPLETED";
    match.winner = winner; // 'p1' or 'p2'
    match.winningPhone = winner === 'p1' ? match.p1.phone : match.p2.phone;
    
    activeMatches.set(matchId, match);

    console.log(`🏆 MATCH ${matchId} FINISHED. Winner: ${match.winningPhone}`);
    res.json({ success: true, message: "Result Saved" });
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
app.get('/api/v1/admin/matches', authenticateAdmin, (req, res) => {
    try {
        // Convert Map to Array for Frontend
        const matchList = Array.from(activeMatches.entries()).map(([id, data]) => ({
            matchId: id,
            status: data.status || "PENDING", // PENDING = Waiting for Payment
            p1: data.p1.phone,
            p1_paid: data.p1.paid,
            p2: data.p2.phone,
            p2_paid: data.p2.paid,
            stake: data.stake,
            timestamp: new Date().toISOString()
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

// ➤ SIMULATION: Create Fake Match (Bypasses Safaricom)
app.post('/api/v1/simulation', (req, res) => {
    const matchId = "SIM_" + Date.now();
    // Default to SILVER (100) if not specified
    const entryFee = req.body.amount || "100"; 
    
    // Create Dummy Data in Memory
    activeMatches.set(matchId, {
        status: "PENDING",
        // Force the structure the Admin Panel expects:
        stake: entryFee,  
        p1: "254700FAKE01", 
        p2: "254700FAKE02",
        winner: null,
        matchId: matchId
    });

    console.log(`✅ SIMULATION CREATED: ${matchId}`);
    res.json({ success: true, matchId: matchId });
});

// ----------------------------------------------------------------
// 5. SERVER START
// ----------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on Port ${PORT}`));
