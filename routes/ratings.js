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

// Submit a driver-to-client rating
router.post('/driver-rating', async (req, res) => {
    const { rating, comment, driverId, clientId, ratingType, tripId, deliveryId } = req.body;

    try {
        console.log('⭐ Submitting driver-to-client rating:', {
            rating,
            driverId,
            clientId,
            ratingType,
            tripId,
            deliveryId
        });

        // Validation des champs obligatoires
        if (!rating || !driverId || !clientId || !ratingType) {
            return res.status(400).json({
                success: false,
                error: 'rating, driverId, clientId et ratingType sont obligatoires'
            });
        }

        // Validation de la note (1-5)
        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                error: 'La note doit être entre 1 et 5'
            });
        }

        let result;

        if (ratingType === 'client_by_driver') {
            // Note d'un client par un chauffeur pour une course
            if (!tripId) {
                return res.status(400).json({
                    success: false,
                    error: 'tripId est obligatoire pour noter un client lors d\'une course'
                });
            }

            // Vérifier que la course existe et appartient au bon chauffeur
            const tripCheck = await db.query(
                'SELECT id_course, id_chauffeur, id_client FROM Course WHERE id_course = $1 AND id_chauffeur = $2',
                [tripId, driverId]
            );

            if (tripCheck.rowCount === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Course non trouvée ou vous n\'êtes pas le chauffeur de cette course'
                });
            }

            // Vérifier que le client correspond
            if (tripCheck.rows[0].id_client != clientId) {
                return res.status(400).json({
                    success: false,
                    error: 'Le client ne correspond pas à cette course'
                });
            }

            // Vérifier si une note existe déjà pour cette course (côté chauffeur vers client)
            const existingRating = await db.query(
                'SELECT id_note FROM NoteClientParChauffeur WHERE id_course = $1',
                [tripId]
            );

            if (existingRating.rowCount > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Vous avez déjà noté ce client pour cette course'
                });
            }

            // Créer la table si elle n'existe pas
            await db.query(`
                CREATE TABLE IF NOT EXISTS NoteClientParChauffeur (
                    id_note SERIAL PRIMARY KEY,
                    id_client INTEGER REFERENCES Client(id_client) ON DELETE SET NULL,
                    id_chauffeur INTEGER REFERENCES Chauffeur(id_chauffeur) ON DELETE SET NULL,
                    note INTEGER CHECK (note >= 1 AND note <= 5),
                    commentaire TEXT,
                    date_note TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    id_course INTEGER UNIQUE REFERENCES Course(id_course) ON DELETE SET NULL
                )
            `);

            // Insérer la note du chauffeur vers le client
            result = await db.query(
                `INSERT INTO NoteClientParChauffeur (id_client, id_chauffeur, note, commentaire, id_course) 
                 VALUES ($1, $2, $3, $4, $5) 
                 RETURNING id_note, date_note`,
                [clientId, driverId, rating, comment, tripId]
            );

        } else if (ratingType === 'client_by_delivery_person') {
            // Note d'un client par un livreur pour une livraison
            if (!deliveryId) {
                return res.status(400).json({
                    success: false,
                    error: 'deliveryId est obligatoire pour noter un client lors d\'une livraison'
                });
            }

            // Vérifier que la livraison existe et appartient au bon livreur
            const deliveryCheck = await db.query(
                'SELECT id_livraison, id_livreur, id_client FROM Livraison WHERE id_livraison = $1 AND id_livreur = $2',
                [deliveryId, driverId] // driverId est en fait le livreur ID dans ce cas
            );

            if (deliveryCheck.rowCount === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Livraison non trouvée ou vous n\'êtes pas le livreur de cette livraison'
                });
            }

            // Vérifier que le client correspond
            if (deliveryCheck.rows[0].id_client != clientId) {
                return res.status(400).json({
                    success: false,
                    error: 'Le client ne correspond pas à cette livraison'
                });
            }

            // Vérifier si une note existe déjà pour cette livraison (côté livreur vers client)
            const existingRating = await db.query(
                'SELECT id_note FROM NoteClientParLivreur WHERE id_livraison = $1',
                [deliveryId]
            );

            if (existingRating.rowCount > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Vous avez déjà noté ce client pour cette livraison'
                });
            }

            // Créer la table si elle n'existe pas
            await db.query(`
                CREATE TABLE IF NOT EXISTS NoteClientParLivreur (
                    id_note SERIAL PRIMARY KEY,
                    id_client INTEGER REFERENCES Client(id_client) ON DELETE SET NULL,
                    id_livreur INTEGER REFERENCES Livreur(id_livreur) ON DELETE SET NULL,
                    note INTEGER CHECK (note >= 1 AND note <= 5),
                    commentaire TEXT,
                    date_note TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    id_livraison INTEGER UNIQUE REFERENCES Livraison(id_livraison) ON DELETE SET NULL
                )
            `);

            // Insérer la note du livreur vers le client
            result = await db.query(
                `INSERT INTO NoteClientParLivreur (id_client, id_livreur, note, commentaire, id_livraison) 
                 VALUES ($1, $2, $3, $4, $5) 
                 RETURNING id_note, date_note`,
                [clientId, driverId, rating, comment, deliveryId] // driverId est en fait le livreur ID
            );

        } else {
            return res.status(400).json({
                success: false,
                error: 'Type de notation invalide'
            });
        }

        console.log('✅ Driver-to-client rating saved successfully:', result.rows[0]);

        res.json({
            success: true,
            message: 'Note du chauffeur/livreur enregistrée avec succès',
            data: {
                id_note: result.rows[0].id_note,
                date_note: result.rows[0].date_note,
                rating: rating,
                ratingType: ratingType
            }
        });

    } catch (error) {
        console.error('❌ Error saving driver-to-client rating:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de l\'enregistrement de la note'
        });
    }
});

// Get client ratings by drivers/delivery persons
router.get('/client/:clientId/ratings-received', async (req, res) => {
    const { clientId } = req.params;

    try {
        // Ratings from drivers (chauffeurs)
        const driverRatings = await db.query(`
            SELECT 
                nc.note,
                nc.commentaire,
                nc.date_note,
                nc.id_course,
                c.nom as chauffeur_nom,
                c.prenom as chauffeur_prenom,
                'chauffeur' as rated_by_type
            FROM NoteClientParChauffeur nc
            JOIN Chauffeur c ON nc.id_chauffeur = c.id_chauffeur
            WHERE nc.id_client = $1
            ORDER BY nc.date_note DESC
        `, [clientId]);

        // Ratings from delivery persons (livreurs)
        const deliveryPersonRatings = await db.query(`
            SELECT 
                nl.note,
                nl.commentaire,
                nl.date_note,
                nl.id_livraison,
                l.nom as livreur_nom,
                l.prenom as livreur_prenom,
                'livreur' as rated_by_type
            FROM NoteClientParLivreur nl
            JOIN Livreur l ON nl.id_livreur = l.id_livreur
            WHERE nl.id_client = $1
            ORDER BY nl.date_note DESC
        `, [clientId]);

        // Combine all ratings
        const allRatings = [
            ...driverRatings.rows,
            ...deliveryPersonRatings.rows
        ].sort((a, b) => new Date(b.date_note) - new Date(a.date_note));

        // Calculate average rating
        const totalRatings = allRatings.length;
        const averageRating = totalRatings > 0 
            ? allRatings.reduce((sum, rating) => sum + rating.note, 0) / totalRatings 
            : 0;

        res.json({
            success: true,
            data: {
                ratings: allRatings,
                statistics: {
                    total_ratings: totalRatings,
                    average_rating: Math.round(averageRating * 10) / 10,
                    rating_display: totalRatings > 0 ? `${Math.round(averageRating * 10) / 10}/5` : 'N/A'
                }
            }
        });

    } catch (error) {
        console.error('❌ Error fetching client ratings:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la récupération des notes'
        });
    }
});

module.exports = router;