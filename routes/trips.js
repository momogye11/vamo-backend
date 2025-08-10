require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('../db');
const pushNotificationService = require('../services/pushNotificationService');

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

// Complete trip and confirm payment (DEPRECATED - using the main complete endpoint below)
// This endpoint was causing conflicts and is no longer used

// Cancel trip (client cancelling during search)
router.post('/cancel', async (req, res) => {
    const { tripId } = req.body;

    console.log('🚗 DEBUG - Cancel request body:', req.body);
    console.log('🚗 DEBUG - tripId type:', typeof tripId);
    console.log('🚗 DEBUG - tripId value:', tripId);

    if (!tripId) {
        return res.status(400).json({
            success: false,
            error: 'tripId est requis'
        });
    }

    try {
        console.log(`🚗 Client cancelling trip ${tripId}`);

        // Handle both courseId (integer) and searchId (string with timestamp)
        let actualCourseId = tripId;
        
        // If tripId is a searchId (contains timestamp), extract the courseId
        if (typeof tripId === 'string' && tripId.includes('_')) {
            const parts = tripId.split('_');
            if (parts.length >= 2) {
                actualCourseId = parseInt(parts[1]);
                console.log(`🔧 Extracted courseId ${actualCourseId} from searchId ${tripId}`);
            }
        }

        // Cancel trip (set status to cancelled)
        const result = await db.query(`
            UPDATE Course 
            SET etat_course = 'annulee'
            WHERE id_course = $1 AND etat_course = 'en_attente'
        `, [actualCourseId]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Course non trouvée ou déjà traitée'
            });
        }

        console.log(`✅ Trip ${tripId} cancelled successfully by client`);

        res.json({
            success: true,
            message: 'Course annulée avec succès'
        });

    } catch (err) {
        console.error("❌ Error cancelling trip:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Cancel trip (driver cancelling accepted trip)
router.post('/driver-cancel', async (req, res) => {
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

// API spécifique pour l'arrivée au pickup avec notification WebSocket
router.post('/arrive-pickup', async (req, res) => {
    const { driverId, tripId } = req.body;

    if (!driverId || !tripId) {
        return res.status(400).json({
            success: false,
            error: 'driverId et tripId sont requis'
        });
    }

    try {
        console.log(`🚗 Driver ${driverId} arrived at pickup for trip ${tripId}`);

        await db.query('BEGIN');

        // Vérifier que la course existe et appartient au chauffeur
        const currentTrip = await db.query(`
            SELECT etat_course, id_client, nom_client, telephone_client
            FROM Course 
            WHERE id_course = $1 AND id_chauffeur = $2
        `, [tripId, driverId]);

        if (currentTrip.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Course non trouvée ou non assignée à ce chauffeur'
            });
        }

        const trip = currentTrip.rows[0];

        // Vérifier que le statut permet la transition vers 'arrivee_pickup'
        if (!['acceptee', 'en_route_pickup'].includes(trip.etat_course)) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: `Impossible de marquer comme arrivé depuis l'état: ${trip.etat_course}`
            });
        }

        // Mettre à jour le statut de la course à 'arrivee_pickup'
        const updateResult = await db.query(`
            UPDATE Course 
            SET etat_course = 'arrivee_pickup', 
                date_heure_arrivee = CURRENT_TIMESTAMP 
            WHERE id_course = $1 AND id_chauffeur = $2
            RETURNING *
        `, [tripId, driverId]);

        if (updateResult.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                error: 'Impossible de mettre à jour la course'
            });
        }

        // Récupérer les informations du chauffeur pour la notification
        const driverInfo = await db.query(`
            SELECT nom, prenom, telephone, marque_vehicule, plaque_immatriculation
            FROM Chauffeur 
            WHERE id_chauffeur = $1
        `, [driverId]);

        let driverData = null;
        if (driverInfo.rowCount > 0) {
            const driver = driverInfo.rows[0];
            driverData = {
                id: driverId,
                name: `${driver.prenom} ${driver.nom}`,
                phone: driver.telephone,
                vehicle: {
                    brand: driver.marque_vehicule || 'Véhicule',
                    plate: driver.plaque_immatriculation || 'Non spécifiée'
                }
            };
        }

        await db.query('COMMIT');

        // 🚀 NOTIFICATION WEBSOCKET AU CLIENT
        try {
            const { notifyClient } = require('./websocket');
            
            console.log(`🔍 DEBUG: About to notify client with id_client: ${trip.id_client}`);
            console.log(`🔍 DEBUG: Trip data:`, {
                tripId: tripId,
                clientId: trip.id_client,
                clientName: trip.nom_client,
                clientPhone: trip.telephone_client
            });
            
            const notification = {
                type: 'driver_arrived_pickup',
                data: {
                    tripId: tripId,
                    message: 'Votre chauffeur est arrivé au point de récupération',
                    driver: driverData,
                    timestamp: new Date().toISOString()
                }
            };

            // Notifier le client (si connecté via WebSocket)
            const notificationSent = await notifyClient(trip.id_client, notification);
            if (notificationSent) {
                console.log(`✅ Client ${trip.id_client} successfully notified of driver arrival`);
            } else {
                console.log(`⚠️ Client ${trip.id_client} was NOT notified (not connected or error)`);
            }
            
        } catch (wsError) {
            console.error('⚠️ WebSocket notification failed (trip status updated):', wsError.message);
            // Ne pas faire échouer la requête si la notification échoue
        }

        // 📱 PUSH NOTIFICATION AU CLIENT
        try {
            await pushNotificationService.sendTripStatusNotification(
                trip.id_client,
                tripId,
                'driver_arrived',
                {
                    name: `${driverData.prenom} ${driverData.nom}`,
                    phone: driverData.telephone,
                    vehicle: driverData.vehicule_info
                }
            );
            console.log(`✅ Push notification sent to client ${trip.id_client} for driver arrival`);
        } catch (pushError) {
            console.error('⚠️ Push notification failed (trip status updated):', pushError.message);
            // Ne pas faire échouer la requête si la notification échoue
        }

        console.log(`✅ Trip ${tripId} marked as arrived at pickup`);

        res.json({
            success: true,
            message: 'Arrivée au pickup confirmée',
            trip: {
                id: tripId,
                status: 'arrivee_pickup',
                arrivedAt: updateResult.rows[0].date_heure_arrivee_pickup
            },
            driver: driverData
        });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error("❌ Error marking arrival at pickup:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// API spécifique pour démarrer le voyage avec notification WebSocket
router.post('/start-trip', async (req, res) => {
    const { driverId, tripId } = req.body;

    if (!driverId || !tripId) {
        return res.status(400).json({
            success: false,
            error: 'driverId et tripId sont requis'
        });
    }

    try {
        console.log(`🚗 Driver ${driverId} starting trip ${tripId}`);

        await db.query('BEGIN');

        // Vérifier que la course existe et appartient au chauffeur
        const currentTrip = await db.query(`
            SELECT etat_course, id_client, nom_client, telephone_client, adresse_arrivee
            FROM Course 
            WHERE id_course = $1 AND id_chauffeur = $2
        `, [tripId, driverId]);

        if (currentTrip.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Course non trouvée ou non assignée à ce chauffeur'
            });
        }

        const trip = currentTrip.rows[0];

        // Vérifier que le statut permet la transition vers 'en_cours'
        if (!['arrivee_pickup'].includes(trip.etat_course)) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: `Impossible de démarrer le voyage depuis l'état: ${trip.etat_course}. Le chauffeur doit d'abord arriver au pickup.`
            });
        }

        // Mettre à jour le statut de la course à 'en_cours'
        const updateResult = await db.query(`
            UPDATE Course 
            SET etat_course = 'en_cours', 
                date_heure_debut_course = CURRENT_TIMESTAMP 
            WHERE id_course = $1 AND id_chauffeur = $2
            RETURNING *
        `, [tripId, driverId]);

        if (updateResult.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                error: 'Impossible de mettre à jour la course'
            });
        }

        // Récupérer les informations du chauffeur pour la notification
        const driverInfo = await db.query(`
            SELECT nom, prenom, telephone, marque_vehicule, plaque_immatriculation
            FROM Chauffeur 
            WHERE id_chauffeur = $1
        `, [driverId]);

        let driverData = null;
        if (driverInfo.rowCount > 0) {
            const driver = driverInfo.rows[0];
            driverData = {
                id: driverId,
                name: `${driver.prenom} ${driver.nom}`,
                phone: driver.telephone,
                vehicle: {
                    brand: driver.marque_vehicule || 'Véhicule',
                    plate: driver.plaque_immatriculation || 'Non spécifiée'
                }
            };
        }

        await db.query('COMMIT');

        // 🚀 NOTIFICATION WEBSOCKET AU CLIENT
        try {
            const { notifyClient } = require('./websocket');
            
            const notification = {
                type: 'trip_started',
                data: {
                    tripId: tripId,
                    message: 'Votre voyage a commencé ! Direction: ' + (trip.adresse_arrivee || 'votre destination'),
                    driver: driverData,
                    destination: trip.adresse_arrivee,
                    timestamp: new Date().toISOString()
                }
            };

            // Notifier le client (si connecté via WebSocket)
            await notifyClient(trip.id_client, notification);
            console.log(`✅ Client ${trip.id_client} notified of trip start`);
            
        } catch (wsError) {
            console.error('⚠️ WebSocket notification failed (trip status updated):', wsError.message);
            // Ne pas faire échouer la requête si la notification échoue
        }

        // 📱 PUSH NOTIFICATION AU CLIENT
        try {
            await pushNotificationService.sendTripStatusNotification(
                trip.id_client,
                tripId,
                'trip_started',
                {
                    name: driverData ? driverData.name : 'Votre chauffeur',
                    destination: trip.adresse_arrivee
                }
            );
            console.log(`✅ Push notification sent to client ${trip.id_client} for trip start`);
        } catch (pushError) {
            console.error('⚠️ Push notification failed (trip status updated):', pushError.message);
            // Ne pas faire échouer la requête si la notification échoue
        }

        console.log(`✅ Trip ${tripId} started successfully`);

        res.json({
            success: true,
            message: 'Voyage démarré avec succès',
            trip: {
                id: tripId,
                status: 'en_cours',
                startedAt: updateResult.rows[0].date_heure_debut_course,
                destination: trip.adresse_arrivee
            },
            driver: driverData
        });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error("❌ Error starting trip:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// API spécifique pour terminer le voyage avec calcul du prix final et notification WebSocket
router.post('/complete', async (req, res) => {
    const { driverId, tripId } = req.body;

    if (!driverId || !tripId) {
        return res.status(400).json({
            success: false,
            error: 'driverId et tripId sont requis'
        });
    }

    try {
        console.log(`🚗 Driver ${driverId} completing trip ${tripId}`);

        await db.query('BEGIN');

        // Vérifier que la course existe et appartient au chauffeur
        const currentTrip = await db.query(`
            SELECT etat_course, id_client, nom_client, telephone_client, prix, 
                   adresse_depart, adresse_arrivee, distance_km, duree_min,
                   date_heure_debut_course
            FROM Course 
            WHERE id_course = $1 AND id_chauffeur = $2
        `, [tripId, driverId]);

        if (currentTrip.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Course non trouvée ou non assignée à ce chauffeur'
            });
        }

        const trip = currentTrip.rows[0];

        // Vérifier que le statut permet la transition vers 'terminee'
        if (!['en_cours'].includes(trip.etat_course)) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: `Impossible de terminer le voyage depuis l'état: ${trip.etat_course}. Le voyage doit être en cours.`
            });
        }

        // Calculer le prix final (utiliser le prix existant ou recalculer si nécessaire)
        let finalPrice = parseFloat(trip.prix) || 0;
        
        // Si le prix n'existe pas, calculer un prix de base basé sur la distance
        if (finalPrice === 0 && trip.distance_km) {
            const basePricePerKm = 500; // 500 FCFA par km (à ajuster selon les tarifs Vamo)
            const minimumPrice = 1000; // Prix minimum de 1000 FCFA
            finalPrice = Math.max(trip.distance_km * basePricePerKm, minimumPrice);
        }

        // Mettre à jour le statut de la course à 'terminee'
        const updateResult = await db.query(`
            UPDATE Course 
            SET etat_course = 'terminee', 
                date_heure_arrivee = CURRENT_TIMESTAMP,
                prix = $1,
                est_paye = false
            WHERE id_course = $2 AND id_chauffeur = $3
            RETURNING *
        `, [finalPrice, tripId, driverId]);

        if (updateResult.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                error: 'Impossible de mettre à jour la course'
            });
        }

        // Récupérer les informations du chauffeur pour la notification
        const driverInfo = await db.query(`
            SELECT nom, prenom, telephone, marque_vehicule, plaque_immatriculation
            FROM Chauffeur 
            WHERE id_chauffeur = $1
        `, [driverId]);

        let driverData = null;
        if (driverInfo.rowCount > 0) {
            const driver = driverInfo.rows[0];
            driverData = {
                id: driverId,
                name: `${driver.prenom} ${driver.nom}`,
                phone: driver.telephone,
                vehicle: {
                    brand: driver.marque_vehicule || 'Véhicule',
                    plate: driver.plaque_immatriculation || 'Non spécifiée'
                }
            };
        }

        await db.query('COMMIT');

        // 🚀 NOTIFICATION WEBSOCKET AU CLIENT
        try {
            const { notifyClient } = require('./websocket');
            
            const notification = {
                type: 'trip_completed',
                data: {
                    tripId: tripId,
                    message: 'Votre voyage est terminé ! Évaluez votre chauffeur.',
                    finalPrice: finalPrice,
                    currency: 'FCFA',
                    distance: trip.distance_km + ' km',
                    duration: trip.duree_min + ' min',
                    driver: driverData,
                    pickupAddress: trip.adresse_depart,
                    destinationAddress: trip.adresse_arrivee,
                    timestamp: new Date().toISOString(),
                    // Données pour la page de notation
                    tripData: {
                        id: tripId,
                        driverName: driverData ? `${driverData.prenom} ${driverData.nom}` : 'Votre chauffeur',
                        finalPrice: finalPrice,
                        distance: trip.distance_km + ' km',
                        duration: trip.duree_min + ' min',
                        pickupAddress: trip.adresse_depart,
                        destinationAddress: trip.adresse_arrivee
                    }
                }
            };

            // Notifier le client (si connecté via WebSocket)
            await notifyClient(trip.id_client, notification);
            console.log(`✅ Client ${trip.id_client} notified of trip completion`);
            
        } catch (wsError) {
            console.error('⚠️ WebSocket notification failed (trip status updated):', wsError.message);
            // Ne pas faire échouer la requête si la notification échoue
        }

        // 📱 PUSH NOTIFICATION AU CLIENT
        try {
            await pushNotificationService.sendTripStatusNotification(
                trip.id_client,
                tripId,
                'trip_completed',
                {
                    name: driverData ? driverData.name : 'Votre chauffeur',
                    finalPrice: finalPrice,
                    currency: 'FCFA'
                }
            );
            console.log(`✅ Push notification sent to client ${trip.id_client} for trip completion`);
        } catch (pushError) {
            console.error('⚠️ Push notification failed (trip status updated):', pushError.message);
            // Ne pas faire échouer la requête si la notification échoue
        }

        console.log(`✅ Trip ${tripId} completed successfully with final price: ${finalPrice} FCFA`);

        res.json({
            success: true,
            message: 'Voyage terminé avec succès',
            trip: {
                id: tripId,
                status: 'terminee',
                completedAt: updateResult.rows[0].date_heure_arrivee,
                finalPrice: finalPrice,
                currency: 'FCFA',
                distance: trip.distance_km + ' km',
                duration: trip.duree_min + ' min',
                pickup: trip.adresse_depart,
                destination: trip.adresse_arrivee
            },
            driver: driverData
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

// Search endpoint for trips
router.post('/search', async (req, res) => {
    try {
        const { origin, destination, estimatedFare } = req.body;

        console.log('🔍 Trip search request received:', {
            origin: origin?.description,
            destination: destination?.description,
            estimatedFare
        });

        if (!origin || !destination || !estimatedFare) {
            return res.status(400).json({
                success: false,
                error: 'Origin, destination, and estimated fare are required'
            });
        }

        // Extract coordinates
        let originCoords = origin?.location || origin?.coordinates;
        let destCoords = destination?.location || destination?.coordinates;

        if (!originCoords && origin?.latitude && origin?.longitude) {
            originCoords = { lat: origin.latitude, lng: origin.longitude };
        }
        if (!destCoords && destination?.latitude && destination?.longitude) {
            destCoords = { lat: destination.latitude, lng: destination.longitude };
        }

        // Validate coordinates are present - NO MORE DEFAULTS
        if (!originCoords) {
            console.error('❌ Missing origin coordinates');
            return res.status(400).json({
                success: false,
                error: 'Origin coordinates are required'
            });
        }
        if (!destCoords) {
            console.error('❌ Missing destination coordinates');
            return res.status(400).json({
                success: false,
                error: 'Destination coordinates are required'
            });
        }

        // Create trip in database
        const result = await db.query(`
            INSERT INTO Course (
                id_client,
                adresse_depart,
                adresse_arrivee,
                latitude_depart,
                longitude_depart,
                latitude_arrivee,
                longitude_arrivee,
                prix,
                mode_paiement,
                etat_course,
                distance_km,
                duree_min,
                date_heure_depart
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP
            ) RETURNING id_course
        `, [
            1, // Default client ID
            origin.description || 'Unknown origin',
            destination.description || 'Unknown destination',
            originCoords.lat,
            originCoords.lng,
            destCoords.lat,
            destCoords.lng,
            estimatedFare.amount,
            'especes',
            'en_attente',
            5.0, // Default distance
            15   // Default duration
        ]);

        const tripId = result.rows[0].id_course;
        const searchId = `trip_search_${tripId}_${Date.now()}`;

        console.log(`✅ Trip search created: ${searchId} (Trip ID: ${tripId})`);

        res.json({
            success: true,
            searchId: searchId,
            status: 'searching',
            estimatedWaitTime: '3-7 min',
            tripId: tripId
        });

    } catch (err) {
        console.error('❌ Error creating trip search:', err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

module.exports = router;