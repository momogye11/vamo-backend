const express = require('express');
const router = express.Router();
const pool = require('../db');

// Création d'une nouvelle livraison
router.post('/', async (req, res) => {
    console.log("📦 Requête POST /api/livraison reçue !");
    console.log(req.body);

    const {
        id_client,
        adresse_depart,
        adresse_arrivee,
        destinataire_nom,
        destinataire_telephone,
        instructions,
        taille_colis,
        prix,
        id_type,
        latitude_depart,
        longitude_depart,
        latitude_arrivee,
        longitude_arrivee
    } = req.body;


    try {
        const result = await pool.query(
            `INSERT INTO Livraison (
        id_client, adresse_depart, adresse_arrivee, destinataire_nom, 
        destinataire_telephone, instructions, taille_colis, prix, id_type,
        latitude_depart, longitude_depart, latitude_arrivee, longitude_arrivee, etat_livraison
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'en_attente')
        RETURNING *`,
            [
                id_client, adresse_depart, adresse_arrivee, destinataire_nom,
                destinataire_telephone, instructions, taille_colis, prix, id_type,
                latitude_depart, longitude_depart, latitude_arrivee, longitude_arrivee
            ]
        );


        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Erreur lors de la création de la livraison :', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
