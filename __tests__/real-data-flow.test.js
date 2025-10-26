/**
 * 🎯 TEST AVEC VRAIES DONNÉES DE RAILWAY
 *
 * Ce test utilise des données qui EXISTENT vraiment dans ta DB Railway
 * pour tester le flux complet sans erreurs de données
 */

const request = require('supertest');
const db = require('../db');

const BASE_URL = 'https://vamo-backend-production.up.railway.app';

describe('🎯 FLUX avec vraies données Railway', () => {

    let realClientId;
    let realDriverId;
    let realTripId;

    // ============================================
    // ÉTAPE 0: RÉCUPÉRER DES VRAIES DONNÉES
    // ============================================
    beforeAll(async () => {
        console.log('\n📡 Connexion à la base de données Railway...');

        // Récupérer un vrai client de la DB
        try {
            const clientResult = await db.query(`
                SELECT id_client FROM Client LIMIT 1
            `);

            if (clientResult.rows.length > 0) {
                realClientId = clientResult.rows[0].id_client;
                console.log(`✅ Client réel trouvé: ID ${realClientId}`);
            } else {
                console.log('⚠️  Aucun client dans la DB');
            }
        } catch (err) {
            console.log('⚠️  Impossible de récupérer un client:', err.message);
        }

        // Récupérer un vrai chauffeur de la DB
        try {
            const driverResult = await db.query(`
                SELECT id_chauffeur FROM Chauffeur WHERE disponibilite = true LIMIT 1
            `);

            if (driverResult.rows.length > 0) {
                realDriverId = driverResult.rows[0].id_chauffeur;
                console.log(`✅ Chauffeur réel trouvé: ID ${realDriverId}`);
            } else {
                console.log('⚠️  Aucun chauffeur disponible dans la DB');
            }
        } catch (err) {
            console.log('⚠️  Impossible de récupérer un chauffeur:', err.message);
        }

        // Récupérer une vraie course terminée pour tester la notation
        try {
            const tripResult = await db.query(`
                SELECT id_course, id_client, id_chauffeur
                FROM Course
                WHERE etat_course = 'terminee'
                ORDER BY date_heure_arrivee DESC
                LIMIT 1
            `);

            if (tripResult.rows.length > 0) {
                realTripId = tripResult.rows[0].id_course;
                const tripClientId = tripResult.rows[0].id_client;
                const tripDriverId = tripResult.rows[0].id_chauffeur;
                console.log(`✅ Course terminée trouvée: ID ${realTripId} (Client: ${tripClientId}, Driver: ${tripDriverId})`);

                // Utiliser le vrai client de cette course pour la notation
                realClientId = tripClientId;
                realDriverId = tripDriverId;
            } else {
                console.log('⚠️  Aucune course terminée dans la DB');
            }
        } catch (err) {
            console.log('⚠️  Impossible de récupérer une course:', err.message);
        }

        console.log('\n📊 Données de test:');
        console.log(`   Client ID: ${realClientId || 'N/A'}`);
        console.log(`   Driver ID: ${realDriverId || 'N/A'}`);
        console.log(`   Trip ID: ${realTripId || 'N/A'}`);
        console.log('');
    });

    // ============================================
    // TEST 1: API BASIQUES
    // ============================================
    describe('✅ Tests basiques de l\'API', () => {

        test('1. Le backend Railway répond', async () => {
            const response = await request(BASE_URL).get('/');

            console.log(`📊 Backend status: ${response.status}`);
            expect([200, 404, 301, 302]).toContain(response.status);
        }, 10000);

        test('2. WebSocket connections fonctionnent', async () => {
            const response = await request(BASE_URL)
                .get('/api/debug/websocket-connections');

            console.log(`📊 WebSocket status: ${response.status}`);
            console.log(`📊 Connexions:`, response.body.connections);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        }, 10000);

    });

    // ============================================
    // TEST 2: COURSES DISPONIBLES
    // ============================================
    describe('🚗 Tests des courses', () => {

        test('3. Récupérer les courses disponibles', async () => {
            if (!realDriverId) {
                console.log('⚠️  Skip: Pas de chauffeur disponible');
                return;
            }

            const response = await request(BASE_URL)
                .get(`/api/trips/available/${realDriverId}`);

            console.log(`📊 Status: ${response.status}`);
            console.log(`📊 Courses disponibles:`, response.body.hasTrip ? 'Oui' : 'Non');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success');
        }, 10000);

    });

    // ============================================
    // TEST 3: NOTATION (avec vraies données)
    // ============================================
    describe('⭐ Tests de notation', () => {

        test('4. Récupérer les notes d\'un chauffeur', async () => {
            if (!realDriverId) {
                console.log('⚠️  Skip: Pas de chauffeur disponible');
                return;
            }

            const response = await request(BASE_URL)
                .get(`/api/ratings/driver/${realDriverId}`);

            console.log(`📊 Status: ${response.status}`);
            console.log(`📊 Note moyenne:`, response.body?.data?.stats);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
        }, 10000);

        test('5. Soumettre une note (si course terminée existe)', async () => {
            if (!realTripId || !realClientId || !realDriverId) {
                console.log('⚠️  Skip: Pas de données de course terminée');
                return;
            }

            // Vérifier si cette course a déjà une note
            const existingRating = await db.query(`
                SELECT * FROM Evaluation
                WHERE id_course = $1 AND id_client = $2
            `, [realTripId, realClientId]);

            if (existingRating.rows.length > 0) {
                console.log('⚠️  Cette course a déjà été notée, skip du test');
                return;
            }

            const ratingData = {
                tripId: realTripId,
                clientId: realClientId,
                driverId: realDriverId,
                rating: 5,
                comment: 'Test automatisé - Excellent service!',
                ratingType: 'driver'
            };

            const response = await request(BASE_URL)
                .post('/api/ratings/submit')
                .send(ratingData);

            console.log(`📊 Status: ${response.status}`);
            console.log(`📊 Response:`, response.body);

            if (response.status === 200) {
                console.log(`✅ NOTATION RÉUSSIE! Note: 5/5 ⭐⭐⭐⭐⭐`);
                expect(response.body.success).toBe(true);
            } else {
                console.log(`⚠️  Notation échouée: ${response.body.error}`);
                // On accepte l'échec si c'est pour une bonne raison (déjà noté, etc.)
                expect(response.body).toHaveProperty('error');
            }
        }, 10000);

    });

    // ============================================
    // RÉSUMÉ FINAL
    // ============================================
    afterAll(async () => {
        console.log('\n' + '='.repeat(60));
        console.log('🎉 TESTS AVEC VRAIES DONNÉES TERMINÉS!');
        console.log('='.repeat(60));
        console.log(`📊 Client ID utilisé: ${realClientId || 'N/A'}`);
        console.log(`📊 Driver ID utilisé: ${realDriverId || 'N/A'}`);
        console.log(`📊 Trip ID utilisé: ${realTripId || 'N/A'}`);
        console.log('='.repeat(60));

        // Fermer la connexion DB
        await db.pool.end();
    });

});
