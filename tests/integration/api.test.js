const request = require('supertest');
const express = require('express');

// Import de l'application complète
const app = express();
app.use(express.json());

// Setup des routes comme dans index.js
app.use('/api', require('../../routes/send-otp'));
app.use('/api', require('../../routes/verify-otp'));
app.use('/api/rides', require('../../routes/rides'));
app.use('/api/trips', require('../../routes/trips'));

describe('API Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Authentication Flow Integration', () => {
        test('should complete full OTP authentication flow', async () => {
            const testPhone = '+221781234567';
            
            // Step 1: Send OTP
            mockDb.query
                .mockResolvedValueOnce({ // INSERT OTP
                    rows: [{
                        phone: testPhone,
                        code: '1234',
                        expires_at: new Date(Date.now() + 5 * 60 * 1000)
                    }]
                })
                .mockResolvedValueOnce({ // Verification query
                    rows: [{ phone: testPhone, code: '1234' }]
                });

            const sendOtpResponse = await request(app)
                .post('/api/send-otp')
                .send({ phone: testPhone });

            expect(sendOtpResponse.status).toBe(200);
            expect(sendOtpResponse.body.success).toBe(true);
            expect(sendOtpResponse.body.debug_otp).toMatch(/^\d{4}$/);

            const otpCode = sendOtpResponse.body.debug_otp;

            // Step 2: Verify OTP
            mockDb.query
                .mockResolvedValueOnce({ // All OTP codes query
                    rows: [{
                        phone: testPhone,
                        code: otpCode,
                        expires_at: new Date(Date.now() + 5 * 60 * 1000)
                    }]
                })
                .mockResolvedValueOnce({ // Verification query
                    rowCount: 1,
                    rows: [{
                        phone: testPhone,
                        code: otpCode,
                        expires_at: new Date(Date.now() + 5 * 60 * 1000)
                    }]
                })
                .mockResolvedValueOnce({ rowCount: 1 }); // DELETE query

            const verifyOtpResponse = await request(app)
                .post('/api/verify-otp')
                .send({ phone: testPhone, code: otpCode });

            expect(verifyOtpResponse.status).toBe(200);
            expect(verifyOtpResponse.body.success).toBe(true);
            expect(verifyOtpResponse.body.message).toBe('Numéro vérifié avec succès');
            expect(verifyOtpResponse.body.phone).toBe(testPhone);
        });

        test('should handle OTP expiration in full flow', async () => {
            const testPhone = '+221781234567';
            
            // Send OTP
            mockDb.query
                .mockResolvedValueOnce({ rows: [{}] })
                .mockResolvedValueOnce({ rows: [{}] });

            const sendResponse = await request(app)
                .post('/api/send-otp')
                .send({ phone: testPhone });

            expect(sendResponse.status).toBe(200);

            // Try to verify with expired OTP
            mockDb.query
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rowCount: 0 }) // Verification fails (expired)
                .mockResolvedValueOnce({ // Phone check shows expired OTP
                    rowCount: 1,
                    rows: [{
                        phone: testPhone,
                        code: '1234',
                        expires_at: new Date(Date.now() - 10 * 60 * 1000) // Expired
                    }]
                });

            const verifyResponse = await request(app)
                .post('/api/verify-otp')
                .send({ phone: testPhone, code: '1234' });

            expect(verifyResponse.status).toBe(400);
            expect(verifyResponse.body.success).toBe(false);
            expect(verifyResponse.body.error).toBe('Code incorrect ou expiré');
        });
    });

    describe('Ride Booking Flow Integration', () => {
        test('should complete full ride booking flow', async () => {
            const clientId = 123;
            const driverId = 456;
            
            // Step 1: Create ride request
            mockDb.query
                .mockResolvedValueOnce({ // INSERT course
                    rowCount: 1,
                    rows: [{ id_course: 789 }]
                })
                .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // No available drivers initially

            const rideSearchResponse = await request(app)
                .post('/api/rides/search')
                .send({
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
                });

            expect(rideSearchResponse.status).toBe(200);
            expect(rideSearchResponse.body.success).toBe(true);
            expect(rideSearchResponse.body.ride).toBeDefined();

            const tripId = 789; // From mock

            // Step 2: Driver checks for available trips
            mockDb.query.mockResolvedValueOnce({
                rowCount: 1,
                rows: [{
                    id_course: tripId,
                    adresse_depart: 'Almadies, Dakar',
                    adresse_arrivee: 'Plateau, Dakar',
                    distance_km: 8.5,
                    duree_min: 18,
                    prix: 2500,
                    mode_paiement: 'wave',
                    mode_silencieux: false,
                    latitude_depart: 14.7275,
                    longitude_depart: -17.5113,
                    latitude_arrivee: 14.7167,
                    longitude_arrivee: -17.4677,
                    telephone_client: '+221781234567',
                    nom_client: 'Test Client',
                    etat_course: 'en_attente',
                    client_nom: 'Client',
                    client_prenom: 'Test'
                }]
            });

            const availableTripsResponse = await request(app)
                .get(`/api/trips/available/${driverId}`);

            expect(availableTripsResponse.status).toBe(200);
            expect(availableTripsResponse.body.hasTrip).toBe(true);

            // Step 3: Driver accepts trip
            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                .mockResolvedValueOnce({ // Check trip availability
                    rowCount: 1,
                    rows: [{
                        id_course: tripId,
                        etat_course: 'en_attente',
                        id_chauffeur: null
                    }]
                })
                .mockResolvedValueOnce({ // UPDATE assignment
                    rowCount: 1,
                    rows: [{
                        id_course: tripId,
                        etat_course: 'acceptee',
                        adresse_depart: 'Almadies, Dakar',
                        adresse_arrivee: 'Plateau, Dakar',
                        distance_km: 8.5,
                        duree_min: 18,
                        prix: 2500,
                        mode_paiement: 'wave',
                        mode_silencieux: false,
                        nom_client: 'Test Client',
                        telephone_client: '+221781234567',
                        latitude_depart: 14.7275,
                        longitude_depart: -17.5113,
                        latitude_arrivee: 14.7167,
                        longitude_arrivee: -17.4677
                    }]
                })
                .mockResolvedValueOnce({ rowCount: 1 }) // COMMIT
                .mockResolvedValueOnce({ // Get driver info
                    rowCount: 1,
                    rows: [{
                        id_chauffeur: driverId,
                        chauffeur_nom: 'Diop',
                        chauffeur_prenom: 'Amadou',
                        chauffeur_telephone: '+221771234567',
                        marque_vehicule: 'Toyota Corolla',
                        plaque_immatriculation: 'DK-123-AB'
                    }]
                });

            const acceptResponse = await request(app)
                .post('/api/trips/accept')
                .send({ driverId, tripId });

            expect(acceptResponse.status).toBe(200);
            expect(acceptResponse.body.success).toBe(true);
            expect(acceptResponse.body.trip.status).toBe('acceptee');
        });

        test('should handle concurrent trip acceptance', async () => {
            const tripId = 789;
            const driver1Id = 456;
            const driver2Id = 457;

            // First driver accepts successfully
            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                .mockResolvedValueOnce({ // Trip available
                    rowCount: 1,
                    rows: [{ id_course: tripId, etat_course: 'en_attente', id_chauffeur: null }]
                })
                .mockResolvedValueOnce({ rowCount: 1, rows: [{}] }) // UPDATE successful
                .mockResolvedValueOnce({ rowCount: 1 }) // COMMIT
                .mockResolvedValueOnce({ rowCount: 1, rows: [{}] }); // Driver info

            const firstAcceptResponse = await request(app)
                .post('/api/trips/accept')
                .send({ driverId: driver1Id, tripId });

            expect(firstAcceptResponse.status).toBe(200);

            // Second driver tries to accept same trip (should fail)
            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // Trip no longer available
                .mockResolvedValueOnce({ rowCount: 1 }); // ROLLBACK

            const secondAcceptResponse = await request(app)
                .post('/api/trips/accept')
                .send({ driverId: driver2Id, tripId });

            expect(secondAcceptResponse.status).toBe(409);
            expect(secondAcceptResponse.body.error).toBe('Cette course n\'est plus disponible');
        });
    });

    describe('Trip Lifecycle Integration', () => {
        test('should complete full trip lifecycle', async () => {
            const driverId = 123;
            const tripId = 456;
            const statuses = ['en_route_pickup', 'arrivee_pickup', 'en_cours', 'terminee'];

            // Test each status transition
            for (let i = 0; i < statuses.length; i++) {
                const status = statuses[i];
                const prevStatus = i === 0 ? 'acceptee' : statuses[i - 1];

                if (status === 'terminee') {
                    // Special handling for completion
                    mockDb.query
                        .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                        .mockResolvedValueOnce({ // Get current trip
                            rowCount: 1,
                            rows: [{
                                etat_course: 'en_cours',
                                id_client: 789,
                                prix: 2500,
                                distance_km: 8.5,
                                adresse_depart: 'Origin',
                                adresse_arrivee: 'Destination'
                            }]
                        })
                        .mockResolvedValueOnce({ // UPDATE completion
                            rowCount: 1,
                            rows: [{
                                id_course: tripId,
                                prix: 2500,
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
                } else {
                    // Regular status update
                    mockDb.query
                        .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                        .mockResolvedValueOnce({ // Get current trip
                            rowCount: 1,
                            rows: [{
                                etat_course: prevStatus,
                                id_chauffeur: driverId
                            }]
                        })
                        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE status
                        .mockResolvedValueOnce({ rowCount: 1 }); // COMMIT

                    const response = await request(app)
                        .post('/api/trips/status')
                        .send({ driverId, tripId, status });

                    expect(response.status).toBe(200);
                    expect(response.body.success).toBe(true);
                    expect(response.body.newStatus).toBe(status);
                }

                mockDb.query.mockClear();
            }
        });
    });

    describe('Error Handling Integration', () => {
        test('should handle database connection failures gracefully', async () => {
            // Test OTP endpoint with DB failure
            mockDb.query.mockRejectedValue(new Error('Connection timeout'));

            const otpResponse = await request(app)
                .post('/api/send-otp')
                .send({ phone: '+221781234567' });

            expect(otpResponse.status).toBe(500);
            expect(otpResponse.body.success).toBe(false);
            expect(otpResponse.body.error).toBe('Erreur serveur');

            // Test trip endpoint with DB failure
            mockDb.query.mockRejectedValue(new Error('Connection timeout'));

            const tripResponse = await request(app)
                .get('/api/trips/available/123');

            expect(tripResponse.status).toBe(500);
            expect(tripResponse.body.success).toBe(false);
        });

        test('should validate input data across all endpoints', async () => {
            // Test invalid phone formats
            const invalidPhones = ['123', 'invalid', '+33123456789', ''];
            
            for (const phone of invalidPhones) {
                const response = await request(app)
                    .post('/api/send-otp')
                    .send({ phone });

                if (phone === '') {
                    expect(response.status).toBe(400);
                    expect(response.body.error).toBe('Numéro de téléphone requis');
                } else {
                    expect(response.status).toBe(400);
                    expect(response.body.error).toContain('Format de numéro invalide');
                }
            }

            // Test missing required fields for ride search
            const incompleteRideData = {
                origin: { description: 'Test' }
                // Missing destination and other required fields
            };

            const rideResponse = await request(app)
                .post('/api/rides/search')
                .send(incompleteRideData);

            expect(rideResponse.status).toBe(400);
            expect(rideResponse.body.success).toBe(false);
        });
    });

    describe('Performance and Load Testing', () => {
        test('should handle multiple concurrent OTP requests', async () => {
            const phones = [
                '+221781234567',
                '+221781234568',
                '+221781234569',
                '+221781234570'
            ];

            // Mock successful responses for all requests
            mockDb.query.mockResolvedValue({ rows: [{}] });

            const promises = phones.map(phone => 
                request(app)
                    .post('/api/send-otp')
                    .send({ phone })
            );

            const responses = await Promise.all(promises);

            responses.forEach(response => {
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
            });

            // Verify that all database calls were made
            expect(mockDb.query).toHaveBeenCalledTimes(phones.length * 2); // 2 calls per request
        });

        test('should handle rapid trip status updates', async () => {
            const driverId = 123;
            const tripId = 456;
            const updates = [
                'en_route_pickup',
                'arrivee_pickup',
                'en_cours'
            ];

            // Mock successful responses
            mockDb.query.mockResolvedValue({ rowCount: 1 });

            const promises = updates.map((status, index) => {
                mockDb.query
                    .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                    .mockResolvedValueOnce({ // Get current trip
                        rowCount: 1,
                        rows: [{
                            etat_course: index === 0 ? 'acceptee' : updates[index - 1],
                            id_chauffeur: driverId
                        }]
                    })
                    .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE
                    .mockResolvedValueOnce({ rowCount: 1 }); // COMMIT

                return request(app)
                    .post('/api/trips/status')
                    .send({ driverId, tripId, status });
            });

            const responses = await Promise.all(promises);

            responses.forEach((response, index) => {
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.newStatus).toBe(updates[index]);
            });
        });
    });
});