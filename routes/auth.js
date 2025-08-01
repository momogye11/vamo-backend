require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('../db');

// Login endpoint that checks both driver and delivery accounts
router.post('/login', async (req, res) => {
    const { phone } = req.body;

    console.log("🔐 Tentative de connexion pour:", phone);

    if (!phone) {
        return res.status(400).json({
            success: false,
            error: 'Numéro de téléphone requis'
        });
    }

    try {
        // Check in Chauffeur table first
        console.log("🚗 Vérification dans la table Chauffeur...");
        const driverResult = await db.query(
            'SELECT id_chauffeur, nom, prenom, telephone, statut_validation, disponibilite FROM Chauffeur WHERE telephone = $1',
            [phone]
        );

        if (driverResult.rowCount > 0) {
            const driver = driverResult.rows[0];
            console.log("✅ Chauffeur trouvé:", driver);

            return res.json({
                success: true,
                message: 'Connexion réussie en tant que chauffeur',
                userType: 'driver',
                data: {
                    id: driver.id_chauffeur,
                    nom: driver.nom,
                    prenom: driver.prenom,
                    telephone: driver.telephone,
                    statut_validation: driver.statut_validation,
                    disponibilite: driver.disponibilite
                }
            });
        }

        // Check in Livreur table
        console.log("🛵 Vérification dans la table Livreur...");
        const deliveryResult = await db.query(
            'SELECT id_livreur, nom, prenom, telephone, type_vehicule, statut_validation, disponibilite FROM Livreur WHERE telephone = $1',
            [phone]
        );

        if (deliveryResult.rowCount > 0) {
            const delivery = deliveryResult.rows[0];
            console.log("✅ Livreur trouvé:", delivery);

            return res.json({
                success: true,
                message: 'Connexion réussie en tant que livreur',
                userType: 'delivery',
                data: {
                    id: delivery.id_livreur,
                    nom: delivery.nom,
                    prenom: delivery.prenom,
                    telephone: delivery.telephone,
                    type_vehicule: delivery.type_vehicule,
                    statut_validation: delivery.statut_validation,
                    disponibilite: delivery.disponibilite
                }
            });
        }

        // No account found
        console.log("❌ Aucun compte trouvé pour:", phone);
        return res.status(404).json({
            success: false,
            error: 'Aucun compte trouvé avec ce numéro de téléphone',
            suggestion: 'Veuillez créer un compte'
        });

    } catch (err) {
        console.error("❌ Erreur lors de la connexion:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Check account status endpoint
router.get('/check/:phone', async (req, res) => {
    const { phone } = req.params;

    try {
        // Check both tables to see if phone number exists
        const driverCheck = await db.query(
            'SELECT telephone, statut_validation FROM Chauffeur WHERE telephone = $1',
            [phone]
        );

        const deliveryCheck = await db.query(
            'SELECT telephone, statut_validation FROM Livreur WHERE telephone = $1',
            [phone]
        );

        let accountType = null;
        let status = null;

        if (driverCheck.rowCount > 0) {
            accountType = 'driver';
            status = driverCheck.rows[0].statut_validation;
        } else if (deliveryCheck.rowCount > 0) {
            accountType = 'delivery';
            status = deliveryCheck.rows[0].statut_validation;
        }

        res.json({
            success: true,
            exists: accountType !== null,
            accountType: accountType,
            status: status
        });

    } catch (err) {
        console.error("❌ Erreur vérification compte:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

module.exports = router;