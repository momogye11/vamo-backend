/**
 * Système de logging sécurisé avec Winston
 * Trace les actions sensibles sans exposer les données critiques
 */

const winston = require('winston');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

// Créer le dossier de logs s'il n'existe pas
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Configuration des formats de logs
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return JSON.stringify({
            timestamp,
            level,
            message,
            ...meta
        });
    })
);

// Configuration des transports
const transports = [
    // Console en développement
    new winston.transports.Console({
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }),

    // Fichier pour toutes les erreurs
    new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: logFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5
    }),

    // Fichier pour tous les logs
    new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: logFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10
    }),

    // Fichier séparé pour les actions sensibles
    new winston.transports.File({
        filename: path.join(logsDir, 'security.log'),
        level: 'warn',
        format: logFormat,
        maxsize: 50 * 1024 * 1024, // 50MB
        maxFiles: 20
    })
];

// Créer le logger principal
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports,
    exitOnError: false
});

/**
 * Logger spécifique pour les événements de sécurité
 */
const securityLogger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        new winston.transports.File({
            filename: path.join(logsDir, 'security-events.log'),
            format: logFormat,
            maxsize: 50 * 1024 * 1024,
            maxFiles: 30
        })
    ]
});

/**
 * Fonction pour nettoyer les données sensibles des logs
 */
function sanitizeForLogging(data) {
    if (!data || typeof data !== 'object') return data;
    
    const sensitiveFields = [
        'password', 'token', 'otp', 'code', 'api_key', 'secret',
        'auth_token', 'refresh_token', 'jwt_token', 'session_id',
        'credit_card', 'bank_account', 'ssn', 'nin'
    ];
    
    const sanitized = Array.isArray(data) ? [...data] : { ...data };
    
    function cleanObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        
        for (const key in obj) {
            const lowerKey = key.toLowerCase();
            
            // Masquer les champs sensibles
            if (sensitiveFields.some(field => lowerKey.includes(field))) {
                obj[key] = '***MASKED***';
            }
            // Masquer les numéros de téléphone partiellement
            else if (lowerKey.includes('phone') || lowerKey.includes('telephone')) {
                if (typeof obj[key] === 'string' && obj[key].length > 4) {
                    obj[key] = obj[key].slice(0, 4) + '****' + obj[key].slice(-2);
                }
            }
            // Masquer les emails partiellement
            else if (lowerKey.includes('email') && typeof obj[key] === 'string') {
                const parts = obj[key].split('@');
                if (parts.length === 2) {
                    const username = parts[0];
                    const domain = parts[1];
                    obj[key] = username.slice(0, 2) + '***@' + domain;
                }
            }
            // Traitement récursif
            else if (typeof obj[key] === 'object' && obj[key] !== null) {
                cleanObject(obj[key]);
            }
        }
        
        return obj;
    }
    
    return cleanObject(sanitized);
}

/**
 * Middleware Morgan personnalisé pour les logs HTTP
 */
const httpLogger = morgan((tokens, req, res) => {
    const logData = {
        method: tokens.method(req, res),
        url: tokens.url(req, res),
        status: tokens.status(req, res),
        contentLength: tokens.res(req, res, 'content-length'),
        responseTime: tokens['response-time'](req, res) + 'ms',
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        timestamp: new Date().toISOString()
    };
    
    // Ajouter l'utilisateur si authentifié
    if (req.user) {
        logData.userId = req.user.id;
        logData.userType = req.user.type;
    }
    
    // Log différents niveaux selon le status
    const status = parseInt(tokens.status(req, res));
    if (status >= 500) {
        logger.error('HTTP Error', logData);
    } else if (status >= 400) {
        logger.warn('HTTP Warning', logData);
    } else {
        logger.info('HTTP Request', logData);
    }
    
    return null; // Morgan n'affiche rien, Winston s'en charge
});

/**
 * Classes d'événements de sécurité
 */
class SecurityEvents {
    static logAuthentication(req, success, details = {}) {
        const event = {
            type: 'AUTHENTICATION',
            success,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            phone: details.phone ? details.phone.slice(0, 4) + '****' : null,
            method: details.method || 'OTP',
            timestamp: new Date().toISOString(),
            ...sanitizeForLogging(details)
        };
        
        if (success) {
            securityLogger.info('Authentication Success', event);
        } else {
            securityLogger.warn('Authentication Failed', event);
        }
    }
    
    static logOTPGeneration(req, phone, success, details = {}) {
        const event = {
            type: 'OTP_GENERATION',
            success,
            ip: req.ip,
            phone: phone.slice(0, 4) + '****',
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString(),
            ...sanitizeForLogging(details)
        };
        
        securityLogger.info('OTP Generated', event);
    }
    
    static logOTPVerification(req, phone, success, attempts, details = {}) {
        const event = {
            type: 'OTP_VERIFICATION',
            success,
            ip: req.ip,
            phone: phone.slice(0, 4) + '****',
            attempts: attempts || 1,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString(),
            ...sanitizeForLogging(details)
        };
        
        if (success) {
            securityLogger.info('OTP Verified', event);
        } else {
            securityLogger.warn('OTP Verification Failed', event);
        }
    }
    
    static logRateLimitExceeded(req, limitType, details = {}) {
        const event = {
            type: 'RATE_LIMIT_EXCEEDED',
            limitType,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            url: req.originalUrl,
            method: req.method,
            timestamp: new Date().toISOString(),
            ...sanitizeForLogging(details)
        };
        
        securityLogger.warn('Rate Limit Exceeded', event);
    }
    
    static logSuspiciousActivity(req, activityType, details = {}) {
        const event = {
            type: 'SUSPICIOUS_ACTIVITY',
            activityType,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            url: req.originalUrl,
            method: req.method,
            userId: req.user?.id || null,
            timestamp: new Date().toISOString(),
            ...sanitizeForLogging(details)
        };
        
        securityLogger.error('Suspicious Activity Detected', event);
    }
    
    static logDataAccess(req, dataType, action, success, details = {}) {
        const event = {
            type: 'DATA_ACCESS',
            dataType,
            action, // CREATE, READ, UPDATE, DELETE
            success,
            ip: req.ip,
            userId: req.user?.id || null,
            userType: req.user?.type || null,
            timestamp: new Date().toISOString(),
            ...sanitizeForLogging(details)
        };
        
        securityLogger.info('Data Access', event);
    }
    
    static logPaymentEvent(req, eventType, amount, success, details = {}) {
        const event = {
            type: 'PAYMENT_EVENT',
            eventType,
            amount,
            success,
            ip: req.ip,
            userId: req.user?.id || null,
            timestamp: new Date().toISOString(),
            ...sanitizeForLogging(details)
        };
        
        securityLogger.info('Payment Event', event);
    }
}

/**
 * Middleware pour logger automatiquement certaines actions
 */
function autoLogSecurity(req, res, next) {
    const originalJson = res.json;
    const startTime = Date.now();
    
    res.json = function(data) {
        const responseTime = Date.now() - startTime;
        const status = res.statusCode;
        
        // Logger les erreurs automatiquement
        if (status >= 400) {
            logger.warn('API Error Response', {
                method: req.method,
                url: req.originalUrl,
                status,
                responseTime,
                ip: req.ip,
                userId: req.user?.id || null,
                error: data.error || 'Unknown error',
                body: sanitizeForLogging(req.body)
            });
        }
        
        // Logger les actions sensibles
        const sensitiveEndpoints = [
            '/api/send-otp',
            '/api/verify-otp',
            '/api/trips/accept',
            '/api/trips/complete',
            '/api/ratings/submit'
        ];
        
        if (sensitiveEndpoints.some(endpoint => req.originalUrl.includes(endpoint))) {
            SecurityEvents.logDataAccess(
                req,
                req.originalUrl.split('/').pop(),
                req.method,
                status < 400,
                { status, responseTime }
            );
        }
        
        return originalJson.call(this, data);
    };
    
    next();
}

/**
 * Middleware de logging d'erreurs
 */
function errorLogger(err, req, res, next) {
    logger.error('Unhandled Error', {
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userId: req.user?.id || null,
        body: sanitizeForLogging(req.body),
        timestamp: new Date().toISOString()
    });
    
    next(err);
}

/**
 * Fonction pour nettoyer les anciens logs
 */
function cleanOldLogs() {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 jours
    const now = Date.now();
    
    fs.readdir(logsDir, (err, files) => {
        if (err) return;
        
        files.forEach(file => {
            const filePath = path.join(logsDir, file);
            
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                
                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlink(filePath, (err) => {
                        if (!err) {
                            logger.info(`Ancien fichier de log supprimé: ${file}`);
                        }
                    });
                }
            });
        });
    });
}

// Nettoyer les anciens logs au démarrage et tous les jours
cleanOldLogs();
setInterval(cleanOldLogs, 24 * 60 * 60 * 1000);

module.exports = {
    logger,
    securityLogger,
    httpLogger,
    SecurityEvents,
    autoLogSecurity,
    errorLogger,
    sanitizeForLogging
};