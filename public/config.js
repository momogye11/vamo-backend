// 🚀 VAMO ADMIN - CONFIGURATION CENTRALISÉE

// Configuration API
const VAMO_CONFIG = {
    // URLs API - RELATIVE (frontend et backend sur le même serveur Railway)
    API_BASE: '/api',
    API_ADVANCED_BASE: '/api/admin-advanced',

    // URLs API - LOCAL pour développement
    // API_BASE: 'http://localhost:5001/api',
    // API_ADVANCED_BASE: 'http://localhost:5001/api/admin-advanced',
    
    // Configuration admin - À vérifier avec tes vraies données
    ADMIN: {
        email: 'admin@vamo.sn',
        password: 'VamoAdmin2024',
        refreshInterval: 30000, // 30 secondes
        maxRetries: 3
    },
    
    // Configuration des animations
    ANIMATIONS: {
        transitionFast: '0.2s ease',
        transitionNormal: '0.3s ease',
        transitionSlow: '0.5s ease',
        fadeInDelay: 100,
        staggerDelay: 50
    },
    
    // Configuration des couleurs (utilise les variables CSS)
    COLORS: {
        primary: 'var(--vamo-gold)',
        primaryLight: 'var(--vamo-gold-light)',
        primaryDark: 'var(--vamo-gold-dark)',
        white: 'var(--vamo-white)',
        dark: 'var(--vamo-dark)',
        success: '#10B981',
        error: '#EF4444',
        warning: '#F59E0B'
    },
    
    // Configuration des border-radius
    BORDER_RADIUS: {
        sm: 'var(--border-radius-sm)',
        md: 'var(--border-radius-md)',
        lg: 'var(--border-radius-lg)',
        xl: 'var(--border-radius-xl)',
        '2xl': 'var(--border-radius-2xl)'
    },
    
    // Configuration des endpoints
    ENDPOINTS: {
        login: '/admin/login',
        chauffeurs: '/debug/chauffeurs',
        livreurs: '/debug/livreurs',
        analytics: '/analytics/dashboard',
        revenus: '/revenus/dashboard',
        test: '/test'
    },
    
    // Configuration des messages
    MESSAGES: {
        loading: 'Chargement des données...',
        error: 'Erreur de chargement',
        success: 'Opération réussie',
        noData: 'Aucune donnée disponible',
        connectionError: 'Erreur de connexion',
        networkError: 'Erreur réseau'
    },
    
    // Configuration des statuts
    STATUS: {
        en_attente: 'En attente',
        approuve: 'Approuvé',
        rejete: 'Rejeté',
        suspendu: 'Suspendu'
    },
    
    // Configuration des disponibilités
    DISPONIBILITE: {
        true: 'En ligne',
        false: 'Hors ligne'
    }
};

// Fonction pour obtenir la configuration
function getConfig() {
    return VAMO_CONFIG;
}

// Fonction pour obtenir une valeur de configuration
function getConfigValue(path) {
    const keys = path.split('.');
    let value = VAMO_CONFIG;
    
    for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
            value = value[key];
        } else {
            // console.warn(`Configuration path not found: ${path}`);
            return null;
        }
    }
    
    return value;
}

// Fonction pour mettre à jour la configuration
function updateConfig(path, value) {
    const keys = path.split('.');
    let current = VAMO_CONFIG;
    
    for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    // console.log(`Configuration updated: ${path} = ${value}`);
}

// Export pour utilisation dans d'autres fichiers
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VAMO_CONFIG, getConfig, getConfigValue, updateConfig };
}
