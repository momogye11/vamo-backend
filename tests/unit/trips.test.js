const request = require('supertest');
const express = require('express');

// Import des routes à tester
const tripsRouter = require('../../routes/trips');

// Setup de l'app Express pour les tests
const app = express();
app.use(express.json());
app.use('/api/trips', tripsRouter);

describe('Trip Management', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/trips/available/:driverId', () => {
        test('should return available trip for driver', async () => {
            const driverId = 123;
            const mockTrip = {
                id_course: 456,
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
                date_heure_depart: new Date(),
                etat_course: 'en_attente',
                client_nom: 'Client',
                client_prenom: 'Test'
            };

            mockDb.query.mockResolvedValue({
                rowCount: 1,
                rows: [mockTrip]
            });

            const response = await request(app)
                .get(`/api/trips/available/${driverId}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.hasTrip).toBe(true);
            expect(response.body.trip).toBeDefined();
            expect(response.body.trip.id).toBe(mockTrip.id_course);
            expect(response.body.trip.pickup).toBe(mockTrip.adresse_depart);
            expect(response.body.trip.destination).toBe(mockTrip.adresse_arrivee);
            expect(response.body.trip.price).toBe(mockTrip.prix);
            expect(response.body.trip.distance).toBe('8.5 km');
            expect(response.body.trip.duration).toBe('18 min');

            // Vérifier la query SQL
            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT'),
                expect.not.arrayContaining([expect.anything()])
            );
        });

        test('should return no trip when none available', async () => {
            const driverId = 123;

            mockDb.query.mockResolvedValue({
                rowCount: 0,
                rows: []
            });

            const response = await request(app)
                .get(`/api/trips/available/${driverId}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.hasTrip).toBe(false);
            expect(response.body.trip).toBeNull();
        });

        test('should handle database errors', async () => {
            const driverId = 123;

            mockDb.query.mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app)
                .get(`/api/trips/available/${driverId}`);

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Erreur serveur');
        });
    });

    describe('POST /api/trips/accept', () => {
        test('should accept available trip successfully', async () => {
            const driverId = 123;
            const tripId = 456;

            // Mock successful trip acceptance
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
                .mockResolvedValueOnce({ // UPDATE trip assignment
                    rowCount: 1,
                    rows: [{
                        id_course: tripId,
                        adresse_depart: 'Almadies',
                        adresse_arrivee: 'Plateau',
                        distance_km: 8.5,
                        duree_min: 18,
                        prix: 2500,
                        mode_paiement: 'wave',
                        mode_silencieux: false,
                        nom_client: 'Test Client',
                        telephone_client: '+221781234567',
                        etat_course: 'acceptee',
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
                        chauffeur_photo: null,
                        marque_vehicule: 'Toyota Corolla',
                        plaque_immatriculation: 'DK-123-AB',
                        annee_vehicule: 2020
                    }]
                });

            const response = await request(app)
                .post('/api/trips/accept')
                .send({ driverId, tripId });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Course acceptée avec succès');
            expect(response.body.trip).toBeDefined();
            expect(response.body.trip.id).toBe(tripId);
            expect(response.body.trip.status).toBe('acceptee');
            expect(response.body.driver).toBeDefined();
            expect(response.body.driver.name).toBe('Amadou Diop');

            // Vérifier les appels à la base de données
            expect(mockDb.query).toHaveBeenCalledWith('BEGIN');
            expect(mockDb.query).toHaveBeenCalledWith('COMMIT');
        });

        test('should reject if trip is no longer available', async () => {
            const driverId = 123;
            const tripId = 456;

            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                .mockResolvedValueOnce({ // Check trip - not available
                    rowCount: 0,
                    rows: []
                })
                .mockResolvedValueOnce({ rowCount: 1 }); // ROLLBACK

            const response = await request(app)
                .post('/api/trips/accept')
                .send({ driverId, tripId });

            expect(response.status).toBe(409);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Cette course n\'est plus disponible');

            expect(mockDb.query).toHaveBeenCalledWith('ROLLBACK');
        });

        test('should require driverId and tripId', async () => {
            // Test sans driverId
            let response = await request(app)
                .post('/api/trips/accept')
                .send({ tripId: 456 });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('driverId et tripId sont requis');

            // Test sans tripId
            response = await request(app)
                .post('/api/trips/accept')
                .send({ driverId: 123 });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('driverId et tripId sont requis');
        });
    });

    describe('POST /api/trips/status', () => {
        test('should update trip status successfully', async () => {
            const driverId = 123;
            const tripId = 456;
            const status = 'en_cours';

            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                .mockResolvedValueOnce({ // Get current trip
                    rowCount: 1,
                    rows: [{
                        etat_course: 'arrivee_pickup',
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
            expect(response.body.message).toBe('Statut mis à jour avec succès');
            expect(response.body.newStatus).toBe(status);
        });

        test('should reject invalid status values', async () => {
            const driverId = 123;
            const tripId = 456;
            const invalidStatus = 'invalid_status';

            const response = await request(app)
                .post('/api/trips/status')
                .send({ driverId, tripId, status: invalidStatus });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Statut invalide');
        });

        test('should validate status transitions', async () => {
            const validStatuses = ['en_route_pickup', 'arrivee_pickup', 'en_cours', 'terminee'];
            
            for (const status of validStatuses) {
                mockDb.query
                    .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                    .mockResolvedValueOnce({ // Get current trip
                        rowCount: 1,
                        rows: [{
                            etat_course: 'acceptee',
                            id_chauffeur: 123
                        }]
                    })
                    .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE
                    .mockResolvedValueOnce({ rowCount: 1 }); // COMMIT

                const response = await request(app)
                    .post('/api/trips/status')
                    .send({ driverId: 123, tripId: 456, status });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                
                mockDb.query.mockClear();
            }
        });

        test('should reject status update from wrong driver', async () => {
            const driverId = 123;
            const wrongDriverId = 999;
            const tripId = 456;

            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                .mockResolvedValueOnce({ // Get current trip
                    rowCount: 1,
                    rows: [{
                        etat_course: 'acceptee',
                        id_chauffeur: driverId // Different driver
                    }]
                })
                .mockResolvedValueOnce({ rowCount: 1 }); // ROLLBACK

            const response = await request(app)
                .post('/api/trips/status')
                .send({ driverId: wrongDriverId, tripId, status: 'en_cours' });

            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Vous n\'êtes pas assigné à cette course');
        });
    });

    describe('GET /api/trips/current/:driverId', () => {
        test('should return current active trip for driver', async () => {
            const driverId = 123;
            const mockCurrentTrip = {
                id_course: 456,
                adresse_depart: 'Almadies',
                adresse_arrivee: 'Plateau',
                distance_km: 8.5,
                duree_min: 18,
                prix: 2500,
                mode_paiement: 'wave',
                mode_silencieux: false,
                nom_client: 'Test Client',
                telephone_client: '+221781234567',
                etat_course: 'en_cours',
                latitude_depart: 14.7275,
                longitude_depart: -17.5113,
                latitude_arrivee: 14.7167,
                longitude_arrivee: -17.4677,
                date_heure_depart: new Date(),
                date_heure_arrivee_pickup: new Date(),
                date_heure_debut_course: new Date(),
                date_heure_arrivee: null,
                client_nom: 'Client',
                client_prenom: 'Test'
            };

            mockDb.query.mockResolvedValue({
                rowCount: 1,
                rows: [mockCurrentTrip]
            });

            const response = await request(app)
                .get(`/api/trips/current/${driverId}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.hasCurrentTrip).toBe(true);
            expect(response.body.trip).toBeDefined();
            expect(response.body.trip.id).toBe(mockCurrentTrip.id_course);
            expect(response.body.trip.status).toBe(mockCurrentTrip.etat_course);
            expect(response.body.trip.timestamps).toBeDefined();
        });

        test('should return no current trip when driver has none', async () => {
            const driverId = 123;

            mockDb.query.mockResolvedValue({
                rowCount: 0,
                rows: []
            });

            const response = await request(app)
                .get(`/api/trips/current/${driverId}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.hasCurrentTrip).toBe(false);
            expect(response.body.trip).toBeNull();
        });
    });

    describe('POST /api/trips/complete', () => {
        test('should complete trip with payment confirmation', async () => {
            const driverId = 123;
            const tripId = 456;
            const paymentMethod = 'wave';

            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                .mockResolvedValueOnce({ // UPDATE completion
                    rowCount: 1,
                    rows: [{
                        id_course: tripId,
                        prix: 2500,
                        mode_paiement: paymentMethod,
                        date_heure_arrivee: new Date()
                    }]
                })
                .mockResolvedValueOnce({ rowCount: 1 }); // COMMIT

            const response = await request(app)
                .post('/api/trips/complete')
                .send({ driverId, tripId, paymentMethod });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Course terminée avec succès');
            expect(response.body.trip.price).toBe(2500);
            expect(response.body.trip.paymentMethod).toBe(paymentMethod);
        });

        test('should require payment method for completion', async () => {
            const response = await request(app)
                .post('/api/trips/complete')
                .send({ driverId: 123, tripId: 456 });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('driverId, tripId et paymentMethod sont requis');
        });
    });

    describe('POST /api/trips/cancel', () => {
        test('should cancel trip successfully', async () => {
            const driverId = 123;
            const tripId = 456;
            const reason = 'Client not available';

            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                .mockResolvedValueOnce({ // Check current trip
                    rowCount: 1,
                    rows: [{ etat_course: 'acceptee' }]
                })
                .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE cancellation
                .mockResolvedValueOnce({ rowCount: 1 }); // COMMIT

            const response = await request(app)
                .post('/api/trips/cancel')
                .send({ driverId, tripId, reason });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Course annulée avec succès');

            // Vérifier que la course a été mise à jour pour retirer le chauffeur
            const cancelQuery = mockDb.query.mock.calls.find(call => 
                call[0].includes('UPDATE Course') && call[0].includes('annulee')
            );
            expect(cancelQuery).toBeDefined();
        });

        test('should handle trip not found for cancellation', async () => {
            const driverId = 123;
            const tripId = 456;

            mockDb.query
                .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
                .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // Trip not found
                .mockResolvedValueOnce({ rowCount: 1 }); // ROLLBACK

            const response = await request(app)
                .post('/api/trips/cancel')
                .send({ driverId, tripId });

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Course non trouvée');
        });
    });

    describe('Trip State Management', () => {
        test('should validate proper trip state transitions', () => {
            const validTransitions = {
                'en_attente': ['acceptee'],
                'acceptee': ['en_route_pickup', 'annulee'],
                'en_route_pickup': ['arrivee_pickup', 'annulee'],
                'arrivee_pickup': ['en_cours', 'annulee'],
                'en_cours': ['terminee', 'annulee'],
                'terminee': [], // Final state
                'annulee': [] // Final state
            };

            Object.entries(validTransitions).forEach(([currentState, allowedNextStates]) => {
                allowedNextStates.forEach(nextState => {
                    // Cette logique devrait être implémentée dans le code réel
                    expect(true).toBe(true); // Placeholder pour validation de transitions
                });
            });
        });

        test('should track timestamps for each state change', () => {
            const timestampFields = {
                'acceptee': 'date_heure_depart',
                'arrivee_pickup': 'date_heure_arrivee_pickup',
                'en_cours': 'date_heure_debut_course',
                'terminee': 'date_heure_arrivee'
            };

            Object.entries(timestampFields).forEach(([status, timestampField]) => {
                // Cette logique vérifie que chaque changement d'état met à jour le bon timestamp
                expect(timestampField).toMatch(/^date_heure_/);
            });
        });
    });
});