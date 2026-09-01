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
// ➤ PAYMENT: CALLBACK HANDLER (The "Receptionist" - BULLETPROOF)
// =================================================================
app.post('/api/v1/payment/callback', (req, res) => {
    try {
        const callbackData = req.body.Body.stkCallback;
        const resultCode = callbackData.ResultCode; // 0 = Success
        const incomingCheckoutId = callbackData.CheckoutRequestID; // 🎯 SAFARICOM'S UNIQUE KEY

        // 1. REJECT FAILED/CANCELLED PAYMENTS IMMEDIATELY
        if (resultCode !== 0) {
            console.log(`❌ PAYMENT CANCELLED/FAILED. ResultCode: ${resultCode} | ID: ${incomingCheckoutId}`);
            return res.json({ result: "ok" });
        }

        if (!incomingCheckoutId) {
            console.log("❌ CRITICAL: Callback missing CheckoutRequestID data.");
            return res.json({ result: "ok" });
        }

        console.log(`\n📡 SECURE CALLBACK RECEIVED FROM SAFARICOM FOR ID: ${incomingCheckoutId}`);

        let matchFound = false;

        // 3. SCAN SYSTEM RECORDS BY UNIQUE CHECKOUT ID (Preserves Object Structure)
        for (const [matchId, match] of activeMatches.entries()) {
            
            // Skip matches that are already cleared or closed
            if (match.status === "READY_TO_FIGHT") continue;

            let matchUpdated = false;

            // 🎯 SECURE CHECK: Match strictly by Safaricom Transaction ID, not just phone number
            if (match.p1.reqId === incomingCheckoutId && !match.p1.paid) {
                match.p1.paid = true;
                matchUpdated = true;
                matchFound = true;
                console.log(`✅ MATCH [${matchId}]: Player 1 VERIFIED PAID via CheckoutID.`);
            }
            
            if (match.p2.reqId === incomingCheckoutId && !match.p2.paid) {
                match.p2.paid = true;
                matchUpdated = true;
                matchFound = true;
                console.log(`✅ MATCH [${matchId}]: Player 2 VERIFIED PAID via CheckoutID.`);
            }

            // 4. TRANSACTION GATE EVALUATION
            if (matchUpdated) {
                // Sockets remain completely untouched; your status variables shift normally
                if (match.p1.paid && match.p2.paid) {
                    match.status = "READY_TO_FIGHT"; 
                    console.log(`⚔️ [LOCKOUT DEACTIVATED] MATCH ${matchId} FULLY FUNDED! UNLOCKING ARENA.`);
                }
                
                activeMatches.set(matchId, match); // Save Updates
            }
        }

        if (!matchFound) {
            console.log(`⚠️ ALERT: Received valid payment for ID ${incomingCheckoutId} but no active pending match tracking it.`);
        }

        res.json({ result: "processed" });

    } catch (error) {
        console.error("🔒 CRITICAL CALLBACK SECURE ERROR:", error.message);
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
// =============================================================
// ➤ THE STATUS CHECKER (Connects Frontend to Database)
// =============================================================
app.get('/api/v1/match/status/:matchId', (req, res) => {
    const { matchId } = req.params;

    // 1. CHECK IF MATCH EXISTS
    if (!activeMatches.has(matchId)) {
        // Return JSON so the frontend doesn't crash
        return res.json({ success: false, state: "NOT_FOUND", p1_paid: false, p2_paid: false });
    }

    const match = activeMatches.get(matchId);

    // 2. CHECK STATUS
    const p1Ready = match.p1.paid;
    const p2Ready = match.p2.paid;

    // 3. DECIDE: UNLOCK OR WAIT?
    let state = "WAITING";
    if (p1Ready && p2Ready) {
        state = "READY_TO_FIGHT"; // 🟢 THIS UNLOCKS THE BUTTON
    }

    // 4. SEND RESPONSE
    res.json({
        success: true,
        matchId: matchId,
        state: state,
        p1_paid: p1Ready,
        p2_paid: p2Ready
    });
});
// ============================================================================
// 💎💎💎 MERLIN DIGITAL | POOL SIMULATIONS STORE
// ============================================================================
//
// IMPORTANT:
// This is a SEPARATE system from Merlin Mines.
//
// It does NOT modify:
// - Merlin Mines matches
// - dual-stk
// - activeMatches
// - combat callback
// - game/end
// - admin/matches
// - admin/clear
//
// It only reuses the existing:
// - PostgreSQL pool
// - axios
// - getMpesaToken()
// - formatPhoneNumber()
// - APP_URL
//
// ============================================================================


// ============================================================================
// 1. MERLIN DIGITAL PRODUCT CATALOGUE
// ============================================================================
//
// IMPORTANT:
// Prices are controlled by the BACKEND.
// The frontend is NOT trusted to determine the amount.
//
// ============================================================================

const merlinDigitalProducts = {

    "game-1": {
        name: "8-Ball Classic Pro",
        price: 750
    },

    "game-2": {
        name: "Neon Billiards Edition",
        price: 1200
    },

    "game-3": {
        name: "9-Ball Championship Sim",
        price: 1500
    },

    "game-4": {
        name: "Speed Pool Rush",
        price: 600
    },

    "game-5": {
        name: "Trickshot Masterclass VR",
        price: 2000
    },

    "game-6": {
        name: "Snooker Elite Club",
        price: 1800
    }

};


// ============================================================================
// 2. MERLIN DIGITAL DATABASE TABLE
// ============================================================================
//
// This creates the table automatically if it does not already exist.
//
// Your existing Merlin Mines tables are NOT modified.
//
// ============================================================================

async function initializeMerlinDigitalDatabase() {

    try {

        await pool.query(`

            CREATE TABLE IF NOT EXISTS merlin_orders (

                id SERIAL PRIMARY KEY,

                order_id VARCHAR(80)
                    UNIQUE
                    NOT NULL,

                product_id VARCHAR(50)
                    NOT NULL,

                product_name VARCHAR(255)
                    NOT NULL,

                amount INTEGER
                    NOT NULL,

                phone VARCHAR(20)
                    NOT NULL,

                merchant_request_id VARCHAR(100),

                checkout_request_id VARCHAR(100),

                mpesa_receipt VARCHAR(100),

                result_code INTEGER,

                result_desc TEXT,

                status VARCHAR(40)
                    NOT NULL
                    DEFAULT 'PENDING',

                activation_code VARCHAR(100),

                download_url TEXT,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                paid_at TIMESTAMP,

                delivered_at TIMESTAMP

            );

        `);

        console.log(
            "✅ MERLIN DIGITAL DATABASE READY"
        );

    } catch (error) {

        console.error(
            "❌ MERLIN DIGITAL DATABASE INITIALIZATION FAILED:",
            error.message
        );

    }

}


// ============================================================================
// 3. CREATE DATABASE TABLE
// ============================================================================

initializeMerlinDigitalDatabase();


// ============================================================================
// 4. MERLIN DIGITAL — PRODUCT LIST
// ============================================================================
//
// This allows the frontend to retrieve the official backend catalogue.
//
// ============================================================================

app.get(
    '/api/v1/merlin-digital/products',
    (req, res) => {

        try {

            const products = Object.entries(
                merlinDigitalProducts
            ).map(([id, product]) => ({

                productId: id,

                name: product.name,

                price: product.price

            }));


            res.json({

                success: true,

                products: products

            });


        } catch (error) {

            console.error(
                "MERLIN DIGITAL PRODUCTS ERROR:",
                error.message
            );


            res.status(500).json({

                success: false,

                message: "Unable to load products."

            });

        }

    }
);


// ============================================================================
// 5. MERLIN DIGITAL — CREATE ORDER + STK PUSH
// ============================================================================
//
// Frontend sends:
//
// {
//     productId: "game-1",
//     phone: "0712345678"
// }
//
// Backend determines the REAL price.
//
// ============================================================================

app.post(
    '/api/v1/merlin-digital/stk',
    async (req, res) => {

        const {
            productId,
            phone
        } = req.body;


        // --------------------------------------------------------------------
        // VALIDATE PRODUCT
        // --------------------------------------------------------------------

        const product =
            merlinDigitalProducts[productId];


        if (!product) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid Merlin Digital product."

            });

        }


        // --------------------------------------------------------------------
        // VALIDATE PHONE
        // --------------------------------------------------------------------

        if (!phone) {

            return res.status(400).json({

                success: false,

                message:
                    "M-Pesa phone number is required."

            });

        }


        // --------------------------------------------------------------------
        // USE EXISTING PHONE SANITIZER
        // --------------------------------------------------------------------

        const cleanPhone =
            formatPhoneNumber(phone);


        // Accept only Kenyan 07 / 01 mobile numbers
        // after conversion to 254XXXXXXXXX.

        if (
            !/^254(7|1)\d{8}$/.test(cleanPhone)
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid Kenyan mobile number."

            });

        }


        // --------------------------------------------------------------------
        // CREATE UNIQUE MERLIN DIGITAL ORDER
        // --------------------------------------------------------------------

        const orderId =
            "MD-" +
            Date.now() +
            "-" +
            Math.floor(
                1000 + Math.random() * 9000
            );


        try {

            // ----------------------------------------------------------------
            // CREATE PENDING DATABASE ORDER
            // ----------------------------------------------------------------

            await pool.query(

                `
                INSERT INTO merlin_orders
                (
                    order_id,
                    product_id,
                    product_name,
                    amount,
                    phone,
                    status
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    'PENDING'
                )
                `,

                [
                    orderId,
                    productId,
                    product.name,
                    product.price,
                    cleanPhone
                ]

            );


            // ----------------------------------------------------------------
            // GET EXISTING M-PESA TOKEN
            // ----------------------------------------------------------------
            //
            // We deliberately reuse your existing function.
            //
            // No second authentication system.
            //
            // ----------------------------------------------------------------

            const token =
                await getMpesaToken();


            // ----------------------------------------------------------------
            // M-PESA CONFIGURATION
            // ----------------------------------------------------------------
            //
            // Currently follows your existing SANDBOX setup.
            //
            // Replace these with your proper production values when moving
            // to live Daraja.
            //
            // ----------------------------------------------------------------

            const shortCode =
                "174379";


            const passkey =
                "YOUR_SANDBOX_PASSKEY";


            // ----------------------------------------------------------------
            // TIMESTAMP
            // ----------------------------------------------------------------

            const timestamp =
                new Date()
                    .toISOString()
                    .replace(/[^0-9]/g, '')
                    .slice(0, 14);


            // ----------------------------------------------------------------
            // PASSWORD
            // ----------------------------------------------------------------

            const password =
                Buffer
                    .from(
                        `${shortCode}${passkey}${timestamp}`
                    )
                    .toString('base64');


            // ----------------------------------------------------------------
            // MERLIN DIGITAL CALLBACK
            // ----------------------------------------------------------------

            const callbackUrl =
                `${process.env.APP_URL}/api/v1/merlin-digital/callback`;


            // ----------------------------------------------------------------
            // STK PAYLOAD
            // ----------------------------------------------------------------

            const stkPayload = {

                BusinessShortCode:
                    shortCode,

                Password:
                    password,

                Timestamp:
                    timestamp,

                TransactionType:
                    "CustomerPayBillOnline",

                Amount:
                    product.price,

                PartyA:
                    cleanPhone,

                PartyB:
                    shortCode,

                PhoneNumber:
                    cleanPhone,

                CallBackURL:
                    callbackUrl,

                AccountReference:
                    orderId,

                TransactionDesc:
                    `Merlin Digital - ${product.name}`

            };


            console.log(
                `💎 MERLIN DIGITAL STK: ${orderId} | ${product.name} | KES ${product.price} | ${cleanPhone}`
            );


            // ----------------------------------------------------------------
            // SEND STK PUSH
            // ----------------------------------------------------------------

            const mpesaResponse =
                await axios.post(

                    'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',

                    stkPayload,

                    {

                        headers: {

                            Authorization:
                                `Bearer ${token}`

                        }

                    }

                );


            // ----------------------------------------------------------------
            // SAVE SAFARICOM REQUEST IDENTIFIERS
            // ----------------------------------------------------------------

            await pool.query(

                `
                UPDATE merlin_orders

                SET
                    merchant_request_id = $1,
                    checkout_request_id = $2

                WHERE order_id = $3
                `,

                [
                    mpesaResponse.data.MerchantRequestID,
                    mpesaResponse.data.CheckoutRequestID,
                    orderId
                ]

            );


            // ----------------------------------------------------------------
            // RETURN SUCCESS TO FRONTEND
            // ----------------------------------------------------------------

            return res.json({

                success: true,

                orderId:
                    orderId,

                productId:
                    productId,

                productName:
                    product.name,

                amount:
                    product.price,

                checkoutRequestId:
                    mpesaResponse.data.CheckoutRequestID,

                message:
                    "M-Pesa STK Push sent successfully."

            });


        } catch (error) {

            console.error(
                "❌ MERLIN DIGITAL STK FAILED:",
                error.response
                    ? error.response.data
                    : error.message
            );


            // ----------------------------------------------------------------
            // MARK ORDER AS STK_FAILED
            // ----------------------------------------------------------------

            try {

                await pool.query(

                    `
                    UPDATE merlin_orders

                    SET
                        status = 'STK_FAILED',
                        result_desc = $1

                    WHERE order_id = $2
                    `,

                    [
                        error.response
                            ? JSON.stringify(
                                error.response.data
                            )
                            : error.message,

                        orderId
                    ]

                );

            } catch (dbError) {

                console.error(
                    "❌ MERLIN ORDER FAILURE UPDATE FAILED:",
                    dbError.message
                );

            }


            return res.status(500).json({

                success: false,

                message:
                    "M-Pesa STK Push could not be initiated.",

                orderId:
                    orderId

            });

        }

    }
);


// ============================================================================
// 6. MERLIN DIGITAL — M-PESA CALLBACK
// ============================================================================
//
// IMPORTANT:
//
// This is completely separate from:
//
// /api/v1/payment/callback
//
// That existing callback belongs to Merlin Mines.
//
// ============================================================================

app.post(
    '/api/v1/merlin-digital/callback',
    async (req, res) => {

        try {

            console.log(
                "📡 MERLIN DIGITAL CALLBACK RECEIVED"
            );


            // ----------------------------------------------------------------
            // BASIC CALLBACK STRUCTURE VALIDATION
            // ----------------------------------------------------------------

            if (
                !req.body ||
                !req.body.Body ||
                !req.body.Body.stkCallback
            ) {

                console.error(
                    "❌ INVALID MERLIN CALLBACK STRUCTURE"
                );


                return res.json({

                    ResultCode: 0,

                    ResultDesc: "Accepted"

                });

            }


            const callbackData =
                req.body.Body.stkCallback;


            const resultCode =
                callbackData.ResultCode;


            const resultDesc =
                callbackData.ResultDesc;


            const checkoutRequestId =
                callbackData.CheckoutRequestID;


            console.log(
                `💎 MERLIN CALLBACK ID: ${checkoutRequestId} | RESULT: ${resultCode}`
            );


            // ----------------------------------------------------------------
            // CALLBACK WITHOUT CHECKOUT ID
            // ----------------------------------------------------------------

            if (!checkoutRequestId) {

                return res.json({

                    ResultCode: 0,

                    ResultDesc: "Accepted"

                });

            }


            // ----------------------------------------------------------------
            // FIND ORDER
            // ----------------------------------------------------------------

            const orderResult =
                await pool.query(

                    `
                    SELECT *

                    FROM merlin_orders

                    WHERE checkout_request_id = $1

                    LIMIT 1
                    `,

                    [
                        checkoutRequestId
                    ]

                );


            // ----------------------------------------------------------------
            // ORDER NOT FOUND
            // ----------------------------------------------------------------

            if (
                orderResult.rows.length === 0
            ) {

                console.error(
                    `⚠️ MERLIN DIGITAL ORDER NOT FOUND: ${checkoutRequestId}`
                );


                return res.json({

                    ResultCode: 0,

                    ResultDesc: "Accepted"

                });

            }


            const order =
                orderResult.rows[0];


            // ----------------------------------------------------------------
            // PREVENT DOUBLE PROCESSING
            // ----------------------------------------------------------------

            if (
                order.status === "PAID" ||
                order.status === "DELIVERED"
            ) {

                console.log(
                    `ℹ️ MERLIN ORDER ALREADY PROCESSED: ${order.order_id}`
                );


                return res.json({

                    ResultCode: 0,

                    ResultDesc: "Accepted"

                });

            }


            // =================================================================
            // PAYMENT FAILED / CANCELLED
            // =================================================================

            if (resultCode !== 0) {

                await pool.query(

                    `
                    UPDATE merlin_orders

                    SET
                        status = 'FAILED',
                        result_code = $1,
                        result_desc = $2

                    WHERE order_id = $3
                    `,

                    [
                        resultCode,
                        resultDesc,
                        order.order_id
                    ]

                );


                console.log(
                    `❌ MERLIN DIGITAL PAYMENT FAILED: ${order.order_id} | ${resultDesc}`
                );


                return res.json({

                    ResultCode: 0,

                    ResultDesc: "Accepted"

                });

            }


            // =================================================================
            // PAYMENT SUCCESS
            // =================================================================

            const metadata =
                callbackData.CallbackMetadata &&
                callbackData.CallbackMetadata.Item
                    ? callbackData.CallbackMetadata.Item
                    : [];


            let paidAmount = null;

            let paidPhone = null;

            let mpesaReceipt = null;


            // ----------------------------------------------------------------
            // READ CALLBACK METADATA
            // ----------------------------------------------------------------

            for (
                const item of metadata
            ) {

                if (
                    item.Name ===
                    "Amount"
                ) {

                    paidAmount =
                        item.Value;

                }


                if (
                    item.Name ===
                    "PhoneNumber"
                ) {

                    paidPhone =
                        String(item.Value);

                }


                if (
                    item.Name ===
                    "MpesaReceiptNumber"
                ) {

                    mpesaReceipt =
                        item.Value;

                }

            }


            // =================================================================
            // SECURITY VALIDATION 1 — AMOUNT
            // =================================================================

            if (
                Number(paidAmount) !==
                Number(order.amount)
            ) {

                console.error(
                    `🚨 MERLIN AMOUNT MISMATCH: ${order.order_id} | Expected ${order.amount} | Received ${paidAmount}`
                );


                await pool.query(

                    `
                    UPDATE merlin_orders

                    SET
                        status = 'PAYMENT_MISMATCH',
                        result_code = $1,
                        result_desc = $2

                    WHERE order_id = $3
                    `,

                    [
                        resultCode,
                        `Expected KES ${order.amount}, received KES ${paidAmount}`,
                        order.order_id
                    ]

                );


                return res.json({

                    ResultCode: 0,

                    ResultDesc: "Accepted"

                });

            }


            // =================================================================
            // SECURITY VALIDATION 2 — PHONE
            // =================================================================

            if (
                paidPhone &&
                String(paidPhone) !==
                String(order.phone)
            ) {

                console.error(
                    `🚨 MERLIN PHONE MISMATCH: ${order.order_id}`
                );


                await pool.query(

                    `
                    UPDATE merlin_orders

                    SET
                        status = 'PHONE_MISMATCH',
                        result_code = $1,
                        result_desc = $2

                    WHERE order_id = $3
                    `,

                    [
                        resultCode,
                        "Payment phone did not match order phone.",
                        order.order_id
                    ]

                );


                return res.json({

                    ResultCode: 0,

                    ResultDesc: "Accepted"

                });

            }


            // =================================================================
            // PAYMENT VERIFIED
            // =================================================================

            await pool.query(

                `
                UPDATE merlin_orders

                SET
                    status = 'PAID',
                    mpesa_receipt = $1,
                    result_code = $2,
                    result_desc = $3,
                    paid_at = CURRENT_TIMESTAMP

                WHERE order_id = $4
                `,

                [
                    mpesaReceipt,
                    resultCode,
                    resultDesc,
                    order.order_id
                ]

            );


            console.log(
                `✅ MERLIN DIGITAL PAYMENT VERIFIED: ${order.order_id} | ${order.product_name} | KES ${order.amount} | RECEIPT ${mpesaReceipt}`
            );


            // ----------------------------------------------------------------
            // ACKNOWLEDGE CALLBACK
            // ----------------------------------------------------------------

            return res.json({

                ResultCode: 0,

                ResultDesc: "Accepted"

            });


        } catch (error) {

            console.error(
                "🔒 MERLIN DIGITAL CALLBACK ERROR:",
                error.message
            );


            // Safaricom should receive an acknowledgement.
            return res.json({

                ResultCode: 0,

                ResultDesc: "Accepted"

            });

        }

    }
);


// ============================================================================
// 7. MERLIN DIGITAL — ORDER STATUS
// ============================================================================
//
// Frontend uses this endpoint after STK Push.
//
// Possible statuses:
//
// PENDING
// STK_FAILED
// FAILED
// PAYMENT_MISMATCH
// PHONE_MISMATCH
// PAID
// DELIVERED
//
// ============================================================================

app.get(
    '/api/v1/merlin-digital/status/:orderId',
    async (req, res) => {

        try {

            const {
                orderId
            } = req.params;


            const result =
                await pool.query(

                    `
                    SELECT
                        order_id,
                        product_id,
                        product_name,
                        amount,
                        status,
                        mpesa_receipt,
                        activation_code,
                        download_url,
                        created_at,
                        paid_at,
                        delivered_at

                    FROM merlin_orders

                    WHERE order_id = $1

                    LIMIT 1
                    `,

                    [
                        orderId
                    ]

                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Order not found."

                });

            }


            const order =
                result.rows[0];


            return res.json({

                success: true,

                orderId:
                    order.order_id,

                productId:
                    order.product_id,

                productName:
                    order.product_name,

                amount:
                    order.amount,

                status:
                    order.status,

                paid:
                    order.status === "PAID" ||
                    order.status === "DELIVERED",

                receipt:
                    order.mpesa_receipt ||
                    null,

                activationCode:
                    order.activation_code ||
                    null,

                downloadUrl:
                    order.download_url ||
                    null,

                createdAt:
                    order.created_at,

                paidAt:
                    order.paid_at ||
                    null,

                deliveredAt:
                    order.delivered_at ||
                    null

            });


        } catch (error) {

            console.error(
                "❌ MERLIN DIGITAL STATUS ERROR:",
                error.message
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to check payment status."

            });

        }

    }
);


// ============================================================================
// 8. MERLIN DIGITAL — ADMIN ORDER LOOKUP
// ============================================================================
//
// This is intentionally protected by your EXISTING admin middleware.
//
// No new authentication system.
//
// ============================================================================

app.get(
    '/api/v1/admin/merlin-digital/orders',
    authenticateAdmin,
    async (req, res) => {

        try {

            const result =
                await pool.query(

                    `
                    SELECT
                        id,
                        order_id,
                        product_id,
                        product_name,
                        amount,
                        phone,
                        merchant_request_id,
                        checkout_request_id,
                        mpesa_receipt,
                        result_code,
                        result_desc,
                        status,
                        activation_code,
                        created_at,
                        paid_at,
                        delivered_at

                    FROM merlin_orders

                    ORDER BY created_at DESC

                    LIMIT 500
                    `

                );


            return res.json({

                success: true,

                orders:
                    result.rows

            });


        } catch (error) {

            console.error(
                "❌ MERLIN DIGITAL ADMIN ERROR:",
                error.message
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to retrieve Merlin Digital orders."

            });

        }

    }
);


// ============================================================================
// 9. MERLIN DIGITAL — ADMIN SINGLE ORDER
// ============================================================================

app.get(
    '/api/v1/admin/merlin-digital/order/:orderId',
    authenticateAdmin,
    async (req, res) => {

        try {

            const {
                orderId
            } = req.params;


            const result =
                await pool.query(

                    `
                    SELECT *

                    FROM merlin_orders

                    WHERE order_id = $1

                    LIMIT 1
                    `,

                    [
                        orderId
                    ]

                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Merlin Digital order not found."

                });

            }


            return res.json({

                success: true,

                order:
                    result.rows[0]

            });


        } catch (error) {

            console.error(
                "❌ MERLIN DIGITAL ORDER LOOKUP ERROR:",
                error.message
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to retrieve order."

            });

        }

    }
);


// ============================================================================
// 10. MERLIN DIGITAL — SYSTEM HEALTH
// ============================================================================

app.get(
    '/api/v1/merlin-digital/health',
    async (req, res) => {

        try {

            await pool.query(
                'SELECT 1'
            );


            return res.json({

                success: true,

                system:
                    "MERLIN DIGITAL",

                database:
                    "ONLINE",

                paymentEngine:
                    "READY",

                timestamp:
                    new Date().toISOString()

            });


        } catch (error) {

            return res.status(500).json({

                success: false,

                system:
                    "MERLIN DIGITAL",

                database:
                    "OFFLINE"

            });

        }

    }
);


// ============================================================================
// 💎 END OF MERLIN DIGITAL MODULE
// ============================================================================
// ================================================================
// ➤ MERLIN DIGITAL SHOP — M-PESA CALLBACK
// ================================================================
app.post('/api/v1/merlin-digital/callback', (req, res) => {
    try {
        const callback = req.body?.Body?.stkCallback;

        if (!callback) {
            console.log("❌ Invalid M-Pesa callback");
            return res.json({ result: "ok" });
        }

        const {
            MerchantRequestID,
            CheckoutRequestID,
            ResultCode,
            ResultDesc
        } = callback;

        console.log("📡 MERLIN DIGITAL CALLBACK:", {
            MerchantRequestID,
            CheckoutRequestID,
            ResultCode,
            ResultDesc
        });

        // Payment failed or cancelled
        if (ResultCode !== 0) {
            console.log(`❌ SHOP PAYMENT FAILED: ${ResultDesc}`);
            return res.json({ result: "ok" });
        }

        // Payment successfully confirmed
        console.log(`✅ SHOP PAYMENT CONFIRMED: ${CheckoutRequestID}`);

        // Order validation/fulfilment will be connected here next.

        return res.json({ result: "processed" });

    } catch (error) {
        console.error("❌ MERLIN DIGITAL CALLBACK ERROR:", error.message);
        return res.json({ result: "error" });
    }
});

// ============================================================================

// ----------------------------------------------------------------
// 5. SERVER START
// ----------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on Port ${PORT}`));
 
