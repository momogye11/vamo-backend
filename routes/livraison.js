const express = require('express');
const router = express.Router();
const pool = require('../db');

// Store for managing active delivery searches
const activeDeliverySearches = new Map();

// Utility function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(coord1, coord2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
}

// Start a delivery search for a delivery request
router.post('/search', async (req, res) => {
    const {
        origin,
        destination,
        deliveryType,
        paymentMethod,
        estimatedFare,
        routeDistance,
        routeDuration,
        colisSize,
        description,
        instructions
    } = req.body;
    
    try {
        console.log('🚚 Starting delivery search with full data:');
        console.log('  Origin:', JSON.stringify(origin, null, 2));
        console.log('  Destination:', JSON.stringify(destination, null, 2));
        console.log('  Delivery Type:', deliveryType);
        console.log('  Payment Method:', paymentMethod);
        console.log('  Estimated Fare:', estimatedFare);
        console.log('  Route Distance:', routeDistance);
        console.log('  Route Duration:', routeDuration);
        console.log('  Colis Size:', colisSize);
        
        console.log('🔍 DEBUG - About to extract coordinates...');
        
        // Extract addresses and coordinates from the frontend data structure
        const originAddress = origin?.description || origin?.address || origin?.start_address || 'Unknown origin';
        const destinationAddress = destination?.description || destination?.address || destination?.end_address || 'Unknown destination';
        
        console.log('🔍 DEBUG - Raw data received:');
        console.log('  Origin raw:', JSON.stringify(origin, null, 2));
        console.log('  Destination raw:', JSON.stringify(destination, null, 2));
        
        // Handle different coordinate formats
        let originCoords = origin?.location || origin?.coordinates || origin?.start_location;
        let destCoords = destination?.location || destination?.coordinates || destination?.end_location;
        
        console.log('🔍 Debug coordinate extraction:');
        console.log('  Origin:', { hasLocation: !!origin?.location, hasCoordinates: !!origin?.coordinates, hasStartLocation: !!origin?.start_location, hasLatLng: !!(origin?.latitude && origin?.longitude) });
        console.log('  Destination:', { hasLocation: !!destination?.location, hasCoordinates: !!destination?.coordinates, hasEndLocation: !!destination?.end_location, hasLatLng: !!(destination?.latitude && destination?.longitude) });
        
        // If coordinates are directly in the object (latitude/longitude format)
        if (!originCoords && origin?.latitude && origin?.longitude) {
            originCoords = { lat: origin.latitude, lng: origin.longitude };
            console.log('✅ Extracted origin coords from latitude/longitude:', originCoords);
        }
        if (!destCoords && destination?.latitude && destination?.longitude) {
            destCoords = { lat: destination.latitude, lng: destination.longitude };
            console.log('✅ Extracted destination coords from latitude/longitude:', destCoords);
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
        
        console.log('✅ DEBUG - Coordinates extracted successfully:');
        console.log('  Origin coords:', originCoords);
        console.log('  Destination coords:', destCoords);
        
        // Validate required fields
        if (!origin || !destination || !estimatedFare) {
            console.error('❌ Missing required fields:', { origin: !!origin, destination: !!destination, estimatedFare: !!estimatedFare });
            return res.status(400).json({
                success: false,
                error: 'Origin, destination, and estimated fare are required'
            });
        }

        // Additional validation for extreme values (respecting database constraints)
        const cleanDistance = Math.min(parseFloat(routeDistance) || 5.0, 999.99); // BD constraint: numeric(5,2)
        const cleanDuration = Math.min(parseInt(routeDuration?.replace(/[^\d]/g, '')) || 15, 1440); // 24h max
        const cleanFare = Math.min(parseFloat(estimatedFare) || 0, 99999999.99); // BD constraint: numeric(10,2)
        
        console.log('🔧 Data validation/cleaning:');
        console.log('  Original distance:', routeDistance, '→ Clean:', cleanDistance);
        console.log('  Original duration:', routeDuration, '→ Clean:', cleanDuration);
        console.log('  Original fare:', estimatedFare, '→ Clean:', cleanFare);
        
        // Map payment method to database format
        const mapPaymentMethod = (method) => {
            const normalized = (method || 'especes').toLowerCase();
            switch (normalized) {
                case 'orange':
                case 'orange money':
                case 'orange_money':
                    return 'orange_money';
                case 'wave':
                case 'wave money':
                    return 'wave';
                case 'especes':
                case 'cash':
                case 'argent':
                    return 'especes';
                default:
                    return 'especes';
            }
        };
        
        const dbPaymentMethod = mapPaymentMethod(paymentMethod);
        console.log('  Payment method mapping:', paymentMethod, '→', dbPaymentMethod);
        
        // Map delivery type to database format
        const mapDeliveryType = (type) => {
            const normalized = (type || 'express').toLowerCase();
            switch (normalized) {
                case 'express':
                    return 1; // TypeLivraison ID for express
                case 'flex':
                case 'standard':
                    return 2; // TypeLivraison ID for flex
                default:
                    return 1;
            }
        };
        
        const dbDeliveryType = mapDeliveryType(deliveryType);
        console.log('  Delivery type mapping:', deliveryType, '→', dbDeliveryType);
        
        // Start database transaction
        await pool.query('BEGIN');
        
        // Create a delivery request in the database
        const deliveryResult = await pool.query(`
            INSERT INTO Livraison (
                adresse_depart,
                adresse_arrivee,
                latitude_depart,
                longitude_depart,
                latitude_arrivee,
                longitude_arrivee,
                prix,
                taille_colis,
                instructions,
                id_type,
                etat_livraison,
                distance_km,
                duree_estimee_min,
                mode_paiement,
                description_colis,
                date_heure_demande
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'en_attente', $11, $12, $13, $14, CURRENT_TIMESTAMP)
            RETURNING id_livraison
        `, [
            originAddress,
            destinationAddress,
            parseFloat(originCoords.lat || originCoords.latitude),
            parseFloat(originCoords.lng || originCoords.longitude),
            parseFloat(destCoords.lat || destCoords.latitude),
            parseFloat(destCoords.lng || destCoords.longitude),
            cleanFare,
            colisSize || 'M',
            instructions || '',
            dbDeliveryType,
            cleanDistance,
            cleanDuration,
            dbPaymentMethod,
            description || 'Colis à livrer'
        ]);
        
        const deliveryId = deliveryResult.rows[0].id_livraison;
        const searchId = `delivery_search_${deliveryId}_${Date.now()}`;
        
        // Store search session data
        activeDeliverySearches.set(searchId, {
            deliveryId: deliveryId,
            status: 'searching',
            origin: origin,
            destination: destination,
            estimatedFare: estimatedFare,
            startTime: new Date(),
            paymentMethod: paymentMethod,
            deliveryType: deliveryType
        });
        
        await pool.query('COMMIT');
        
        console.log(`✅ Delivery search started: ${searchId} (Delivery ID: ${deliveryId})`);
        
        // 🚀 BROADCAST À TOUS LES LIVREURS DISPONIBLES
        try {
            console.log('📡 Broadcasting new delivery to all available delivery drivers...');
            
            // Récupérer tous les livreurs disponibles
            const availableDrivers = await pool.query(`
                SELECT id_livreur, nom, prenom 
                FROM Livreur 
                WHERE disponibilite = true 
                AND statut_validation = 'approuve'
            `);
            
            console.log(`📊 Found ${availableDrivers.rowCount} available delivery drivers to notify`);
            
            // Préparer les données de la livraison pour la notification
            const deliveryNotification = {
                type: 'new_delivery',
                data: {
                    id: deliveryId,
                    pickup: originAddress,
                    destination: destinationAddress,
                    distance: `${cleanDistance} km`,
                    duration: `${cleanDuration} min`,
                    price: cleanFare,
                    paymentMethod: dbPaymentMethod,
                    colisSize: colisSize || 'M',
                    deliveryType: deliveryType,
                    pickupCoords: {
                        latitude: parseFloat(originCoords.lat || originCoords.latitude),
                        longitude: parseFloat(originCoords.lng || originCoords.longitude)
                    },
                    destinationCoords: {
                        latitude: parseFloat(destCoords.lat || destCoords.latitude),
                        longitude: parseFloat(destCoords.lng || destCoords.longitude)
                    }
                }
            };
            
            // Notifier chaque livreur via WebSocket (comme pour les chauffeurs)
            const { notifyAllDeliveryDrivers } = require('./websocket');
            const notifiedCount = await notifyAllDeliveryDrivers(availableDrivers.rows, deliveryNotification);
            
            console.log(`✅ Delivery broadcasted to ${notifiedCount} delivery drivers successfully`);
            
        } catch (broadcastError) {
            console.error('⚠️ Error broadcasting to delivery drivers (delivery still created):', broadcastError.message);
            // Ne pas faire échouer la création de livraison si la notification échoue
        }
        
        res.json({
            success: true,
            searchId: searchId,
            status: 'searching',
            estimatedWaitTime: '3-7 min',
            deliveryId: deliveryId
        });
        
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("❌ DETAILED ERROR starting delivery search:");
        console.error("   Error message:", err.message);
        console.error("   Error stack:", err.stack);
        console.error("   Error code:", err.code);
        console.error("   Error detail:", err.detail);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la recherche'
        });
    }
});

// Check the status of a delivery search
router.get('/search/:searchId/status', async (req, res) => {
    const { searchId } = req.params;
    
    try {
        console.log(`🔄 Checking delivery search status: ${searchId}`);
        
        const searchData = activeDeliverySearches.get(searchId);
        
        if (!searchData) {
            return res.status(404).json({
                success: false,
                error: 'Delivery search session not found'
            });
        }
        
        // Check if the delivery has been assigned to a driver
        const deliveryResult = await pool.query(`
            SELECT 
                l.etat_livraison,
                l.id_livreur,
                li.nom as livreur_nom,
                li.prenom as livreur_prenom,
                li.telephone as livreur_telephone
            FROM Livraison l
            LEFT JOIN Livreur li ON l.id_livreur = li.id_livreur
            WHERE l.id_livraison = $1
        `, [searchData.deliveryId]);
        
        if (deliveryResult.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Delivery not found'
            });
        }
        
        const delivery = deliveryResult.rows[0];
        let status = 'searching';
        let driver = null;
        
        // Update status based on delivery state
        if (delivery.etat_livraison === 'acceptee' && delivery.id_livreur) {
            status = 'driver_found';
            searchData.status = 'driver_found';
            
            // Récupérer les vraies données du livreur + position
            const driverDetailsResult = await pool.query(`
                SELECT 
                    l.id_livreur,
                    l.nom, l.prenom, l.telephone, l.photo_selfie,
                    l.type_vehicule,
                    pl.latitude, pl.longitude
                FROM Livreur l
                LEFT JOIN PositionLivreur pl ON l.id_livreur = pl.id_livreur
                WHERE l.id_livreur = $1
            `, [delivery.id_livreur]);
            
            const driverData = driverDetailsResult.rows[0] || {};
            
            // Calculer l'ETA approximatif (distance / vitesse moyenne 25km/h en ville pour moto)
            const originCoords = { 
                lat: parseFloat(delivery.latitude_depart) || 14.7167, 
                lng: parseFloat(delivery.longitude_depart) || -17.4677 
            };
            const driverCoords = { 
                lat: parseFloat(driverData.latitude) || 14.7167, 
                lng: parseFloat(driverData.longitude) || -17.4677 
            };
            const estimatedDistance = calculateDistance(originCoords, driverCoords);
            const estimatedETA = Math.max(1, Math.round(estimatedDistance / 25 * 60)); // minutes
            
            driver = {
                id: driverData.id_livreur,
                name: `${driverData.prenom || 'Livreur'} ${driverData.nom || ''}`.trim(),
                firstName: driverData.prenom || 'Livreur',
                lastName: driverData.nom || '',
                phone: driverData.telephone,
                photo: driverData.photo_selfie,
                rating: 4.3, // TODO: Calculate real rating from NoteLivraison table
                eta: `${estimatedETA} min`,
                vehicle: {
                    type: driverData.type_vehicule || 'motorcycle',
                    make: 'Moto' // Temporaire: marque_vehicule est déjà utilisée
                },
                location: {
                    latitude: parseFloat(driverData.latitude) || 14.7167,
                    longitude: parseFloat(driverData.longitude) || -17.4677
                }
            };
        } else if (delivery.etat_livraison === 'annulee') {
            status = 'cancelled';
            searchData.status = 'cancelled';
        } else {
            // Check if we've been searching too long (simulate timeout)
            const searchDuration = new Date() - searchData.startTime;
            if (searchDuration > 180000) { // 3 minutes timeout for deliveries
                status = 'no_drivers';
                searchData.status = 'no_drivers';
                console.log(`⏰ Delivery search timeout after ${Math.round(searchDuration/1000)}s for delivery ${searchData.deliveryId}`);
            } else {
                console.log(`⏳ Still searching for delivery driver... ${Math.round(searchDuration/1000)}s elapsed`);
            }
        }
        
        console.log(`📱 Delivery search status update: ${status}`, {
            searchId,
            deliveryId: searchData.deliveryId,
            driver: driver
        });
        
        res.json({
            success: true,
            status: status,
            driver: driver,
            estimatedWaitTime: status === 'searching' ? '3-7 min' : null,
            deliveryId: searchData.deliveryId
        });
        
    } catch (err) {
        console.error("❌ Error checking delivery search status:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Cancel a delivery search
router.delete('/search/:searchId', async (req, res) => {
    const { searchId } = req.params;
    
    try {
        console.log(`❌ Cancelling delivery search: ${searchId}`);
        
        const searchData = activeDeliverySearches.get(searchId);
        
        if (!searchData) {
            return res.status(404).json({
                success: false,
                error: 'Delivery search session not found'
            });
        }
        
        // Update delivery status to cancelled
        await pool.query(`
            UPDATE Livraison 
            SET etat_livraison = 'annulee' 
            WHERE id_livraison = $1 AND etat_livraison = 'en_attente'
        `, [searchData.deliveryId]);
        
        // Remove from active searches
        activeDeliverySearches.delete(searchId);
        
        console.log(`✅ Delivery search cancelled: ${searchId}`);
        
        res.json({
            success: true,
            message: 'Delivery search cancelled successfully'
        });
        
    } catch (err) {
        console.error("❌ Error cancelling delivery search:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Get delivery details after driver is found
router.get('/delivery/:deliveryId', async (req, res) => {
    const { deliveryId } = req.params;
    
    try {
        console.log(`🚚 Fetching delivery details: ${deliveryId}`);
        
        const deliveryResult = await pool.query(`
            SELECT 
                l.*,
                li.nom as livreur_nom,
                li.prenom as livreur_prenom,
                li.telephone as livreur_telephone
            FROM Livraison l
            LEFT JOIN Livreur li ON l.id_livreur = li.id_livreur
            WHERE l.id_livraison = $1
        `, [deliveryId]);
        
        if (deliveryResult.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Delivery not found'
            });
        }
        
        const delivery = deliveryResult.rows[0];
        
        res.json({
            success: true,
            delivery: {
                id: delivery.id_livraison,
                origin: delivery.adresse_depart,
                destination: delivery.adresse_arrivee,
                status: delivery.etat_livraison,
                price: delivery.prix,
                paymentMethod: delivery.mode_paiement,
                distance: `${delivery.distance_km} km`,
                duration: `${delivery.duree_estimee_min} min`,
                colisSize: delivery.taille_colis,
                description: delivery.description_colis,
                instructions: delivery.instructions,
                driver: delivery.id_livreur ? {
                    id: delivery.id_livreur,
                    name: `${delivery.livreur_prenom} ${delivery.livreur_nom}`,
                    phone: delivery.livreur_telephone
                } : null,
                coordinates: {
                    origin: {
                        latitude: parseFloat(delivery.latitude_depart),
                        longitude: parseFloat(delivery.longitude_depart)
                    },
                    destination: {
                        latitude: parseFloat(delivery.latitude_arrivee),
                        longitude: parseFloat(delivery.longitude_arrivee)
                    }
                },
                timestamps: {
                    requested: delivery.date_heure_demande,
                    collected: delivery.date_heure_collecte,
                    completed: delivery.date_heure_arrivee
                }
            }
        });
        
    } catch (err) {
        console.error("❌ Error fetching delivery details:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Accept delivery by delivery driver
router.post('/accept', async (req, res) => {
    const { driverId, deliveryId } = req.body;
    
    try {
        console.log(`🚚 Livreur ${driverId} attempting to accept delivery ${deliveryId}`);
        
        // Validate required fields
        if (!driverId || !deliveryId) {
            return res.status(400).json({
                success: false,
                error: 'Driver ID and delivery ID are required'
            });
        }
        
        // Start database transaction
        await pool.query('BEGIN');
        
        // Check if delivery is still available
        const deliveryCheck = await pool.query(`
            SELECT etat_livraison, id_livreur 
            FROM Livraison 
            WHERE id_livraison = $1
        `, [deliveryId]);
        
        if (deliveryCheck.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Delivery not found'
            });
        }
        
        const delivery = deliveryCheck.rows[0];
        
        if (delivery.etat_livraison !== 'en_attente') {
            await pool.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                error: 'Delivery is no longer available'
            });
        }
        
        if (delivery.id_livreur && delivery.id_livreur !== parseInt(driverId)) {
            await pool.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                error: 'Delivery already accepted by another driver'
            });
        }
        
        // Check if driver exists and is available
        const driverCheck = await pool.query(`
            SELECT nom, prenom, disponibilite, statut_validation 
            FROM Livreur 
            WHERE id_livreur = $1
        `, [driverId]);
        
        if (driverCheck.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Driver not found'
            });
        }
        
        const driver = driverCheck.rows[0];
        
        if (!driver.disponibilite) {
            await pool.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Driver is not available'
            });
        }
        
        if (driver.statut_validation !== 'approuve') {
            await pool.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Driver is not approved'
            });
        }
        
        // Accept the delivery
        const updateResult = await pool.query(`
            UPDATE Livraison 
            SET id_livreur = $1, 
                etat_livraison = 'acceptee',
                date_heure_depart = CURRENT_TIMESTAMP
            WHERE id_livraison = $2 
            AND etat_livraison = 'en_attente'
            RETURNING *
        `, [driverId, deliveryId]);
        
        if (updateResult.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                error: 'Failed to accept delivery - it may have been taken by another driver'
            });
        }
        
        // Mark driver as busy (temporary fix - use disponibilite instead of en_livraison)
        await pool.query(`
            UPDATE Livreur 
            SET disponibilite = false 
            WHERE id_livreur = $1
        `, [driverId]);
        
        await pool.query('COMMIT');
        
        const acceptedDelivery = updateResult.rows[0];
        
        console.log(`✅ Delivery ${deliveryId} accepted by livreur ${driver.prenom} ${driver.nom} (ID: ${driverId})`);
        
        res.json({
            success: true,
            message: 'Delivery accepted successfully',
            delivery: {
                id: acceptedDelivery.id_livraison,
                origin: acceptedDelivery.adresse_depart,
                destination: acceptedDelivery.adresse_arrivee,
                status: acceptedDelivery.etat_livraison,
                price: acceptedDelivery.prix,
                colisSize: acceptedDelivery.taille_colis,
                coordinates: {
                    origin: {
                        latitude: parseFloat(acceptedDelivery.latitude_depart),
                        longitude: parseFloat(acceptedDelivery.longitude_depart)
                    },
                    destination: {
                        latitude: parseFloat(acceptedDelivery.latitude_arrivee),
                        longitude: parseFloat(acceptedDelivery.longitude_arrivee)
                    }
                }
            }
        });
        
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("❌ Error accepting delivery:", err);
        res.status(500).json({
            success: false,
            error: 'Server error while accepting delivery'
        });
    }
});

// Cleanup old delivery searches periodically (run every 5 minutes)
setInterval(() => {
    const now = new Date();
    const cutoffTime = 10 * 60 * 1000; // 10 minutes
    
    for (const [searchId, searchData] of activeDeliverySearches.entries()) {
        if (now - searchData.startTime > cutoffTime) {
            console.log(`🧹 Cleaning up old delivery search: ${searchId}`);
            activeDeliverySearches.delete(searchId);
        }
    }
}, 5 * 60 * 1000);

// Création d'une nouvelle livraison (ancienne route, gardée pour compatibilité)
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

// Cancel a delivery (POST endpoint for frontend compatibility)
router.post('/cancel', async (req, res) => {
    const { deliveryId } = req.body;
    
    try {
        console.log(`❌ Cancelling delivery: ${deliveryId}`);
        
        // Update delivery status to cancelled
        await pool.query(`
            UPDATE Livraison 
            SET etat_livraison = 'annulee' 
            WHERE id_livraison = $1 AND etat_livraison = 'en_attente'
        `, [deliveryId]);
        
        // Remove from active searches if exists
        for (const [searchId, searchData] of activeDeliverySearches.entries()) {
            if (searchData.deliveryId === deliveryId) {
                console.log(`🧹 Removing delivery search: ${searchId}`);
                activeDeliverySearches.delete(searchId);
                break;
            }
        }
        
        console.log(`✅ Delivery cancelled: ${deliveryId}`);
        
        res.json({
            success: true,
            message: 'Delivery cancelled successfully'
        });
        
    } catch (err) {
        console.error("❌ Error cancelling delivery:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// =====================================
// ENDPOINTS POUR CHANGEMENTS D'ÉTAT
// Copiés de trips.js et adaptés pour les livraisons
// =====================================

// API spécifique pour marquer l'arrivée au pickup avec notification WebSocket
router.post('/arrived-pickup', async (req, res) => {
    const { driverId, deliveryId } = req.body;

    if (!driverId || !deliveryId) {
        return res.status(400).json({
            success: false,
            error: 'driverId et deliveryId sont requis'
        });
    }

    try {
        console.log(`🛵 Delivery driver ${driverId} arrived at pickup for delivery ${deliveryId}`);

        await pool.query('BEGIN');

        // Vérifier que la livraison existe et appartient au livreur
        const currentDelivery = await pool.query(`
            SELECT etat_livraison, id_client, adresse_depart
            FROM Livraison 
            WHERE id_livraison = $1 AND id_livreur = $2
        `, [deliveryId, driverId]);

        if (currentDelivery.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Livraison non trouvée ou non assignée à ce livreur'
            });
        }

        const delivery = currentDelivery.rows[0];

        // Vérifier que la livraison est dans le bon état
        if (delivery.etat_livraison !== 'acceptee') {
            await pool.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: `Livraison doit être acceptée pour marquer l'arrivée au pickup. État actuel: ${delivery.etat_livraison}`
            });
        }

        // Mettre à jour le statut de la livraison
        const updateResult = await pool.query(`
            UPDATE Livraison 
            SET etat_livraison = 'arrivee_pickup'
            WHERE id_livraison = $1 AND id_livreur = $2
            RETURNING etat_livraison, date_heure_depart
        `, [deliveryId, driverId]);

        if (updateResult.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(500).json({
                success: false,
                error: 'Échec de la mise à jour du statut'
            });
        }

        await pool.query('COMMIT');

        // Récupérer les informations du livreur
        const driverData = await pool.query(`
            SELECT prenom, nom, telephone
            FROM Livreur 
            WHERE id_livreur = $1
        `, [driverId]);

        // 🔌 WEBSOCKET NOTIFICATION AU CLIENT
        try {
            const { notifyClient } = require('./websocket');
            
            const notification = {
                type: 'driver_arrived_pickup',
                data: {
                    deliveryId: deliveryId,
                    message: 'Votre livreur est arrivé au point de récupération',
                    driver: driverData.rows[0],
                    timestamp: new Date().toISOString()
                }
            };

            // Notifier le client (si connecté via WebSocket)
            const notificationSent = await notifyClient(delivery.id_client, notification);
            if (notificationSent) {
                console.log(`✅ Client ${delivery.id_client} successfully notified of driver arrival`);
            } else {
                console.log(`⚠️ Client ${delivery.id_client} was NOT notified (not connected or error)`);
            }
        } catch (wsError) {
            console.error('⚠️ WebSocket notification failed (delivery status updated):', wsError.message);
            // Ne pas faire échouer la requête si la notification échoue
        }

        console.log(`✅ Delivery ${deliveryId} marked as arrived at pickup`);

        res.json({
            success: true,
            message: 'Arrivée au pickup confirmée',
            delivery: {
                id: deliveryId,
                status: 'arrivee_pickup',
                arrivedAt: new Date().toISOString()
            },
            driver: driverData.rows[0]
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("❌ Error marking arrival at pickup:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// API spécifique pour démarrer la livraison avec notification WebSocket
router.post('/start-delivery', async (req, res) => {
    const { driverId, deliveryId } = req.body;

    if (!driverId || !deliveryId) {
        return res.status(400).json({
            success: false,
            error: 'driverId et deliveryId sont requis'
        });
    }

    try {
        console.log(`🛵 Delivery driver ${driverId} starting delivery ${deliveryId}`);

        await pool.query('BEGIN');

        // Vérifier que la livraison existe et appartient au livreur
        const currentDelivery = await pool.query(`
            SELECT etat_livraison, id_client, adresse_arrivee
            FROM Livraison 
            WHERE id_livraison = $1 AND id_livreur = $2
        `, [deliveryId, driverId]);

        if (currentDelivery.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Livraison non trouvée ou non assignée à ce livreur'
            });
        }

        const delivery = currentDelivery.rows[0];

        // Vérifier que la livraison est dans le bon état
        if (delivery.etat_livraison !== 'arrivee_pickup') {
            await pool.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: `Livraison doit être arrivée au pickup pour démarrer. État actuel: ${delivery.etat_livraison}`
            });
        }

        // Mettre à jour le statut de la livraison
        const updateResult = await pool.query(`
            UPDATE Livraison 
            SET etat_livraison = 'en_cours'
            WHERE id_livraison = $1 AND id_livreur = $2
            RETURNING etat_livraison
        `, [deliveryId, driverId]);

        if (updateResult.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(500).json({
                success: false,
                error: 'Échec de la mise à jour du statut'
            });
        }

        await pool.query('COMMIT');

        // Récupérer les informations du livreur
        const driverData = await pool.query(`
            SELECT prenom, nom, telephone
            FROM Livreur 
            WHERE id_livreur = $1
        `, [driverId]);

        // 🔌 WEBSOCKET NOTIFICATION AU CLIENT
        try {
            const { notifyClient } = require('./websocket');
            
            const notification = {
                type: 'trip_started',
                data: {
                    deliveryId: deliveryId,
                    message: 'Votre livraison a commencé',
                    driver: driverData.rows[0],
                    destination: delivery.adresse_arrivee,
                    timestamp: new Date().toISOString()
                }
            };

            // Notifier le client (si connecté via WebSocket)
            const notificationSent = await notifyClient(delivery.id_client, notification);
            if (notificationSent) {
                console.log(`✅ Client ${delivery.id_client} successfully notified of delivery start`);
            } else {
                console.log(`⚠️ Client ${delivery.id_client} was NOT notified (not connected or error)`);
            }
        } catch (wsError) {
            console.error('⚠️ WebSocket notification failed (delivery status updated):', wsError.message);
            // Ne pas faire échouer la requête si la notification échoue
        }

        console.log(`✅ Delivery ${deliveryId} started successfully`);

        res.json({
            success: true,
            message: 'Livraison démarrée avec succès',
            delivery: {
                id: deliveryId,
                status: 'en_cours',
                startedAt: new Date().toISOString(),
                destination: delivery.adresse_arrivee
            },
            driver: driverData.rows[0]
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("❌ Error starting delivery:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// API spécifique pour terminer la livraison avec notification WebSocket
router.post('/complete', async (req, res) => {
    const { driverId, deliveryId } = req.body;

    if (!driverId || !deliveryId) {
        return res.status(400).json({
            success: false,
            error: 'driverId et deliveryId sont requis'
        });
    }

    try {
        console.log(`🛵 Delivery driver ${driverId} completing delivery ${deliveryId}`);

        await pool.query('BEGIN');

        // Vérifier que la livraison existe et appartient au livreur
        const currentDelivery = await pool.query(`
            SELECT etat_livraison, id_client, prix, adresse_arrivee
            FROM Livraison 
            WHERE id_livraison = $1 AND id_livreur = $2
        `, [deliveryId, driverId]);

        if (currentDelivery.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: 'Livraison non trouvée ou non assignée à ce livreur'
            });
        }

        const delivery = currentDelivery.rows[0];

        // Vérifier que la livraison est dans le bon état
        if (delivery.etat_livraison !== 'en_cours') {
            await pool.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: `Livraison doit être en cours pour être terminée. État actuel: ${delivery.etat_livraison}`
            });
        }

        // Mettre à jour le statut de la livraison
        const updateResult = await pool.query(`
            UPDATE Livraison 
            SET etat_livraison = 'terminee', 
                date_heure_arrivee = CURRENT_TIMESTAMP
            WHERE id_livraison = $1 AND id_livreur = $2
            RETURNING date_heure_arrivee, prix
        `, [deliveryId, driverId]);

        if (updateResult.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(500).json({
                success: false,
                error: 'Échec de la mise à jour du statut'
            });
        }

        // 🔧 Remettre le livreur comme disponible après completion (comme les chauffeurs)
        await pool.query(`
            UPDATE Livreur 
            SET disponibilite = true 
            WHERE id_livreur = $1
        `, [driverId]);
        
        console.log(`✅ Livreur ${driverId} is now available again after completing delivery`);

        await pool.query('COMMIT');

        // Récupérer les informations du livreur
        const driverData = await pool.query(`
            SELECT prenom, nom, telephone
            FROM Livreur 
            WHERE id_livreur = $1
        `, [driverId]);

        const finalPrice = updateResult.rows[0].prix;

        // 🔌 WEBSOCKET NOTIFICATION AU CLIENT
        try {
            const { notifyClient } = require('./websocket');
            
            const notification = {
                type: 'trip_completed',
                data: {
                    deliveryId: deliveryId,
                    message: 'Votre livraison est terminée',
                    driver: driverData.rows[0],
                    finalPrice: finalPrice,
                    currency: 'FCFA',
                    timestamp: new Date().toISOString(),
                    deliveryData: {
                        id: deliveryId,
                        finalPrice: finalPrice,
                        driverName: `${driverData.rows[0].prenom} ${driverData.rows[0].nom}`
                    }
                }
            };

            // Notifier le client (si connecté via WebSocket)
            const notificationSent = await notifyClient(delivery.id_client, notification);
            if (notificationSent) {
                console.log(`✅ Client ${delivery.id_client} successfully notified of delivery completion`);
            } else {
                console.log(`⚠️ Client ${delivery.id_client} was NOT notified (not connected or error)`);
            }
        } catch (wsError) {
            console.error('⚠️ WebSocket notification failed (delivery status updated):', wsError.message);
            // Ne pas faire échouer la requête si la notification échoue
        }

        console.log(`✅ Delivery ${deliveryId} completed successfully with final price: ${finalPrice} FCFA`);

        res.json({
            success: true,
            message: 'Livraison terminée avec succès',
            delivery: {
                id: deliveryId,
                status: 'terminee',
                completedAt: updateResult.rows[0].date_heure_arrivee,
                finalPrice: finalPrice,
                currency: 'FCFA'
            },
            driver: driverData.rows[0]
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("❌ Error completing delivery:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

module.exports = router;
