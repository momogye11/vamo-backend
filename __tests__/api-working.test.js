/**
 * 🎉 TESTS QUI PASSENT - API Vamo
 *
 * Ces tests vérifient des endpoints qui EXISTENT vraiment sur Railway
 * Tous ces tests devraient PASSER ✅
 */

const request = require('supertest');

// URL de ton backend Railway
const BASE_URL = 'https://vamo-backend-production.up.railway.app';

describe('🎉 Tests des endpoints qui fonctionnent', () => {

    test('✅ Le backend Railway est accessible', async () => {
        // Test que l'API est en ligne
        const response = await request(BASE_URL)
            .get('/');

        console.log(`\n📊 Backend status: ${response.status}`);

        // On vérifie juste que le serveur répond (peu importe le code)
        expect(response.status).toBeDefined();
        expect([200, 404, 301, 302]).toContain(response.status); // Tous ces codes signifient "serveur en ligne"
    }, 10000);

    test('✅ Endpoint /api/debug/websocket-connections fonctionne', async () => {
        // Cet endpoint existe et devrait renvoyer les connexions WebSocket
        const response = await request(BASE_URL)
            .get('/api/debug/websocket-connections');

        console.log(`\n📊 WebSocket debug status: ${response.status}`);
        console.log(`📊 Response:`, response.body);

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
    }, 10000);

    test('✅ Endpoint /api/ratings/driver/1 fonctionne', async () => {
        // Récupérer les notes d'un chauffeur
        const response = await request(BASE_URL)
            .get('/api/ratings/driver/1');

        console.log(`\n📊 Driver ratings status: ${response.status}`);
        console.log(`📊 Response:`, response.body);

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
    }, 10000);

    test('✅ Endpoint /api/debug/approved-chauffeurs fonctionne', async () => {
        // Liste des chauffeurs approuvés
        const response = await request(BASE_URL)
            .get('/api/debug/approved-chauffeurs');

        console.log(`\n📊 Approved drivers status: ${response.status}`);
        console.log(`📊 Number of drivers:`, response.body?.drivers?.length || 'N/A');

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
    }, 10000);

});

describe('🚀 Performance des endpoints', () => {

    test('⚡ Les endpoints répondent en moins de 5 secondes', async () => {
        const startTime = Date.now();

        await request(BASE_URL)
            .get('/api/debug/websocket-connections');

        const duration = Date.now() - startTime;

        console.log(`\n⏱️  Temps de réponse: ${duration}ms`);

        // Vérifie que la réponse est rapide (< 5000ms)
        expect(duration).toBeLessThan(5000);
    }, 10000);

});
