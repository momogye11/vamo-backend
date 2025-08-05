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

// Endpoint pour lister tous les livreurs approuvés
router.get('/approved-livreurs', async (req, res) => {
    try {
        console.log('🔍 Fetching all approved livreurs...');
        
        const result = await pool.query(`
            SELECT 
                id_livreur,
                nom,
                prenom,
                telephone,
                type_vehicule,
                statut_validation,
                disponibilite,
                date_creation
            FROM Livreur 
            WHERE statut_validation = 'approuve'
            ORDER BY id_livreur
        `);
        
        console.log(`✅ Found ${result.rowCount} approved livreurs`);
        
        res.json({
            success: true,
            message: `Found ${result.rowCount} approved livreurs`,
            livreurs: result.rows
        });
        
    } catch (error) {
        console.error('❌ Error fetching approved livreurs:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint pour lister tous les chauffeurs approuvés
router.get('/approved-chauffeurs', async (req, res) => {
    try {
        console.log('🔍 Fetching all approved chauffeurs...');
        
        const result = await pool.query(`
            SELECT 
                id_chauffeur,
                nom,
                prenom,
                telephone,
                statut_validation,
                disponibilite,
                date_creation
            FROM Chauffeur 
            WHERE statut_validation = 'approuve'
            ORDER BY id_chauffeur
        `);
        
        console.log(`✅ Found ${result.rowCount} approved chauffeurs`);
        
        res.json({
            success: true,
            message: `Found ${result.rowCount} approved chauffeurs`,
            chauffeurs: result.rows
        });
        
    } catch (error) {
        console.error('❌ Error fetching approved chauffeurs:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint pour vérifier la structure de la table Client
router.get('/check-client-structure', async (req, res) => {
    try {
        console.log('🔍 Checking Client table structure...');
        const result = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'client'
            ORDER BY ordinal_position
        `);
        console.log('✅ Client table structure retrieved');
        res.json({
            success: true,
            message: 'Client table structure',
            columns: result.rows
        });
    } catch (error) {
        console.error('❌ Error checking Client table structure:', error);
        res.status(500).json({
            success: false,
            error: 'Database error'
        });
    }
});

// Endpoint pour ajouter les colonnes manquantes à la table Client
router.post('/add-client-notification-fields', async (req, res) => {
    try {
        console.log('🔧 Adding notification fields to Client table...');
        
        // Ajouter les colonnes manquantes
        await pool.query(`
            ALTER TABLE Client 
            ADD COLUMN IF NOT EXISTS push_token TEXT,
            ADD COLUMN IF NOT EXISTS platform VARCHAR(20),
            ADD COLUMN IF NOT EXISTS last_token_update TIMESTAMP,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        `);
        
        // Vérifier la structure de la table
        const tableInfo = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'client' 
            ORDER BY ordinal_position
        `);
        
        console.log('✅ Successfully added notification fields to Client table');
        
        res.json({
            success: true,
            message: 'Colonnes de notification ajoutées avec succès à la table Client',
            tableStructure: tableInfo.rows
        });
        
    } catch (error) {
        console.error('❌ Error adding notification fields to Client table:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint pour vérifier la structure de la table Course
router.get('/check-course-structure', async (req, res) => {
    try {
        console.log('🔍 Checking Course table structure...');
        const result = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'course'
            ORDER BY ordinal_position
        `);
        console.log('✅ Course table structure retrieved');
        res.json({
            success: true,
            message: 'Course table structure',
            columns: result.rows
        });
    } catch (error) {
        console.error('❌ Error checking Course table structure:', error);
        res.status(500).json({
            success: false,
            error: 'Database error'
        });
    }
});

// Add en_livraison column to Livreur table
router.post('/add-en-livraison-column', async (req, res) => {
    try {
        console.log('🔧 Adding en_livraison column to Livreur table...');
        
        // Add the column
        await pool.query(`
            ALTER TABLE Livreur ADD COLUMN IF NOT EXISTS en_livraison BOOLEAN DEFAULT FALSE
        `);
        
        // Update existing livreurs
        await pool.query(`
            UPDATE Livreur SET en_livraison = FALSE WHERE en_livraison IS NULL
        `);
        
        // Verify the column was added
        const verifyResult = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'livreur' AND column_name = 'en_livraison'
        `);
        
        console.log('✅ en_livraison column added successfully');
        
        res.json({
            success: true,
            message: 'en_livraison column added successfully',
            verification: verifyResult.rows[0]
        });
    } catch (error) {
        console.error('❌ Error adding en_livraison column:', error);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// Check Livraison table structure
router.get('/check-livraison-structure', async (req, res) => {
    try {
        console.log('🔍 Checking Livraison table structure...');
        
        const result = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'livraison' 
            ORDER BY ordinal_position
        `);
        
        console.log('✅ Livraison table structure retrieved');
        
        res.json({
            success: true,
            message: 'Livraison table structure',
            columns: result.rows
        });
    } catch (error) {
        console.error('❌ Error checking Livraison table structure:', error);
        res.status(500).json({ success: false, error: 'Database error' });
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

// Endpoint pour voir les connexions WebSocket des livreurs
router.get('/websocket-connections', async (req, res) => {
    try {
        const { getWebSocketConnections } = require('./websocket');
        const connections = getWebSocketConnections();
        
        res.json({
            success: true,
            connections: connections
        });
        
    } catch (error) {
        console.error('❌ Error getting WebSocket connections:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router; 