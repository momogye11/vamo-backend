const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const db = require('../db');

// 📧 Configuration nodemailer
let transporter = null;

// Initialiser le transporteur email
function initializeEmailTransporter() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.log('⚠️ Email credentials not configured');
        return null;
    }

    try {
        transporter = nodemailer.createTransport({
            service: 'gmail', // Vous pouvez changer pour SendGrid, Mailgun, etc.
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });
        console.log('✅ Email transporter initialized');
        return transporter;
    } catch (error) {
        console.error('❌ Error initializing email transporter:', error);
        return null;
    }
}

// Stocker les codes OTP en mémoire (pour production, utiliser Redis ou base de données)
const loginCodes = new Map(); // { email: { code, expires } }

// 📧 Route pour envoyer le code de connexion par email
router.post('/send-login-code', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email requis'
            });
        }

        // Vérifier que c'est l'email admin
        const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@vamo.sn';

        if (email !== ADMIN_EMAIL) {
            return res.status(403).json({
                success: false,
                message: 'Email non autorisé'
            });
        }

        // Générer un code à 6 chiffres
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 5 * 60 * 1000; // Expire dans 5 minutes

        // Stocker le code
        loginCodes.set(email, { code, expires });

        console.log(`🔐 Code de connexion généré pour ${email}: ${code}`);

        // Initialiser le transporteur si pas déjà fait
        if (!transporter) {
            transporter = initializeEmailTransporter();
        }

        // Envoyer l'email
        if (transporter) {
            try {
                await transporter.sendMail({
                    from: `"Vamo Admin" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: '🔐 Code de connexion Vamo Admin',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center;">
                                <h1 style="color: white; margin: 0;">🚗 VAMO</h1>
                                <p style="color: white; margin: 10px 0 0 0;">Dashboard Admin</p>
                            </div>

                            <div style="background: #f9f9f9; padding: 30px; border-radius: 10px; margin-top: 20px;">
                                <h2 style="color: #333; margin-top: 0;">Votre code de connexion</h2>
                                <p style="color: #666; font-size: 16px;">Utilisez le code ci-dessous pour vous connecter au dashboard admin :</p>

                                <div style="background: white; border: 2px solid #C6B383; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
                                    <h1 style="color: #C6B383; font-size: 48px; margin: 0; letter-spacing: 8px;">${code}</h1>
                                </div>

                                <p style="color: #666; font-size: 14px;">
                                    ⏱️ Ce code expire dans <strong>5 minutes</strong>
                                </p>

                                <p style="color: #999; font-size: 12px; margin-top: 30px;">
                                    Si vous n'avez pas demandé ce code, ignorez cet email.
                                </p>
                            </div>

                            <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
                                <p>🔐 Connexion sécurisée - Vamo Admin</p>
                            </div>
                        </div>
                    `
                });

                console.log(`✅ Code envoyé par email à ${email}`);

                res.json({
                    success: true,
                    message: 'Code de connexion envoyé par email',
                    expiresIn: 300 // 5 minutes en secondes
                });
            } catch (emailError) {
                console.error('❌ Erreur envoi email:', emailError);

                // En développement, on peut retourner le code dans la réponse
                if (process.env.NODE_ENV === 'development') {
                    res.json({
                        success: true,
                        message: 'Mode développement - Code disponible dans la console',
                        code: code, // À RETIRER EN PRODUCTION
                        expiresIn: 300
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        message: 'Erreur lors de l\'envoi de l\'email'
                    });
                }
            }
        } else {
            // Si nodemailer n'est pas configuré, on retourne le code en mode dev
            if (process.env.NODE_ENV === 'development') {
                console.log(`🔧 Mode développement - Code: ${code}`);
                res.json({
                    success: true,
                    message: 'Mode développement - Code disponible dans la console',
                    code: code, // À RETIRER EN PRODUCTION
                    expiresIn: 300
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Service email non configuré'
                });
            }
        }
    } catch (error) {
        console.error('❌ Erreur send-login-code:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            error: error.message
        });
    }
});

// 🔐 Route pour vérifier le code de connexion
router.post('/verify-login-code', (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({
                success: false,
                message: 'Email et code requis'
            });
        }

        // Récupérer le code stocké
        const storedData = loginCodes.get(email);

        if (!storedData) {
            return res.status(401).json({
                success: false,
                message: 'Aucun code trouvé pour cet email'
            });
        }

        // Vérifier l'expiration
        if (Date.now() > storedData.expires) {
            loginCodes.delete(email);
            return res.status(401).json({
                success: false,
                message: 'Code expiré. Demandez un nouveau code.'
            });
        }

        // Vérifier le code
        if (storedData.code !== code) {
            return res.status(401).json({
                success: false,
                message: 'Code incorrect'
            });
        }

        // Code valide - Supprimer le code et créer une session
        loginCodes.delete(email);

        // Générer un token simple (comme dans index.js)
        const token = Math.random().toString(36).substring(2) + Date.now().toString(36);

        // Stocker dans les sessions actives (doit être partagé avec index.js)
        // Pour l'instant, on le retourne juste
        const activeSessions = require('../index').activeSessions || new Set();
        activeSessions.add(token);

        // Token expire après 24h
        setTimeout(() => {
            activeSessions.delete(token);
        }, 24 * 60 * 60 * 1000);

        console.log(`✅ Connexion réussie pour ${email}`);

        res.json({
            success: true,
            message: 'Connexion réussie',
            token: token
        });
    } catch (error) {
        console.error('❌ Erreur verify-login-code:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            error: error.message
        });
    }
});

// 🧹 Nettoyer les codes expirés toutes les minutes
setInterval(() => {
    const now = Date.now();
    for (const [email, data] of loginCodes.entries()) {
        if (now > data.expires) {
            loginCodes.delete(email);
            console.log(`🧹 Code expiré supprimé pour ${email}`);
        }
    }
}, 60000); // Chaque minute

module.exports = router;
