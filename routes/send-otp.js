require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('../db');
// const verifyPhoneNumber = require('../utils/verifyPhone'); // Removed Numverify dependency

// Initialize Africa's Talking
const AfricasTalking = require('africastalking');

const africasTalking = AfricasTalking({
    apiKey: process.env.AFRICASTALKING_API_KEY,
    username: process.env.AFRICASTALKING_USERNAME, // Use 'sandbox' for testing
});

const sms = africasTalking.SMS;

function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

async function sendSMSviaAfricasTalking(phone, otp) {
    try {
        const options = {
            to: [phone],
            message: `Code de vérification Vamo: ${otp}. Ne partagez ce code avec personne.`,
            from: process.env.AFRICASTALKING_SENDER_ID || null // Optional sender ID
        };

        const result = await sms.send(options);
        console.log('✅ SMS envoyé via Africa\'s Talking:', result);
        
        // Check if SMS was sent successfully
        if (result.SMSMessageData.Recipients.length > 0) {
            const recipient = result.SMSMessageData.Recipients[0];
            if (recipient.statusCode === 101) { // Success code
                return { success: true, messageId: recipient.messageId };
            } else {
                console.log('❌ Erreur envoi SMS:', recipient.status);
                return { success: false, error: recipient.status };
            }
        }
        
        return { success: false, error: 'Aucun destinataire trouvé' };
    } catch (error) {
        console.error('❌ Erreur Africa\'s Talking:', error);
        return { success: false, error: error.message };
    }
}

router.post('/send-otp', async (req, res) => {
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({
            success: false,
            error: "Numéro de téléphone requis"
        });
    }

    const otp = generateOTP();
    const expiration = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    try {
        // Simple phone format validation (Numverify removed)
        if (!phone.match(/^\+221[0-9]{8,9}$/)) {
            console.log("🚫 Format de numéro invalide:", phone);
            return res.status(400).json({
                success: false,
                error: "Format de numéro invalide. Utilisez +221XXXXXXXX"
            });
        }

        // Save OTP to database
        console.log('🔍 About to insert into database:');
        console.log('  📱 Phone:', phone);
        console.log('  🔢 OTP:', otp);
        console.log('  ⏰ Expiration:', expiration);
        
        try {
            const dbResult = await db.query(
                'INSERT INTO otp_codes(phone, code, expires_at) VALUES($1, $2, $3) ON CONFLICT (phone) DO UPDATE SET code = $2, expires_at = $3, created_at = CURRENT_TIMESTAMP RETURNING *',
                [phone, otp, expiration]
            );
            
            console.log('✅ Database insertion successful:', dbResult.rows[0]);
            console.log(`📱 Code OTP généré pour ${phone}: ${otp}`);
        } catch (dbError) {
            console.error('❌ Database insertion failed:', dbError);
            throw dbError; // Re-throw to be caught by outer try-catch
        }

        // Verify the insertion by querying the database
        try {
            const verifyResult = await db.query('SELECT * FROM otp_codes WHERE phone = $1', [phone]);
            console.log('🔍 Verification query result:', verifyResult.rows);
        } catch (verifyError) {
            console.error('❌ Verification query failed:', verifyError);
        }

        // Development mode: return OTP in response
        if (process.env.NODE_ENV === 'development' || true) { // Temporarily enable debug OTP
            return res.json({
                success: true,
                message: "Code généré (mode développement)",
                debug_otp: otp,
                phone: phone
            });
        }

        // Production mode: send actual SMS
        const smsResult = await sendSMSviaAfricasTalking(phone, otp);
        
        if (smsResult.success) {
            res.json({
                success: true,
                message: "Code envoyé par SMS",
                messageId: smsResult.messageId
            });
        } else {
            // If SMS fails, still return success but log the error
            console.log('⚠️ SMS failed but OTP saved:', smsResult.error);
            res.json({
                success: true,
                message: "Code généré (SMS non envoyé)",
                debug_otp: process.env.NODE_ENV === 'development' ? otp : undefined
            });
        }

    } catch (err) {
        console.error("❌ Erreur send-otp:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

module.exports = router;
