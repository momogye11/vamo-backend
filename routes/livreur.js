require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Test route to verify router is working
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'Livreur routes are working!' });
});

// Configure multer for photo uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        const uploadDir = 'uploads/livreurs/';
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

// GET tous les livreurs
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM Livreur');
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur récupération livreurs :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Register new delivery person
router.post('/register', upload.fields([
    { name: 'photo_cni', maxCount: 1 },
    { name: 'photo_selfie', maxCount: 1 },
    { name: 'photo_vehicule', maxCount: 1 }
]), async (req, res) => {
    const { nom, prenom, telephone, type_vehicule } = req.body;
    const files = req.files;

    try {
        console.log('🛵 Registering new delivery person:', { nom, prenom, telephone, type_vehicule });
        console.log('📁 Files received:', Object.keys(files || {}));

        // Upload images to Cloudinary if available
        let photoUrls = {
            photo_cni: null,
            photo_selfie: null,
            photo_vehicule: null
        };

        console.log('🔍 Checking Cloudinary availability...');
        console.log('📋 CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? 'SET' : 'NOT_SET');
        console.log('📋 Files received:', files ? Object.keys(files) : 'NO_FILES');

        if (process.env.CLOUDINARY_CLOUD_NAME && files) {
            console.log('✅ Cloudinary environment variable found, attempting upload...');
            try {
                const cloudinary = require('cloudinary').v2;
                console.log('✅ Cloudinary module loaded successfully');
                
                cloudinary.config({
                    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                    api_key: process.env.CLOUDINARY_API_KEY,
                    api_secret: process.env.CLOUDINARY_API_SECRET
                });
                console.log('✅ Cloudinary configured successfully');

                for (const [fieldName, fileArray] of Object.entries(files)) {
                    if (fileArray && fileArray.length > 0) {
                        const file = fileArray[0];
                        console.log(`📤 Uploading ${fieldName} to Cloudinary:`, file.path);
                        
                        const result = await cloudinary.uploader.upload(file.path, {
                            folder: 'vamo/livreurs',
                            resource_type: 'auto'
                        });
                        
                        photoUrls[fieldName] = result.secure_url;
                        console.log(`✅ ${fieldName} uploaded successfully:`, result.secure_url);
                    }
                }
            } catch (cloudinaryError) {
                console.error('❌ Cloudinary upload error:', cloudinaryError);
                console.error('❌ Error details:', cloudinaryError.message);
                // Continue with local file paths if Cloudinary fails
            }
        } else {
            console.log('⚠️ Cloudinary not available or no files:');
            console.log('  - CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? 'SET' : 'NOT_SET');
            console.log('  - Files:', files ? 'PRESENT' : 'NOT_PRESENT');
        }

        // Use Cloudinary URLs if available, otherwise use local paths
        const photo_cni = photoUrls.photo_cni || (files?.photo_cni?.[0]?.filename || null);
        const photo_selfie = photoUrls.photo_selfie || (files?.photo_selfie?.[0]?.filename || null);
        const photo_vehicule = photoUrls.photo_vehicule || (files?.photo_vehicule?.[0]?.filename || null);

        // Validation des champs obligatoires
        if (!nom || !prenom || !telephone || !type_vehicule) {
            console.log("❌ Validation échouée - champs manquants");
            return res.status(400).json({
                success: false,
                error: 'Tous les champs sont obligatoires'
            });
        }

        // Validation du type de véhicule
        if (!['bike', 'motorcycle'].includes(type_vehicule)) {
            return res.status(400).json({
                success: false,
                error: 'Type de véhicule invalide'
            });
        }

        // Validation des photos
        console.log("📸 Validation des photos:");
        console.log("  photo_vehicule présente:", !!photo_vehicule);
        console.log("  photo_cni présente:", !!photo_cni);
        console.log("  photo_selfie présente:", !!photo_selfie);
        
        if (!photo_vehicule || !photo_cni || !photo_selfie) {
            console.log("❌ Photos manquantes");
            return res.status(400).json({
                success: false,
                error: 'Les 3 photos sont obligatoires (véhicule, CNI, selfie)'
            });
        }

        console.log("🔄 Début de l'insertion en base de données...");
        // Vérifier si le numéro de téléphone existe déjà
        console.log("📞 Vérification numéro existant pour:", telephone);
        const existingDelivery = await db.query(
            'SELECT telephone FROM Livreur WHERE telephone = $1',
            [telephone]
        );
        console.log("🔍 Résultat vérification livreur existant:", existingDelivery.rowCount);

        if (existingDelivery.rowCount > 0) {
            return res.status(400).json({
                success: false,
                error: 'Ce numéro de téléphone est déjà utilisé pour un compte livreur'
            });
        }

        // Vérifier dans la table Chauffeur aussi
        console.log("🚗 Vérification dans table Chauffeur...");
        const existingDriver = await db.query(
            'SELECT telephone FROM Chauffeur WHERE telephone = $1',
            [telephone]
        );
        console.log("🔍 Résultat vérification chauffeur existant:", existingDriver.rowCount);

        if (existingDriver.rowCount > 0) {
            return res.status(400).json({
                success: false,
                error: 'Ce numéro de téléphone est déjà utilisé pour un compte chauffeur'
            });
        }

        // Créer le livreur avec les photos
        console.log("💾 Préparation de l'insertion avec les données:");
        console.log("  Fichier véhicule:", photo_vehicule);
        console.log("  Fichier CNI:", photo_cni);
        console.log("  Fichier selfie:", photo_selfie);
        
        const result = await db.query(
            `INSERT INTO Livreur 
            (nom, prenom, telephone, type_vehicule, photo_vehicule, photo_cni, photo_selfie) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING id_livreur, telephone, statut_validation`,
            [
                nom,
                prenom,
                telephone,
                type_vehicule,
                photo_vehicule,
                photo_cni,
                photo_selfie
            ]
        );
        console.log("✅ Insertion réussie:", result.rows[0]);

        console.log("✅ Livreur créé avec succès:", result.rows[0]);

        res.json({
            success: true,
            message: 'Inscription livreur réussie',
            data: {
                id_livreur: result.rows[0].id_livreur,
                telephone: result.rows[0].telephone,
                statut_validation: result.rows[0].statut_validation
            }
        });

    } catch (err) {
        console.error("❌ Erreur inscription livreur:", err);
        
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

// Get delivery person info by phone
router.get('/by-phone/:phone', async (req, res) => {
    const { phone } = req.params;

    try {
        const result = await db.query(
            'SELECT id_livreur, nom, prenom, telephone, type_vehicule, statut_validation, disponibilite FROM Livreur WHERE telephone = $1',
            [phone]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Aucun livreur trouvé avec ce numéro'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (err) {
        console.error("❌ Erreur récupération livreur:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Get delivery person rating
router.get('/:id/rating', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query(`
            SELECT 
                COALESCE(AVG(n.note::decimal), 0) as average_rating,
                COUNT(n.note) as total_ratings
            FROM Livreur l
            LEFT JOIN NoteLivraison n ON l.id_livreur = n.id_livreur
            WHERE l.id_livreur = $1
            GROUP BY l.id_livreur
        `, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Livreur non trouvé'
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
        console.error("❌ Erreur récupération rating livreur:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Get delivery person earnings
router.get('/:id/earnings', async (req, res) => {
    const { id } = req.params;

    try {
        // Today's earnings
        const todayEarnings = await db.query(`
            SELECT COALESCE(SUM(prix), 0) as total_earnings
            FROM Livraison 
            WHERE id_livreur = $1 
            AND etat_livraison = 'livree' 
            AND DATE(date_heure_arrivee) = CURRENT_DATE
        `, [id]);

        // Last 7 days earnings
        const weeklyEarnings = await db.query(`
            SELECT COALESCE(SUM(prix), 0) as total_earnings
            FROM Livraison 
            WHERE id_livreur = $1 
            AND etat_livraison = 'livree' 
            AND date_heure_arrivee >= CURRENT_DATE - INTERVAL '7 days'
        `, [id]);

        // Last month earnings
        const monthlyEarnings = await db.query(`
            SELECT COALESCE(SUM(prix), 0) as total_earnings
            FROM Livraison 
            WHERE id_livreur = $1 
            AND etat_livraison = 'livree' 
            AND date_heure_arrivee >= CURRENT_DATE - INTERVAL '30 days'
        `, [id]);

        // Delivery count statistics
        const deliveryStats = await db.query(`
            SELECT 
                COUNT(CASE WHEN DATE(date_heure_arrivee) = CURRENT_DATE THEN 1 END) as today_deliveries,
                COUNT(CASE WHEN date_heure_arrivee >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as weekly_deliveries,
                COUNT(CASE WHEN date_heure_arrivee >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as monthly_deliveries
            FROM Livraison 
            WHERE id_livreur = $1 AND etat_livraison = 'livree'
        `, [id]);

        res.json({
            success: true,
            data: {
                today: {
                    earnings: parseFloat(todayEarnings.rows[0].total_earnings) || 0,
                    deliveries: parseInt(deliveryStats.rows[0].today_deliveries) || 0
                },
                weekly: {
                    earnings: parseFloat(weeklyEarnings.rows[0].total_earnings) || 0,
                    deliveries: parseInt(deliveryStats.rows[0].weekly_deliveries) || 0
                },
                monthly: {
                    earnings: parseFloat(monthlyEarnings.rows[0].total_earnings) || 0,
                    deliveries: parseInt(deliveryStats.rows[0].monthly_deliveries) || 0
                }
            }
        });

    } catch (err) {
        console.error("❌ Erreur récupération gains livreur:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Get delivery person history
router.get('/:id/history', async (req, res) => {
    const { id } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    try {
        const result = await db.query(`
            SELECT
                l.id_livraison,
                l.adresse_depart,
                l.adresse_arrivee,
                l.destinataire_nom,
                l.destinataire_telephone,
                l.taille_colis,
                l.prix,
                l.date_heure_depart,
                l.date_heure_arrivee,
                l.etat_livraison,
                l.est_paye,
                l.instructions,
                cl.nom as client_nom,
                cl.prenom as client_prenom,
                cl.telephone as client_telephone,
                t.nom as type_livraison,
                p.mode as mode_paiement,
                n.note as rating
            FROM Livraison l
            LEFT JOIN Client cl ON l.id_client = cl.id_client
            LEFT JOIN TypeLivraison t ON l.id_type = t.id_type
            LEFT JOIN PaiementLivraison p ON l.id_livraison = p.id_livraison
            LEFT JOIN NoteLivraison n ON l.id_livraison = n.id_livraison
            WHERE l.id_livreur = $1
            AND l.etat_livraison IN ('terminee', 'annulee')
            ORDER BY l.date_heure_depart DESC
            LIMIT $2 OFFSET $3
        `, [id, limit, offset]);

        const totalCount = await db.query(`
            SELECT COUNT(*) as total
            FROM Livraison
            WHERE id_livreur = $1
            AND etat_livraison IN ('terminee', 'annulee')
        `, [id]);

        res.json({
            success: true,
            data: {
                deliveries: result.rows.map(delivery => ({
                    id_livraison: delivery.id_livraison,
                    adresse_depart: delivery.adresse_depart,
                    adresse_arrivee: delivery.adresse_arrivee,
                    destinataire_nom: delivery.destinataire_nom,
                    destinataire_telephone: delivery.destinataire_telephone,
                    taille_colis: delivery.taille_colis,
                    prix: delivery.prix,
                    date_heure_depart: delivery.date_heure_depart,
                    date_heure_arrivee: delivery.date_heure_arrivee,
                    etat_livraison: delivery.etat_livraison,
                    est_paye: delivery.est_paye,
                    instructions: delivery.instructions,
                    client: delivery.client_nom && delivery.client_prenom ?
                        `${delivery.client_prenom} ${delivery.client_nom}` : null,
                    clientInfo: {
                        nom: delivery.client_nom,
                        prenom: delivery.client_prenom,
                        telephone: delivery.client_telephone
                    },
                    type_livraison: delivery.type_livraison,
                    mode_paiement: delivery.mode_paiement,
                    rating: delivery.rating
                })),
                total: parseInt(totalCount.rows[0].total) || 0,
                hasMore: (parseInt(offset) + parseInt(limit)) < parseInt(totalCount.rows[0].total)
            }
        });

    } catch (err) {
        console.error("❌ Erreur récupération historique livreur:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Legacy endpoint for backward compatibility
router.post('/', async (req, res) => {
  const { nom, prenom, telephone } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO Livreur (nom, prenom, telephone) VALUES ($1, $2, $3) RETURNING *',
      [nom, prenom, telephone]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erreur ajout livreur :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get full profile information
router.get('/:id/profile', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query(`
            SELECT 
                l.id_livreur,
                l.nom,
                l.prenom,
                l.telephone,
                l.type_vehicule,
                l.photo_vehicule,
                l.photo_cni,
                l.photo_selfie,
                l.statut_validation,
                l.disponibilite,
                l.date_creation,
                COALESCE(AVG(n.note::decimal), 0) as average_rating,
                COUNT(n.note) as total_ratings
            FROM Livreur l
            LEFT JOIN NoteLivraison n ON l.id_livreur = n.id_livreur
            WHERE l.id_livreur = $1
            GROUP BY l.id_livreur, l.nom, l.prenom, l.telephone, l.type_vehicule, 
                     l.photo_vehicule, l.photo_cni, l.photo_selfie, l.statut_validation, 
                     l.disponibilite, l.date_creation
        `, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Livreur non trouvé'
            });
        }

        const profile = result.rows[0];
        const rating = parseFloat(profile.average_rating) || 0;
        const totalRatings = parseInt(profile.total_ratings) || 0;

        res.json({
            success: true,
            data: {
                id_livreur: profile.id_livreur,
                nom: profile.nom,
                prenom: profile.prenom,
                telephone: profile.telephone,
                role: 'Livreur',
                vehicle: {
                    type: profile.type_vehicule,
                    photo: profile.photo_vehicule
                },
                photos: {
                    selfie: profile.photo_selfie,
                    cni: profile.photo_cni,
                    vehicule: profile.photo_vehicule
                },
                statut_validation: profile.statut_validation,
                disponibilite: profile.disponibilite,
                date_creation: profile.date_creation,
                rating: {
                    average_rating: Math.round(rating * 10) / 10,
                    total_ratings: totalRatings,
                    display: totalRatings > 0 ? `${Math.round(rating * 10) / 10}/5` : 'N/A'
                }
            }
        });

    } catch (err) {
        console.error("❌ Erreur récupération profil livreur:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Update livreur availability status (online/offline)
router.post('/availability', async (req, res) => {
    try {
        const { livreurId, isAvailable } = req.body;
        
        console.log(`🛵 Updating livreur ${livreurId} availability: ${isAvailable ? 'Online' : 'Offline'}`);
        
        if (!livreurId) {
            return res.status(400).json({
                success: false,
                error: 'ID livreur requis'
            });
        }

        // Vérifier si le livreur existe
        const livreurCheck = await db.query(
            'SELECT id_livreur, nom, prenom FROM Livreur WHERE id_livreur = $1',
            [livreurId]
        );

        if (livreurCheck.rowCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Livreur non trouvé'
            });
        }

        // Mettre à jour la disponibilité
        await db.query(
            'UPDATE Livreur SET disponibilite = $1 WHERE id_livreur = $2',
            [isAvailable, livreurId]
        );

        const livreur = livreurCheck.rows[0];
        console.log(`✅ Livreur ${livreurId} (${livreur.nom} ${livreur.prenom}) availability updated: ${isAvailable ? 'Online' : 'Offline'}`);

        res.json({
            success: true,
            message: `Livreur ${livreur.nom} ${livreur.prenom} is now ${isAvailable ? 'online' : 'offline'}`,
            data: {
                livreurId: parseInt(livreurId),
                isAvailable: isAvailable,
                nom: livreur.nom,
                prenom: livreur.prenom
            }
        });

    } catch (error) {
        console.error('❌ Error updating livreur availability:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la mise à jour de la disponibilité'
        });
    }
});

// Get delivery driver daily metrics (earnings, hours, deliveries)
router.get('/:id/daily-metrics', async (req, res) => {
    const { id } = req.params;

    try {
        // Today's completed deliveries and earnings (check both 'livree' and 'terminee' statuses)
        const todayStats = await db.query(`
            SELECT 
                COUNT(*) as completed_orders,
                COALESCE(SUM(prix), 0) as total_earnings
            FROM Livraison 
            WHERE id_livreur = $1 
            AND (etat_livraison = 'livree' OR etat_livraison = 'terminee')
            AND DATE(date_heure_arrivee) = CURRENT_DATE
        `, [id]);

        // Calculate hours active today by checking delivery durations (all deliveries with both timestamps)
        const hoursActive = await db.query(`
            SELECT 
                COALESCE(
                    SUM(
                        EXTRACT(EPOCH FROM (date_heure_arrivee - date_heure_depart)) / 3600
                    ), 0
                ) as hours_active
            FROM Livraison 
            WHERE id_livreur = $1 
            AND date_heure_depart IS NOT NULL 
            AND date_heure_arrivee IS NOT NULL
            AND (etat_livraison = 'livree' OR etat_livraison = 'terminee')
            AND DATE(date_heure_depart) = CURRENT_DATE
        `, [id]);

        const stats = todayStats.rows[0];
        const activeHours = parseFloat(hoursActive.rows[0].hours_active) || 0;

        console.log(`📊 Daily metrics for livreur ${id}:`, {
            completed_orders: stats.completed_orders,
            total_earnings: stats.total_earnings,
            hours_active: activeHours
        });

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
        console.error("❌ Erreur récupération métriques quotidiennes livreur:", err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// GET - Get delivery person's current active delivery with client details
router.get('/:id/active-delivery', async (req, res) => {
    const { id } = req.params;

    try {
        console.log(`📦 Fetching active delivery for delivery person: ${id}`);

        // Get current delivery with full client details
        const result = await db.query(`
            SELECT
                l.id_livraison,
                l.adresse_depart,
                l.adresse_arrivee,
                l.destinataire_nom,
                l.destinataire_telephone,
                l.taille_colis,
                l.prix,
                l.mode_paiement,
                l.latitude_depart,
                l.longitude_depart,
                l.latitude_arrivee,
                l.longitude_arrivee,
                l.date_heure_depart,
                l.date_heure_debut_livraison,
                l.etat_livraison,
                l.instructions,
                cl.id_client,
                cl.nom AS client_nom,
                cl.prenom AS client_prenom,
                cl.telephone AS client_telephone,
                t.nom AS type_livraison
            FROM Livraison l
            LEFT JOIN Client cl ON l.id_client = cl.id_client
            LEFT JOIN TypeLivraison t ON l.id_type = t.id_type
            WHERE l.id_livreur = $1
            AND l.etat_livraison IN ('acceptee', 'en_route_pickup', 'arrivee_pickup', 'en_cours')
            ORDER BY l.date_heure_depart DESC
            LIMIT 1
        `, [id]);

        console.log(`📊 Found ${result.rowCount} active deliveries for delivery person ${id}`);

        if (result.rowCount === 0) {
            return res.json({
                success: true,
                hasActiveDelivery: false,
                message: 'Aucune livraison active'
            });
        }

        const delivery = result.rows[0];

        // Format the response
        const response = {
            success: true,
            hasActiveDelivery: true,
            delivery: {
                id: delivery.id_livraison,
                pickup: delivery.adresse_depart,
                destination: delivery.adresse_arrivee,
                recipientName: delivery.destinataire_nom,
                recipientPhone: delivery.destinataire_telephone,
                packageSize: delivery.taille_colis,
                price: delivery.prix,
                paymentMode: delivery.mode_paiement,
                status: delivery.etat_livraison,
                instructions: delivery.instructions,
                departureTime: delivery.date_heure_depart,
                startTime: delivery.date_heure_debut_livraison,
                deliveryType: delivery.type_livraison,
                client: delivery.id_client ? {
                    id: delivery.id_client,
                    nom: `${delivery.client_prenom || ''} ${delivery.client_nom || ''}`.trim(),
                    telephone: delivery.client_telephone
                } : null,
                pickupCoords: delivery.latitude_depart && delivery.longitude_depart ? {
                    latitude: parseFloat(delivery.latitude_depart),
                    longitude: parseFloat(delivery.longitude_depart)
                } : null,
                destinationCoords: delivery.latitude_arrivee && delivery.longitude_arrivee ? {
                    latitude: parseFloat(delivery.latitude_arrivee),
                    longitude: parseFloat(delivery.longitude_arrivee)
                } : null
            }
        };

        console.log(`✅ Returning delivery details:`, {
            deliveryId: response.delivery.id,
            status: response.delivery.status,
            hasClient: !!response.delivery.client,
            clientName: response.delivery.client?.nom
        });

        res.json(response);

    } catch (err) {
        console.error(`❌ Error fetching active delivery for delivery person ${id}:`, err);
        console.error('❌ Stack trace:', err.stack);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur',
            details: err.message
        });
    }
});

module.exports = router;
