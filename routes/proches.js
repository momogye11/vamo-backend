const express = require('express');
const router = express.Router();
const db = require('../db');

// ======================================
//   API PROCHES CLIENT (Qui monte ?)
// ======================================

/**
 * GET /api/proches/:idClient
 * Récupérer la liste des proches d'un client
 */
router.get('/:idClient', async (req, res) => {
    const { idClient } = req.params;

    try {
        const result = await db.query(
            `SELECT
                id_proche,
                nom,
                prenom,
                telephone,
                date_ajout,
                nombre_utilisations,
                derniere_utilisation
            FROM ProchesClient
            WHERE id_client = $1
            ORDER BY nombre_utilisations DESC, date_ajout DESC`,
            [idClient]
        );

        res.json({
            success: true,
            proches: result.rows
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des proches:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des proches'
        });
    }
});

/**
 * POST /api/proches
 * Ajouter un nouveau proche
 * Body: { idClient, nom, prenom, telephone }
 */
router.post('/', async (req, res) => {
    const { idClient, nom, prenom, telephone } = req.body;

    // Validation
    if (!idClient || !nom || !telephone) {
        return res.status(400).json({
            success: false,
            message: 'idClient, nom et telephone sont requis'
        });
    }

    // Valider le format du téléphone (international)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(telephone)) {
        return res.status(400).json({
            success: false,
            message: 'Le numéro de téléphone doit être au format international (+221...)'
        });
    }

    try {
        // Vérifier si le proche existe déjà
        const existing = await db.query(
            'SELECT id_proche FROM ProchesClient WHERE id_client = $1 AND telephone = $2',
            [idClient, telephone]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Ce proche est déjà enregistré'
            });
        }

        // Ajouter le proche
        const result = await db.query(
            `INSERT INTO ProchesClient (id_client, nom, prenom, telephone)
             VALUES ($1, $2, $3, $4)
             RETURNING id_proche, nom, prenom, telephone, date_ajout, nombre_utilisations`,
            [idClient, nom, prenom || null, telephone]
        );

        res.status(201).json({
            success: true,
            message: 'Proche ajouté avec succès',
            proche: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Erreur lors de l\'ajout du proche:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'ajout du proche'
        });
    }
});

/**
 * PUT /api/proches/:idProche
 * Modifier un proche existant
 * Body: { nom, prenom, telephone }
 */
router.put('/:idProche', async (req, res) => {
    const { idProche } = req.params;
    const { nom, prenom, telephone } = req.body;

    if (!nom || !telephone) {
        return res.status(400).json({
            success: false,
            message: 'nom et telephone sont requis'
        });
    }

    // Valider le format du téléphone
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(telephone)) {
        return res.status(400).json({
            success: false,
            message: 'Le numéro de téléphone doit être au format international (+221...)'
        });
    }

    try {
        const result = await db.query(
            `UPDATE ProchesClient
             SET nom = $1, prenom = $2, telephone = $3
             WHERE id_proche = $4
             RETURNING id_proche, nom, prenom, telephone, date_ajout, nombre_utilisations`,
            [nom, prenom || null, telephone, idProche]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Proche non trouvé'
            });
        }

        res.json({
            success: true,
            message: 'Proche modifié avec succès',
            proche: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Erreur lors de la modification du proche:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la modification du proche'
        });
    }
});

/**
 * DELETE /api/proches/:idProche
 * Supprimer un proche
 */
router.delete('/:idProche', async (req, res) => {
    const { idProche } = req.params;

    try {
        const result = await db.query(
            'DELETE FROM ProchesClient WHERE id_proche = $1 RETURNING id_proche',
            [idProche]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Proche non trouvé'
            });
        }

        res.json({
            success: true,
            message: 'Proche supprimé avec succès'
        });
    } catch (error) {
        console.error('❌ Erreur lors de la suppression du proche:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression du proche'
        });
    }
});

/**
 * POST /api/proches/:idProche/use
 * Incrémenter le compteur d'utilisation d'un proche
 * Appelé quand un proche est sélectionné comme passager
 */
router.post('/:idProche/use', async (req, res) => {
    const { idProche } = req.params;

    try {
        const result = await db.query(
            `UPDATE ProchesClient
             SET nombre_utilisations = nombre_utilisations + 1,
                 derniere_utilisation = CURRENT_TIMESTAMP
             WHERE id_proche = $1
             RETURNING id_proche, nombre_utilisations, derniere_utilisation`,
            [idProche]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Proche non trouvé'
            });
        }

        res.json({
            success: true,
            message: 'Utilisation enregistrée'
        });
    } catch (error) {
        console.error('❌ Erreur lors de l\'enregistrement de l\'utilisation:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'enregistrement de l\'utilisation'
        });
    }
});

module.exports = router;
