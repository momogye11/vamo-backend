require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/verify-otp', async (req, res) => {
    const { phone, code } = req.body;

    // Nettoyer le numéro de téléphone (enlever les espaces)
    const cleanPhone = phone.replace(/\s+/g, '');

    console.log("🔍 Tentative de vérification OTP:");
    console.log("  📱 Téléphone reçu:", phone);
    console.log("  📱 Téléphone nettoyé:", cleanPhone);
    console.log("  🔢 Code reçu:", code);

    if (!phone || !code) {
        return res.status(400).json({
            success: false,
            error: 'Numéro de téléphone et code requis'
        });
    }

    try {
        // First, let's see what's in the database
        const allOtpCodes = await db.query('SELECT phone, code, expires_at FROM otp_codes ORDER BY created_at DESC LIMIT 5');
        console.log("🗄️ Derniers codes OTP en base:");
        allOtpCodes.rows.forEach(row => {
            console.log(`  📱 ${row.phone} -> 🔢 ${row.code} (expire: ${row.expires_at})`);
        });

        // Vérifie si le code est valide et non expiré (utilise le numéro nettoyé)
        const result = await db.query(
            'SELECT * FROM otp_codes WHERE phone = $1 AND code = $2 AND expires_at > NOW()',
            [cleanPhone, code]
        );

        console.log(`🔍 Recherche pour phone='${cleanPhone}' et code='${code}' -> ${result.rowCount} résultat(s)`);

        if (result.rowCount === 0) {
            // Let's check if the phone exists with any code
            const phoneCheck = await db.query('SELECT * FROM otp_codes WHERE phone = $1', [cleanPhone]);
            console.log(`📱 Vérification téléphone '${cleanPhone}' -> ${phoneCheck.rowCount} entrée(s) trouvée(s)`);
            
            if (phoneCheck.rowCount > 0) {
                phoneCheck.rows.forEach(row => {
                    const isExpired = new Date(row.expires_at) < new Date();
                    console.log(`  🔢 Code en base: ${row.code}, expiré: ${isExpired}`);
                });
            }

            console.log("❌ Code incorrect ou expiré pour:", cleanPhone);
            return res.status(400).json({
                success: false,
                error: 'Code incorrect ou expiré'
            });
        }

        // Supprime le code utilisé
        await db.query('DELETE FROM otp_codes WHERE phone = $1', [cleanPhone]);

        console.log("✅ OTP vérifié avec succès pour:", cleanPhone);

        res.json({
            success: true,
            message: 'Numéro vérifié avec succès',
            phone: cleanPhone
        });

    } catch (err) {
        console.error("❌ Erreur verify-otp:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

module.exports = router;
