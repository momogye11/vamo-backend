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
            db.query('SELECT COUNT(*) as count FROM client'),
            db.query('SELECT COUNT(*) as count FROM chauffeur'),
            db.query('SELECT COUNT(*) as count FROM livreur'),
            db.query("SELECT COUNT(*) as count FROM course WHERE statut = 'en_cours'"),
            db.query("SELECT COUNT(*) as count FROM livraison WHERE statut = 'en_cours'"),
            db.query("SELECT COUNT(*) as count FROM course WHERE DATE(created_at) = CURRENT_DATE"),
            db.query("SELECT COUNT(*) as count FROM livraison WHERE DATE(created_at) = CURRENT_DATE"),
            db.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN prix_course END), 0) as today_revenue,
                    COALESCE(SUM(CASE WHEN DATE_PART('month', created_at) = DATE_PART('month', CURRENT_DATE) 
                                     AND DATE_PART('year', created_at) = DATE_PART('year', CURRENT_DATE) 
                                     THEN prix_course END), 0) as monthly_revenue
                FROM course WHERE statut = 'termine'
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
                id, nom, prenom, telephone, 
                created_at, is_active,
                (SELECT COUNT(*) FROM course WHERE client_id = client.id) as total_trips
            FROM client 
            ORDER BY created_at DESC 
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const countResult = await db.query('SELECT COUNT(*) as total FROM client');
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
                c.id, c.nom, c.prenom, c.telephone, c.email,
                c.statut_verification, c.date_inscription, c.is_active,
                c.photo_selfie, c.photo_cni, c.numero_permis,
                v.marque, v.modele, v.annee, v.couleur, v.numero_immatriculation,
                (SELECT COUNT(*) FROM course WHERE chauffeur_id = c.id) as total_trips,
                (SELECT AVG(note) FROM note WHERE chauffeur_id = c.id) as average_rating
            FROM chauffeur c
            LEFT JOIN vehicule v ON v.chauffeur_id = c.id
            ORDER BY c.date_inscription DESC 
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const countResult = await db.query('SELECT COUNT(*) as total FROM chauffeur');
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
                l.id, l.nom, l.prenom, l.telephone, l.email,
                l.statut_verification, l.date_inscription, l.is_active,
                l.photo_selfie, l.photo_cni, l.type_vehicule,
                (SELECT COUNT(*) FROM livraison WHERE livreur_id = l.id) as total_deliveries,
                (SELECT AVG(note) FROM notelivraison WHERE livreur_id = l.id) as average_rating
            FROM livreur l
            ORDER BY l.date_inscription DESC 
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const countResult = await db.query('SELECT COUNT(*) as total FROM livreur');
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
        const { action, reason } = req.body; // action: 'approve' ou 'reject'

        if (!action || (action !== 'approve' && action !== 'reject')) {
            return res.status(400).json({ error: 'Action invalide' });
        }

        const newStatus = action === 'approve' ? 'verifie' : 'rejete';
        const isActive = action === 'approve';

        await db.query(`
            UPDATE chauffeur 
            SET statut_verification = $1, is_active = $2, 
                verification_reason = $3, verified_at = CURRENT_TIMESTAMP
            WHERE id = $4
        `, [newStatus, isActive, reason || null, id]);

        res.json({ 
            success: true, 
            message: `Chauffeur ${action === 'approve' ? 'approuvé' : 'rejeté'} avec succès`
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

        if (!action || (action !== 'approve' && action !== 'reject')) {
            return res.status(400).json({ error: 'Action invalide' });
        }

        const newStatus = action === 'approve' ? 'verifie' : 'rejete';
        const isActive = action === 'approve';

        await db.query(`
            UPDATE livreur 
            SET statut_verification = $1, is_active = $2,
                verification_reason = $3, verified_at = CURRENT_TIMESTAMP
            WHERE id = $4
        `, [newStatus, isActive, reason || null, id]);

        res.json({ 
            success: true, 
            message: `Livreur ${action === 'approve' ? 'approuvé' : 'rejeté'} avec succès`
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
            whereClause = 'WHERE c.statut = $3';
            queryParams.push(status);
        }

        const result = await db.query(`
            SELECT 
                c.id, c.lieu_depart, c.lieu_destination, c.prix_course,
                c.statut, c.created_at, c.distance, c.duree,
                cl.nom as client_nom, cl.prenom as client_prenom, cl.telephone as client_telephone,
                ch.nom as chauffeur_nom, ch.prenom as chauffeur_prenom
            FROM course c
            LEFT JOIN client cl ON cl.id = c.client_id
            LEFT JOIN chauffeur ch ON ch.id = c.chauffeur_id
            ${whereClause}
            ORDER BY c.created_at DESC 
            LIMIT $1 OFFSET $2
        `, queryParams);

        const countQuery = status ? 
            'SELECT COUNT(*) as total FROM course WHERE statut = $1' :
            'SELECT COUNT(*) as total FROM course';
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
            whereClause = 'WHERE l.statut = $3';
            queryParams.push(status);
        }

        const result = await db.query(`
            SELECT 
                l.id, l.lieu_recuperation, l.lieu_livraison, l.prix_livraison,
                l.statut, l.created_at, l.description_colis,
                cl.nom as client_nom, cl.prenom as client_prenom, cl.telephone as client_telephone,
                li.nom as livreur_nom, li.prenom as livreur_prenom
            FROM livraison l
            LEFT JOIN client cl ON cl.id = l.client_id
            LEFT JOIN livreur li ON li.id = l.livreur_id
            ${whereClause}
            ORDER BY l.created_at DESC 
            LIMIT $1 OFFSET $2
        `, queryParams);

        const countQuery = status ? 
            'SELECT COUNT(*) as total FROM livraison WHERE statut = $1' :
            'SELECT COUNT(*) as total FROM livraison';
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
            dateFilter = 'WHERE DATE(created_at) BETWEEN $1 AND $2';
            queryParams = [startDate, endDate];
        }

        const [coursesRevenue, deliveriesRevenue] = await Promise.all([
            db.query(`
                SELECT 
                    COUNT(*) as total_trips,
                    COALESCE(SUM(prix_course), 0) as total_revenue
                FROM course 
                ${dateFilter} AND statut = 'termine'
            `, queryParams),
            db.query(`
                SELECT 
                    COUNT(*) as total_deliveries,
                    COALESCE(SUM(prix_livraison), 0) as total_revenue
                FROM livraison 
                ${dateFilter} AND statut = 'livre'
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
                c.id, c.lieu_depart, c.lieu_destination, c.prix_course,
                c.statut, c.created_at,
                cl.nom as client_nom, cl.prenom as client_prenom,
                ch.nom as chauffeur_nom, ch.prenom as chauffeur_prenom,
                pc.latitude, pc.longitude, pc.last_update
            FROM course c
            LEFT JOIN client cl ON cl.id = c.client_id
            LEFT JOIN chauffeur ch ON ch.id = c.chauffeur_id
            LEFT JOIN positionchauffeur pc ON pc.chauffeur_id = ch.id
            WHERE c.statut IN ('en_cours', 'en_attente', 'accepte')
            ORDER BY c.created_at DESC
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
                l.id, l.lieu_recuperation, l.lieu_livraison, l.prix_livraison,
                l.statut, l.created_at, l.description_colis,
                cl.nom as client_nom, cl.prenom as client_prenom,
                li.nom as livreur_nom, li.prenom as livreur_prenom,
                pl.latitude, pl.longitude, pl.last_update
            FROM livraison l
            LEFT JOIN client cl ON cl.id = l.client_id
            LEFT JOIN livreur li ON li.id = l.livreur_id
            LEFT JOIN positionlivreur pl ON pl.livreur_id = li.id
            WHERE l.statut IN ('en_cours', 'en_attente', 'accepte', 'en_livraison')
            ORDER BY l.created_at DESC
        `);

        res.json({ success: true, activeDeliveries: result.rows });

    } catch (error) {
        console.error('Erreur livraisons actives:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;