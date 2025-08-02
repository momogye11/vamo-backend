require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('../db');

// Get available trips for drivers (simple polling)
router.get('/available/:driverId', async (req, res) => {
    const { driverId } = req.params;

    try {
        console.log(`🚗 Fetching available trips for driver: ${driverId}`);

        // Simple query for available trips (no complex queue system)
        const result = await db.query(`
            SELECT 
                c.id_course,
                c.adresse_depart,
                c.adresse_arrivee,
                c.distance_km,
                c.duree_min,
                c.prix,
                c.mode_paiement,
                c.mode_silencieux,
                c.latitude_depart,
                c.longitude_depart,
                c.latitude_arrivee,
                c.longitude_arrivee,
                c.telephone_client,
                c.nom_client,
                c.date_heure_depart,
                c.etat_course,
                cl.nom as client_nom,
                cl.prenom as client_prenom
            FROM Course c
            LEFT JOIN Client cl ON c.id_client = cl.id_client
            WHERE c.etat_course = 'en_attente' 
            AND c.id_chauffeur IS NULL
            ORDER BY c.date_heure_depart ASC
            LIMIT 1
        `);

        console.log(`📊 Found ${result.rowCount} available trips in database`);

        // Debug: Log what we found
        if (result.rowCount > 0) {
            console.log('🔍 Available trip details:', {
                id: result.rows[0].id_course,
                status: result.rows[0].etat_course,
                driver_assigned: result.rows[0].id_chauffeur,
                created: result.rows[0].date_heure_depart
            });
        }

        if (result.rowCount === 0) {
            return res.json({
                success: true,
                hasTrip: false,
                trip: null
            });
        }

        const trip = result.rows[0];

        // Calculate estimated pickup time based on driver location (mock for now)
        const estimatedPickupTime = 8; // minutes

        res.json({
            success: true,
            hasTrip: true,
            trip: {
                id: trip.id_course,
                type: 'ride',
                pickup: trip.adresse_depart,
                destination: trip.adresse_arrivee,
                distance: `${trip.distance_km} km`,
                duration: `${trip.duree_min} min`,
                eta: `${estimatedPickupTime} min`,
                price: trip.prix,
                paymentMethod: trip.mode_paiement,
                silentMode: trip.mode_silencieux,
                clientName: `${trip.client_prenom || ''} ${trip.client_nom || ''}`.trim() || trip.nom_client || 'Client Vamo',
                clientPhone: trip.telephone_client,
                pickupCoords: {
                    latitude: parseFloat(trip.latitude_depart),
                    longitude: parseFloat(trip.longitude_depart)
                },
                destinationCoords: {
                    latitude: parseFloat(trip.latitude_arrivee),
                    longitude: parseFloat(trip.longitude_arrivee)
                }
            }
        });

    } catch (err) {
        console.error("❌ Error fetching available trips for driver", driverId, ":", err);
        console.error("❌ Stack trace:", err.stack);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur',
            details: err.message
        });
    }
});

// Accept a trip (simple version without complex attribution)
router.post('/accept', async (req, res) => {
    const { driverId, tripId } = req.body;

    if (!driverId || !tripId) {
        return res.status(400).json({
            success: false,
            error: 'driverId et tripId sont requis'
        });
    }

    try {
        console.log(`🚗 Driver ${driverId} accepting trip ${tripId}`);

        await db.query('BEGIN');

        // Check if trip is still available
        const tripCheck = await db.query(`
            SELECT id_course, etat_course, id_chauffeur 
            FROM Course 
            WHERE id_course = $1 AND etat_course = 'en_attente' AND id_chauffeur IS NULL
        `, [tripId]);

        if (tripCheck.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                error: 'Cette course n\'est plus disponible'
            });
        }

        // Assign trip to driver WITHOUT changing their availability status
        const updateResult = await db.query(`
    UPDATE Course 
    SET id_chauffeur = $1, 
        etat_course = 'acceptee',
        date_heure_depart = CURRENT_TIMESTAMP
    WHERE id_course = $2 AND etat_course = 'en_attente' AND id_chauffeur IS NULL
    RETURNING *
`, [parseInt(driverId) || 1, tripId]);

        // IMPORTANT: Do NOT change driver availability here
        // The driver should remain online and available for new trips
        console.log(`✅ Trip ${tripId} assigned to driver ${driverId} - Driver remains online`);


        if (updateResult.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                error: 'Impossible d\'accepter la course'
            });
        }

        await db.query('COMMIT');

        const trip = updateResult.rows[0];
        console.log(`✅ Trip ${tripId} accepted successfully`);

        // 🚀 Récupérer les informations complètes du chauffeur
        const driverInfo = await db.query(`
            SELECT 
                c.id_chauffeur,
                c.nom as chauffeur_nom,
                c.prenom as chauffeur_prenom,
                c.telephone as chauffeur_telephone,
                c.photo_selfie as chauffeur_photo,
                c.marque_vehicule,
                c.plaque_immatriculation,
                c.annee_vehicule
            FROM Chauffeur c
            WHERE c.id_chauffeur = $1
        `, [driverId]);

        let driverData = null;
        if (driverInfo.rowCount > 0) {
            const driver = driverInfo.rows[0];
            driverData = {
                id: driver.id_chauffeur,
                name: `${driver.chauffeur_prenom} ${driver.chauffeur_nom}`,
                firstName: driver.chauffeur_prenom,
                lastName: driver.chauffeur_nom,
                phone: driver.chauffeur_telephone,
                photo: driver.chauffeur_photo,
                vehicle: {
                    brand: driver.marque_vehicule || 'Véhicule',
                    plate: driver.plaque_immatriculation || 'Non spécifiée',
                    year: driver.annee_vehicule
                }
            };
            console.log('👤 Driver info retrieved:', driverData);
        }

        // 🚀 NOTIFICATION - Informer les autres chauffeurs que la course est prise (WebSocket)
        try {
            console.log('📢 Notifying other drivers that trip was taken via WebSocket...');

            // Récupérer les chauffeurs encore connectés
            const { getConnectionStatus, notifyTripTaken } = require('./websocket');
            const connectionStatus = getConnectionStatus();

            if (connectionStatus.totalConnections > 0) {
                console.log(`📊 ${connectionStatus.totalConnections} drivers connected via WebSocket, notifying them`);

                // Notifier via WebSocket que cette course est prise (pour fermer les modals)
                notifyTripTaken(tripId, driverId);
            }
        } catch (notifyError) {
            console.error('⚠️ Error notifying other drivers via WebSocket (trip still accepted):', notifyError.message);
        }

        return res.json({
            success: true,
            message: 'Course acceptée avec succès',
            trip: {
                id: trip.id_course,
                type: 'ride',
                pickup: trip.adresse_depart,
                destination: trip.adresse_arrivee,
                distance: `${trip.distance_km} km`,
                duration: `${trip.duree_min} min`,
                price: trip.prix,
                paymentMethod: trip.mode_paiement || 'wave',
                silentMode: trip.mode_silencieux || false,
                clientName: trip.nom_client || 'Client Vamo',
                clientPhone: trip.telephone_client,
                status: trip.etat_course,
                pickupCoords: {
                    latitude: parseFloat(trip.latitude_depart) || 0,
                    longitude: parseFloat(trip.longitude_depart) || 0
                },
                destinationCoords: {
                    latitude: parseFloat(trip.latitude_arrivee) || 0,
                    longitude: parseFloat(trip.longitude_arrivee) || 0
                }
            },
            driver: driverData
        });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error("❌ Error accepting trip:", err);

        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Erreur serveur',
                details: err.message
            });
        }
    }
});

// Update trip status (arrived at pickup, started trip, completed trip)
router.post('/status', async (req, res) => {
    const { driverId, tripId, status } = req.body;

    if (!driverId || !tripId || !status) {
        return res.status(400).json({
            success: false,
            error: 'driverId, tripId et status sont requis'
        });
    }

    try {
        console.log(`🚗 Updating trip ${tripId} status to: ${status}`);

        // Validate status transition
        const validStatuses = ['en_route_pickup', 'arrivee_pickup', 'en_cours', 'terminee'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Statut invalide'
            });
        }

        await db.query('BEGIN');

        // Get current trip status
        const currentTrip = await db.query(`
            SELECT etat_course, id_chauffeur 
            FROM Course 
            WHERE id_course = $1
        `, [tripId]);

        if (currentTrip.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Course non trouvée'
            });
        }

        if (currentTrip.rows[0].id_chauffeur !== parseInt(driverId)) {
            await db.query('ROLLBACK');
            return res.status(403).json({
                success: false,
                error: 'Vous n\'êtes pas assigné à cette course'
            });
        }

        const oldStatus = currentTrip.rows[0].etat_course;
        let updateQuery;
        let updateParams;

        // Determine what timestamp to update based on status
        switch (status) {
            case 'arrivee_pickup':
                updateQuery = `
                    UPDATE Course 
                    SET etat_course = $1, date_heure_arrivee_pickup = CURRENT_TIMESTAMP 
                    WHERE id_course = $2 AND id_chauffeur = $3
                `;
                updateParams = [status, tripId, driverId];
                break;

            case 'en_cours':
                updateQuery = `
                    UPDATE Course 
                    SET etat_course = $1, date_heure_debut_course = CURRENT_TIMESTAMP 
                    WHERE id_course = $2 AND id_chauffeur = $3
                `;
                updateParams = [status, tripId, driverId];
                break;

            case 'terminee':
                updateQuery = `
                    UPDATE Course 
                    SET etat_course = $1, date_heure_arrivee = CURRENT_TIMESTAMP 
                    WHERE id_course = $2 AND id_chauffeur = $3
                `;
                updateParams = [status, tripId, driverId];
                break;

            default:
                updateQuery = `
                    UPDATE Course 
                    SET etat_course = $1 
                    WHERE id_course = $2 AND id_chauffeur = $3
                `;
                updateParams = [status, tripId, driverId];
        }

        const updateResult = await db.query(updateQuery, updateParams);

        if (updateResult.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Impossible de mettre à jour le statut'
            });
        }

        await db.query('COMMIT');

        console.log(`✅ Trip ${tripId} status updated from ${oldStatus} to ${status}`);

        res.json({
            success: true,
            message: 'Statut mis à jour avec succès',
            oldStatus,
            newStatus: status
        });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error("❌ Error updating trip status:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Get current trip for driver
router.get('/current/:driverId', async (req, res) => {
    const { driverId } = req.params;

    try {
        console.log(`🚗 Fetching current trip for driver: ${driverId}`);

        const result = await db.query(`
            SELECT 
                c.*,
                cl.nom as client_nom,
                cl.prenom as client_prenom
            FROM Course c
            LEFT JOIN Client cl ON c.id_client = cl.id_client
            WHERE c.id_chauffeur = $1 
            AND c.etat_course IN ('acceptee', 'en_route_pickup', 'arrivee_pickup', 'en_cours')
            ORDER BY c.date_heure_depart DESC
            LIMIT 1
        `, [driverId]);

        if (result.rowCount === 0) {
            return res.json({
                success: true,
                hasCurrentTrip: false,
                trip: null
            });
        }

        const trip = result.rows[0];

        res.json({
            success: true,
            hasCurrentTrip: true,
            trip: {
                id: trip.id_course,
                type: 'ride',
                pickup: trip.adresse_depart,
                destination: trip.adresse_arrivee,
                distance: `${trip.distance_km} km`,
                duration: `${trip.duree_min} min`,
                price: trip.prix,
                paymentMethod: trip.mode_paiement,
                silentMode: trip.mode_silencieux,
                clientName: `${trip.client_prenom || ''} ${trip.client_nom || ''}`.trim() || trip.nom_client || 'Client Vamo',
                clientPhone: trip.telephone_client,
                status: trip.etat_course,
                pickupCoords: {
                    latitude: parseFloat(trip.latitude_depart),
                    longitude: parseFloat(trip.longitude_depart)
                },
                destinationCoords: {
                    latitude: parseFloat(trip.latitude_arrivee),
                    longitude: parseFloat(trip.longitude_arrivee)
                },
                timestamps: {
                    accepted: trip.date_heure_depart,
                    arrivedPickup: trip.date_heure_arrivee_pickup,
                    started: trip.date_heure_debut_course,
                    completed: trip.date_heure_arrivee
                }
            }
        });

    } catch (err) {
        console.error("❌ Error fetching current trip:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Complete trip and confirm payment
router.post('/complete', async (req, res) => {
    const { driverId, tripId, paymentMethod } = req.body;

    if (!driverId || !tripId || !paymentMethod) {
        return res.status(400).json({
            success: false,
            error: 'driverId, tripId et paymentMethod sont requis'
        });
    }

    try {
        console.log(`🚗 Completing trip ${tripId} with payment: ${paymentMethod}`);

        await db.query('BEGIN');

        // Update trip as completed and set payment method
        const updateResult = await db.query(`
            UPDATE Course 
            SET etat_course = 'terminee',
                mode_paiement = $1,
                est_paye = true,
                date_heure_arrivee = COALESCE(date_heure_arrivee, CURRENT_TIMESTAMP)
            WHERE id_course = $2 AND id_chauffeur = $3 AND etat_course IN ('en_cours', 'terminee')
            RETURNING *
        `, [paymentMethod, tripId, driverId]);

        if (updateResult.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Impossible de terminer la course'
            });
        }

        await db.query('COMMIT');

        const trip = updateResult.rows[0];

        console.log(`✅ Trip ${tripId} completed successfully`);

        res.json({
            success: true,
            message: 'Course terminée avec succès',
            trip: {
                id: trip.id_course,
                price: trip.prix,
                paymentMethod: trip.mode_paiement,
                completedAt: trip.date_heure_arrivee
            }
        });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error("❌ Error completing trip:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Cancel trip
router.post('/cancel', async (req, res) => {
    const { driverId, tripId, reason } = req.body;

    if (!driverId || !tripId) {
        return res.status(400).json({
            success: false,
            error: 'driverId et tripId sont requis'
        });
    }

    try {
        console.log(`🚗 Cancelling trip ${tripId}, reason: ${reason || 'No reason provided'}`);

        await db.query('BEGIN');

        // Get current trip status
        const currentTrip = await db.query(`
            SELECT etat_course 
            FROM Course 
            WHERE id_course = $1 AND id_chauffeur = $2
        `, [tripId, driverId]);

        if (currentTrip.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Course non trouvée'
            });
        }

        // Cancel trip
        await db.query(`
            UPDATE Course 
            SET etat_course = 'annulee', id_chauffeur = NULL
            WHERE id_course = $1 AND id_chauffeur = $2
        `, [tripId, driverId]);

        await db.query('COMMIT');

        console.log(`✅ Trip ${tripId} cancelled successfully`);

        res.json({
            success: true,
            message: 'Course annulée avec succès'
        });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error("❌ Error cancelling trip:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

module.exports = router;