const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'vamo-admin-secret-key-2024';

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

// Login admin (même que l'original)
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email et mot de passe requis' });
        }

        const adminCredentials = {
            email: 'admin@vamo.sn',
            password: 'VamoAdmin2024',
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
            { expiresIn: '24h' }
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
        console.error('❌ Erreur login admin:', error);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// 📊 ANALYTICS ET STATISTIQUES
router.get('/analytics/dashboard', authenticateAdmin, async (req, res) => {
    try {
        console.log('📊 Récupération analytics dashboard...');

        // Statistiques générales
        const [chauffeurs, livreurs, courses, livraisons] = await Promise.all([
            db.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE statut_validation = \'approuve\') as approuves, COUNT(*) FILTER (WHERE disponibilite = true) as disponibles FROM Chauffeur'),
            db.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE statut_validation = \'approuve\') as approuves, COUNT(*) FILTER (WHERE disponibilite = true) as disponibles FROM Livreur'),
            db.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE statut = \'terminee\') as terminees FROM Course'),
            db.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE statut = \'livree\') as livrees FROM Livraison')
        ]);

        // Statistiques de la semaine
        const weeklyStats = await db.query(`
            SELECT 
                DATE(date_heure_debut) as date,
                COUNT(*) as courses_count,
                SUM(prix_total) as revenus_total
            FROM Course 
            WHERE date_heure_debut >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY DATE(date_heure_debut)
            ORDER BY date DESC
        `);

        // Statistiques du mois
        const monthlyStats = await db.query(`
            SELECT 
                COUNT(*) as courses_total,
                SUM(prix_total) as revenus_total,
                AVG(prix_total) as prix_moyen
            FROM Course 
            WHERE date_heure_debut >= CURRENT_DATE - INTERVAL '30 days'
        `);

        // Top chauffeurs
        const topChauffeurs = await db.query(`
            SELECT 
                c.id_chauffeur,
                c.nom,
                c.prenom,
                COUNT(co.id_course) as courses_total,
                SUM(co.prix_total) as revenus_total
            FROM Chauffeur c
            LEFT JOIN Course co ON c.id_chauffeur = co.id_chauffeur
            WHERE co.date_heure_debut >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY c.id_chauffeur, c.nom, c.prenom
            ORDER BY revenus_total DESC
            LIMIT 5
        `);

        res.json({
            success: true,
            analytics: {
                general: {
                    chauffeurs: chauffeurs.rows[0],
                    livreurs: livreurs.rows[0],
                    courses: courses.rows[0],
                    livraisons: livraisons.rows[0]
                },
                weekly: weeklyStats.rows,
                monthly: monthlyStats.rows[0],
                topChauffeurs: topChauffeurs.rows
            }
        });

    } catch (error) {
        console.error('❌ Erreur analytics:', error);
        res.status(500).json({ error: 'Erreur récupération analytics' });
    }
});

// 🚗 GESTION AVANCÉE CHAUFFEURS
router.get('/chauffeurs/:id/details', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🔍 Récupération détails chauffeur ${id}...`);

        // Informations complètes du chauffeur
        const chauffeur = await db.query(`
            SELECT 
                c.*,
                v.marque,
                v.modele,
                v.annee,
                v.couleur,
                v.numero_plaque,
                COUNT(co.id_course) as total_courses,
                SUM(co.prix_total) as revenus_total,
                AVG(co.prix_total) as prix_moyen
            FROM Chauffeur c
            LEFT JOIN Vehicule v ON c.id_chauffeur = v.id_chauffeur
            LEFT JOIN Course co ON c.id_chauffeur = co.id_chauffeur
            WHERE c.id_chauffeur = $1
            GROUP BY c.id_chauffeur, v.id_vehicule
        `, [id]);

        if (chauffeur.rows.length === 0) {
            return res.status(404).json({ error: 'Chauffeur non trouvé' });
        }

        // Historique des courses récentes
        const coursesRecentes = await db.query(`
            SELECT 
                id_course,
                adresse_depart,
                adresse_arrivee,
                prix_total,
                statut,
                date_heure_debut,
                date_heure_fin
            FROM Course
            WHERE id_chauffeur = $1
            ORDER BY date_heure_debut DESC
            LIMIT 10
        `, [id]);

        // Historique des actions admin
        const historiqueActions = await db.query(`
            SELECT 
                action,
                ancien_statut,
                nouveau_statut,
                raison,
                date_action,
                admin_email
            FROM HistoriqueActionsChauffeur
            WHERE id_chauffeur = $1
            ORDER BY date_action DESC
            LIMIT 10
        `, [id]);

        res.json({
            success: true,
            chauffeur: chauffeur.rows[0],
            courses_recentes: coursesRecentes.rows,
            historique_actions: historiqueActions.rows
        });

    } catch (error) {
        console.error('❌ Erreur détails chauffeur:', error);
        res.status(500).json({ error: 'Erreur récupération détails chauffeur' });
    }
});

// 🏍️ GESTION AVANCÉE LIVREURS
router.get('/livreurs/:id/details', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🔍 Récupération détails livreur ${id}...`);

        // Informations complètes du livreur
        const livreur = await db.query(`
            SELECT 
                l.*,
                COUNT(li.id_livraison) as total_livraisons,
                SUM(li.prix_total) as revenus_total,
                AVG(li.prix_total) as prix_moyen
            FROM Livreur l
            LEFT JOIN Livraison li ON l.id_livreur = li.id_livreur
            WHERE l.id_livreur = $1
            GROUP BY l.id_livreur
        `, [id]);

        if (livreur.rows.length === 0) {
            return res.status(404).json({ error: 'Livreur non trouvé' });
        }

        // Historique des livraisons récentes
        const livraisonsRecentes = await db.query(`
            SELECT 
                id_livraison,
                adresse_depart,
                adresse_arrivee,
                prix_total,
                statut,
                date_heure_demande,
                date_heure_livraison
            FROM Livraison
            WHERE id_livreur = $1
            ORDER BY date_heure_demande DESC
            LIMIT 10
        `, [id]);

        res.json({
            success: true,
            livreur: livreur.rows[0],
            livraisons_recentes: livraisonsRecentes.rows
        });

    } catch (error) {
        console.error('❌ Erreur détails livreur:', error);
        res.status(500).json({ error: 'Erreur récupération détails livreur' });
    }
});

// ⚡ ACTIONS AVANCÉES CHAUFFEURS
router.post('/chauffeurs/:id/action', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { action, raison, admin_email } = req.body;
        
        console.log(`⚡ Action ${action} sur chauffeur ${id}...`);

        // Récupérer statut actuel
        const currentStatus = await db.query('SELECT statut_validation FROM Chauffeur WHERE id_chauffeur = $1', [id]);
        if (currentStatus.rows.length === 0) {
            return res.status(404).json({ error: 'Chauffeur non trouvé' });
        }

        const ancienStatut = currentStatus.rows[0].statut_validation;
        let nouveauStatut;

        // Déterminer nouveau statut selon l'action
        switch (action) {
            case 'approuver':
                nouveauStatut = 'approuve';
                break;
            case 'suspendre':
                nouveauStatut = 'suspendu';
                break;
            case 'rejeter':
                nouveauStatut = 'rejete';
                break;
            case 'reapprouver':
                nouveauStatut = 'approuve';
                break;
            default:
                return res.status(400).json({ error: 'Action non valide' });
        }

        // Mettre à jour le statut
        await db.query(
            'UPDATE Chauffeur SET statut_validation = $1, date_modification = CURRENT_TIMESTAMP WHERE id_chauffeur = $2',
            [nouveauStatut, id]
        );

        // Enregistrer l'action dans l'historique
        await db.query(`
            INSERT INTO HistoriqueActionsChauffeur 
            (id_chauffeur, action, ancien_statut, nouveau_statut, raison, admin_email, date_action)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        `, [id, action, ancienStatut, nouveauStatut, raison || '', admin_email || req.admin.email]);

        res.json({
            success: true,
            message: `Chauffeur ${action} avec succès`,
            ancien_statut: ancienStatut,
            nouveau_statut: nouveauStatut
        });

    } catch (error) {
        console.error('❌ Erreur action chauffeur:', error);
        res.status(500).json({ error: 'Erreur lors de l\'action' });
    }
});

// ⚡ ACTIONS AVANCÉES LIVREURS
router.post('/livreurs/:id/action', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { action, raison, admin_email } = req.body;
        
        console.log(`⚡ Action ${action} sur livreur ${id}...`);

        // Récupérer statut actuel
        const currentStatus = await db.query('SELECT statut_validation FROM Livreur WHERE id_livreur = $1', [id]);
        if (currentStatus.rows.length === 0) {
            return res.status(404).json({ error: 'Livreur non trouvé' });
        }

        const ancienStatut = currentStatus.rows[0].statut_validation;
        let nouveauStatut;

        // Déterminer nouveau statut selon l'action
        switch (action) {
            case 'approuver':
                nouveauStatut = 'approuve';
                break;
            case 'suspendre':
                nouveauStatut = 'suspendu';
                break;
            case 'rejeter':
                nouveauStatut = 'rejete';
                break;
            case 'reapprouver':
                nouveauStatut = 'approuve';
                break;
            default:
                return res.status(400).json({ error: 'Action non valide' });
        }

        // Mettre à jour le statut
        await db.query(
            'UPDATE Livreur SET statut_validation = $1, date_modification = CURRENT_TIMESTAMP WHERE id_livreur = $2',
            [nouveauStatut, id]
        );

        res.json({
            success: true,
            message: `Livreur ${action} avec succès`,
            ancien_statut: ancienStatut,
            nouveau_statut: nouveauStatut
        });

    } catch (error) {
        console.error('❌ Erreur action livreur:', error);
        res.status(500).json({ error: 'Erreur lors de l\'action' });
    }
});

// 🔍 RECHERCHE ET FILTRES
router.get('/search', authenticateAdmin, async (req, res) => {
    try {
        const { query, type, statut, disponibilite } = req.query;
        console.log(`🔍 Recherche: ${query}, type: ${type}, statut: ${statut}`);

        let results = {};

        if (!type || type === 'chauffeurs') {
            let chauffeurQuery = `
                SELECT c.*, v.marque, v.modele, v.numero_plaque 
                FROM Chauffeur c 
                LEFT JOIN Vehicule v ON c.id_chauffeur = v.id_chauffeur 
                WHERE 1=1
            `;
            let params = [];

            if (query) {
                chauffeurQuery += ` AND (c.nom ILIKE $${params.length + 1} OR c.prenom ILIKE $${params.length + 1} OR c.telephone ILIKE $${params.length + 1})`;
                params.push(`%${query}%`);
            }
            if (statut) {
                chauffeurQuery += ` AND c.statut_validation = $${params.length + 1}`;
                params.push(statut);
            }
            if (disponibilite !== undefined) {
                chauffeurQuery += ` AND c.disponibilite = $${params.length + 1}`;
                params.push(disponibilite === 'true');
            }

            const chauffeurs = await db.query(chauffeurQuery + ' ORDER BY c.nom, c.prenom', params);
            results.chauffeurs = chauffeurs.rows;
        }

        if (!type || type === 'livreurs') {
            let livreurQuery = `
                SELECT * FROM Livreur WHERE 1=1
            `;
            let params = [];

            if (query) {
                livreurQuery += ` AND (nom ILIKE $${params.length + 1} OR prenom ILIKE $${params.length + 1} OR telephone ILIKE $${params.length + 1})`;
                params.push(`%${query}%`);
            }
            if (statut) {
                livreurQuery += ` AND statut_validation = $${params.length + 1}`;
                params.push(statut);
            }
            if (disponibilite !== undefined) {
                livreurQuery += ` AND disponibilite = $${params.length + 1}`;
                params.push(disponibilite === 'true');
            }

            const livreurs = await db.query(livreurQuery + ' ORDER BY nom, prenom', params);
            results.livreurs = livreurs.rows;
        }

        res.json({
            success: true,
            results
        });

    } catch (error) {
        console.error('❌ Erreur recherche:', error);
        res.status(500).json({ error: 'Erreur lors de la recherche' });
    }
});

// 💰 NOUVEAUX ENDPOINTS POUR VRAIS REVENUS
router.get('/revenus/chauffeurs', authenticateAdmin, async (req, res) => {
    try {
        console.log('💰 Récupération revenus chauffeurs...');
        
        // Revenus par chauffeur - semaine
        const revenus7jours = await db.query(`
            SELECT 
                c.id_chauffeur,
                c.nom,
                c.prenom,
                COUNT(co.id_course) as courses_total,
                SUM(co.prix_total) as revenus_total
            FROM Chauffeur c
            LEFT JOIN Course co ON c.id_chauffeur = co.id_chauffeur
            WHERE co.statut = 'terminee'
            AND co.date_heure_debut >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY c.id_chauffeur, c.nom, c.prenom
            HAVING SUM(co.prix_total) > 0
            ORDER BY revenus_total DESC
        `);

        // Revenus par chauffeur - mois  
        const revenus30jours = await db.query(`
            SELECT 
                c.id_chauffeur,
                c.nom,
                c.prenom,
                COUNT(co.id_course) as courses_total,
                SUM(co.prix_total) as revenus_total,
                AVG(co.prix_total) as prix_moyen
            FROM Chauffeur c
            LEFT JOIN Course co ON c.id_chauffeur = co.id_chauffeur
            WHERE co.statut = 'terminee'
            AND co.date_heure_debut >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY c.id_chauffeur, c.nom, c.prenom
            HAVING SUM(co.prix_total) > 0
            ORDER BY revenus_total DESC
        `);

        // Totaux globaux chauffeurs
        const totauxChauffeurs = await db.query(`
            SELECT 
                COUNT(DISTINCT c.id_chauffeur) as chauffeurs_actifs,
                COUNT(co.id_course) as courses_total,
                SUM(co.prix_total) as revenus_total_global,
                AVG(co.prix_total) as prix_moyen_global
            FROM Chauffeur c
            JOIN Course co ON c.id_chauffeur = co.id_chauffeur
            WHERE co.statut = 'terminee'
            AND co.date_heure_debut >= CURRENT_DATE - INTERVAL '30 days'
        `);

        res.json({
            success: true,
            revenus_chauffeurs: {
                semaine: revenus7jours.rows,
                mois: revenus30jours.rows,
                totaux: totauxChauffeurs.rows[0] || { 
                    chauffeurs_actifs: 0, 
                    courses_total: 0, 
                    revenus_total_global: 0, 
                    prix_moyen_global: 0 
                }
            }
        });

    } catch (error) {
        console.error('❌ Erreur revenus chauffeurs:', error);
        res.status(500).json({ error: 'Erreur récupération revenus chauffeurs' });
    }
});

router.get('/revenus/livreurs', authenticateAdmin, async (req, res) => {
    try {
        console.log('💰 Récupération revenus livreurs...');
        
        // Revenus par livreur - semaine
        const revenus7jours = await db.query(`
            SELECT 
                l.id_livreur,
                l.nom,
                l.prenom,
                COUNT(li.id_livraison) as livraisons_total,
                SUM(li.prix_total) as revenus_total
            FROM Livreur l
            LEFT JOIN Livraison li ON l.id_livreur = li.id_livreur
            WHERE li.statut = 'livree'
            AND li.date_heure_demande >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY l.id_livreur, l.nom, l.prenom
            HAVING SUM(li.prix_total) > 0
            ORDER BY revenus_total DESC
        `);

        // Revenus par livreur - mois
        const revenus30jours = await db.query(`
            SELECT 
                l.id_livreur,
                l.nom,
                l.prenom,
                COUNT(li.id_livraison) as livraisons_total,
                SUM(li.prix_total) as revenus_total,
                AVG(li.prix_total) as prix_moyen
            FROM Livreur l
            LEFT JOIN Livraison li ON l.id_livreur = li.id_livreur
            WHERE li.statut = 'livree'
            AND li.date_heure_demande >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY l.id_livreur, l.nom, l.prenom
            HAVING SUM(li.prix_total) > 0
            ORDER BY revenus_total DESC
        `);

        // Totaux globaux livreurs
        const totauxLivreurs = await db.query(`
            SELECT 
                COUNT(DISTINCT l.id_livreur) as livreurs_actifs,
                COUNT(li.id_livraison) as livraisons_total,
                SUM(li.prix_total) as revenus_total_global,
                AVG(li.prix_total) as prix_moyen_global
            FROM Livreur l
            JOIN Livraison li ON l.id_livreur = li.id_livreur
            WHERE li.statut = 'livree'
            AND li.date_heure_demande >= CURRENT_DATE - INTERVAL '30 days'
        `);

        res.json({
            success: true,
            revenus_livreurs: {
                semaine: revenus7jours.rows,
                mois: revenus30jours.rows,
                totaux: totauxLivreurs.rows[0] || { 
                    livreurs_actifs: 0, 
                    livraisons_total: 0, 
                    revenus_total_global: 0, 
                    prix_moyen_global: 0 
                }
            }
        });

    } catch (error) {
        console.error('❌ Erreur revenus livreurs:', error);
        res.status(500).json({ error: 'Erreur récupération revenus livreurs' });
    }
});

// 📊 REVENUS GLOBAUX - DASHBOARD PRINCIPAL  
router.get('/revenus/dashboard', authenticateAdmin, async (req, res) => {
    try {
        console.log('📊 Récupération revenus dashboard...');

        // Revenus totaux aujourd'hui
        const revenusJour = await db.query(`
            SELECT 
                COALESCE(SUM(c.prix_total), 0) as revenus_courses,
                COALESCE(COUNT(c.id_course), 0) as courses_count,
                COALESCE(SUM(l.prix_total), 0) as revenus_livraisons,
                COALESCE(COUNT(l.id_livraison), 0) as livraisons_count
            FROM 
                (SELECT prix_total, id_course FROM Course WHERE statut = 'terminee' AND DATE(date_heure_debut) = CURRENT_DATE) c
            FULL OUTER JOIN 
                (SELECT prix_total, id_livraison FROM Livraison WHERE statut = 'livree' AND DATE(date_heure_demande) = CURRENT_DATE) l
            ON 1=1
        `);

        // Revenus semaine
        const revenusSemaine = await db.query(`
            SELECT 
                DATE(COALESCE(c.date_heure_debut, l.date_heure_demande)) as date,
                COALESCE(SUM(c.prix_total), 0) as revenus_courses,
                COALESCE(COUNT(c.id_course), 0) as courses_count,
                COALESCE(SUM(l.prix_total), 0) as revenus_livraisons,
                COALESCE(COUNT(l.id_livraison), 0) as livraisons_count,
                COALESCE(SUM(c.prix_total), 0) + COALESCE(SUM(l.prix_total), 0) as revenus_total
            FROM 
                (SELECT prix_total, id_course, date_heure_debut FROM Course WHERE statut = 'terminee' AND date_heure_debut >= CURRENT_DATE - INTERVAL '7 days') c
            FULL OUTER JOIN 
                (SELECT prix_total, id_livraison, date_heure_demande FROM Livraison WHERE statut = 'livree' AND date_heure_demande >= CURRENT_DATE - INTERVAL '7 days') l
            ON DATE(c.date_heure_debut) = DATE(l.date_heure_demande)
            GROUP BY DATE(COALESCE(c.date_heure_debut, l.date_heure_demande))
            ORDER BY date DESC
        `);

        const result = revenusJour.rows[0];
        const revenusJourTotal = (parseFloat(result.revenus_courses) || 0) + (parseFloat(result.revenus_livraisons) || 0);

        res.json({
            success: true,
            revenus_dashboard: {
                aujourd_hui: {
                    revenus_total: revenusJourTotal,
                    revenus_courses: parseFloat(result.revenus_courses) || 0,
                    revenus_livraisons: parseFloat(result.revenus_livraisons) || 0,
                    courses_count: parseInt(result.courses_count) || 0,
                    livraisons_count: parseInt(result.livraisons_count) || 0
                },
                semaine: revenusSemaine.rows
            }
        });

    } catch (error) {
        console.error('❌ Erreur revenus dashboard:', error);
        res.status(500).json({ error: 'Erreur récupération revenus dashboard' });
    }
});

module.exports = router;