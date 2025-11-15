const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'vamo-admin-secret-key-2024';
const JWT_EXPIRES_IN = '24h';

// Middleware d'authentification admin
const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token d\'accès requis' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token invalide' });
    }
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

// Dashboard stats
router.get('/dashboard/stats', authenticateAdmin, async (req, res) => {
    try {
        // Requêtes pour obtenir les statistiques
        const [
            clientsResult,
            chauffeursResult,
            livreursResult,
            coursesActiveResult,
            livraisonsActiveResult,
            coursesTodayResult,
            livraisonsTodayResult,
            revenueResult
        ] = await Promise.all([
            db.query('SELECT COUNT(*) as count FROM Client'),
            db.query('SELECT COUNT(*) as count FROM Chauffeur'),
            db.query('SELECT COUNT(*) as count FROM Livreur'),
            db.query("SELECT COUNT(*) as count FROM Course WHERE etat_course = 'en_cours'"),
            db.query("SELECT COUNT(*) as count FROM Livraison WHERE etat_livraison = 'en_cours'"),
            db.query("SELECT COUNT(*) as count FROM Course WHERE DATE(date_heure_depart) = CURRENT_DATE"),
            db.query("SELECT COUNT(*) as count FROM Livraison WHERE DATE(date_heure_depart) = CURRENT_DATE"),
            db.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN DATE(date_heure_depart) = CURRENT_DATE THEN prix END), 0) as today_revenue,
                    COALESCE(SUM(CASE WHEN DATE_PART('month', date_heure_depart) = DATE_PART('month', CURRENT_DATE) 
                                     AND DATE_PART('year', date_heure_depart) = DATE_PART('year', CURRENT_DATE) 
                                     THEN prix END), 0) as monthly_revenue
                FROM Course WHERE etat_course = 'termine'
            `)
        ]);

        const stats = {
            totalUsers: parseInt(clientsResult.rows[0].count),
            totalDrivers: parseInt(chauffeursResult.rows[0].count),
            totalDeliveryPersons: parseInt(livreursResult.rows[0].count),
            activeTrips: parseInt(coursesActiveResult.rows[0].count),
            activeDeliveries: parseInt(livraisonsActiveResult.rows[0].count),
            completedTripsToday: parseInt(coursesTodayResult.rows[0].count),
            completedDeliveriesToday: parseInt(livraisonsTodayResult.rows[0].count),
            todayRevenue: parseFloat(revenueResult.rows[0].today_revenue || 0),
            monthlyRevenue: parseFloat(revenueResult.rows[0].monthly_revenue || 0),
            averageRating: 4.5 // À calculer plus tard avec les vraies notes
        };

        res.json({ success: true, stats });

    } catch (error) {
        console.error('Erreur dashboard stats:', error);
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
        console.error('Erreur liste clients:', error);
        res.status(500).json({ error: 'Erreur serveur' });
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
                newStatus = 'verifie';
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
                newStatus = 'verifie';
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

module.exports = router;