const express = require('express');
const router = express.Router();
const pool = require('../db');
const fs = require('fs');
const path = require('path');

// Endpoint pour ajouter les champs manquants à la table Livraison
router.post('/add-livraison-fields', async (req, res) => {
    try {
        console.log('🔧 Adding missing fields to Livraison table...');
        
        // Ajouter les champs manquants
        await pool.query(`
            ALTER TABLE Livraison 
            ADD COLUMN IF NOT EXISTS distance_km DECIMAL(5, 2),
            ADD COLUMN IF NOT EXISTS duree_estimee_min INTEGER,
            ADD COLUMN IF NOT EXISTS mode_paiement VARCHAR(20) CHECK (mode_paiement IN ('wave', 'orange_money', 'especes')),
            ADD COLUMN IF NOT EXISTS description_colis TEXT,
            ADD COLUMN IF NOT EXISTS date_heure_demande TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        `);
        
        // Mettre à jour les enregistrements existants avec des valeurs par défaut
        await pool.query(`
            UPDATE Livraison 
            SET 
                distance_km = 5.0,
                duree_estimee_min = 15,
                mode_paiement = 'especes',
                description_colis = 'Colis à livrer',
                date_heure_demande = CURRENT_TIMESTAMP
            WHERE distance_km IS NULL
        `);
        
        // Vérifier la structure de la table
        const tableInfo = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'livraison' 
            ORDER BY ordinal_position
        `);
        
        console.log('✅ Successfully added missing fields to Livraison table');
        
        res.json({
            success: true,
            message: 'Champs ajoutés avec succès à la table Livraison',
            tableStructure: tableInfo.rows
        });
        
    } catch (error) {
        console.error('❌ Error adding fields to Livraison table:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint pour mettre un livreur en mode disponible
router.post('/set-livreur-available', async (req, res) => {
    try {
        const { telephone } = req.body;
        
        if (!telephone) {
            return res.status(400).json({
                success: false,
                error: 'Numéro de téléphone requis'
            });
        }
        
        console.log(`🔧 Setting livreur ${telephone} as available...`);
        
        // Mettre le livreur en mode disponible
        const result = await pool.query(`
            UPDATE Livreur 
            SET disponibilite = true 
            WHERE telephone = $1 AND statut_validation = 'approuve'
            RETURNING id_livreur, nom, prenom, telephone, disponibilite
        `, [telephone]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Livreur non trouvé ou non approuvé'
            });
        }
        
        console.log('✅ Livreur set as available:', result.rows[0]);
        
        res.json({
            success: true,
            message: 'Livreur mis en mode disponible',
            livreur: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Error setting livreur as available:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router; 