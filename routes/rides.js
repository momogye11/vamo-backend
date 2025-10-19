require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('../db');

// Store for managing active ride searches
const activeSearches = new Map();

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

// Start a driver search for a ride request
router.post('/search', async (req, res) => {
    const {
        origin,
        destination,
        intermediateStops = [],
        vehicleType,
        paymentMethod,
        estimatedFare,
        routeDistance,
        routeDuration,
        silentMode,
        clientId
    } = req.body;
    
    try {
        console.log('🔍 Starting ride search with full data:');
        console.log('  Origin:', JSON.stringify(origin, null, 2));
        console.log('  Destination:', JSON.stringify(destination, null, 2));
        console.log('  Intermediate Stops:', intermediateStops.length);
        console.log('  Vehicle Type:', vehicleType);
        console.log('  Payment Method:', paymentMethod);
        console.log('  Estimated Fare:', estimatedFare);
        console.log('  Route Distance:', routeDistance);
        console.log('  Route Duration:', routeDuration);
        console.log('  Silent Mode:', silentMode);
        
        // Extract addresses and coordinates from the frontend data structure
        const originAddress = origin?.description || origin?.address || 'Unknown origin';
        const destinationAddress = destination?.description || destination?.address || 'Unknown destination';
        const originCoords = origin?.location || origin?.coordinates || { lat: 14.7275, lng: -17.5113 };
        const destCoords = destination?.location || destination?.coordinates || { lat: 14.7167, lng: -17.4677 };
        
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
        
        // Start database transaction
        await db.query('BEGIN');
        
        // Create a ride request in the database
        const courseResult = await db.query(`
            INSERT INTO Course (
                id_client,
                adresse_depart,
                adresse_arrivee,
                latitude_depart,
                longitude_depart,
                latitude_arrivee,
                longitude_arrivee,
                distance_km,
                duree_min,
                prix,
                mode_paiement,
                telephone_client,
                nom_client,
                date_heure_depart,
                etat_course,
                mode_silencieux
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, 'en_attente', $14)
            RETURNING id_course
        `, [
            clientId || 1, // fallback to 1 if not provided
            originAddress,
            destinationAddress,
            parseFloat(originCoords.lat || originCoords.latitude) || 14.7275,
            parseFloat(originCoords.lng || originCoords.longitude) || -17.5113,
            parseFloat(destCoords.lat || destCoords.latitude) || 14.7167,
            parseFloat(destCoords.lng || destCoords.longitude) || -17.4677,
            cleanDistance,
            cleanDuration, 
            cleanFare,
            dbPaymentMethod,
            null, // Client phone will be set when authenticated
            null, // Client name will be set when authenticated
            Boolean(silentMode) // Mode silencieux
        ]);
        
        const courseId = courseResult.rows[0].id_course;
        const searchId = `search_${courseId}_${Date.now()}`;

        // Sauvegarder les arrêts intermédiaires si présents
        if (intermediateStops && intermediateStops.length > 0) {
            console.log(`💾 Saving ${intermediateStops.length} intermediate stops for course ${courseId}`);

            for (let i = 0; i < intermediateStops.length; i++) {
                const stop = intermediateStops[i];
                await db.query(`
                    INSERT INTO arrets_intermediaires (
                        id_course,
                        ordre_arret,
                        adresse,
                        latitude,
                        longitude
                    ) VALUES ($1, $2, $3, $4, $5)
                `, [
                    courseId,
                    i + 1, // ordre commence à 1
                    stop.description || stop.address || `Arrêt ${i + 1}`,
                    parseFloat(stop.latitude) || 0,
                    parseFloat(stop.longitude) || 0
                ]);
            }

            console.log(`✅ Saved ${intermediateStops.length} intermediate stops`);
        }

        // Store search session data
        activeSearches.set(searchId, {
            courseId: courseId,
            status: 'searching',
            origin: origin,
            destination: destination,
            intermediateStops: intermediateStops || [],
            estimatedFare: estimatedFare,
            startTime: new Date(),
            paymentMethod: paymentMethod,
            vehicleType: vehicleType
        });

        await db.query('COMMIT');
        
        console.log(`✅ Ride search started: ${searchId} (Course ID: ${courseId})`);
        
        // 🚀 NOUVEAU FLUX SIMPLIFIÉ - BROADCAST À TOUS LES CHAUFFEURS DISPONIBLES
        try {
            console.log('📡 Broadcasting new ride to all available drivers...');
            
            // Récupérer tous les chauffeurs disponibles (en excluant ceux blacklistés pour cette course)
            const availableDrivers = await db.query(`
                SELECT c.id_chauffeur, c.nom, c.prenom
                FROM Chauffeur c
                WHERE c.disponibilite = true
                AND c.statut_validation = 'approuve'
                AND c.id_chauffeur NOT IN (
                    SELECT b.id_chauffeur
                    FROM ChauffeurBlacklistTemporaire b
                    WHERE b.id_course = $1
                    AND b.blacklist_jusqu_a > NOW()
                )
            `, [courseId]);

            // Log des chauffeurs blacklistés pour cette course (pour debug)
            const blacklistedDrivers = await db.query(`
                SELECT b.id_chauffeur, c.nom, c.prenom, b.blacklist_jusqu_a, b.raison
                FROM ChauffeurBlacklistTemporaire b
                JOIN Chauffeur c ON b.id_chauffeur = c.id_chauffeur
                WHERE b.id_course = $1 AND b.blacklist_jusqu_a > NOW()
            `, [courseId]);

            if (blacklistedDrivers.rowCount > 0) {
                console.log(`🚫 ${blacklistedDrivers.rowCount} driver(s) blacklisted for this trip:`);
                blacklistedDrivers.rows.forEach(driver => {
                    console.log(`   - Driver ${driver.id_chauffeur} (${driver.prenom} ${driver.nom}) until ${driver.blacklist_jusqu_a.toLocaleString('fr-FR')}`);
                    console.log(`     Reason: ${driver.raison}`);
                });
            }

            console.log(`📊 Found ${availableDrivers.rowCount} available drivers to notify (after blacklist filter)`);
            
            // Préparer les données de la course pour la notification
            const rideNotification = {
                type: 'new_ride',
                data: {
                    id: courseId,
                    pickup: originAddress,
                    destination: destinationAddress,
                    intermediateStops: (intermediateStops || []).map((stop, index) => ({
                        description: stop.description || stop.address || `Arrêt ${index + 1}`,
                        address: stop.description || stop.address || `Arrêt ${index + 1}`,
                        latitude: parseFloat(stop.latitude) || 0,
                        longitude: parseFloat(stop.longitude) || 0
                    })),
                    distance: `${cleanDistance} km`,
                    duration: `${cleanDuration} min`,
                    price: cleanFare,
                    paymentMethod: dbPaymentMethod,
                    pickupCoords: {
                        latitude: parseFloat(originCoords.lat || originCoords.latitude) || 14.7275,
                        longitude: parseFloat(originCoords.lng || originCoords.longitude) || -17.5113
                    },
                    destinationCoords: {
                        latitude: parseFloat(destCoords.lat || destCoords.latitude) || 14.7167,
                        longitude: parseFloat(destCoords.lng || destCoords.longitude) || -17.4677
                    }
                }
            };
            
            // Notifier chaque chauffeur via WebSocket (sera implémenté dans websocket.js)
            const { notifyAllDrivers } = require('./websocket');
            const notifiedCount = await notifyAllDrivers(availableDrivers.rows, rideNotification);
            
            console.log(`✅ Ride broadcasted to ${notifiedCount} drivers successfully`);
            
        } catch (broadcastError) {
            console.error('⚠️ Error broadcasting to drivers (ride still created):', broadcastError.message);
            // Ne pas faire échouer la création de course si la notification échoue
        }
        
        res.json({
            success: true,
            searchId: searchId,
            status: 'searching',
            estimatedWaitTime: '2-5 min',
            courseId: courseId
        });
        
    } catch (err) {
        await db.query('ROLLBACK');
        console.error("❌ DETAILED ERROR starting ride search:");
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

// Check the status of a ride search
router.get('/search/:searchId/status', async (req, res) => {
    const { searchId } = req.params;
    
    try {
        console.log(`🔄 Checking search status: ${searchId}`);
        
        if (!searchId) {
            return res.status(400).json({
                success: false,
                error: 'Search ID is required'
            });
        }
        
        const searchData = activeSearches.get(searchId);
        
        if (!searchData) {
            console.log(`❌ Search session not found: ${searchId}`);
            return res.status(404).json({
                success: false,
                error: 'Search session not found'
            });
        }
        
        // Check if the course has been assigned to a driver
        const courseResult = await db.query(`
            SELECT 
                c.etat_course,
                c.id_chauffeur,
                ch.nom as chauffeur_nom,
                ch.prenom as chauffeur_prenom,
                ch.telephone as chauffeur_telephone
            FROM Course c
            LEFT JOIN Chauffeur ch ON c.id_chauffeur = ch.id_chauffeur
            WHERE c.id_course = $1
        `, [searchData.courseId]);
        
        if (courseResult.rowCount === 0) {
            console.log(`❌ Course not found: ${searchData.courseId}`);
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        const course = courseResult.rows[0];
        let status = 'searching';
        let driver = null;
        
        // Update status based on course state
        if (course.etat_course === 'acceptee' && course.id_chauffeur) {
            status = 'driver_found';
            searchData.status = 'driver_found';
            
            try {
                // Récupérer les vraies données du chauffeur + véhicule + position
                const driverDetailsResult = await db.query(`
                    SELECT 
                        c.id_chauffeur,
                        c.nom, c.prenom, c.telephone, c.photo_selfie,
                        c.marque_vehicule, c.plaque_immatriculation, c.annee_vehicule,
                        v.marque as vehicle_make, v.modele as vehicle_model, v.couleur as vehicle_color,
                        pc.latitude, pc.longitude
                    FROM Chauffeur c
                    LEFT JOIN Vehicule v ON c.id_chauffeur = v.id_chauffeur
                    LEFT JOIN PositionChauffeur pc ON c.id_chauffeur = pc.id_chauffeur
                    WHERE c.id_chauffeur = $1
                `, [course.id_chauffeur]);
                
                const driverData = driverDetailsResult.rows[0] || {};
                
                // Calculer l'ETA approximatif (distance / vitesse moyenne 30km/h en ville)
                const originCoords = { 
                    lat: parseFloat(searchData.origin?.location?.lat || searchData.origin?.location?.latitude) || 14.7167, 
                    lng: parseFloat(searchData.origin?.location?.lng || searchData.origin?.location?.longitude) || -17.4677 
                };
                const driverCoords = { 
                    lat: parseFloat(driverData.latitude) || 14.7167, 
                    lng: parseFloat(driverData.longitude) || -17.4677 
                };
                const estimatedDistance = calculateDistance(originCoords, driverCoords);
                const estimatedETA = Math.max(1, Math.round(estimatedDistance / 30 * 60)); // minutes
                
                driver = {
                    id: driverData.id_chauffeur,
                    name: `${driverData.prenom || 'Chauffeur'} ${driverData.nom || ''}`.trim(),
                    firstName: driverData.prenom || 'Chauffeur',
                    lastName: driverData.nom || '',
                    phone: driverData.telephone,
                    photo: driverData.photo_selfie,
                    rating: 4.5, // TODO: Calculate real rating from Note table
                    eta: `${estimatedETA} min`,
                    vehicle: {
                        make: driverData.vehicle_make || driverData.marque_vehicule || 'Toyota',
                        model: driverData.vehicle_model || 'Yaris',
                        color: driverData.vehicle_color || 'Noir',
                        year: driverData.annee_vehicule,
                        licensePlate: driverData.plaque_immatriculation || 'DK-0000-XX'
                    },
                    location: {
                        latitude: parseFloat(driverData.latitude) || 14.7167,
                        longitude: parseFloat(driverData.longitude) || -17.4677
                    }
                };
                
                console.log(`✅ Driver data prepared for course ${searchData.courseId}:`, {
                    driverId: driver.id,
                    driverName: driver.name,
                    eta: driver.eta
                });
                
            } catch (driverError) {
                console.error('❌ Error fetching driver details:', driverError);
                // Return basic driver info even if details fail
                driver = {
                    id: course.id_chauffeur,
                    name: `${course.chauffeur_prenom || 'Chauffeur'} ${course.chauffeur_nom || ''}`.trim(),
                    firstName: course.chauffeur_prenom || 'Chauffeur',
                    lastName: course.chauffeur_nom || '',
                    phone: course.chauffeur_telephone,
                    photo: null,
                    rating: 4.5,
                    eta: '3 min',
                    vehicle: {
                        make: 'Toyota',
                        model: 'Yaris',
                        color: 'Noir',
                        year: null,
                        licensePlate: 'DK-0000-XX'
                    },
                    location: {
                        latitude: 14.7167,
                        longitude: -17.4677
                    }
                };
            }
        } else if (course.etat_course === 'annulee') {
            status = 'cancelled';
            searchData.status = 'cancelled';
        } else {
            // Check if we've been searching too long (simulate timeout)
            const searchDuration = new Date() - searchData.startTime;
            if (searchDuration > 120000) { // 2 minutes timeout instead of 30 seconds
                status = 'no_drivers';
                searchData.status = 'no_drivers';
                console.log(`⏰ Search timeout after ${Math.round(searchDuration/1000)}s for course ${searchData.courseId}`);
            } else {
                console.log(`⏳ Still searching... ${Math.round(searchDuration/1000)}s elapsed`);
            }
        }
        
        console.log(`📱 Search status update: ${status}`, {
            searchId,
            courseId: searchData.courseId,
            hasDriver: !!driver
        });
        
        res.json({
            success: true,
            status: status,
            driver: driver,
            estimatedWaitTime: status === 'searching' ? '2-5 min' : null,
            courseId: searchData.courseId
        });
        
    } catch (err) {
        console.error("❌ Error checking search status:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Cancel a ride search
router.delete('/search/:searchId', async (req, res) => {
    const { searchId } = req.params;
    
    try {
        console.log(`❌ Cancelling ride search: ${searchId}`);
        
        const searchData = activeSearches.get(searchId);
        
        if (!searchData) {
            return res.status(404).json({
                success: false,
                error: 'Search session not found'
            });
        }
        
        // Update course status to cancelled
        await db.query(`
            UPDATE Course 
            SET etat_course = 'annulee' 
            WHERE id_course = $1 AND etat_course = 'en_attente'
        `, [searchData.courseId]);
        
        // Remove from active searches
        activeSearches.delete(searchId);
        
        console.log(`✅ Ride search cancelled: ${searchId}`);
        
        res.json({
            success: true,
            message: 'Search cancelled successfully'
        });
        
    } catch (err) {
        console.error("❌ Error cancelling search:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Get ride details after driver is found
router.get('/ride/:courseId', async (req, res) => {
    const { courseId } = req.params;

    try {
        console.log(`🚗 Fetching ride details: ${courseId}`);

        const rideResult = await db.query(`
            SELECT
                c.*,
                ch.nom as chauffeur_nom,
                ch.prenom as chauffeur_prenom,
                ch.telephone as chauffeur_telephone
            FROM Course c
            LEFT JOIN Chauffeur ch ON c.id_chauffeur = ch.id_chauffeur
            WHERE c.id_course = $1
        `, [courseId]);

        if (rideResult.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Ride not found'
            });
        }

        const ride = rideResult.rows[0];

        // Récupérer les arrêts intermédiaires
        const stopsResult = await db.query(`
            SELECT adresse, latitude, longitude, ordre_arret
            FROM arrets_intermediaires
            WHERE id_course = $1
            ORDER BY ordre_arret ASC
        `, [courseId]);

        const intermediateStops = stopsResult.rows.map(stop => ({
            description: stop.adresse,
            address: stop.adresse,
            latitude: parseFloat(stop.latitude),
            longitude: parseFloat(stop.longitude)
        }));

        console.log(`📍 Found ${intermediateStops.length} intermediate stops for course ${courseId}`);

        res.json({
            success: true,
            ride: {
                id: ride.id_course,
                origin: ride.adresse_depart,
                destination: ride.adresse_arrivee,
                intermediateStops: intermediateStops,
                status: ride.etat_course,
                price: ride.prix,
                paymentMethod: ride.mode_paiement,
                distance: `${ride.distance_km} km`,
                duration: `${ride.duree_min} min`,
                driver: ride.id_chauffeur ? {
                    id: ride.id_chauffeur,
                    name: `${ride.chauffeur_prenom} ${ride.chauffeur_nom}`,
                    phone: ride.chauffeur_telephone
                } : null,
                coordinates: {
                    origin: {
                        latitude: parseFloat(ride.latitude_depart),
                        longitude: parseFloat(ride.longitude_depart)
                    },
                    destination: {
                        latitude: parseFloat(ride.latitude_arrivee),
                        longitude: parseFloat(ride.longitude_arrivee)
                    }
                },
                timestamps: {
                    requested: ride.date_heure_depart,
                    accepted: ride.date_heure_debut_course,
                    completed: ride.date_heure_arrivee
                }
            }
        });

    } catch (err) {
        console.error("❌ Error fetching ride details:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Cleanup old searches periodically (run every 5 minutes)
setInterval(() => {
    const now = new Date();
    const cutoffTime = 10 * 60 * 1000; // 10 minutes
    
    for (const [searchId, searchData] of activeSearches.entries()) {
        if (now - searchData.startTime > cutoffTime) {
            console.log(`🧹 Cleaning up old search: ${searchId}`);
            activeSearches.delete(searchId);
        }
    }
}, 5 * 60 * 1000);

module.exports = router;