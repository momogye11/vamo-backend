/**
 * Système de rate limiting pour protéger contre les attaques DDoS
 * et limiter l'utilisation abusive des APIs
 */

const rateLimit = require('express-rate-limit');

/**
 * Rate limiter général pour toutes les APIs
 */
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limite à 1000 requêtes par fenêtre de 15 min
    message: {
        success: false,
        error: 'Trop de requêtes, veuillez réessayer plus tard',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: 15 * 60 // 15 minutes en secondes
    },
    standardHeaders: true, // Retourner les headers `RateLimit-*`
    legacyHeaders: false, // Désactiver les headers `X-RateLimit-*`
    skip: (req) => {
        // Skip pour les requêtes de health check
        return req.path === '/health' || req.path === '/ping';
    },
    keyGenerator: (req) => {
        // Utiliser l'IP + User-Agent pour une meilleure identification
        return `${req.ip}-${req.get('User-Agent') || 'unknown'}`;
    }
});

/**
 * Rate limiter strict pour les endpoints d'authentification
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limite à 10 tentatives par IP
    message: {
        success: false,
        error: 'Trop de tentatives d\'authentification, veuillez réessayer dans 15 minutes',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        retryAfter: 15 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Ne compter que les requêtes échouées
    keyGenerator: (req) => {
        // Combiner IP + numéro de téléphone pour l'auth
        const phone = req.body?.phone || req.query?.phone || '';
        return `auth-${req.ip}-${phone}`;
    }
});

/**
 * Rate limiter pour les endpoints OTP (très strict)
 */
const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5, // Maximum 5 OTP par numéro par 10 minutes
    message: {
        success: false,
        error: 'Limite d\'envoi d\'OTP atteinte. Attendez 10 minutes avant de réessayer',
        code: 'OTP_RATE_LIMIT_EXCEEDED',
        retryAfter: 10 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Rate limit par numéro de téléphone
        const phone = req.body?.phone || '';
        return `otp-${phone}`;
    },
    onLimitReached: (req, res, options) => {
        console.warn(`🚨 OTP rate limit exceeded for phone: ${req.body?.phone} from IP: ${req.ip}`);
    }
});

/**
 * Rate limiter pour la vérification OTP (anti brute-force)
 */
const otpVerifyLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 tentatives de vérification par numéro
    message: {
        success: false,
        error: 'Trop de tentatives de vérification. Attendez 5 minutes',
        code: 'OTP_VERIFY_RATE_LIMIT_EXCEEDED',
        retryAfter: 5 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Ne compter que les échecs
    keyGenerator: (req) => {
        const phone = req.body?.phone || '';
        return `otp-verify-${phone}`;
    }
});

/**
 * Rate limiter pour les créations de courses
 */
const rideCreationLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20, // 20 créations de course max par 5 minutes
    message: {
        success: false,
        error: 'Limite de création de courses atteinte, attendez quelques minutes',
        code: 'RIDE_CREATION_RATE_LIMIT_EXCEEDED',
        retryAfter: 5 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Rate limit par téléphone client
        const phone = req.body?.clientPhone || req.ip;
        return `ride-creation-${phone}`;
    }
});

/**
 * Rate limiter pour les actions des chauffeurs
 */
const driverActionLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 actions par minute (1 par seconde)
    message: {
        success: false,
        error: 'Actions trop rapides, ralentissez le rythme',
        code: 'DRIVER_ACTION_RATE_LIMIT_EXCEEDED',
        retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const driverId = req.body?.driverId || req.params?.driverId || req.ip;
        return `driver-action-${driverId}`;
    }
});

/**
 * Rate limiter pour les mises à jour de position
 */
const positionUpdateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120, // 120 updates par minute (2 par seconde max)
    message: {
        success: false,
        error: 'Mises à jour de position trop fréquentes',
        code: 'POSITION_UPDATE_RATE_LIMIT_EXCEEDED',
        retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req, res) => {
        // Skip si la position n'a pas changé significativement
        const lat = req.body?.lat;
        const lng = req.body?.lng;
        const lastLat = req.session?.lastLat;
        const lastLng = req.session?.lastLng;
        
        if (lastLat && lastLng) {
            const distance = calculateDistance(lat, lng, lastLat, lastLng);
            if (distance < 10) { // Moins de 10 mètres
                return true; // Skip rate limiting
            }
        }
        
        // Sauvegarder la position actuelle
        if (req.session) {
            req.session.lastLat = lat;
            req.session.lastLng = lng;
        }
        
        return false;
    }
});

/**
 * Rate limiter pour les uploads de fichiers
 */
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 uploads par 15 minutes
    message: {
        success: false,
        error: 'Limite d\'upload atteinte, attendez 15 minutes',
        code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
        retryAfter: 15 * 60
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Rate limiter pour les API externes (Google, etc.)
 */
const externalApiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 requêtes par minute vers APIs externes
    message: {
        success: false,
        error: 'Limite d\'utilisation des services externes atteinte',
        code: 'EXTERNAL_API_RATE_LIMIT_EXCEEDED',
        retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Fonction utilitaire pour calculer la distance
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Rayon de la Terre en mètres
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance en mètres
}

/**
 * Middleware pour créer des rate limiters dynamiques
 */
function createCustomLimiter(options) {
    const defaultOptions = {
        windowMs: 15 * 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            success: false,
            error: 'Limite de requêtes atteinte',
            code: 'CUSTOM_RATE_LIMIT_EXCEEDED'
        }
    };
    
    return rateLimit({ ...defaultOptions, ...options });
}

/**
 * Middleware pour bypass le rate limiting en développement
 */
function developmentBypass(req, res, next) {
    if (process.env.NODE_ENV === 'development' && req.headers['x-bypass-rate-limit'] === 'development') {
        return next();
    }
    next();
}

module.exports = {
    generalLimiter,
    authLimiter,
    otpLimiter,
    otpVerifyLimiter,
    rideCreationLimiter,
    driverActionLimiter,
    positionUpdateLimiter,
    uploadLimiter,
    externalApiLimiter,
    createCustomLimiter,
    developmentBypass
};