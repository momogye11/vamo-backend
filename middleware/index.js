/**
 * Point d'entrée centralisé pour tous les middlewares de sécurité
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const securityConfig = require('../config/security');

// Import des middlewares de sécurité
const { validateInput, validateParams, validateQuery } = require('./validation');
const {
    generalLimiter,
    authLimiter,
    otpLimiter,
    otpVerifyLimiter,
    rideCreationLimiter,
    driverActionLimiter,
    positionUpdateLimiter,
    uploadLimiter,
    developmentBypass
} = require('./rateLimiting');

const {
    helmetConfig,
    authenticateToken,
    optionalAuth,
    requireRole,
    sanitizeResponse,
    csrfProtection,
    attackDetection
} = require('./security');

const {
    httpLogger,
    autoLogSecurity,
    errorLogger,
    SecurityEvents
} = require('./secureLogging');

/**
 * Configuration des middlewares de base
 */
function setupBasicMiddleware(app) {
    // Logging HTTP
    app.use(httpLogger);
    
    // Headers de sécurité avec Helmet
    app.use(helmetConfig);
    
    // CORS sécurisé
    app.use(cors(securityConfig.cors));
    
    // Parser JSON avec limite de taille
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Trust proxy (pour Heroku, etc.)
    app.set('trust proxy', 1);
    
    // Bypass rate limiting en développement
    if (process.env.NODE_ENV === 'development') {
        app.use(developmentBypass);
    }
    
    // Rate limiting général
    app.use(generalLimiter);
    
    // Détection d'attaques
    app.use(attackDetection);
    
    // Nettoyage automatique des réponses
    app.use(sanitizeResponse);
    
    // Logging automatique des actions sensibles
    app.use(autoLogSecurity);
}

/**
 * Middlewares spécifiques par type d'endpoint
 */
const middlewares = {
    // Authentification
    auth: {
        sendOtp: [
            otpLimiter,
            validateInput('sendOtp'),
            (req, res, next) => {
                SecurityEvents.logOTPGeneration(req, req.body.phone, true, { 
                    source: 'api_request',
                    userAgent: req.get('User-Agent')
                });
                next();
            }
        ],
        
        verifyOtp: [
            otpVerifyLimiter,
            validateInput('verifyOtp'),
            (req, res, next) => {
                // Le logging se fera dans le controller après vérification
                next();
            }
        ]
    },

    // Gestion des clients
    client: {
        create: [
            authLimiter,
            validateInput('createClient'),
            (req, res, next) => {
                SecurityEvents.logDataAccess(req, 'client', 'CREATE', true);
                next();
            }
        ],
        
        update: [
            authenticateToken,
            requireRole(['client', 'admin']),
            validateInput('updateClient'),
            validateParams(require('./validation').commonParamSchemas.clientId)
        ],
        
        get: [
            optionalAuth,
            validateParams(require('./validation').commonParamSchemas.clientId)
        ]
    },

    // Gestion des chauffeurs
    driver: {
        create: [
            authLimiter,
            validateInput('createDriver'),
            (req, res, next) => {
                SecurityEvents.logDataAccess(req, 'driver', 'CREATE', true);
                next();
            }
        ],
        
        update: [
            authenticateToken,
            requireRole(['driver', 'admin']),
            validateInput('updateDriver'),
            validateParams(require('./validation').commonParamSchemas.driverId)
        ],
        
        position: [
            authenticateToken,
            requireRole(['driver']),
            positionUpdateLimiter,
            validateInput('updatePosition')
        ]
    },

    // Gestion des courses
    ride: {
        create: [
            rideCreationLimiter,
            validateInput('createRide'),
            (req, res, next) => {
                SecurityEvents.logDataAccess(req, 'ride', 'CREATE', true, {
                    origin: req.body.origin?.description,
                    destination: req.body.destination?.description,
                    estimatedFare: req.body.estimatedFare
                });
                next();
            }
        ],
        
        accept: [
            authenticateToken,
            requireRole(['driver']),
            driverActionLimiter,
            validateInput('acceptTrip')
        ],
        
        updateStatus: [
            authenticateToken,
            requireRole(['driver']),
            driverActionLimiter,
            validateInput('updateTripStatus')
        ],
        
        complete: [
            authenticateToken,
            requireRole(['driver']),
            validateInput('completeTrip'),
            (req, res, next) => {
                SecurityEvents.logDataAccess(req, 'ride', 'COMPLETE', true, {
                    tripId: req.body.tripId,
                    finalFare: req.body.finalFare
                });
                next();
            }
        ],
        
        cancel: [
            authenticateToken,
            requireRole(['driver', 'client']),
            validateInput('cancelTrip')
        ]
    },

    // Notation
    rating: {
        submit: [
            authenticateToken,
            requireRole(['client', 'driver']),
            validateInput('submitRating'),
            (req, res, next) => {
                SecurityEvents.logDataAccess(req, 'rating', 'CREATE', true, {
                    tripId: req.body.tripId,
                    rating: req.body.rating,
                    ratedBy: req.body.ratedBy
                });
                next();
            }
        ]
    },

    // Upload de fichiers
    upload: {
        photo: [
            authenticateToken,
            uploadLimiter,
            validateInput('uploadPhoto'),
            // Middleware spécifique pour valider les fichiers
            (req, res, next) => {
                if (!req.files || req.files.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Aucun fichier fourni',
                        code: 'NO_FILE_PROVIDED'
                    });
                }
                
                // Vérifier le type MIME
                const allowedTypes = securityConfig.upload.allowedMimeTypes;
                const file = req.files[0];
                
                if (!allowedTypes.includes(file.mimetype)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Type de fichier non autorisé',
                        code: 'INVALID_FILE_TYPE',
                        allowed: allowedTypes
                    });
                }
                
                // Vérifier la taille
                if (file.size > securityConfig.upload.maxFileSize) {
                    return res.status(400).json({
                        success: false,
                        error: 'Fichier trop volumineux',
                        code: 'FILE_TOO_LARGE',
                        maxSize: securityConfig.upload.maxFileSize
                    });
                }
                
                SecurityEvents.logDataAccess(req, 'file', 'UPLOAD', true, {
                    fileType: file.mimetype,
                    fileSize: file.size,
                    uploadType: req.body.type
                });
                
                next();
            }
        ]
    },

    // Endpoints publics (pas d'auth requise)
    public: {
        healthCheck: [],
        places: [
            require('./rateLimiting').externalApiLimiter
        ],
        directions: [
            require('./rateLimiting').externalApiLimiter
        ]
    }
};

/**
 * Fonction helper pour appliquer les middlewares à une route
 */
function applyMiddlewares(category, action) {
    const categoryMiddlewares = middlewares[category];
    if (!categoryMiddlewares) {
        throw new Error(`Catégorie de middleware inconnue: ${category}`);
    }
    
    const actionMiddlewares = categoryMiddlewares[action];
    if (!actionMiddlewares) {
        throw new Error(`Action de middleware inconnue: ${category}.${action}`);
    }
    
    return actionMiddlewares;
}

/**
 * Middleware d'erreur global
 */
function setupErrorHandling(app) {
    // Logger d'erreurs
    app.use(errorLogger);
    
    // Gestionnaire d'erreurs global
    app.use((err, req, res, next) => {
        // Erreurs de validation Joi
        if (err.isJoi) {
            return res.status(400).json({
                success: false,
                error: 'Données invalides',
                code: 'VALIDATION_ERROR',
                details: err.details
            });
        }
        
        // Erreurs de rate limiting
        if (err.status === 429) {
            SecurityEvents.logRateLimitExceeded(req, 'general', {
                error: err.message
            });
            
            return res.status(429).json({
                success: false,
                error: 'Trop de requêtes',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: err.retryAfter || 60
            });
        }
        
        // Erreurs CORS
        if (err.message && err.message.includes('CORS')) {
            return res.status(403).json({
                success: false,
                error: 'Origine non autorisée',
                code: 'CORS_ERROR'
            });
        }
        
        // Erreurs de base de données
        if (err.code && err.code.startsWith('23')) { // Erreurs PostgreSQL
            return res.status(400).json({
                success: false,
                error: 'Erreur de données',
                code: 'DATABASE_ERROR'
            });
        }
        
        // Erreur générique
        const status = err.status || 500;
        res.status(status).json({
            success: false,
            error: status === 500 ? 'Erreur serveur interne' : err.message,
            code: 'INTERNAL_ERROR'
        });
    });
    
    // Route 404
    app.use('*', (req, res) => {
        res.status(404).json({
            success: false,
            error: 'Endpoint non trouvé',
            code: 'NOT_FOUND',
            path: req.originalUrl
        });
    });
}

module.exports = {
    setupBasicMiddleware,
    setupErrorHandling,
    middlewares,
    applyMiddlewares,
    // Export direct des middlewares individuels
    validateInput,
    validateParams,
    validateQuery,
    authenticateToken,
    optionalAuth,
    requireRole,
    SecurityEvents
};