/**
 * Serveur principal Vamo Backend avec sécurité renforcée
 * Version sécurisée avec tous les middlewares de protection
 */

const express = require('express');
require('dotenv').config();

const app = express();
const db = require('./db');

// Import des middlewares de sécurité
const { setupBasicMiddleware, setupErrorHandling, applyMiddlewares } = require('./middleware');
const { logger } = require('./middleware/secureLogging');
const securityConfig = require('./config/security');

// Configuration Cloudinary (optionnelle)
let cloudinary = null;
try {
    cloudinary = require('cloudinary').v2;
    
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });
        logger.info('✅ Cloudinary configured successfully');
    } else {
        logger.warn('⚠️ Cloudinary not configured - environment variables missing');
    }
} catch (error) {
    logger.warn('⚠️ Cloudinary module not available:', error.message);
}

// ===== CONFIGURATION DES MIDDLEWARES DE SÉCURITÉ =====
logger.info('🔒 Setting up security middlewares...');
setupBasicMiddleware(app);

// Servir les fichiers statiques de manière sécurisée
app.use('/uploads', express.static('uploads', {
    maxAge: '1d',
    etag: false,
    setHeaders: (res, path) => {
        // Headers de sécurité pour les fichiers statiques
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
    }
}));

// ===== ROUTES DE SANTÉ ET DEBUG =====

// Health check (sans authentification)
app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Status endpoint avec informations système
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        server: 'vamo-backend',
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        security: {
            helmet: true,
            rateLimiting: true,
            validation: true,
            authentication: true,
            logging: true
        }
    });
});

// Test de base de données sécurisé
app.get('/api/db-test', async (req, res) => {
    try {
        const result = await db.query('SELECT NOW() as current_time, version() as pg_version');
        res.json({
            success: true,
            message: 'Database connection working',
            currentTime: result.rows[0].current_time,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('❌ Database test failed:', error);
        res.status(500).json({
            success: false,
            error: 'Database connection failed',
            code: 'DB_CONNECTION_ERROR'
        });
    }
});

// ===== ROUTES D'AUTHENTIFICATION =====

// Envoi OTP avec sécurité renforcée
app.post('/api/send-otp', 
    ...applyMiddlewares('auth', 'sendOtp'),
    require('./routes/send-otp')
);

// Vérification OTP avec sécurité renforcée
app.post('/api/verify-otp',
    ...applyMiddlewares('auth', 'verifyOtp'),
    require('./routes/verify-otp')
);

// ===== ROUTES CLIENTS =====

// Création client
app.post('/api/client',
    ...applyMiddlewares('client', 'create'),
    require('./routes/client')
);

// Mise à jour client
app.put('/api/client/:clientId',
    ...applyMiddlewares('client', 'update'),
    require('./routes/client')
);

// Récupération client
app.get('/api/client/:clientId',
    ...applyMiddlewares('client', 'get'),
    require('./routes/client')
);

// ===== ROUTES CHAUFFEURS =====

// Création chauffeur
app.post('/api/chauffeur',
    ...applyMiddlewares('driver', 'create'),
    require('./routes/chauffeur')
);

// Mise à jour chauffeur
app.put('/api/chauffeur/:driverId',
    ...applyMiddlewares('driver', 'update'),
    require('./routes/chauffeur')
);

// Mise à jour position chauffeur
app.post('/api/chauffeur/:driverId/position',
    ...applyMiddlewares('driver', 'position'),
    require('./routes/chauffeur')
);

// ===== ROUTES COURSES =====

// Création de course
app.post('/api/rides/search',
    ...applyMiddlewares('ride', 'create'),
    require('./routes/rides')
);

// Acceptation de course
app.post('/api/trips/accept',
    ...applyMiddlewares('ride', 'accept'),
    require('./routes/trips')
);

// Mise à jour statut course
app.post('/api/trips/status',
    ...applyMiddlewares('ride', 'updateStatus'),
    require('./routes/trips')
);

// Finalisation course
app.post('/api/trips/complete',
    ...applyMiddlewares('ride', 'complete'),
    require('./routes/trips')
);

// Annulation course
app.post('/api/trips/cancel',
    ...applyMiddlewares('ride', 'cancel'),
    require('./routes/trips')
);

// ===== ROUTES NOTATION =====

// Soumission de note
app.post('/api/ratings/submit',
    ...applyMiddlewares('rating', 'submit'),
    require('./routes/ratings')
);

// ===== ROUTES UPLOAD =====

// Upload de photos sécurisé
app.post('/api/upload/photo',
    ...applyMiddlewares('upload', 'photo'),
    require('./routes/upload')
);

// ===== ROUTES PUBLIQUES (avec rate limiting) =====

// Google Places (avec rate limiting pour API externe)
app.use('/api/places',
    ...applyMiddlewares('public', 'places'),
    require('./routes/places')
);

// Google Directions (avec rate limiting pour API externe)
app.use('/api/directions',
    ...applyMiddlewares('public', 'directions'),
    require('./routes/directions')
);

// Locations dynamiques
app.use('/api/locations', require('./routes/locations'));

// ===== ROUTES AVEC PROTECTION STANDARD =====

// Chargement sécurisé des autres routes
const routesToLoad = [
    { path: '/api/livreur', file: './routes/livreur', name: 'Livreur' },
    { path: '/api/livraison', file: './routes/livraison', name: 'Livraison' },
    { path: '/api/notifications', file: './routes/notifications', name: 'Notifications' },
    { path: '/api/ws', file: './routes/websocket', name: 'WebSocket', property: 'router' }
];

routesToLoad.forEach(({ path, file, name, property }) => {
    try {
        const routeModule = require(file);
        const router = property ? routeModule[property] : routeModule;
        
        if (router) {
            app.use(path, router);
            logger.info(`✅ ${name} routes loaded successfully`);
        } else {
            logger.warn(`⚠️ ${name} router not found in module`);
        }
    } catch (error) {
        logger.error(`❌ Error loading ${name} routes:`, error.message);
    }
});

// ===== ROUTES DEBUG (UNIQUEMENT EN DÉVELOPPEMENT) =====

if (process.env.NODE_ENV === 'development') {
    logger.info('🔧 Loading development debug routes...');
    
    // Routes debug sécurisées
    app.use('/api/debug', (req, res, next) => {
        // Vérifier que c'est bien du développement
        if (process.env.NODE_ENV !== 'development') {
            return res.status(404).json({
                success: false,
                error: 'Route non trouvée',
                code: 'NOT_FOUND'
            });
        }
        next();
    }, require('./routes/debug'));
    
    logger.info('✅ Debug routes loaded (development only)');
} else {
    logger.info('🚫 Debug routes disabled in production');
}

// ===== INITIALISATION WEBSOCKET =====

let server;
const PORT = process.env.PORT || 5001;

const startServer = async () => {
    try {
        // Initialiser la base de données
        await initializeDatabase();
        
        // Démarrer le serveur
        server = app.listen(PORT, '0.0.0.0', () => {
            logger.info(`✅ Vamo Backend server started on http://0.0.0.0:${PORT}`);
            logger.info(`🔒 Security features enabled: JWT, Rate Limiting, Input Validation, Logging`);
            logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        });
        
        // Initialiser WebSocket
        try {
            const { initializeWebSocket } = require('./routes/websocket');
            const wss = initializeWebSocket(server);
            logger.info('✅ WebSocket server initialized successfully');
        } catch (error) {
            logger.error('❌ Error initializing WebSocket server:', error.message);
        }
        
        // Heartbeat pour confirmer que le serveur reste en vie
        setTimeout(() => {
            logger.info('💓 Server heartbeat - running smoothly');
        }, 5000);
        
    } catch (error) {
        logger.error('❌ Error starting server:', error);
        process.exit(1);
    }
};

// ===== CONFIGURATION DES GESTIONNAIRES D'ERREURS =====
setupErrorHandling(app);

// ===== INITIALISATION BASE DE DONNÉES =====

async function initializeDatabase() {
    try {
        const fs = require('fs');
        const path = require('path');
        const schemaPath = path.join(__dirname, 'db', 'schema.sql');
        
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            const statements = schema
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
            
            for (const statement of statements) {
                try {
                    await db.query(statement);
                } catch (error) {
                    // Ignorer les erreurs "already exists"
                    if (!error.message.includes('already exists') && 
                        !error.message.includes('duplicate key')) {
                        logger.error('❌ Error executing database statement:', error.message);
                    }
                }
            }
            
            logger.info('✅ Database tables initialized successfully');
        } else {
            logger.warn('⚠️ Schema file not found, skipping database initialization');
        }
    } catch (error) {
        logger.error('❌ Error initializing database:', error.message);
        throw error;
    }
}

// ===== GESTIONNAIRES DE SIGNAUX =====

// Graceful shutdown
const gracefulShutdown = (signal) => {
    logger.info(`📪 ${signal} received. Shutting down gracefully...`);
    
    if (server) {
        server.close(() => {
            logger.info('✅ HTTP server closed');
            
            // Fermer les connexions de base de données
            if (db && db.end) {
                db.end().then(() => {
                    logger.info('✅ Database connections closed');
                    process.exit(0);
                }).catch((error) => {
                    logger.error('❌ Error closing database connections:', error);
                    process.exit(1);
                });
            } else {
                process.exit(0);
            }
        });
        
        // Force shutdown après 10 secondes
        setTimeout(() => {
            logger.error('❌ Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 10000);
    } else {
        process.exit(0);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Gestionnaire d'erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    // Ne pas arrêter le serveur en production sauf si critique
    if (process.env.NODE_ENV === 'development') {
        console.error('Full error details:', reason);
    }
});

process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught Exception:', error);
    logger.error('❌ Stack trace:', error.stack);
    
    // En production, tenter un arrêt gracieux
    if (process.env.NODE_ENV === 'production') {
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    }
});

// ===== DÉMARRAGE DU SERVEUR =====
startServer();

module.exports = app;