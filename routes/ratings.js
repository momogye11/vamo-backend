require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('../db');

// API pour soumettre une note (chauffeur ou client)
router.post('/submit', async (req, res) => {
    const { 
        ratingType, // 'driver' ou 'client'
        tripId, 
        deliveryId,
        clientId,
        driverId,
        deliveryPersonId,
        rating,
        comment 
    } = req.body;

    // Validation des paramètres requis
    if (!ratingType || !rating) {
        return res.status(400).json({
            success: false,
            error: 'ratingType et rating sont requis'
        });
    }

    // Validation de la note (1-5)
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        return res.status(400).json({
            success: false,
            error: 'La note doit être un entier entre 1 et 5'
        });
    }

    try {
        console.log(`⭐ Submitting ${ratingType} rating:`, {
            rating,
            tripId,
            deliveryId,
            comment: comment ? 'Avec commentaire' : 'Sans commentaire'
        });

        await db.query('BEGIN');

        let result;
        let ratingData = {
            rating,
            comment: comment || null,
            submittedAt: new Date().toISOString()
        };

        if (ratingType === 'driver') {
            // Note pour un chauffeur (course normale)
            if (!tripId || !clientId || !driverId) {
                await db.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    error: 'tripId, clientId et driverId sont requis pour noter un chauffeur'
                });
            }

            // Vérifier que la course existe et est terminée
            const tripCheck = await db.query(`
                SELECT etat_course, id_client, id_chauffeur
                FROM Course 
                WHERE id_course = $1 AND etat_course = 'terminee'
            `, [tripId]);

            if (tripCheck.rowCount === 0) {
                await db.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    error: 'Course non trouvée ou non terminée'
                });
            }

            const trip = tripCheck.rows[0];
            if (trip.id_client !== parseInt(clientId) || trip.id_chauffeur !== parseInt(driverId)) {
                await db.query('ROLLBACK');
                return res.status(403).json({
                    success: false,
                    error: 'Vous n\'êtes pas autorisé à noter cette course'
                });
            }

            // Vérifier si une note existe déjà
            const existingRating = await db.query(`
                SELECT id_note FROM Note WHERE id_course = $1
            `, [tripId]);

            if (existingRating.rowCount > 0) {
                await db.query('ROLLBACK');
                return res.status(409).json({
                    success: false,
                    error: 'Une note a déjà été soumise pour cette course'
                });
            }

            // Insérer la note pour le chauffeur
            result = await db.query(`
                INSERT INTO Note (id_client, id_chauffeur, id_course, note, commentaire)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id_note, date_note
            `, [clientId, driverId, tripId, rating, comment]);

            ratingData.ratingId = result.rows[0].id_note;
            ratingData.dateCreated = result.rows[0].date_note;

        } else if (ratingType === 'delivery_person') {
            // Note pour un livreur
            if (!deliveryId || !clientId || !deliveryPersonId) {
                await db.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    error: 'deliveryId, clientId et deliveryPersonId sont requis pour noter un livreur'
                });
            }

            // Vérifier que la livraison existe et est terminée
            const deliveryCheck = await db.query(`
                SELECT etat_livraison, id_client, id_livreur
                FROM Livraison 
                WHERE id_livraison = $1 AND etat_livraison = 'terminee'
            `, [deliveryId]);

            if (deliveryCheck.rowCount === 0) {
                await db.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    error: 'Livraison non trouvée ou non terminée'
                });
            }

            const delivery = deliveryCheck.rows[0];
            if (delivery.id_client !== parseInt(clientId) || delivery.id_livreur !== parseInt(deliveryPersonId)) {
                await db.query('ROLLBACK');
                return res.status(403).json({
                    success: false,
                    error: 'Vous n\'êtes pas autorisé à noter cette livraison'
                });
            }

            // Vérifier si une note existe déjà
            const existingRating = await db.query(`
                SELECT id_note FROM NoteLivraison WHERE id_livraison = $1
            `, [deliveryId]);

            if (existingRating.rowCount > 0) {
                await db.query('ROLLBACK');
                return res.status(409).json({
                    success: false,
                    error: 'Une note a déjà été soumise pour cette livraison'
                });
            }

            // Insérer la note pour le livreur
            result = await db.query(`
                INSERT INTO NoteLivraison (id_client, id_livreur, id_livraison, note, commentaire)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id_note, date_note
            `, [clientId, deliveryPersonId, deliveryId, rating, comment]);

            ratingData.ratingId = result.rows[0].id_note;
            ratingData.dateCreated = result.rows[0].date_note;

        } else if (ratingType === 'client') {
            // Note pour un client (par le chauffeur ou livreur)
            if (tripId) {
                // Note d'un chauffeur vers un client
                if (!driverId || !clientId) {
                    await db.query('ROLLBACK');
                    return res.status(400).json({
                        success: false,
                        error: 'driverId et clientId sont requis pour qu\'un chauffeur note un client'
                    });
                }

                // Vérifier que la course existe et est terminée
                const tripCheck = await db.query(`
                    SELECT etat_course, id_client, id_chauffeur
                    FROM Course 
                    WHERE id_course = $1 AND etat_course = 'terminee'
                `, [tripId]);

                if (tripCheck.rowCount === 0) {
                    await db.query('ROLLBACK');
                    return res.status(404).json({
                        success: false,
                        error: 'Course non trouvée ou non terminée'
                    });
                }

                const trip = tripCheck.rows[0];
                if (trip.id_client !== parseInt(clientId) || trip.id_chauffeur !== parseInt(driverId)) {
                    await db.query('ROLLBACK');
                    return res.status(403).json({
                        success: false,
                        error: 'Vous n\'êtes pas autorisé à noter ce client pour cette course'
                    });
                }

                // Pour l'instant, nous pouvons créer une table séparée pour les notes des chauffeurs vers les clients
                // ou utiliser un système de flags dans la table Note existante
                // Ici, nous allons créer une note "inverse" dans la même table
                result = await db.query(`
                    INSERT INTO Note (id_client, id_chauffeur, id_course, note, commentaire)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id_note, date_note
                `, [clientId, driverId, tripId, rating, comment]);

            } else if (deliveryId) {
                // Note d'un livreur vers un client
                if (!deliveryPersonId || !clientId) {
                    await db.query('ROLLBACK');
                    return res.status(400).json({
                        success: false,
                        error: 'deliveryPersonId et clientId sont requis pour qu\'un livreur note un client'
                    });
                }

                // Logique similaire pour les livraisons
                result = await db.query(`
                    INSERT INTO NoteLivraison (id_client, id_livreur, id_livraison, note, commentaire)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id_note, date_note
                `, [clientId, deliveryPersonId, deliveryId, rating, comment]);
            }

            ratingData.ratingId = result.rows[0].id_note;
            ratingData.dateCreated = result.rows[0].date_note;

        } else {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'ratingType doit être "driver", "delivery_person" ou "client"'
            });
        }

        await db.query('COMMIT');

        console.log(`✅ Rating submitted successfully:`, ratingData);

        res.json({
            success: true,
            message: 'Note soumise avec succès',
            data: ratingData
        });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error("❌ Error submitting rating:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la soumission de la note'
        });
    }
});

// API pour récupérer les notes d'un chauffeur
router.get('/driver/:driverId', async (req, res) => {
    const { driverId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    try {
        // Récupérer les notes du chauffeur avec informations des clients
        const ratings = await db.query(`
            SELECT 
                n.id_note,
                n.note,
                n.commentaire,
                n.date_note,
                c.nom as client_nom,
                c.prenom as client_prenom,
                co.id_course,
                co.adresse_depart,
                co.adresse_arrivee
            FROM Note n
            LEFT JOIN Client c ON n.id_client = c.id_client
            LEFT JOIN Course co ON n.id_course = co.id_course
            WHERE n.id_chauffeur = $1
            ORDER BY n.date_note DESC
            LIMIT $2 OFFSET $3
        `, [driverId, limit, offset]);

        // Calculer la moyenne et le nombre total de notes
        const stats = await db.query(`
            SELECT 
                COALESCE(AVG(note::decimal), 0) as average_rating,
                COUNT(note) as total_ratings
            FROM Note
            WHERE id_chauffeur = $1
        `, [driverId]);

        const averageRating = parseFloat(stats.rows[0].average_rating) || 0;
        const totalRatings = parseInt(stats.rows[0].total_ratings) || 0;

        res.json({
            success: true,
            data: {
                ratings: ratings.rows,
                stats: {
                    average_rating: Math.round(averageRating * 10) / 10,
                    total_ratings: totalRatings,
                    rating_display: totalRatings > 0 ? `${Math.round(averageRating * 10) / 10}/5` : 'N/A'
                }
            }
        });

    } catch (err) {
        console.error("❌ Error fetching driver ratings:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// API pour récupérer les notes d'un livreur
router.get('/delivery-person/:deliveryPersonId', async (req, res) => {
    const { deliveryPersonId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    try {
        // Récupérer les notes du livreur
        const ratings = await db.query(`
            SELECT 
                n.id_note,
                n.note,
                n.commentaire,
                n.date_note,
                c.nom as client_nom,
                c.prenom as client_prenom,
                l.id_livraison,
                l.adresse_depart,
                l.adresse_arrivee
            FROM NoteLivraison n
            LEFT JOIN Client c ON n.id_client = c.id_client
            LEFT JOIN Livraison l ON n.id_livraison = l.id_livraison
            WHERE n.id_livreur = $1
            ORDER BY n.date_note DESC
            LIMIT $2 OFFSET $3
        `, [deliveryPersonId, limit, offset]);

        // Calculer la moyenne et le nombre total de notes
        const stats = await db.query(`
            SELECT 
                COALESCE(AVG(note::decimal), 0) as average_rating,
                COUNT(note) as total_ratings
            FROM NoteLivraison
            WHERE id_livreur = $1
        `, [deliveryPersonId]);

        const averageRating = parseFloat(stats.rows[0].average_rating) || 0;
        const totalRatings = parseInt(stats.rows[0].total_ratings) || 0;

        res.json({
            success: true,
            data: {
                ratings: ratings.rows,
                stats: {
                    average_rating: Math.round(averageRating * 10) / 10,
                    total_ratings: totalRatings,
                    rating_display: totalRatings > 0 ? `${Math.round(averageRating * 10) / 10}/5` : 'N/A'
                }
            }
        });

    } catch (err) {
        console.error("❌ Error fetching delivery person ratings:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

module.exports = router;