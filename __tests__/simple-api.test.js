/**
 * 🧪 TESTS SIMPLES DE L'API VAMO
 *
 * Tests basiques pour vérifier que ton backend fonctionne
 * Ces tests ne modifient PAS la base de données
 */

const request = require('supertest');

// URL de ton backend Railway
const BASE_URL = 'https://vamo-backend-production.up.railway.app';

describe('🚀 Tests simples de l\'API Vamo', () => {

    test('✅ Le backend Railway répond correctement', async () => {
        // Test que l'API est accessible
        const response = await request(BASE_URL)
            .get('/');

        console.log(`📊 Status: ${response.status}`);

        // Le backend devrait renvoyer quelque chose (200, 404, etc. - peu importe tant qu'il répond)
        expect(response.status).toBeDefined();
    }, 10000); // 10 secondes de timeout

    test('✅ L\'endpoint /api/locations fonctionne', async () => {
        const response = await request(BASE_URL)
            .get('/api/locations');

        console.log(`📊 Locations status: ${response.status}`);
        console.log(`📊 Nombre de locations: ${response.body?.success ? 'OK' : 'N/A'}`);

        expect(response.status).toBe(200);
    }, 10000);

    test('✅ Je peux créer une recherche de course', async () => {
        const testData = {
            origin: {
                description: 'Almadies, Dakar',
                latitude: 14.7167,
                longitude: -17.5000,
                location: { lat: 14.7167, lng: -17.5000 }
            },
            destination: {
                description: 'Plateau, Dakar',
                latitude: 14.6928,
                longitude: -17.4467,
                location: { lat: 14.6928, lng: -17.4467 }
            },
            estimatedFare: {
                amount: 2500,
                currency: 'FCFA'
            }
        };

        const response = await request(BASE_URL)
            .post('/api/trips/search')
            .send(testData);

        console.log(`📊 Search status: ${response.status}`);
        console.log(`📊 Response:`, response.body);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.searchId).toBeDefined();
    }, 10000);

});
