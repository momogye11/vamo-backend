/**
 * Middleware de validation des inputs avec Joi
 * Sécurise toutes les APIs contre les données malveillantes
 */

const Joi = require('joi');

// Schémas de validation réutilisables
const phoneSchema = Joi.string()
    .pattern(/^\+221[67]\d{8}$/)
    .required()
    .messages({
        'string.pattern.base': 'Format de numéro sénégalais invalide (+221XXXXXXXXX)',
        'any.required': 'Numéro de téléphone requis'
    });

const otpSchema = Joi.string()
    .pattern(/^\d{4}$/)
    .required()
    .messages({
        'string.pattern.base': 'Code OTP doit contenir 4 chiffres',
        'any.required': 'Code OTP requis'
    });

const coordinatesSchema = Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required()
});

const addressSchema = Joi.object({
    description: Joi.string().min(5).max(200).required(),
    location: coordinatesSchema.required()
});

// Schémas de validation par endpoint
const validationSchemas = {
    // Authentification
    sendOtp: Joi.object({
        phone: phoneSchema
    }),

    verifyOtp: Joi.object({
        phone: phoneSchema,
        code: otpSchema
    }),

    // Client
    createClient: Joi.object({
        nom: Joi.string().min(2).max(50).pattern(/^[a-zA-ZÀ-ÿ\s]+$/).required(),
        prenom: Joi.string().min(2).max(50).pattern(/^[a-zA-ZÀ-ÿ\s]+$/).required(),
        telephone: phoneSchema,
        email: Joi.string().email().optional(),
        push_token: Joi.string().max(500).optional(),
        platform: Joi.string().valid('ios', 'android', 'web').optional()
    }),

    updateClient: Joi.object({
        nom: Joi.string().min(2).max(50).pattern(/^[a-zA-ZÀ-ÿ\s]+$/).optional(),
        prenom: Joi.string().min(2).max(50).pattern(/^[a-zA-ZÀ-ÿ\s]+$/).optional(),
        email: Joi.string().email().optional(),
        push_token: Joi.string().max(500).optional(),
        platform: Joi.string().valid('ios', 'android', 'web').optional()
    }),

    // Chauffeur
    createDriver: Joi.object({
        nom: Joi.string().min(2).max(50).pattern(/^[a-zA-ZÀ-ÿ\s]+$/).required(),
        prenom: Joi.string().min(2).max(50).pattern(/^[a-zA-ZÀ-ÿ\s]+$/).required(),
        telephone: phoneSchema,
        email: Joi.string().email().optional(),
        marque_vehicule: Joi.string().min(2).max(50).required(),
        annee_vehicule: Joi.number().integer().min(1990).max(new Date().getFullYear() + 1).required(),
        plaque_immatriculation: Joi.string().min(5).max(15).pattern(/^[A-Z]{2}-\d{3}-[A-Z]{2}$/).required(),
        push_token: Joi.string().max(500).optional(),
        platform: Joi.string().valid('ios', 'android', 'web').optional()
    }),

    updateDriver: Joi.object({
        nom: Joi.string().min(2).max(50).pattern(/^[a-zA-ZÀ-ÿ\s]+$/).optional(),
        prenom: Joi.string().min(2).max(50).pattern(/^[a-zA-ZÀ-ÿ\s]+$/).optional(),
        email: Joi.string().email().optional(),
        marque_vehicule: Joi.string().min(2).max(50).optional(),
        annee_vehicule: Joi.number().integer().min(1990).max(new Date().getFullYear() + 1).optional(),
        disponibilite: Joi.boolean().optional(),
        push_token: Joi.string().max(500).optional(),
        platform: Joi.string().valid('ios', 'android', 'web').optional()
    }),

    // Courses
    createRide: Joi.object({
        origin: addressSchema,
        destination: addressSchema,
        vehicleType: Joi.string().valid('standard', 'premium', 'vip').default('standard'),
        paymentMethod: Joi.string().valid('wave', 'orange_money', 'especes').default('especes'),
        estimatedFare: Joi.number().min(500).max(50000).required(),
        routeDistance: Joi.string().max(20).required(),
        routeDuration: Joi.string().max(20).required(),
        clientPhone: phoneSchema,
        clientName: Joi.string().min(2).max(100).optional(),
        silentMode: Joi.boolean().default(false)
    }),

    acceptTrip: Joi.object({
        driverId: Joi.number().integer().positive().required(),
        tripId: Joi.number().integer().positive().required()
    }),

    updateTripStatus: Joi.object({
        driverId: Joi.number().integer().positive().required(),
        tripId: Joi.number().integer().positive().required(),
        status: Joi.string().valid('en_route_pickup', 'arrivee_pickup', 'en_cours', 'terminee', 'annulee').required()
    }),

    completeTrip: Joi.object({
        driverId: Joi.number().integer().positive().required(),
        tripId: Joi.number().integer().positive().required(),
        finalFare: Joi.number().min(500).max(50000).optional()
    }),

    cancelTrip: Joi.object({
        driverId: Joi.number().integer().positive().required(),
        tripId: Joi.number().integer().positive().required(),
        reason: Joi.string().min(5).max(200).required(),
        cancelledBy: Joi.string().valid('driver', 'client').required()
    }),

    // Notation
    submitRating: Joi.object({
        tripId: Joi.number().integer().positive().required(),
        rating: Joi.number().integer().min(1).max(5).required(),
        comment: Joi.string().max(500).optional().allow(''),
        ratedBy: Joi.string().valid('client', 'driver').required(),
        tags: Joi.array().items(Joi.string().valid(
            'ponctuel', 'aimable', 'propre', 'securitaire', 'professional',
            'lent', 'malpoli', 'sale', 'dangereux', 'non_professional'
        )).max(5).optional()
    }),

    // Position
    updatePosition: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required(),
        heading: Joi.number().min(0).max(360).optional(),
        speed: Joi.number().min(0).max(200).optional()
    }),

    // Livraison
    createDelivery: Joi.object({
        origine: addressSchema,
        destination: addressSchema,
        type_colis: Joi.string().valid('petit', 'moyen', 'grand', 'fragile').required(),
        poids_kg: Joi.number().min(0.1).max(50).required(),
        description_colis: Joi.string().min(5).max(200).required(),
        telephone_expediteur: phoneSchema,
        nom_expediteur: Joi.string().min(2).max(100).required(),
        telephone_destinataire: phoneSchema,
        nom_destinataire: Joi.string().min(2).max(100).required(),
        mode_paiement: Joi.string().valid('wave', 'orange_money', 'especes').default('especes'),
        prix: Joi.number().min(500).max(20000).required()
    }),

    // Upload
    uploadPhoto: Joi.object({
        type: Joi.string().valid('selfie', 'cni', 'vehicule', 'permis').required(),
        userId: Joi.number().integer().positive().required(),
        userType: Joi.string().valid('client', 'chauffeur', 'livreur').required()
    })
};

/**
 * Middleware factory pour validation
 */
function validateInput(schemaName) {
    return (req, res, next) => {
        const schema = validationSchemas[schemaName];
        
        if (!schema) {
            return res.status(500).json({
                success: false,
                error: 'Schéma de validation non trouvé',
                code: 'VALIDATION_SCHEMA_ERROR'
            });
        }

        // Valider les données
        const { error, value } = schema.validate(req.body, {
            abortEarly: false, // Retourner toutes les erreurs
            stripUnknown: true, // Supprimer les champs non définis
            convert: true // Convertir les types automatiquement
        });

        if (error) {
            const validationErrors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            return res.status(400).json({
                success: false,
                error: 'Données invalides',
                code: 'VALIDATION_ERROR',
                details: validationErrors
            });
        }

        // Remplacer req.body par les données validées et nettoyées
        req.body = value;
        next();
    };
}

/**
 * Validation des paramètres d'URL
 */
function validateParams(paramSchema) {
    return (req, res, next) => {
        const { error, value } = paramSchema.validate(req.params, {
            abortEarly: false,
            stripUnknown: true,
            convert: true
        });

        if (error) {
            const validationErrors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            return res.status(400).json({
                success: false,
                error: 'Paramètres invalides',
                code: 'PARAMS_VALIDATION_ERROR',
                details: validationErrors
            });
        }

        req.params = value;
        next();
    };
}

/**
 * Validation des query parameters
 */
function validateQuery(querySchema) {
    return (req, res, next) => {
        const { error, value } = querySchema.validate(req.query, {
            abortEarly: false,
            stripUnknown: true,
            convert: true
        });

        if (error) {
            const validationErrors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            return res.status(400).json({
                success: false,
                error: 'Paramètres de requête invalides',
                code: 'QUERY_VALIDATION_ERROR',
                details: validationErrors
            });
        }

        req.query = value;
        next();
    };
}

// Schémas pour les paramètres communs
const commonParamSchemas = {
    id: Joi.object({
        id: Joi.number().integer().positive().required()
    }),
    
    driverId: Joi.object({
        driverId: Joi.number().integer().positive().required()
    }),
    
    clientId: Joi.object({
        clientId: Joi.number().integer().positive().required()
    })
};

module.exports = {
    validateInput,
    validateParams,
    validateQuery,
    validationSchemas,
    commonParamSchemas,
    // Export des schémas individuels pour réutilisation
    phoneSchema,
    otpSchema,
    coordinatesSchema,
    addressSchema
};