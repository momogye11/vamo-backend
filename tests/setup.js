// Configuration globale pour les tests Jest
require('dotenv').config({ path: '.env.test' });

// Mock de la base de données
const mockDb = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn()
};

// Mock du module de base de données
jest.mock('../db', () => mockDb);

// Variables d'environnement pour les tests
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_NAME = 'test_vamo_db';
process.env.AFRICASTALKING_API_KEY = 'test_api_key';
process.env.AFRICASTALKING_USERNAME = 'sandbox';
process.env.TWILIO_ACCOUNT_SID = 'test_twilio_sid';
process.env.TWILIO_AUTH_TOKEN = 'test_twilio_token';

// Configuration Jest globale
beforeEach(() => {
    // Nettoyer tous les mocks avant chaque test
    jest.clearAllMocks();
    
    // Reset des mocks de base de données
    mockDb.query.mockClear();
});

afterAll(() => {
    // Nettoyer après tous les tests
    jest.clearAllTimers();
});

// Export des utilitaires de test
global.mockDb = mockDb;

// Helper pour créer des données de test
global.createTestData = {
    validPhone: '+221781234567',
    invalidPhone: '123456789',
    validOtp: '1234',
    expiredOtpData: {
        phone: '+221781234567',
        code: '1234',
        expires_at: new Date(Date.now() - 10 * 60 * 1000) // Expiré il y a 10 minutes
    },
    validOtpData: {
        phone: '+221781234567',
        code: '1234',
        expires_at: new Date(Date.now() + 5 * 60 * 1000) // Expire dans 5 minutes
    },
    tripData: {
        origin: {
            description: 'Almadies, Dakar',
            location: { lat: 14.7275, lng: -17.5113 }
        },
        destination: {
            description: 'Plateau, Dakar',
            location: { lat: 14.7167, lng: -17.4677 }
        },
        vehicleType: 'standard',
        paymentMethod: 'wave',
        estimatedFare: 2500,
        routeDistance: '8.5',
        routeDuration: '18 min'
    }
};

console.log('✅ Test setup completed');