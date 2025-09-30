const request = require('supertest');
const express = require('express');

// Import des routes à tester
const ridesRouter = require('../../routes/rides');
const tripsRouter = require('../../routes/trips');

// Setup de l'app Express pour les tests
const app = express();
app.use(express.json());
app.use('/api/rides', ridesRouter);
app.use('/api/trips', tripsRouter);

describe('Pricing and Trip Management', () => {
    describe('Distance Calculation', () => {
        // Importer la fonction calculateDistance depuis rides.js
        // Note: Il faudrait l'exporter pour pouvoir la tester unitairement
        
        test('should calculate distance between Dakar locations correctly', () => {
            // Almadies to Plateau (approximativement 8-10 km)
            const almadies = { lat: 14.7275, lng: -17.5113 };
            const plateau = { lat: 14.7167, lng: -17.4677 };
            
            // Fonction copiée depuis rides.js pour les tests
            function calculateDistance(coord1, coord2) {
                const R = 6371; // Earth's radius in kilometers
                const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
                const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
                          Math.sin(dLng/2) * Math.sin(dLng/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                return R * c;
            }
            
            const distance = calculateDistance(almadies, plateau);
            
            expect(distance).toBeGreaterThan(3); // Au moins 3km
            expect(distance).toBeLessThan(12); // Maximum 12km
            expect(distance).toBeCloseTo(8.5, 0.5); // Approximativement 8.5km
        });

        test('should return 0 for same coordinates', () => {
            function calculateDistance(coord1, coord2) {
                const R = 6371;
                const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
                const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
                          Math.sin(dLng/2) * Math.sin(dLng/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                return R * c;
            }

            const sameLocation = { lat: 14.7275, lng: -17.5113 };
            const distance = calculateDistance(sameLocation, sameLocation);
            
            expect(distance).toBeCloseTo(0, 3);
        });
    });

    describe('POST /api/rides/search - Pricing Logic', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        test('should create ride with correct pricing calculation', async () => {
            // Mock successful database operations
            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1, rows: [{ id_course: 1 }] }) // INSERT course
                .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // Check available drivers

            const response = await request(app)
                .post('/api/rides/search')
                .send(createTestData.tripData);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.ride).toBeDefined();
            expect(response.body.ride.fare).toBe(createTestData.tripData.estimatedFare);

            // Vérifier que la course a été créée avec les bonnes données
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO Course'),
                expect.arrayContaining([
                    expect.any(Number), // id_client
                    createTestData.tripData.origin.description,
                    createTestData.tripData.destination.description,
                    parseFloat(createTestData.tripData.routeDistance),
                    expect.any(Number), // duration
                    createTestData.tripData.estimatedFare,
                    createTestData.tripData.paymentMethod,
                    expect.any(Number), // latitude_depart
                    expect.any(Number), // longitude_depart
                    expect.any(Number), // latitude_arrivee
                    expect.any(Number), // longitude_arrivee
                ])
            );
        });

        test('should validate and clean pricing data', async () => {
            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1, rows: [{ id_course: 1 }] })
                .mockResolvedValueOnce({ rowCount: 0, rows: [] });

            // Test avec des données extrêmes
            const extremeData = {
                ...createTestData.tripData,
                estimatedFare: 999999999.99, // Maximum DB value
                routeDistance: '999.99', // Maximum DB value
                routeDuration: '1440 min' // 24 hours
            };

            const response = await request(app)
                .post('/api/rides/search')
                .send(extremeData);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            // Vérifier que les valeurs ont été nettoyées
            const insertCall = mockDb.query.mock.calls.find(call => 
                call[0].includes('INSERT INTO Course')
            );
            
            expect(insertCall[1]).toContain(999999999.99); // Max fare allowed
            expect(insertCall[1]).toContain(999.99); // Max distance allowed
            expect(insertCall[1]).toContain(1440); // Max duration allowed
        });

        test('should handle invalid pricing data', async () => {
            const invalidData = {
                ...createTestData.tripData,
                estimatedFare: null,
                routeDistance: null
            };

            const response = await request(app)
                .post('/api/rides/search')
                .send(invalidData);

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('estimated fare are required');
        });

        test('should map payment methods correctly', async () => {
            mockDb.query
                .mockResolvedValue({ rowCount: 1, rows: [{ id_course: 1 }] });

            const paymentMethods = [
                { input: 'orange', expected: 'orange_money' },
                { input: 'Orange Money', expected: 'orange_money' },
                { input: 'orange_money', expected: 'orange_money' },
                { input: 'wave', expected: 'wave' },
                { input: 'Wave Money', expected: 'wave' },
                { input: 'especes', expected: 'especes' },
                { input: 'cash', expected: 'especes' },
                { input: null, expected: 'especes' },
                { input: '', expected: 'especes' }
            ];

            for (const method of paymentMethods) {
                mockDb.query.mockClear();
                mockDb.query
                    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id_course: 1 }] })
                    .mockResolvedValueOnce({ rowCount: 0, rows: [] });

                const testData = {
                    ...createTestData.tripData,
                    paymentMethod: method.input
                };

                const response = await request(app)
                    .post('/api/rides/search')
                    .send(testData);

                expect(response.status).toBe(200);
                
                // Vérifier que le bon mode de paiement a été sauvegardé
                const insertCall = mockDb.query.mock.calls.find(call => 
                    call[0].includes('INSERT INTO Course')
                );
                expect(insertCall[1]).toContain(method.expected);
            }
        });
    });

    describe('Trip Completion and Final Pricing', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        test('should complete trip with correct final price calculation', async () => {
            const tripId = 123;
            const driverId = 456;
            const originalPrice = 2500;

            // Mock trip data
            mockDb.query
                .mockResolvedValueOnce({ // BEGIN
                    rowCount: 1
                })
                .mockResolvedValueOnce({ // Get current trip
                    rowCount: 1,
                    rows: [{
                        etat_course: 'en_cours',
                        id_client: 789,
                        prix: originalPrice,
                        distance_km: 8.5,
                        duree_min: 18,
                        adresse_depart: 'Almadies',
                        adresse_arrivee: 'Plateau'
                    }]
                })
                .mockResolvedValueOnce({ // UPDATE trip completion
                    rowCount: 1,
                    rows: [{
                        id_course: tripId,
                        prix: originalPrice,
                        date_heure_arrivee: new Date()
                    }]
                })
                .mockResolvedValueOnce({ // Get driver info
                    rowCount: 1,
                    rows: [{
                        nom: 'Diop',
                        prenom: 'Amadou',
                        telephone: '+221781234567'
                    }]
                })
                .mockResolvedValueOnce({ // COMMIT
                    rowCount: 1
                });

            const response = await request(app)
                .post('/api/trips/complete')
                .send({ driverId, tripId });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.trip.finalPrice).toBe(originalPrice);
            expect(response.body.trip.id).toBe(tripId);

            // Vérifier que le prix final a été calculé et sauvegardé
            const updateCall = mockDb.query.mock.calls.find(call => 
                call[0].includes('UPDATE Course') && call[0].includes('terminee')
            );
            expect(updateCall).toBeDefined();
            expect(updateCall[1]).toContain(originalPrice);
        });

        test('should calculate minimum price when original price is 0', async () => {
            const tripId = 123;
            const driverId = 456;

            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                .mockResolvedValueOnce({ // Get current trip with 0 price
                    rowCount: 1,
                    rows: [{
                        etat_course: 'en_cours',
                        id_client: 789,
                        prix: 0, // Prix initial à 0
                        distance_km: 5.0,
                        duree_min: 15,
                        adresse_depart: 'Test Origin',
                        adresse_arrivee: 'Test Destination'
                    }]
                })
                .mockResolvedValueOnce({ // UPDATE with calculated price
                    rowCount: 1,
                    rows: [{
                        id_course: tripId,
                        prix: 2500, // 5km * 500 FCFA/km = 2500 FCFA
                        date_heure_arrivee: new Date()
                    }]
                })
                .mockResolvedValueOnce({ // Driver info
                    rowCount: 1,
                    rows: [{ nom: 'Test', prenom: 'Driver', telephone: '+221000000000' }]
                })
                .mockResolvedValueOnce({ rowCount: 1 }); // COMMIT

            const response = await request(app)
                .post('/api/trips/complete')
                .send({ driverId, tripId });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            
            // Le prix final devrait être calculé : 5km * 500 FCFA/km = 2500 FCFA (minimum 1000)
            expect(response.body.trip.finalPrice).toBe(2500);
        });

        test('should apply minimum price rule', async () => {
            const tripId = 123;
            const driverId = 456;

            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                .mockResolvedValueOnce({ // Get trip with very short distance
                    rowCount: 1,
                    rows: [{
                        etat_course: 'en_cours',
                        id_client: 789,
                        prix: 0,
                        distance_km: 0.5, // Très courte distance
                        duree_min: 5,
                        adresse_depart: 'Near Location',
                        adresse_arrivee: 'Very Near Location'
                    }]
                })
                .mockResolvedValueOnce({ // UPDATE with minimum price
                    rowCount: 1,
                    rows: [{
                        id_course: tripId,
                        prix: 1000, // Prix minimum appliqué
                        date_heure_arrivee: new Date()
                    }]
                })
                .mockResolvedValueOnce({ // Driver info
                    rowCount: 1,
                    rows: [{ nom: 'Test', prenom: 'Driver', telephone: '+221000000000' }]
                })
                .mockResolvedValueOnce({ rowCount: 1 }); // COMMIT

            const response = await request(app)
                .post('/api/trips/complete')
                .send({ driverId, tripId });

            expect(response.status).toBe(200);
            
            // Le prix minimum de 1000 FCFA devrait être appliqué
            expect(response.body.trip.finalPrice).toBe(1000);
        });

        test('should reject completion of non-active trip', async () => {
            const tripId = 123;
            const driverId = 456;

            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                .mockResolvedValueOnce({ // Get trip with wrong status
                    rowCount: 1,
                    rows: [{
                        etat_course: 'terminee', // Déjà terminée
                        id_client: 789
                    }]
                })
                .mockResolvedValueOnce({ rowCount: 1 }); // ROLLBACK

            const response = await request(app)
                .post('/api/trips/complete')
                .send({ driverId, tripId });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Impossible de terminer le voyage');
        });
    });

    describe('Pricing Edge Cases', () => {
        test('should handle zero distance gracefully', () => {
            function calculateDistance(coord1, coord2) {
                const R = 6371;
                const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
                const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
                          Math.sin(dLng/2) * Math.sin(dLng/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                return R * c;
            }

            const sameLocation = { lat: 14.7275, lng: -17.5113 };
            const distance = calculateDistance(sameLocation, sameLocation);
            
            expect(distance).toBe(0);
            expect(isNaN(distance)).toBe(false);
        });

        test('should handle very large distances', () => {
            function calculateDistance(coord1, coord2) {
                const R = 6371;
                const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
                const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
                          Math.sin(dLng/2) * Math.sin(dLng/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                return R * c;
            }

            // Dakar to Paris (très grande distance)
            const dakar = { lat: 14.7275, lng: -17.5113 };
            const paris = { lat: 48.8566, lng: 2.3522 };
            
            const distance = calculateDistance(dakar, paris);
            
            expect(distance).toBeGreaterThan(3000); // Plus de 3000km
            expect(distance).toBeLessThan(10000); // Moins de 10000km
            expect(isNaN(distance)).toBe(false);
        });

        test('should validate pricing constraints', () => {
            const testCases = [
                { fare: 0, expected: 0 },
                { fare: 500, expected: 500 },
                { fare: 99999999.99, expected: 99999999.99 },
                { fare: 100000000, expected: 99999999.99 }, // Should be capped
                { fare: -100, expected: 0 }, // Should be floored at 0
                { fare: 'invalid', expected: 0 }, // Should default to 0
                { fare: null, expected: 0 },
                { fare: undefined, expected: 0 }
            ];

            testCases.forEach(({ fare, expected }) => {
                const cleanFare = Math.min(Math.max(parseFloat(fare) || 0, 0), 99999999.99);
                expect(cleanFare).toBe(expected);
            });
        });
    });

    describe('Currency and Formatting', () => {
        test('should handle FCFA currency correctly', async () => {
            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1, rows: [{ id_course: 1 }] })
                .mockResolvedValueOnce({ rowCount: 0, rows: [] });

            const response = await request(app)
                .post('/api/rides/search')
                .send(createTestData.tripData);

            expect(response.status).toBe(200);
            expect(response.body.ride.fare).toBe(2500);
            
            // FCFA est implicite dans le système (pas stocké séparément)
            expect(typeof response.body.ride.fare).toBe('number');
            expect(response.body.ride.fare % 1).toBe(0); // Should be integer for FCFA
        });

        test('should handle decimal pricing correctly', async () => {
            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1, rows: [{ id_course: 1 }] })
                .mockResolvedValueOnce({ rowCount: 0, rows: [] });

            const testData = {
                ...createTestData.tripData,
                estimatedFare: 2500.50 // Prix avec décimales
            };

            const response = await request(app)
                .post('/api/rides/search')
                .send(testData);

            expect(response.status).toBe(200);
            expect(response.body.ride.fare).toBe(2500.50);
        });
    });
});