/**
 * Configuration centrale de sécurité pour Vamo Backend
 */

require('dotenv').config();

module.exports = {
    // JWT Configuration
    jwt: {
        secret: process.env.JWT_SECRET || 'vamo-secure-jwt-secret-2024-change-in-production',
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
        issuer: 'vamo-backend',
        audience: 'vamo-app'
    },

    // Chiffrement
    encryption: {
        algorithm: 'aes-256-gcm',
        keyLength: 32,
        ivLength: 16,
        tagLength: 16,
        iterations: 100000
    },

    // Bcrypt
    bcrypt: {
        rounds: parseInt(process.env.BCRYPT_ROUNDS) || 12
    },

    // Rate Limiting
    rateLimiting: {
        general: {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 1000
        },
        auth: {
            windowMs: 15 * 60 * 1000,
            max: 10
        },
        otp: {
            windowMs: 10 * 60 * 1000,
            max: 5
        },
        otpVerify: {
            windowMs: 5 * 60 * 1000,
            max: 10
        },
        rideCreation: {
            windowMs: 5 * 60 * 1000,
            max: 20
        },
        driverAction: {
            windowMs: 1 * 60 * 1000,
            max: 60
        },
        positionUpdate: {
            windowMs: 1 * 60 * 1000,
            max: 120
        },
        upload: {
            windowMs: 15 * 60 * 1000,
            max: 10
        }
    },

    // CORS Configuration
    cors: {
        origin: function (origin, callback) {
            const allowedOrigins = [
                'http://localhost:19006', // Expo dev
                'http://localhost:19000', // Expo dev alternative
                'https://vamo-app.com',
                'https://api.vamo-app.com',
                'exp://192.168.1.100:19000', // Expo mobile dev
                'capacitor://localhost', // Capacitor mobile
                'ionic://localhost' // Ionic mobile
            ];

            // Permettre les requêtes sans origine (mobile apps)
            if (!origin) return callback(null, true);
            
            if (allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Non autorisé par la politique CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Origin',
            'X-Requested-With',
            'Content-Type',
            'Accept',
            'Authorization',
            'x-device-id',
            'x-app-version',
            'x-platform'
        ]
    },

    // Headers de sécurité
    securityHeaders: {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
                connectSrc: [
                    "'self'",
                    "https://api.numverify.com",
                    "https://api.twilio.com",
                    "https://exp.host",
                    "https://fcm.googleapis.com"
                ],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"]
            }
        },
        hsts: {
            maxAge: 31536000, // 1 an
            includeSubDomains: true,
            preload: true
        },
        noSniff: true,
        frameguard: { action: 'deny' },
        xssFilter: true
    },

    // Configuration des uploads
    upload: {
        maxFileSize: 10 * 1024 * 1024, // 10MB
        allowedMimeTypes: [
            'image/jpeg',
            'image/png',
            'image/webp'
        ],
        maxFiles: 5
    },

    // Session Configuration
    session: {
        secret: process.env.SESSION_SECRET || 'vamo-session-secret-2024',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000 // 24 heures
        }
    },

    // Validation des entrées
    validation: {
        phoneRegex: /^\+221[67]\d{8}$/,
        otpRegex: /^\d{4}$/,
        nameRegex: /^[a-zA-ZÀ-ÿ\s]{2,50}$/,
        plateRegex: /^[A-Z]{2}-\d{3}-[A-Z]{2}$/,
        maxStringLength: 500,
        maxTextLength: 2000
    },

    // Seuils de sécurité
    thresholds: {
        maxLoginAttempts: 5,
        lockoutDuration: 30 * 60 * 1000, // 30 minutes
        otpExpiry: 5 * 60 * 1000, // 5 minutes
        sessionTimeout: 24 * 60 * 60 * 1000, // 24 heures
        maxConcurrentSessions: 3
    },

    // Environnements de confiance
    trustedEnvironments: {
        development: ['localhost', '127.0.0.1', '192.168.1.100'],
        staging: ['staging.vamo-app.com'],
        production: ['api.vamo-app.com', 'vamo-app.com']
    },

    // APIs externes
    externalApis: {
        rateLimit: {
            google: {
                windowMs: 1 * 60 * 1000,
                max: 30
            },
            twilio: {
                windowMs: 1 * 60 * 1000,
                max: 10
            },
            numverify: {
                windowMs: 1 * 60 * 1000,
                max: 20
            }
        }
    }
};