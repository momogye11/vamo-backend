require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Test route to verify router is working
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'Chauffeur routes are working!' });
});

// Configure multer for photo uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        const uploadDir = 'uploads/chauffeurs/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: function(req, file, cb) {
        const allowedTypes = /jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Seules les images JPEG, JPG et PNG sont autorisées'));
        }
    }
});

// Register new driver
router.post('/register', upload.fields([
    { name: 'photo_vehicule', maxCount: 1 },
    { name: 'photo_cni', maxCount: 1 },
    { name: 'photo_selfie', maxCount: 1 }
]), async (req, res) => {
    console.log("🚗 Tentative d'inscription chauffeur:");
    console.log("  Body reçu:", req.body);
    console.log("  Files reçus:", req.files);

    const { nom, prenom, telephone, marque_vehicule, annee_vehicule, plaque_immatriculation } = req.body;

    // Validation des champs obligatoires
    if (!nom || !prenom || !telephone || !marque_vehicule || !annee_vehicule || !plaque_immatriculation) {
        return res.status(400).json({
            success: false,
            error: 'Tous les champs sont obligatoires'
        });
    }

    // Validation des photos
    if (!req.files.photo_vehicule || !req.files.photo_cni || !req.files.photo_selfie) {
        return res.status(400).json({
            success: false,
            error: 'Les 3 photos sont obligatoires (véhicule, CNI, selfie)'
        });
    }

    try {
        // Vérifier si le numéro de téléphone existe déjà
        const existingDriver = await db.query(
            'SELECT telephone FROM Chauffeur WHERE telephone = $1',
            [telephone]
        );

        if (existingDriver.rowCount > 0) {
            return res.status(400).json({
                success: false,
                error: 'Ce numéro de téléphone est déjà utilisé pour un compte chauffeur'
            });
        }

        // Vérifier dans la table Livreur aussi
        const existingDelivery = await db.query(
            'SELECT telephone FROM Livreur WHERE telephone = $1',
            [telephone]
        );

        if (existingDelivery.rowCount > 0) {
            return res.status(400).json({
                success: false,
                error: 'Ce numéro de téléphone est déjà utilisé pour un compte livreur'
            });
        }

        // Créer le chauffeur avec les photos
        const result = await db.query(
            `INSERT INTO Chauffeur 
            (nom, prenom, telephone, marque_vehicule, annee_vehicule, plaque_immatriculation, 
             photo_vehicule, photo_cni, photo_selfie) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
            RETURNING id_chauffeur, telephone, statut_validation`,
            [
                nom,
                prenom,
                telephone,
                marque_vehicule,
                parseInt(annee_vehicule),
                plaque_immatriculation,
                req.files.photo_vehicule[0].path,
                req.files.photo_cni[0].path,
                req.files.photo_selfie[0].path
            ]
        );

        console.log("✅ Chauffeur créé avec succès:", result.rows[0]);

        res.json({
            success: true,
            message: 'Inscription chauffeur réussie',
            data: {
                id_chauffeur: result.rows[0].id_chauffeur,
                telephone: result.rows[0].telephone,
                statut_validation: result.rows[0].statut_validation
            }
        });

    } catch (err) {
        console.error("❌ Erreur inscription chauffeur:", err);
        
        // Nettoyer les fichiers uploadés en cas d'erreur
        if (req.files) {
            Object.values(req.files).flat().forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }

        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de l\'inscription'
        });
    }
});

// Get driver info by phone
router.get('/by-phone/:phone', async (req, res) => {
    const { phone } = req.params;

    try {
        const result = await db.query(
            'SELECT id_chauffeur, nom, prenom, telephone, statut_validation, disponibilite FROM Chauffeur WHERE telephone = $1',
            [phone]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Aucun chauffeur trouvé avec ce numéro'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (err) {
        console.error("❌ Erreur récupération chauffeur:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Get driver rating
router.get('/:id/rating', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query(`
            SELECT 
                COALESCE(AVG(n.note::decimal), 0) as average_rating,
                COUNT(n.note) as total_ratings
            FROM Chauffeur c
            LEFT JOIN Note n ON c.id_chauffeur = n.id_chauffeur
            WHERE c.id_chauffeur = $1
            GROUP BY c.id_chauffeur
        `, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Chauffeur non trouvé'
            });
        }

        const rating = parseFloat(result.rows[0].average_rating) || 0;
        const totalRatings = parseInt(result.rows[0].total_ratings) || 0;

        res.json({
            success: true,
            data: {
                average_rating: Math.round(rating * 10) / 10, // Round to 1 decimal place
                total_ratings: totalRatings,
                rating_display: totalRatings > 0 ? `${Math.round(rating * 10) / 10}/5` : 'N/A'
            }
        });

    } catch (err) {
        console.error("❌ Erreur récupération rating chauffeur:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Get driver earnings
router.get('/:id/earnings', async (req, res) => {
    const { id } = req.params;

    try {
        // Today's earnings
        const todayEarnings = await db.query(`
            SELECT COALESCE(SUM(prix), 0) as total_earnings
            FROM Course 
            WHERE id_chauffeur = $1 
            AND etat_course = 'terminee' 
            AND DATE(date_heure_arrivee) = CURRENT_DATE
        `, [id]);

        // Last 7 days earnings
        const weeklyEarnings = await db.query(`
            SELECT COALESCE(SUM(prix), 0) as total_earnings
            FROM Course 
            WHERE id_chauffeur = $1 
            AND etat_course = 'terminee' 
            AND date_heure_arrivee >= CURRENT_DATE - INTERVAL '7 days'
        `, [id]);

        // Last month earnings
        const monthlyEarnings = await db.query(`
            SELECT COALESCE(SUM(prix), 0) as total_earnings
            FROM Course 
            WHERE id_chauffeur = $1 
            AND etat_course = 'terminee' 
            AND date_heure_arrivee >= CURRENT_DATE - INTERVAL '30 days'
        `, [id]);

        // Trip count statistics
        const tripStats = await db.query(`
            SELECT 
                COUNT(CASE WHEN DATE(date_heure_arrivee) = CURRENT_DATE THEN 1 END) as today_trips,
                COUNT(CASE WHEN date_heure_arrivee >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as weekly_trips,
                COUNT(CASE WHEN date_heure_arrivee >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as monthly_trips
            FROM Course 
            WHERE id_chauffeur = $1 AND etat_course = 'terminee'
        `, [id]);

        res.json({
            success: true,
            data: {
                today: {
                    earnings: parseFloat(todayEarnings.rows[0].total_earnings) || 0,
                    trips: parseInt(tripStats.rows[0].today_trips) || 0
                },
                weekly: {
                    earnings: parseFloat(weeklyEarnings.rows[0].total_earnings) || 0,
                    trips: parseInt(tripStats.rows[0].weekly_trips) || 0
                },
                monthly: {
                    earnings: parseFloat(monthlyEarnings.rows[0].total_earnings) || 0,
                    trips: parseInt(tripStats.rows[0].monthly_trips) || 0
                }
            }
        });

    } catch (err) {
        console.error("❌ Erreur récupération gains chauffeur:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Get driver history
router.get('/:id/history', async (req, res) => {
    const { id } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    try {
        const result = await db.query(`
            SELECT 
                id_course,
                adresse_depart,
                adresse_arrivee,
                distance_km,
                duree_min,
                prix,
                date_heure_depart,
                date_heure_arrivee,
                etat_course,
                est_paye
            FROM Course 
            WHERE id_chauffeur = $1 
            ORDER BY date_heure_depart DESC
            LIMIT $2 OFFSET $3
        `, [id, limit, offset]);

        const totalCount = await db.query(`
            SELECT COUNT(*) as total
            FROM Course 
            WHERE id_chauffeur = $1
        `, [id]);

        res.json({
            success: true,
            data: {
                trips: result.rows,
                total: parseInt(totalCount.rows[0].total) || 0,
                hasMore: (parseInt(offset) + parseInt(limit)) < parseInt(totalCount.rows[0].total)
            }
        });

    } catch (err) {
        console.error("❌ Erreur récupération historique chauffeur:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Get full profile information
router.get('/:id/profile', async (req, res) => {
    const { id } = req.params;

    try {
        // First get chauffeur basic info
        const result = await db.query(`
            SELECT 
                id_chauffeur,
                nom,
                prenom,
                telephone,
                marque_vehicule,
                annee_vehicule,
                plaque_immatriculation,
                photo_vehicule,
                photo_cni,
                photo_selfie,
                statut_validation,
                disponibilite
            FROM Chauffeur
            WHERE id_chauffeur = $1
        `, [id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Chauffeur non trouvé'
            });
        }
        
        // Get rating separately
        const ratingResult = await db.query(`
            SELECT 
                COALESCE(AVG(n.note::decimal), 0) as average_rating,
                COUNT(n.note) as total_ratings
            FROM Course co
            LEFT JOIN Note n ON co.id_course = n.id_course
            WHERE co.id_chauffeur = $1
        `, [id]);

        const profile = result.rows[0];
        const rating = parseFloat(ratingResult.rows[0]?.average_rating) || 0;
        const totalRatings = parseInt(ratingResult.rows[0]?.total_ratings) || 0;

        res.json({
            success: true,
            data: {
                id_chauffeur: profile.id_chauffeur,
                nom: profile.nom,
                prenom: profile.prenom,
                telephone: profile.telephone,
                role: 'Chauffeur',
                vehicle: {
                    marque: profile.marque_vehicule,
                    annee: profile.annee_vehicule,
                    plaque: profile.plaque_immatriculation,
                    photo: profile.photo_vehicule
                },
                photos: {
                    selfie: profile.photo_selfie,
                    cni: profile.photo_cni,
                    vehicule: profile.photo_vehicule
                },
                statut_validation: profile.statut_validation,
                disponibilite: profile.disponibilite,
                rating: {
                    average_rating: Math.round(rating * 10) / 10,
                    total_ratings: totalRatings,
                    display: totalRatings > 0 ? `${Math.round(rating * 10) / 10}/5` : 'N/A'
                }
            }
        });

    } catch (err) {
        console.error("❌ Erreur récupération profil chauffeur:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Update driver availability status (online/offline)
router.post('/availability', async (req, res) => {
    const { driverId, isAvailable } = req.body;

    if (!driverId || typeof isAvailable !== 'boolean') {
        return res.status(400).json({
            success: false,
            error: 'driverId et isAvailable sont requis'
        });
    }

    try {
        const result = await db.query(
            'UPDATE Chauffeur SET disponibilite = $1 WHERE id_chauffeur = $2 RETURNING id_chauffeur, disponibilite',
            [isAvailable, driverId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Chauffeur non trouvé'
            });
        }

        console.log(`✅ Driver ${driverId} availability updated: ${isAvailable ? 'Online' : 'Offline'}`);

        res.json({
            success: true,
            status: isAvailable ? 'online' : 'offline',
            data: result.rows[0]
        });

    } catch (err) {
        console.error("❌ Erreur mise à jour disponibilité:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Get driver daily metrics (earnings, hours, trips)
router.get('/:id/daily-metrics', async (req, res) => {
    const { id } = req.params;

    try {
        // Today's completed trips and earnings
        const todayStats = await db.query(`
            SELECT 
                COUNT(*) as completed_orders,
                COALESCE(SUM(prix), 0) as total_earnings
            FROM Course 
            WHERE id_chauffeur = $1 
            AND etat_course = 'terminee' 
            AND DATE(date_heure_arrivee) = CURRENT_DATE
        `, [id]);

        // Calculate hours active today by checking status changes or trip durations
        const hoursActive = await db.query(`
            SELECT 
                COALESCE(
                    SUM(
                        EXTRACT(EPOCH FROM (date_heure_arrivee - date_heure_depart)) / 3600
                    ), 0
                ) as hours_active
            FROM Course 
            WHERE id_chauffeur = $1 
            AND date_heure_depart IS NOT NULL 
            AND date_heure_arrivee IS NOT NULL
            AND DATE(date_heure_depart) = CURRENT_DATE
        `, [id]);

        const stats = todayStats.rows[0];
        const activeHours = parseFloat(hoursActive.rows[0].hours_active) || 0;

        res.json({
            success: true,
            data: {
                completed_orders: parseInt(stats.completed_orders) || 0,
                total_earnings: parseFloat(stats.total_earnings) || 0,
                hours_active: Math.round(activeHours * 10) / 10, // Round to 1 decimal
                date: new Date().toISOString().split('T')[0] // Today's date
            }
        });

    } catch (err) {
        console.error("❌ Erreur récupération métriques quotidiennes:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Get pending requests for a specific driver (both rides and deliveries)
router.get('/:id/pending-requests', async (req, res) => {
    const { id } = req.params;

    try {
        // Get pending rides (Course)
        const pendingRides = await db.query(`
            SELECT 
                c.id_course as request_id,
                'ride' as request_type,
                c.adresse_depart as pickup_address,
                c.distance_km,
                c.duree_min as duration_minutes,
                c.date_heure_depart as created_at,
                cl.nom as client_name,
                cl.telephone as client_phone,
                c.etat_course as status
            FROM Course c
            JOIN Client cl ON c.id_client = cl.id_client
            WHERE c.etat_course = 'en_attente'
            AND c.id_chauffeur IS NULL
            ORDER BY c.date_heure_depart ASC
            LIMIT 1
        `);

        // Get pending deliveries (Livraison) 
        const pendingDeliveries = await db.query(`
            SELECT 
                l.id_livraison as request_id,
                'delivery' as request_type,
                l.adresse_depart as pickup_address,
                l.latitude_depart,
                l.longitude_depart,
                l.date_heure_depart as created_at,
                cl.nom as client_name,
                cl.telephone as client_phone,
                l.etat_livraison as status,
                tl.nom as delivery_type
            FROM Livraison l
            JOIN Client cl ON l.id_client = cl.id_client
            LEFT JOIN TypeLivraison tl ON l.id_type = tl.id_type
            WHERE l.etat_livraison = 'en_attente'
            AND l.id_livreur IS NULL
            ORDER BY l.date_heure_depart ASC
            LIMIT 1
        `);

        // Combine and prioritize requests (rides first, then deliveries)
        let pendingRequest = null;
        
        if (pendingRides.rowCount > 0) {
            pendingRequest = pendingRides.rows[0];
        } else if (pendingDeliveries.rowCount > 0) {
            pendingRequest = pendingDeliveries.rows[0];
        }

        res.json({
            success: true,
            data: {
                has_pending_request: pendingRequest !== null,
                request: pendingRequest
            }
        });

    } catch (err) {
        console.error("❌ Erreur récupération demandes en attente:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Accept a ride or delivery request
router.post('/accept-request', async (req, res) => {
    const { driverId, requestId, requestType } = req.body;

    if (!driverId || !requestId || !requestType) {
        return res.status(400).json({
            success: false,
            error: 'driverId, requestId et requestType sont requis'
        });
    }

    try {
        let result;
        
        if (requestType === 'ride') {
            // Accept ride (Course)
            result = await db.query(`
                UPDATE Course 
                SET id_chauffeur = $1, etat_course = 'acceptee'
                WHERE id_course = $2 AND etat_course = 'en_attente'
                RETURNING id_course, adresse_depart, adresse_arrivee, prix
            `, [driverId, requestId]);
            
        } else if (requestType === 'delivery') {
            // Accept delivery (Livraison)
            result = await db.query(`
                UPDATE Livraison 
                SET id_livreur = $1, etat_livraison = 'acceptee'
                WHERE id_livraison = $2 AND etat_livraison = 'en_attente'
                RETURNING id_livraison, adresse_depart, adresse_arrivee, prix
            `, [driverId, requestId]);
        }

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Demande non trouvée ou déjà prise'
            });
        }

        console.log(`✅ ${requestType} ${requestId} accepted by driver ${driverId}`);

        res.json({
            success: true,
            message: 'Demande acceptée avec succès',
            data: {
                request_id: requestId,
                request_type: requestType,
                details: result.rows[0]
            }
        });

    } catch (err) {
        console.error("❌ Erreur acceptation demande:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Decline a ride or delivery request
router.post('/decline-request', async (req, res) => {
    const { driverId, requestId, requestType, reason } = req.body;

    if (!driverId || !requestId || !requestType) {
        return res.status(400).json({
            success: false,
            error: 'driverId, requestId et requestType sont requis'
        });
    }

    try {
        // Log the decline (could be used for analytics)
        console.log(`📝 Driver ${driverId} declined ${requestType} ${requestId}: ${reason || 'No reason provided'}`);

        // For now, we just log the decline. The request remains available for other drivers.
        // In a real implementation, you might want to:
        // 1. Track decline reasons for analytics
        // 2. Temporarily blacklist this request for this driver
        // 3. Adjust the matching algorithm

        res.json({
            success: true,
            message: 'Demande refusée'
        });

    } catch (err) {
        console.error("❌ Erreur refus demande:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

module.exports = router;