/**
 * Middleware de sécurité pour le chiffrement et la protection des données
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const helmet = require('helmet');

// Configuration de sécurité
const SECURITY_CONFIG = {
    JWT_SECRET: process.env.JWT_SECRET || 'vamo-super-secret-key-2024',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
    REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')
};

/**
 * Configuration Helmet pour sécuriser les headers HTTP
 */
const helmetConfig = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
            connectSrc: ["'self'", "https://api.numverify.com", "https://api.twilio.com"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false, // Désactivé pour compatibilité mobile
    hsts: {
        maxAge: 31536000, // 1 an
        includeSubDomains: true,
        preload: true
    }
});

/**
 * Chiffrement des données sensibles
 */
class DataEncryption {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyBuffer = Buffer.from(SECURITY_CONFIG.ENCRYPTION_KEY, 'hex');
    }

    /**
     * Chiffre une chaîne de caractères
     */
    encrypt(text) {
        if (!text) return null;
        
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher(this.algorithm, this.keyBuffer);
            cipher.setAAD(Buffer.from('vamo-aad'));
            
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            return {
                encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex')
            };
        } catch (error) {
            console.error('Erreur de chiffrement:', error);
            return null;
        }
    }

    /**
     * Déchiffre une chaîne de caractères
     */
    decrypt(encryptedData) {
        if (!encryptedData || !encryptedData.encrypted) return null;
        
        try {
            const decipher = crypto.createDecipher(this.algorithm, this.keyBuffer);
            decipher.setAAD(Buffer.from('vamo-aad'));
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            
            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Erreur de déchiffrement:', error);
            return null;
        }
    }

    /**
     * Hash d'un mot de passe avec bcrypt
     */
    async hashPassword(password) {
        if (!password) return null;
        
        try {
            const salt = await bcrypt.genSalt(SECURITY_CONFIG.BCRYPT_ROUNDS);
            return await bcrypt.hash(password, salt);
        } catch (error) {
            console.error('Erreur de hachage:', error);
            return null;
        }
    }

    /**
     * Vérification d'un mot de passe
     */
    async verifyPassword(password, hashedPassword) {
        if (!password || !hashedPassword) return false;
        
        try {
            return await bcrypt.compare(password, hashedPassword);
        } catch (error) {
            console.error('Erreur de vérification:', error);
            return false;
        }
    }

    /**
     * Génère un token sécurisé
     */
    generateSecureToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Hash sécurisé avec salt
     */
    hashWithSalt(data, salt = null) {
        const saltBuffer = salt ? Buffer.from(salt, 'hex') : crypto.randomBytes(16);
        const hash = crypto.pbkdf2Sync(data, saltBuffer, 100000, 64, 'sha512');
        
        return {
            hash: hash.toString('hex'),
            salt: saltBuffer.toString('hex')
        };
    }
}

/**
 * Gestion des JWT tokens
 */
class JWTManager {
    /**
     * Génère un access token
     */
    static generateAccessToken(payload) {
        return jwt.sign(payload, SECURITY_CONFIG.JWT_SECRET, {
            expiresIn: SECURITY_CONFIG.JWT_EXPIRES_IN,
            issuer: 'vamo-backend',
            audience: 'vamo-app'
        });
    }

    /**
     * Génère un refresh token
     */
    static generateRefreshToken(payload) {
        return jwt.sign(payload, SECURITY_CONFIG.JWT_SECRET, {
            expiresIn: SECURITY_CONFIG.REFRESH_TOKEN_EXPIRES_IN,
            issuer: 'vamo-backend',
            audience: 'vamo-app'
        });
    }

    /**
     * Vérifie un token
     */
    static verifyToken(token) {
        try {
            return jwt.verify(token, SECURITY_CONFIG.JWT_SECRET, {
                issuer: 'vamo-backend',
                audience: 'vamo-app'
            });
        } catch (error) {
            return null;
        }
    }

    /**
     * Décodes un token sans vérification (pour debug)
     */
    static decodeToken(token) {
        try {
            return jwt.decode(token, { complete: true });
        } catch (error) {
            return null;
        }
    }
}

/**
 * Middleware d'authentification JWT
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Token d\'accès requis',
            code: 'MISSING_TOKEN'
        });
    }

    const decoded = JWTManager.verifyToken(token);
    
    if (!decoded) {
        return res.status(403).json({
            success: false,
            error: 'Token invalide ou expiré',
            code: 'INVALID_TOKEN'
        });
    }

    req.user = decoded;
    next();
}

/**
 * Middleware d'authentification optionnelle
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        const decoded = JWTManager.verifyToken(token);
        if (decoded) {
            req.user = decoded;
        }
    }

    next();
}

/**
 * Middleware de vérification des rôles
 */
function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentification requise',
                code: 'AUTH_REQUIRED'
            });
        }

        const userRole = req.user.role;
        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                error: 'Permissions insuffisantes',
                code: 'INSUFFICIENT_PERMISSIONS',
                required: allowedRoles,
                current: userRole
            });
        }

        next();
    };
}

/**
 * Middleware de nettoyage des données sensibles
 */
function sanitizeResponse(req, res, next) {
    const originalJson = res.json;
    
    res.json = function(data) {
        // Supprimer les champs sensibles de la réponse
        const sanitized = sanitizeObject(data, [
            'password', 'hashed_password', 'jwt_secret', 'api_key',
            'private_key', 'encryption_key', 'otp_code', 'verification_code'
        ]);
        
        return originalJson.call(this, sanitized);
    };
    
    next();
}

/**
 * Fonction utilitaire pour nettoyer un objet
 */
function sanitizeObject(obj, sensitiveFields) {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, sensitiveFields));
    }
    
    const sanitized = { ...obj };
    
    for (const field of sensitiveFields) {
        if (field in sanitized) {
            delete sanitized[field];
        }
    }
    
    // Récursif pour les objets imbriqués
    for (const key in sanitized) {
        if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
            sanitized[key] = sanitizeObject(sanitized[key], sensitiveFields);
        }
    }
    
    return sanitized;
}

/**
 * Middleware de protection CSRF
 */
function csrfProtection(req, res, next) {
    // Vérifier l'origine pour les requêtes critiques
    const allowedOrigins = [
        'http://localhost:19006', // Expo dev
        'https://vamo-app.com',
        'https://api.vamo-app.com'
    ];
    
    const origin = req.headers.origin;
    
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (!origin || !allowedOrigins.includes(origin)) {
            return res.status(403).json({
                success: false,
                error: 'Origine non autorisée',
                code: 'INVALID_ORIGIN'
            });
        }
    }
    
    next();
}

/**
 * Middleware de détection d'attaques
 */
function attackDetection(req, res, next) {
    const suspiciousPatterns = [
        /<script/i,           // XSS
        /union.*select/i,     // SQL Injection
        /exec\(/i,            // Code injection
        /eval\(/i,            // Code injection très suspect
        /document\.cookie/i,  // XSS cookie stealing
        /../,                 // Path traversal
        /\.\./,               // Path traversal
    ];
    
    const dataToCheck = [
        JSON.stringify(req.body),
        JSON.stringify(req.query),
        JSON.stringify(req.params),
        req.url
    ].join(' ');
    
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(dataToCheck)) {
            console.warn(`🚨 Attaque détectée depuis ${req.ip}: ${pattern}`);
            
            return res.status(400).json({
                success: false,
                error: 'Requête suspecte détectée',
                code: 'SUSPICIOUS_REQUEST'
            });
        }
    }
    
    next();
}

// Initialiser l'instance de chiffrement
const encryption = new DataEncryption();

module.exports = {
    helmetConfig,
    encryption,
    JWTManager,
    authenticateToken,
    optionalAuth,
    requireRole,
    sanitizeResponse,
    csrfProtection,
    attackDetection,
    DataEncryption,
    SECURITY_CONFIG
};