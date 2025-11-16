const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'vamo-admin-secret-key-2024';
const JWT_EXPIRES_IN = '24h';

// Middleware d'authentification admin
const authenticateAdmin = (req, res, next) => {
    // Vérifier plusieurs sources pour le token:
    // 1. Header x-auth-token (pour les requêtes AJAX)
    // 2. Cookie vamo_admin_token (HTTP-only, persistent)
    // 3. Query param token (pour navigation)
    const token = req.headers['x-auth-token'] || req.cookies?.vamo_admin_token || req.query.token;

    if (!token) {
        return res.status(401).json({ error: 'Token d\'accès requis' });
    }

    // Vérifier si le token existe dans les sessions actives
    const activeSessions = require('../index').activeSessions;
    if (!activeSessions || !activeSessions.has(token)) {
        return res.status(403).json({ error: 'Token invalide ou expiré' });
    }

    // Token valide
    req.admin = { authenticated: true };
    next();
};

// Login admin
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email et mot de passe requis' });
        }

        // Pour l'instant, utilisateur admin hardcodé (vous pouvez créer une table admin plus tard)
        const adminCredentials = {
            email: 'admin@vamo.sn',
            password: 'VamoAdmin2024', // Mot de passe par défaut
            id: 1,
            name: 'Administrateur Vamo'
        };

        if (email !== adminCredentials.email || password !== adminCredentials.password) {
            return res.status(401).json({ error: 'Identifiants incorrects' });
        }

        const token = jwt.sign(
            { 
                id: adminCredentials.id, 
                email: adminCredentials.email,
                name: adminCredentials.name 
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.json({
            success: true,
            token,
            admin: {
                id: adminCredentials.id,
                email: adminCredentials.email,
                name: adminCredentials.name
            }
        });

    } catch (error) {
        console.error('Erreur login admin:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Dashboard stats - Version améliorée avec stats intelligentes
router.get('/dashboard/stats', authenticateAdmin, async (req, res) => {
    try {
        // Requêtes pour obtenir les statistiques INTELLIGENTES
        const [
            clientsResult,
            chauffeursResult,
            chauffeursOnlineResult,
            livreursResult,
            livreursOnlineResult,
            coursesActivesTodayResult,
            livraisonsActivesTodayResult,
            coursesCompletedTodayResult,
            livraisonsCompletedTodayResult,
            revenueResult
        ] = await Promise.all([
            // Total clients
            db.query('SELECT COUNT(*) as count FROM Client'),

            // Total chauffeurs approuvés
            db.query("SELECT COUNT(*) as count FROM Chauffeur WHERE statut_validation = 'approuve'"),

            // Chauffeurs VRAIMENT en ligne (disponibles ET avec position GPS récente < 10 min)
            db.query(`
                SELECT COUNT(*) as count
                FROM Chauffeur c
                LEFT JOIN PositionChauffeur p ON p.id_chauffeur = c.id_chauffeur
                WHERE c.disponibilite = true
                AND c.statut_validation = 'approuve'
                AND p.derniere_maj IS NOT NULL
                AND p.derniere_maj > NOW() - INTERVAL '10 minutes'
            `),

            // Total livreurs approuvés
            db.query("SELECT COUNT(*) as count FROM Livreur WHERE statut_validation = 'approuve'"),

            // Livreurs VRAIMENT en ligne (disponibles ET avec position GPS récente < 10 min)
            db.query(`
                SELECT COUNT(*) as count
                FROM Livreur l
                LEFT JOIN PositionLivreur p ON p.id_livreur = l.id_livreur
                WHERE l.disponibilite = true
                AND l.statut_validation = 'approuve'
                AND p.derniere_maj IS NOT NULL
                AND p.derniere_maj > NOW() - INTERVAL '10 minutes'
            `),

            // Courses actives AUJOURD'HUI uniquement
            db.query(`
                SELECT COUNT(*) as count
                FROM Course
                WHERE etat_course IN ('en_cours', 'acceptee', 'arrivee_pickup')
                AND DATE(date_heure_depart) = CURRENT_DATE
            `),

            // Livraisons actives AUJOURD'HUI uniquement
            db.query(`
                SELECT COUNT(*) as count
                FROM Livraison
                WHERE etat_livraison IN ('en_cours', 'acceptee', 'arrivee_pickup')
                AND DATE(date_heure_depart) = CURRENT_DATE
            `),

            // Courses terminées aujourd'hui
            db.query(`
                SELECT COUNT(*) as count
                FROM Course
                WHERE etat_course = 'terminee'
                AND DATE(date_heure_depart) = CURRENT_DATE
            `),

            // Livraisons terminées aujourd'hui
            db.query(`
                SELECT COUNT(*) as count
                FROM Livraison
                WHERE etat_livraison = 'terminee'
                AND DATE(date_heure_depart) = CURRENT_DATE
            `),

            // Revenus
            db.query(`
                SELECT
                    COALESCE(SUM(CASE WHEN DATE(date_heure_depart) = CURRENT_DATE THEN prix END), 0) as today_revenue,
                    COALESCE(SUM(CASE WHEN DATE_PART('month', date_heure_depart) = DATE_PART('month', CURRENT_DATE)
                                     AND DATE_PART('year', date_heure_depart) = DATE_PART('year', CURRENT_DATE)
                                     THEN prix END), 0) as monthly_revenue
                FROM Course WHERE etat_course = 'terminee'
            `)
        ]);

        const stats = {
            totalUsers: parseInt(clientsResult.rows[0].count),
            totalDrivers: parseInt(chauffeursResult.rows[0].count),
            driversOnline: parseInt(chauffeursOnlineResult.rows[0].count),
            totalDeliveryPersons: parseInt(livreursResult.rows[0].count),
            deliveryPersonsOnline: parseInt(livreursOnlineResult.rows[0].count),
            activeTrips: parseInt(coursesActivesTodayResult.rows[0].count),
            activeDeliveries: parseInt(livraisonsActivesTodayResult.rows[0].count),
            completedTripsToday: parseInt(coursesCompletedTodayResult.rows[0].count),
            completedDeliveriesToday: parseInt(livraisonsCompletedTodayResult.rows[0].count),
            todayRevenue: parseFloat(revenueResult.rows[0].today_revenue || 0),
            monthlyRevenue: parseFloat(revenueResult.rows[0].monthly_revenue || 0),
            averageRating: 4.5 // À calculer plus tard avec les vraies notes
        };

        res.json({ success: true, stats });

    } catch (error) {
        console.error('❌ Erreur dashboard stats:', error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Liste des clients
router.get('/clients', authenticateAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const result = await db.query(`
            SELECT
                id_client as id, nom, prenom, telephone,
                date_creation as created_at,
                date_creation as date_inscription,
                (SELECT COUNT(*) FROM Course WHERE id_client = Client.id_client) as total_trips
            FROM Client
            ORDER BY date_creation DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const countResult = await db.query('SELECT COUNT(*) as total FROM Client');
        const total = parseInt(countResult.rows[0].total);

        res.json({
            success: true,
            clients: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('❌ Erreur liste clients:', error.message);
        console.error('❌ Stack:', error.stack);
        res.status(500).json({
            error: 'Erreur serveur',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Liste des chauffeurs
router.get('/drivers', authenticateAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const result = await db.query(`
            SELECT 
                c.id_chauffeur as id, c.nom, c.prenom, c.telephone,
                c.statut_validation as statut_verification, c.date_creation as date_inscription,
                c.photo_selfie, c.photo_cni,
                c.marque_vehicule as marque, c.annee_vehicule as annee,
                c.plaque_immatriculation as numero_immatriculation,
                (SELECT COUNT(*) FROM Course WHERE id_chauffeur = c.id_chauffeur) as total_trips,
                (SELECT AVG(note) FROM Note WHERE id_chauffeur = c.id_chauffeur) as average_rating
            FROM Chauffeur c
            ORDER BY c.date_creation DESC 
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const countResult = await db.query('SELECT COUNT(*) as total FROM Chauffeur');
        const total = parseInt(countResult.rows[0].total);

        res.json({
            success: true,
            drivers: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Erreur liste chauffeurs:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Liste des livreurs
router.get('/delivery-persons', authenticateAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const result = await db.query(`
            SELECT 
                l.id_livreur as id, l.nom, l.prenom, l.telephone,
                l.statut_validation as statut_verification, l.date_creation as date_inscription,
                l.photo_selfie, l.photo_cni, l.type_vehicule,
                (SELECT COUNT(*) FROM Livraison WHERE id_livreur = l.id_livreur) as total_deliveries,
                (SELECT AVG(note) FROM NoteLivraison WHERE id_livreur = l.id_livreur) as average_rating
            FROM Livreur l
            ORDER BY l.date_creation DESC 
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const countResult = await db.query('SELECT COUNT(*) as total FROM Livreur');
        const total = parseInt(countResult.rows[0].total);

        res.json({
            success: true,
            deliveryPersons: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Erreur liste livreurs:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Approuver/Rejeter un chauffeur
router.put('/drivers/:id/verify', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { action, reason } = req.body; // action: 'approve', 'reject', ou 'suspend'

        if (!action || !['approve', 'reject', 'suspend'].includes(action)) {
            return res.status(400).json({ error: 'Action invalide' });
        }

        let newStatus, isActive;
        switch(action) {
            case 'approve':
                newStatus = 'approuve';
                isActive = true;
                break;
            case 'reject':
                newStatus = 'rejete';
                isActive = false;
                break;
            case 'suspend':
                newStatus = 'suspendu';
                isActive = false;
                break;
        }

        await db.query(`
            UPDATE Chauffeur
            SET statut_validation = $1, disponibilite = $2
            WHERE id_chauffeur = $3
        `, [newStatus, isActive, id]);

        let message;
        switch(action) {
            case 'approve':
                message = 'Chauffeur approuvé avec succès';
                break;
            case 'reject':
                message = 'Chauffeur rejeté avec succès';
                break;
            case 'suspend':
                message = 'Chauffeur suspendu avec succès';
                break;
        }

        res.json({ 
            success: true, 
            message: message
        });

    } catch (error) {
        console.error('Erreur vérification chauffeur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Approuver/Rejeter un livreur
router.put('/delivery-persons/:id/verify', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { action, reason } = req.body;

        if (!action || !['approve', 'reject', 'suspend'].includes(action)) {
            return res.status(400).json({ error: 'Action invalide' });
        }

        let newStatus, isActive;
        switch(action) {
            case 'approve':
                newStatus = 'approuve';
                isActive = true;
                break;
            case 'reject':
                newStatus = 'rejete';
                isActive = false;
                break;
            case 'suspend':
                newStatus = 'suspendu';
                isActive = false;
                break;
        }

        await db.query(`
            UPDATE Livreur
            SET statut_validation = $1, disponibilite = $2
            WHERE id_livreur = $3
        `, [newStatus, isActive, id]);

        let message;
        switch(action) {
            case 'approve':
                message = 'Livreur approuvé avec succès';
                break;
            case 'reject':
                message = 'Livreur rejeté avec succès';
                break;
            case 'suspend':
                message = 'Livreur suspendu avec succès';
                break;
        }

        res.json({ 
            success: true, 
            message: message
        });

    } catch (error) {
        console.error('Erreur vérification livreur:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Liste des courses
router.get('/trips', authenticateAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const status = req.query.status;

        let whereClause = '';
        let queryParams = [limit, offset];

        if (status) {
            whereClause = 'WHERE c.etat_course = $3';
            queryParams.push(status);
        }

        const result = await db.query(`
            SELECT 
                c.id_course as id, c.adresse_depart as lieu_depart, c.adresse_arrivee as lieu_destination, c.prix as prix_course,
                c.etat_course as statut, c.date_heure_depart as created_at, c.distance_km as distance, c.duree_min as duree,
                cl.nom as client_nom, cl.prenom as client_prenom, cl.telephone as client_telephone,
                ch.nom as chauffeur_nom, ch.prenom as chauffeur_prenom
            FROM Course c
            LEFT JOIN Client cl ON cl.id_client = c.id_client
            LEFT JOIN Chauffeur ch ON ch.id_chauffeur = c.id_chauffeur
            ${whereClause}
            ORDER BY c.date_heure_depart DESC 
            LIMIT $1 OFFSET $2
        `, queryParams);

        const countQuery = status ? 
            'SELECT COUNT(*) as total FROM Course WHERE etat_course = $1' :
            'SELECT COUNT(*) as total FROM Course';
        const countParams = status ? [status] : [];
        const countResult = await db.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].total);

        res.json({
            success: true,
            trips: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Erreur liste courses:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Liste des livraisons
router.get('/deliveries', authenticateAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const status = req.query.status;

        let whereClause = '';
        let queryParams = [limit, offset];

        if (status) {
            whereClause = 'WHERE l.etat_livraison = $3';
            queryParams.push(status);
        }

        const result = await db.query(`
            SELECT 
                l.id_livraison as id, l.adresse_depart as lieu_recuperation, l.adresse_arrivee as lieu_livraison, l.prix as prix_livraison,
                l.etat_livraison as statut, l.date_heure_depart as created_at, l.instructions as description_colis,
                cl.nom as client_nom, cl.prenom as client_prenom, cl.telephone as client_telephone,
                li.nom as livreur_nom, li.prenom as livreur_prenom
            FROM Livraison l
            LEFT JOIN Client cl ON cl.id_client = l.id_client
            LEFT JOIN Livreur li ON li.id_livreur = l.id_livreur
            ${whereClause}
            ORDER BY l.date_heure_depart DESC 
            LIMIT $1 OFFSET $2
        `, queryParams);

        const countQuery = status ? 
            'SELECT COUNT(*) as total FROM Livraison WHERE etat_livraison = $1' :
            'SELECT COUNT(*) as total FROM Livraison';
        const countParams = status ? [status] : [];
        const countResult = await db.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].total);

        res.json({
            success: true,
            deliveries: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Erreur liste livraisons:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Statistiques financières
router.get('/financial/stats', authenticateAdmin, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let dateFilter = '';
        let queryParams = [];
        
        if (startDate && endDate) {
            dateFilter = 'WHERE DATE(date_heure_depart) BETWEEN $1 AND $2';
            queryParams = [startDate, endDate];
        }

        const [coursesRevenue, deliveriesRevenue] = await Promise.all([
            db.query(`
                SELECT 
                    COUNT(*) as total_trips,
                    COALESCE(SUM(prix), 0) as total_revenue
                FROM Course 
                ${dateFilter} AND etat_course = 'termine'
            `, queryParams),
            db.query(`
                SELECT 
                    COUNT(*) as total_deliveries,
                    COALESCE(SUM(prix), 0) as total_revenue
                FROM Livraison 
                ${dateFilter} AND etat_livraison = 'livre'
            `, queryParams)
        ]);

        const stats = {
            trips: {
                count: parseInt(coursesRevenue.rows[0].total_trips),
                revenue: parseFloat(coursesRevenue.rows[0].total_revenue)
            },
            deliveries: {
                count: parseInt(deliveriesRevenue.rows[0].total_deliveries),
                revenue: parseFloat(deliveriesRevenue.rows[0].total_revenue)
            }
        };

        stats.total = {
            count: stats.trips.count + stats.deliveries.count,
            revenue: stats.trips.revenue + stats.deliveries.revenue
        };

        res.json({ success: true, stats });

    } catch (error) {
        console.error('Erreur stats financières:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Courses actives en temps réel
router.get('/trips/active', authenticateAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                c.id_course as id, c.adresse_depart as lieu_depart, c.adresse_arrivee as lieu_destination, c.prix as prix_course,
                c.etat_course as statut, c.date_heure_depart as created_at,
                cl.nom as client_nom, cl.prenom as client_prenom,
                ch.nom as chauffeur_nom, ch.prenom as chauffeur_prenom,
                pc.latitude, pc.longitude, pc.derniere_maj as last_update
            FROM Course c
            LEFT JOIN Client cl ON cl.id_client = c.id_client
            LEFT JOIN Chauffeur ch ON ch.id_chauffeur = c.id_chauffeur
            LEFT JOIN PositionChauffeur pc ON pc.id_chauffeur = ch.id_chauffeur
            WHERE c.etat_course IN ('en_cours', 'en_attente', 'accepte')
            ORDER BY c.date_heure_depart DESC
        `);

        res.json({ success: true, activeTrips: result.rows });

    } catch (error) {
        console.error('Erreur courses actives:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Livraisons actives en temps réel
router.get('/deliveries/active', authenticateAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                l.id_livraison as id, l.adresse_depart as lieu_recuperation, l.adresse_arrivee as lieu_livraison, l.prix as prix_livraison,
                l.etat_livraison as statut, l.date_heure_depart as created_at, l.instructions as description_colis,
                cl.nom as client_nom, cl.prenom as client_prenom,
                li.nom as livreur_nom, li.prenom as livreur_prenom,
                pl.latitude, pl.longitude, pl.derniere_maj as last_update
            FROM Livraison l
            LEFT JOIN Client cl ON cl.id_client = l.id_client
            LEFT JOIN Livreur li ON li.id_livreur = l.id_livreur
            LEFT JOIN PositionLivreur pl ON pl.id_livreur = li.id_livreur
            WHERE l.etat_livraison IN ('en_cours', 'en_attente', 'accepte', 'en_livraison')
            ORDER BY l.date_heure_depart DESC
        `);

        res.json({ success: true, activeDeliveries: result.rows });

    } catch (error) {
        console.error('Erreur livraisons actives:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Déclencher un nettoyage manuel
router.post('/cleanup', authenticateAdmin, async (req, res) => {
    try {
        const autoCleanupService = require('../services/autoCleanupService');
        const result = await autoCleanupService.manualCleanup();
        res.json(result);
    } catch (error) {
        console.error('❌ Erreur cleanup manuel:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du nettoyage'
        });
    }
});

// Récupérer les arrêts intermédiaires d'une course
router.get('/courses/:id/arrets', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT
                id_arret,
                ordre_arret,
                adresse,
                latitude,
                longitude,
                statut,
                heure_arrivee,
                date_creation
            FROM arrets_intermediaires
            WHERE id_course = $1
            ORDER BY ordre_arret ASC
        `, [id]);

        res.json({
            success: true,
            arrets: result.rows
        });
    } catch (error) {
        console.error('❌ Erreur récupération arrêts course:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération des arrêts'
        });
    }
});

// Récupérer les arrêts intermédiaires d'une livraison
router.get('/livraisons/:id/arrets', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT
                id_arret,
                ordre_arret,
                adresse,
                latitude,
                longitude,
                statut,
                heure_arrivee,
                date_creation
            FROM arrets_intermediaires_livraison
            WHERE id_livraison = $1
            ORDER BY ordre_arret ASC
        `, [id]);

        res.json({
            success: true,
            arrets: result.rows
        });
    } catch (error) {
        console.error('❌ Erreur récupération arrêts livraison:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération des arrêts'
        });
    }
});

// ==========================================
// GESTION DES COURSES BLOQUÉES
// ==========================================

// Récupérer toutes les courses bloquées pour analyse
router.get('/stuck-courses', authenticateAdmin, async (req, res) => {
    try {
        console.log('📊 Récupération des courses bloquées...');

        // Courses "en_cours" avec date_heure_arrivee (terminées physiquement mais pas marquées)
        const enCoursQuery = `
            SELECT
                c.id_course,
                c.etat_course,
                c.date_heure_demande,
                c.date_heure_depart,
                c.date_heure_debut_course,
                c.date_heure_arrivee,
                c.adresse_depart,
                c.adresse_arrivee,
                c.montant,
                ch.nom as chauffeur_nom,
                ch.prenom as chauffeur_prenom,
                ch.telephone as chauffeur_telephone,
                cl.nom as client_nom,
                cl.prenom as client_prenom,
                EXTRACT(EPOCH FROM (NOW() - c.date_heure_arrivee))/3600 as heures_depuis_arrivee,
                CASE
                    WHEN c.date_heure_arrivee < c.date_heure_debut_course THEN 'ANOMALIE_TIMESTAMPS'
                    WHEN EXTRACT(EPOCH FROM (NOW() - c.date_heure_arrivee))/3600 > 168 THEN 'TRES_ANCIENNE'
                    WHEN EXTRACT(EPOCH FROM (NOW() - c.date_heure_arrivee))/3600 > 24 THEN 'ANCIENNE'
                    ELSE 'RECENTE'
                END as categorie
            FROM Course c
            LEFT JOIN Chauffeur ch ON c.id_chauffeur = ch.id_chauffeur
            LEFT JOIN Client cl ON c.id_client = cl.id_client
            WHERE c.etat_course = 'en_cours'
            AND c.date_heure_arrivee IS NOT NULL
            ORDER BY c.date_heure_arrivee DESC
        `;

        // Courses "en_attente" timeout
        const enAttenteQuery = `
            SELECT
                c.id_course,
                c.etat_course,
                c.date_heure_demande,
                c.adresse_depart,
                c.adresse_arrivee,
                c.montant,
                cl.nom as client_nom,
                cl.prenom as client_prenom,
                EXTRACT(EPOCH FROM (NOW() - c.date_heure_demande))/60 as minutes_depuis_demande,
                CASE
                    WHEN EXTRACT(EPOCH FROM (NOW() - c.date_heure_demande))/60 > 60 THEN 'TIMEOUT_LONG'
                    ELSE 'TIMEOUT_COURT'
                END as categorie
            FROM Course c
            LEFT JOIN Client cl ON c.id_client = cl.id_client
            WHERE c.etat_course = 'en_attente'
            AND c.date_heure_demande < NOW() - INTERVAL '30 minutes'
            ORDER BY c.date_heure_demande DESC
        `;

        // Courses "acceptee" qui ne démarrent pas
        const accepteeQuery = `
            SELECT
                c.id_course,
                c.etat_course,
                c.date_heure_demande,
                c.date_heure_depart,
                c.adresse_depart,
                c.adresse_arrivee,
                c.montant,
                ch.nom as chauffeur_nom,
                ch.prenom as chauffeur_prenom,
                ch.telephone as chauffeur_telephone,
                cl.nom as client_nom,
                cl.prenom as client_prenom,
                EXTRACT(EPOCH FROM (NOW() - c.date_heure_depart))/60 as minutes_depuis_acceptation,
                'ACCEPTEE_SANS_DEPART' as categorie
            FROM Course c
            LEFT JOIN Chauffeur ch ON c.id_chauffeur = ch.id_chauffeur
            LEFT JOIN Client cl ON c.id_client = cl.id_client
            WHERE c.etat_course = 'acceptee'
            AND c.date_heure_depart IS NOT NULL
            AND c.date_heure_debut_course IS NULL
            AND c.date_heure_depart < NOW() - INTERVAL '15 minutes'
            ORDER BY c.date_heure_depart DESC
        `;

        const [enCoursResults, enAttenteResults, accepteeResults] = await Promise.all([
            db.query(enCoursQuery),
            db.query(enAttenteQuery),
            db.query(accepteeQuery)
        ]);

        res.json({
            success: true,
            stuckCourses: {
                enCours: enCoursResults.rows,
                enAttente: enAttenteResults.rows,
                acceptee: accepteeResults.rows
            },
            summary: {
                total: enCoursResults.rows.length + enAttenteResults.rows.length + accepteeResults.rows.length,
                enCoursCount: enCoursResults.rows.length,
                enAttenteCount: enAttenteResults.rows.length,
                accepteeCount: accepteeResults.rows.length,
                categories: {
                    anomalies: enCoursResults.rows.filter(c => c.categorie === 'ANOMALIE_TIMESTAMPS').length,
                    tresAnciennes: enCoursResults.rows.filter(c => c.categorie === 'TRES_ANCIENNE').length,
                    anciennes: enCoursResults.rows.filter(c => c.categorie === 'ANCIENNE').length,
                    recentes: enCoursResults.rows.filter(c => c.categorie === 'RECENTE').length
                }
            }
        });

    } catch (error) {
        console.error('❌ Erreur récupération courses bloquées:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération des courses bloquées'
        });
    }
});

// Forcer la terminaison d'une course spécifique
router.post('/force-complete-course/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🔧 Forçage terminaison course #${id}...`);

        const result = await db.query(
            `UPDATE Course
             SET etat_course = 'terminee'
             WHERE id_course = $1
             RETURNING *`,
            [id]
        );

        if (result.rows.length > 0) {
            res.json({
                success: true,
                message: `Course #${id} marquée comme terminée`,
                course: result.rows[0]
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Course non trouvée'
            });
        }

    } catch (error) {
        console.error('❌ Erreur forçage terminaison:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du forçage de terminaison'
        });
    }
});

// Forcer l'annulation d'une course spécifique
router.post('/force-cancel-course/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🔧 Forçage annulation course #${id}...`);

        const result = await db.query(
            `UPDATE Course
             SET etat_course = 'annulee'
             WHERE id_course = $1
             RETURNING *`,
            [id]
        );

        if (result.rows.length > 0) {
            res.json({
                success: true,
                message: `Course #${id} annulée`,
                course: result.rows[0]
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Course non trouvée'
            });
        }

    } catch (error) {
        console.error('❌ Erreur forçage annulation:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du forçage d\'annulation'
        });
    }
});

// Nettoyage automatique des courses anciennes bloquées
router.post('/cleanup-old-courses', authenticateAdmin, async (req, res) => {
    try {
        const { daysThreshold = 7 } = req.body;
        console.log(`🧹 Nettoyage automatique des courses de plus de ${daysThreshold} jours...`);

        // Marquer comme "terminee" les courses "en_cours" anciennes avec arrivée
        const termineeResult = await db.query(
            `UPDATE Course
             SET etat_course = 'terminee'
             WHERE etat_course = 'en_cours'
             AND date_heure_arrivee IS NOT NULL
             AND date_heure_arrivee < NOW() - INTERVAL '${daysThreshold} days'
             RETURNING id_course`,
            []
        );

        // Annuler les courses "en_attente" anciennes
        const annuleeAttenteResult = await db.query(
            `UPDATE Course
             SET etat_course = 'annulee'
             WHERE etat_course = 'en_attente'
             AND date_heure_demande < NOW() - INTERVAL '${daysThreshold} days'
             RETURNING id_course`,
            []
        );

        // Annuler les courses "acceptee" anciennes sans départ
        const annuleeAccepteeResult = await db.query(
            `UPDATE Course
             SET etat_course = 'annulee'
             WHERE etat_course = 'acceptee'
             AND date_heure_depart IS NOT NULL
             AND date_heure_debut_course IS NULL
             AND date_heure_depart < NOW() - INTERVAL '${daysThreshold} days'
             RETURNING id_course`,
            []
        );

        res.json({
            success: true,
            message: `Nettoyage terminé`,
            cleaned: {
                terminee: termineeResult.rows.length,
                annuleeAttente: annuleeAttenteResult.rows.length,
                annuleeAcceptee: annuleeAccepteeResult.rows.length,
                total: termineeResult.rows.length + annuleeAttenteResult.rows.length + annuleeAccepteeResult.rows.length
            },
            courseIds: {
                terminee: termineeResult.rows.map(r => r.id_course),
                annulee: [...annuleeAttenteResult.rows, ...annuleeAccepteeResult.rows].map(r => r.id_course)
            }
        });

    } catch (error) {
        console.error('❌ Erreur nettoyage automatique:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du nettoyage automatique'
        });
    }
});

module.exports = router;