require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('../db');
const pushNotificationService = require('../services/pushNotificationService');

// Get ALL trips (for admin dashboard)
router.get('/', async (req, res) => {
    try {
        console.log('📊 Fetching all trips for admin dashboard');

        const result = await db.query(`
            SELECT
                c.*,
                cl.nom as client_nom,
                cl.prenom as client_prenom,
                ch.nom as chauffeur_nom,
                ch.prenom as chauffeur_prenom
            FROM Course c
            LEFT JOIN Client cl ON c.id_client = cl.id_client
            LEFT JOIN Chauffeur ch ON c.id_chauffeur = ch.id_chauffeur
            ORDER BY c.date_heure_depart DESC
            LIMIT 1000
        `);

        console.log(`✅ Found ${result.rowCount} trips`);
        res.json(result.rows);

    } catch (err) {
        console.error("❌ Error fetching all trips:", err);
        res.status(500).json({
            success: false,
            error: 'Error fetching trips',
            message: err.message
        });
    }
});

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
                c.beneficiaire_nom,
                c.beneficiaire_telephone,
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
                beneficiaireName: trip.beneficiaire_nom || null,
                beneficiairePhone: trip.beneficiaire_telephone || null,
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

        // 🔧 Marquer le chauffeur comme indisponible pendant la course
        await db.query(`
            UPDATE Chauffeur 
            SET disponibilite = false 
            WHERE id_chauffeur = $1
        `, [driverId]);
        
        console.log(`✅ Chauffeur ${driverId} is now unavailable during the trip`);

        await db.query('COMMIT');

        const trip = updateResult.rows[0];
        console.log(`✅ Trip ${tripId} accepted successfully`);

        // 🚀 Récupérer les arrêts intermédiaires
        const stopsResult = await db.query(`
            SELECT adresse, latitude, longitude, ordre_arret
            FROM arrets_intermediaires
            WHERE id_course = $1
            ORDER BY ordre_arret ASC
        `, [tripId]);

        const intermediateStops = stopsResult.rows.map(stop => ({
            description: stop.adresse,
            address: stop.adresse,
            latitude: parseFloat(stop.latitude),
            longitude: parseFloat(stop.longitude)
        }));

        console.log(`📍 Found ${intermediateStops.length} intermediate stops for trip ${tripId}`);

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

            // ✅ Récupérer la position actuelle du chauffeur
            const positionResult = await db.query(`
                SELECT latitude, longitude, derniere_maj
                FROM PositionChauffeur
                WHERE id_chauffeur = $1
                ORDER BY derniere_maj DESC
                LIMIT 1
            `, [driverId]);

            let currentPosition = null;
            if (positionResult.rowCount > 0) {
                const pos = positionResult.rows[0];
                currentPosition = {
                    latitude: parseFloat(pos.latitude),
                    longitude: parseFloat(pos.longitude),
                    timestamp: pos.derniere_maj
                };
                console.log('📍 Driver current position:', currentPosition);
            }

            driverData = {
                id: driver.id_chauffeur,
                name: `${driver.chauffeur_prenom} ${driver.chauffeur_nom}`,
                firstName: driver.chauffeur_prenom,
                lastName: driver.chauffeur_nom,
                phone: driver.chauffeur_telephone,
                photo: driver.chauffeur_photo,
                currentPosition: currentPosition, // ✅ AJOUTÉ
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

        // 🎯 CRITICAL: Notifier le CLIENT que sa course a été acceptée
        try {
            console.log('📢 Notifying client that trip was accepted...');
            const { notifyTripAccepted } = require('./websocket');

            // Récupérer l'ID du client depuis la course
            const clientId = trip.id_client;

            if (clientId && driverData) {
                console.log(`📲 Sending trip_accepted notification to client ${clientId}`);
                notifyTripAccepted(clientId, tripId, driverData);
            }
        } catch (notifyError) {
            console.error('⚠️ Error notifying client via WebSocket (trip still accepted):', notifyError.message);
        }

        return res.json({
            success: true,
            message: 'Course acceptée avec succès',
            trip: {
                id: trip.id_course,
                type: 'ride',
                pickup: trip.adresse_depart,
                destination: trip.adresse_arrivee,
                intermediateStops: intermediateStops,
                distance: `${trip.distance_km} km`,
                duration: `${trip.duree_min} min`,
                price: trip.prix,
                paymentMethod: trip.mode_paiement || 'wave',
                silentMode: trip.mode_silencieux || false,
                clientName: trip.nom_client || 'Client Vamo',
                clientPhone: trip.telephone_client,
                beneficiaireName: trip.beneficiaire_nom || null,
                beneficiairePhone: trip.beneficiaire_telephone || null,
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

        // Handle different tripId formats
        let actualCourseId = tripId;
        
        // If tripId is a searchId (contains timestamp), extract the courseId
        if (typeof tripId === 'string' && tripId.includes('_')) {
            const parts = tripId.split('_');
            if (parts.length >= 2) {
                actualCourseId = parseInt(parts[1]);
                console.log(`🔧 Extracted courseId ${actualCourseId} from searchId ${tripId}`);
            }
        }
        // If tripId is just a timestamp (very large number), we need to find the course by other means
        else if (typeof tripId === 'string' && tripId.length > 10) {
            console.log(`🔧 tripId ${tripId} appears to be a timestamp, searching for active course...`);
            
            // Try to find the most recent active course for this client
            // This is a fallback - ideally the client should send the correct courseId
            const recentCourse = await db.query(`
                SELECT id_course 
                FROM Course 
                WHERE etat_course = 'en_attente' 
                ORDER BY date_heure_depart DESC 
                LIMIT 1
            `);
            
            if (recentCourse.rowCount > 0) {
                actualCourseId = recentCourse.rows[0].id_course;
                console.log(`🔧 Found recent course ${actualCourseId} for timestamp ${tripId}`);
            } else {
                console.log(`❌ No active course found for timestamp ${tripId}`);
                return res.status(404).json({
                    success: false,
                    error: 'Aucune course active trouvée'
                });
            }
        }

        // Cancel trip (set status to cancelled)
        // ✅ Allow cancellation if trip is 'en_attente' OR 'acceptee' (driver accepted but not started)
        const result = await db.query(`
            UPDATE Course
            SET etat_course = 'annulee'
            WHERE id_course = $1 AND etat_course IN ('en_attente', 'acceptee')
        `, [actualCourseId]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Course non trouvée ou déjà traitée'
            });
        }

        console.log(`✅ Trip ${tripId} cancelled successfully by client`);

        // Notify driver if there's one assigned and set driver available again
        try {
            console.log(`🔍 Checking for driver assignment for course ${actualCourseId}`);
            const driverQuery = await db.query(`
                SELECT id_chauffeur
                FROM Course
                WHERE id_course = $1
            `, [actualCourseId]);

            console.log(`🔍 Driver query result:`, {
                rowCount: driverQuery.rowCount,
                rows: driverQuery.rows,
                driverId: driverQuery.rows[0]?.id_chauffeur
            });

            if (driverQuery.rowCount > 0 && driverQuery.rows[0].id_chauffeur) {
                const driverId = driverQuery.rows[0].id_chauffeur;
                console.log(`📡 Notifying driver ${driverId} about trip cancellation`);

                // ✅ Set driver available again (client cancelled, not driver's fault)
                await db.query(`
                    UPDATE Chauffeur
                    SET disponibilite = true
                    WHERE id_chauffeur = $1
                `, [driverId]);
                console.log(`✅ Driver ${driverId} set back to available after client cancellation`);

                // Import WebSocket service
                const { notifyDriver } = require('../routes/websocket');
                const notifyResult = await notifyDriver(driverId, 'trip_cancelled', {
                    tripId: actualCourseId,
                    message: 'Course annulée par le client',
                    reason: 'client_cancelled'
                });

                console.log(`📡 Notification result:`, notifyResult);
            } else {
                console.log(`⚠️ No driver assigned to course ${actualCourseId} or driver ID is null`);
            }
        } catch (notifyError) {
            console.error('❌ Error notifying driver about cancellation:', notifyError);
        }

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
        console.log(`🚗 Driver ${driverId} cancelling trip ${tripId}, reason: ${reason || 'No reason provided'}`);

        await db.query('BEGIN');

        // Get current trip info (including client ID and addresses for blacklist)
        const currentTrip = await db.query(`
            SELECT etat_course, id_client, telephone_client, adresse_depart, adresse_arrivee
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

        const trip = currentTrip.rows[0];
        const clientId = trip.id_client;

        // ✅ Mark trip as 'annulee' (cancelled by driver), KEEP driver ID for history
        // Client will automatically start a NEW search which creates a NEW trip
        await db.query(`
            UPDATE Course
            SET etat_course = 'annulee'
            WHERE id_course = $1 AND id_chauffeur = $2
        `, [tripId, driverId]);

        // 🔧 Remettre le chauffeur comme disponible après annulation
        await db.query(`
            UPDATE Chauffeur
            SET disponibilite = true
            WHERE id_chauffeur = $1
        `, [driverId]);

        console.log(`✅ Chauffeur ${driverId} is now available again after cancelling trip`);

        await db.query('COMMIT');

        console.log(`✅ Trip ${tripId} marked as 'annulee' - client will start new search automatically`);

        // 🚫 Add driver to temporary blacklist for this client/route (10 minutes)
        // Blacklist is based on client + route, not just trip ID
        try {
            const blacklistDuration = 10; // minutes
            const blacklistUntil = new Date(Date.now() + blacklistDuration * 60 * 1000);

            console.log(`📋 Blacklist data: driver=${driverId}, trip=${tripId}, client=${trip.id_client}, from="${trip.adresse_depart}", to="${trip.adresse_arrivee}"`);

            await db.query(`
                INSERT INTO ChauffeurBlacklistTemporaire (
                    id_chauffeur, id_course, id_client, adresse_depart, adresse_arrivee, blacklist_jusqu_a, raison
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id_chauffeur, id_course) DO UPDATE
                SET blacklist_jusqu_a = EXCLUDED.blacklist_jusqu_a,
                    raison = EXCLUDED.raison,
                    id_client = EXCLUDED.id_client,
                    adresse_depart = EXCLUDED.adresse_depart,
                    adresse_arrivee = EXCLUDED.adresse_arrivee
            `, [
                driverId,
                tripId,
                trip.id_client,
                trip.adresse_depart,
                trip.adresse_arrivee,
                blacklistUntil,
                reason || 'Annulation par le chauffeur'
            ]);

            console.log(`🚫 Driver ${driverId} blacklisted for client ${trip.id_client} route (${trip.adresse_depart} → ${trip.adresse_arrivee}) until ${blacklistUntil.toLocaleString('fr-FR')}`);
        } catch (blacklistError) {
            console.error('❌ Error adding driver to blacklist:', blacklistError);
            // Don't fail the request if blacklist fails
        }

        // 📡 Notify client about driver cancellation
        try {
            console.log(`📡 Notifying client ${clientId} about driver cancellation`);

            const { notifyClient } = require('../routes/websocket');

            const notification = {
                type: 'driver_cancelled',
                data: {
                    tripId: tripId,
                    reason: reason || 'Non spécifié',
                    message: 'Le chauffeur a annulé la course. Recherche d\'un nouveau chauffeur en cours...',
                    timestamp: new Date().toISOString()
                }
            };

            const notifyResult = await notifyClient(clientId, notification);

            if (notifyResult) {
                console.log(`✅ Client ${clientId} successfully notified of driver cancellation`);
            } else {
                console.log(`⚠️ Client ${clientId} was NOT notified (not connected or error)`);
            }
        } catch (notifyError) {
            console.error('❌ Error notifying client about driver cancellation:', notifyError);
            // Don't fail the request if notification fails
        }

        res.json({
            success: true,
            message: 'Course annulée avec succès. La recherche va redémarrer automatiquement.'
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
            const { notifyClient, getDriverLastLocation } = require('./websocket');

            // ✅ Vérifier s'il y a des arrêts intermédiaires
            const intermediateStopsResult = await db.query(`
                SELECT * FROM arrets_intermediaires
                WHERE id_course = $1
                ORDER BY ordre_arret ASC
            `, [tripId]);

            const hasIntermediateStops = intermediateStopsResult.rowCount > 0;

            // 🎯 Récupérer la position GPS actuelle du chauffeur
            let driverLocation = getDriverLastLocation(driverId);

            // Fallback: récupérer depuis la base de données si pas disponible en mémoire
            if (!driverLocation) {
                console.log('📍 Trying to get driver location from database...');
                const locationResult = await db.query(`
                    SELECT latitude, longitude, derniere_maj
                    FROM PositionChauffeur
                    WHERE id_chauffeur = $1
                `, [driverId]);

                if (locationResult.rowCount > 0) {
                    const loc = locationResult.rows[0];
                    driverLocation = {
                        latitude: parseFloat(loc.latitude),
                        longitude: parseFloat(loc.longitude),
                        timestamp: loc.derniere_maj
                    };
                    console.log('✅ Driver location retrieved from database:', driverLocation);
                } else {
                    console.warn('⚠️ No driver location available (neither WebSocket nor DB)');
                }
            }

            let notification;

            if (hasIntermediateStops) {
                // Si des arrêts intermédiaires existent, notifier que le chauffeur va vers le premier arrêt
                const firstStop = intermediateStopsResult.rows[0];
                notification = {
                    type: 'driving_to_stop',
                    data: {
                        tripId: tripId,
                        stopIndex: 0,
                        stopName: firstStop.adresse || `Arrêt ${firstStop.ordre_arret}`,
                        stopLocation: {
                            latitude: parseFloat(firstStop.latitude),
                            longitude: parseFloat(firstStop.longitude)
                        },
                        driverLocation: driverLocation, // 🆕 Position GPS actuelle du chauffeur
                        message: `Votre voyage a commencé ! Direction: ${firstStop.adresse || `Arrêt ${firstStop.ordre_arret}`}`,
                        driver: driverData,
                        timestamp: new Date().toISOString()
                    }
                };
                console.log(`🛣️ Trip ${tripId} started with intermediate stops - heading to first stop:`, firstStop.adresse);
                if (driverLocation) {
                    console.log(`📍 Driver current location included in notification:`, driverLocation);
                }
            } else {
                // Pas d'arrêts intermédiaires, notification normale
                notification = {
                    type: 'trip_started',
                    data: {
                        tripId: tripId,
                        driverLocation: driverLocation, // 🆕 Position GPS actuelle du chauffeur
                        message: 'Votre voyage a commencé ! Direction: ' + (trip.adresse_arrivee || 'votre destination'),
                        driver: driverData,
                        destination: trip.adresse_arrivee,
                        timestamp: new Date().toISOString()
                    }
                };
                console.log(`🛣️ Trip ${tripId} started without intermediate stops`);
                if (driverLocation) {
                    console.log(`📍 Driver current location included in notification:`, driverLocation);
                }
            }

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

// ✅ API pour notifier l'arrivée à un arrêt intermédiaire
router.post('/arrive-stop', async (req, res) => {
    const { driverId, tripId, stopIndex } = req.body;

    if (!driverId || !tripId || stopIndex === undefined) {
        return res.status(400).json({
            success: false,
            error: 'driverId, tripId et stopIndex sont requis'
        });
    }

    try {
        console.log(`📍 Driver ${driverId} arrived at stop ${stopIndex} for trip ${tripId}`);

        // Vérifier que la course existe et appartient au chauffeur
        const tripResult = await db.query(`
            SELECT * FROM Course
            WHERE id_course = $1 AND id_chauffeur = $2
        `, [tripId, driverId]);

        if (tripResult.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Course non trouvée'
            });
        }

        const trip = tripResult.rows[0];

        // Récupérer l'arrêt intermédiaire
        const stopResult = await db.query(`
            SELECT * FROM arrets_intermediaires
            WHERE id_course = $1 AND ordre_arret = $2
        `, [tripId, stopIndex + 1]); // ordre_arret commence à 1

        if (stopResult.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Arrêt intermédiaire non trouvé'
            });
        }

        const stop = stopResult.rows[0];

        // 🚀 NOTIFICATION WEBSOCKET AU CLIENT
        try {
            const { notifyClient } = require('./websocket');

            const notification = {
                type: 'arrived_at_stop',
                data: {
                    tripId: tripId,
                    stopIndex: stopIndex,
                    stopName: stop.adresse || `Arrêt ${stopIndex + 1}`,
                    message: `Votre chauffeur est arrivé à ${stop.adresse || `l'arrêt ${stopIndex + 1}`}`,
                    timestamp: new Date().toISOString()
                }
            };

            await notifyClient(trip.id_client, notification);
            console.log(`✅ Client ${trip.id_client} notified of arrival at stop ${stopIndex}`);

        } catch (wsError) {
            console.error('⚠️ WebSocket notification failed:', wsError.message);
        }

        res.json({
            success: true,
            message: `Arrivée à l'arrêt ${stopIndex + 1} enregistrée`,
            stop: {
                index: stopIndex,
                address: stop.adresse
            }
        });

    } catch (err) {
        console.error("❌ Error arriving at stop:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// ✅ API pour continuer depuis un arrêt intermédiaire
router.post('/continue-from-stop', async (req, res) => {
    const { driverId, tripId, currentStopIndex } = req.body;

    if (!driverId || !tripId || currentStopIndex === undefined) {
        return res.status(400).json({
            success: false,
            error: 'driverId, tripId et currentStopIndex sont requis'
        });
    }

    try {
        console.log(`🚗 Driver ${driverId} continuing from stop ${currentStopIndex} for trip ${tripId}`);

        // Vérifier que la course existe et appartient au chauffeur
        const tripResult = await db.query(`
            SELECT * FROM Course
            WHERE id_course = $1 AND id_chauffeur = $2
        `, [tripId, driverId]);

        if (tripResult.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Course non trouvée'
            });
        }

        const trip = tripResult.rows[0];

        // Vérifier s'il y a un prochain arrêt
        const nextStopResult = await db.query(`
            SELECT * FROM arrets_intermediaires
            WHERE id_course = $1 AND ordre_arret = $2
            ORDER BY ordre_arret ASC
        `, [tripId, currentStopIndex + 2]); // ordre_arret commence à 1

        const hasNextStop = nextStopResult.rowCount > 0;

        // 🚀 NOTIFICATION WEBSOCKET AU CLIENT
        try {
            const { notifyClient, getDriverLastLocation } = require('./websocket');

            // 🎯 Récupérer la position GPS actuelle du chauffeur
            let driverLocation = getDriverLastLocation(driverId);

            // Fallback: récupérer depuis la base de données si pas disponible en mémoire
            if (!driverLocation) {
                console.log('📍 Trying to get driver location from database...');
                const locationResult = await db.query(`
                    SELECT latitude, longitude, derniere_maj
                    FROM PositionChauffeur
                    WHERE id_chauffeur = $1
                `, [driverId]);

                if (locationResult.rowCount > 0) {
                    const loc = locationResult.rows[0];
                    driverLocation = {
                        latitude: parseFloat(loc.latitude),
                        longitude: parseFloat(loc.longitude),
                        timestamp: loc.derniere_maj
                    };
                    console.log('✅ Driver location retrieved from database:', driverLocation);
                } else {
                    console.warn('⚠️ No driver location available for continue-from-stop');
                }
            }

            let notification;

            if (hasNextStop) {
                // Il y a un prochain arrêt
                const nextStop = nextStopResult.rows[0];
                notification = {
                    type: 'continuing_from_stop',
                    data: {
                        tripId: tripId,
                        nextStopIndex: currentStopIndex + 1,
                        nextStopName: nextStop.adresse || `Arrêt ${currentStopIndex + 2}`,
                        nextStopLocation: {
                            latitude: parseFloat(nextStop.latitude),
                            longitude: parseFloat(nextStop.longitude)
                        },
                        driverLocation: driverLocation, // 🆕 Position GPS actuelle du chauffeur
                        message: `Votre chauffeur se dirige vers ${nextStop.adresse || `l'arrêt ${currentStopIndex + 2}`}`,
                        timestamp: new Date().toISOString()
                    }
                };
                console.log(`🛣️ Continuing to next stop: ${nextStop.adresse}`);
                if (driverLocation) {
                    console.log(`📍 Driver current location included:`, driverLocation);
                }
            } else {
                // Dernier arrêt, direction destination finale
                notification = {
                    type: 'continuing_from_stop',
                    data: {
                        tripId: tripId,
                        goingToDestination: true,
                        driverLocation: driverLocation, // 🆕 Position GPS actuelle du chauffeur
                        message: `Votre chauffeur se dirige vers votre destination finale: ${trip.adresse_arrivee}`,
                        timestamp: new Date().toISOString()
                    }
                };
                console.log(`🛣️ Continuing to final destination: ${trip.adresse_arrivee}`);
                if (driverLocation) {
                    console.log(`📍 Driver current location included:`, driverLocation);
                }
            }

            await notifyClient(trip.id_client, notification);
            console.log(`✅ Client ${trip.id_client} notified of continuation from stop ${currentStopIndex}`);

        } catch (wsError) {
            console.error('⚠️ WebSocket notification failed:', wsError.message);
        }

        res.json({
            success: true,
            message: hasNextStop ? 'En route vers le prochain arrêt' : 'En route vers la destination finale',
            nextStop: hasNextStop ? {
                index: currentStopIndex + 1,
                address: nextStopResult.rows[0].adresse
            } : null
        });

    } catch (err) {
        console.error("❌ Error continuing from stop:", err);
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
                firstName: driver.prenom, // ✅ AJOUTÉ pour compatibilité frontend
                lastName: driver.nom,     // ✅ AJOUTÉ pour compatibilité frontend
                phone: driver.telephone,
                vehicle: {
                    brand: driver.marque_vehicule || 'Véhicule',
                    plate: driver.plaque_immatriculation || 'Non spécifiée'
                }
            };
        }

        // 🔧 Remettre le chauffeur comme disponible après completion
        await db.query(`
            UPDATE Chauffeur 
            SET disponibilite = true 
            WHERE id_chauffeur = $1
        `, [driverId]);
        
        console.log(`✅ Chauffeur ${driverId} is now available again after completing trip`);

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
                        driverName: driverData ? driverData.name : 'Votre chauffeur', // ✅ CORRECTION: Utiliser driverData.name au lieu de prenom/nom
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
        const { origin, destination, estimatedFare, passenger } = req.body;

        console.log('🔍 Trip search request received:', {
            origin: origin?.description,
            destination: destination?.description,
            estimatedFare,
            passenger: passenger ? `${passenger.nom} ${passenger.prenom || ''}` : 'Non spécifié'
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
                date_heure_depart,
                passager_nom,
                passager_prenom,
                passager_telephone,
                passager_est_client
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, $13, $14, $15, $16
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
            15,  // Default duration
            passenger?.nom || null,
            passenger?.prenom || null,
            passenger?.telephone || null,
            passenger?.est_client !== undefined ? passenger.est_client : true
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