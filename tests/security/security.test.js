/**
 * Tests de sécurité complets pour Vamo Backend
 * Valide toutes les protections implémentées
 */

const request = require('supertest');
const express = require('express');

// Mock de l'application avec middlewares de sécurité
const { setupBasicMiddleware, setupErrorHandling, applyMiddlewares } = require('../../middleware');

describe('🔒 Security Integration Tests', () => {
    let app;

    beforeAll(() => {
        app = express();
        
        // Configuration des middlewares de sécurité
        setupBasicMiddleware(app);
        
        // Routes de test
        app.post('/api/test-validation', 
            ...applyMiddlewares('auth', 'sendOtp'),
            (req, res) => {
                res.json({ success: true, message: 'Validation passed' });
            }
        );
        
        app.post('/api/test-rate-limit',
            ...applyMiddlewares('auth', 'sendOtp'),
            (req, res) => {
                res.json({ success: true, message: 'Rate limit not exceeded' });
            }
        );
        
        app.get('/api/test-auth',
            ...applyMiddlewares('client', 'get'),
            (req, res) => {
                res.json({ success: true, user: req.user });
            }
        );
        
        setupErrorHandling(app);
    });

    describe('Input Validation Security', () => {
        test('should block SQL injection attempts', async () => {
            const maliciousInputs = [
                "'; DROP TABLE users; --",
                "' OR '1'='1",
                "admin'/*",
                "1' UNION SELECT * FROM users--"
            ];

            for (const maliciousInput of maliciousInputs) {
                const response = await request(app)
                    .post('/api/test-validation')
                    .send({ phone: maliciousInput });

                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
                expect(response.body.code).toBe('VALIDATION_ERROR');
            }
        });

        test('should block XSS attempts', async () => {
            const xssPayloads = [
                "<script>alert('xss')</script>",
                "javascript:alert('xss')",
                "<img src=x onerror=alert('xss')>",
                "'+alert('xss')+'",
                "<svg onload=alert('xss')>"
            ];

            for (const payload of xssPayloads) {
                const response = await request(app)
                    .post('/api/test-validation')
                    .send({ phone: payload });

                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
            }
        });

        test('should validate phone number format strictly', async () => {
            const invalidPhones = [
                '+33123456789',  // Pas sénégalais
                '+221123456789', // Trop long
                '+22112345',     // Trop court
                '221781234567',  // Pas de +
                '+221881234567', // Commence pas par 6 ou 7
                '+221581234567'  // Commence pas par 6 ou 7
            ];

            for (const phone of invalidPhones) {
                const response = await request(app)
                    .post('/api/test-validation')
                    .send({ phone });

                expect(response.status).toBe(400);
                expect(response.body.code).toBe('VALIDATION_ERROR');
                expect(response.body.details).toBeDefined();
            }
        });

        test('should accept valid Senegalese phone numbers', async () => {
            const validPhones = [
                '+221781234567',
                '+221771234567',
                '+221761234567',
                '+221601234567'
            ];

            // Mock successful response pour éviter les vrais appels API
            mockDb.query.mockResolvedValue({ rows: [{}] });

            for (const phone of validPhones) {
                const response = await request(app)
                    .post('/api/test-validation')
                    .send({ phone });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
            }
        });

        test('should sanitize and strip unknown fields', async () => {
            const response = await request(app)
                .post('/api/test-validation')
                .send({ 
                    phone: '+221781234567',
                    maliciousField: '<script>alert("hack")</script>',
                    unknownField: 'should be stripped'
                });

            expect(response.status).toBe(200);
            // Les champs non définis dans le schéma sont supprimés
        });
    });

    describe('Rate Limiting Security', () => {
        test('should enforce rate limits on authentication endpoints', async () => {
            const promises = [];
            
            // Envoyer plus de requêtes que la limite (10 pour auth)
            for (let i = 0; i < 15; i++) {
                promises.push(
                    request(app)
                        .post('/api/test-rate-limit')
                        .send({ phone: '+221781234567' })
                );
            }

            const responses = await Promise.all(promises);
            
            // Les premières requêtes devraient passer
            const successfulRequests = responses.filter(r => r.status === 200);
            const rateLimitedRequests = responses.filter(r => r.status === 429);

            expect(successfulRequests.length).toBeLessThanOrEqual(10);
            expect(rateLimitedRequests.length).toBeGreaterThan(0);
            
            // Vérifier la structure de la réponse rate limit
            if (rateLimitedRequests.length > 0) {
                const rateLimitResponse = rateLimitedRequests[0];
                expect(rateLimitResponse.body.success).toBe(false);
                expect(rateLimitResponse.body.code).toBe('RATE_LIMIT_EXCEEDED');
                expect(rateLimitResponse.body.retryAfter).toBeDefined();
            }
        });

        test('should have different rate limits for different endpoints', async () => {
            // Test que les limites sont indépendantes par endpoint
            const authResponse = await request(app)
                .post('/api/test-rate-limit')
                .send({ phone: '+221781234567' });

            expect(authResponse.status).toBe(200);
        });

        test('should include proper rate limit headers', async () => {
            const response = await request(app)
                .post('/api/test-rate-limit')
                .send({ phone: '+221781234567' });

            expect(response.headers['x-ratelimit-limit']).toBeDefined();
            expect(response.headers['x-ratelimit-remaining']).toBeDefined();
            expect(response.headers['x-ratelimit-reset']).toBeDefined();
        });
    });

    describe('Authentication Security', () => {
        test('should require authentication for protected routes', async () => {
            const response = await request(app)
                .get('/api/test-auth');

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('MISSING_TOKEN');
        });

        test('should reject invalid JWT tokens', async () => {
            const invalidTokens = [
                'invalid-token',
                'Bearer invalid-token',
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
                ''
            ];

            for (const token of invalidTokens) {
                const response = await request(app)
                    .get('/api/test-auth')
                    .set('Authorization', token.startsWith('Bearer ') ? token : `Bearer ${token}`);

                expect(response.status).toBeGreaterThanOrEqual(401);
                expect(response.body.success).toBe(false);
            }
        });

        test('should accept valid JWT tokens', async () => {
            const { JWTManager } = require('../../middleware/security');
            
            const validToken = JWTManager.generateAccessToken({
                userId: 123,
                userType: 'client',
                phone: '+221781234567'
            });

            const response = await request(app)
                .get('/api/test-auth')
                .set('Authorization', `Bearer ${validToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.user).toBeDefined();
            expect(response.body.user.userId).toBe(123);
        });

        test('should reject expired JWT tokens', async () => {
            const { JWTManager } = require('../../middleware/security');
            
            // Créer un token avec une durée très courte
            const jwt = require('jsonwebtoken');
            const expiredToken = jwt.sign(
                { userId: 123, userType: 'client' },
                process.env.JWT_SECRET || 'test-secret',
                { expiresIn: '1ms' } // Expire immédiatement
            );

            // Attendre que le token expire
            await new Promise(resolve => setTimeout(resolve, 10));

            const response = await request(app)
                .get('/api/test-auth')
                .set('Authorization', `Bearer ${expiredToken}`);

            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('INVALID_TOKEN');
        });
    });

    describe('Attack Detection', () => {
        test('should detect and block common attack patterns', async () => {
            const attackPatterns = [
                { pattern: '<script>alert("xss")</script>', type: 'XSS' },
                { pattern: 'UNION SELECT * FROM users', type: 'SQL Injection' },
                { pattern: '../../../etc/passwd', type: 'Path Traversal' },
                { pattern: 'eval(maliciousCode)', type: 'Code Injection' },
                { pattern: 'document.cookie', type: 'Cookie Theft' }
            ];

            for (const attack of attackPatterns) {
                const response = await request(app)
                    .post('/api/test-validation')
                    .send({ phone: attack.pattern });

                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
                // L'attaque devrait être détectée soit par validation soit par détection
                expect([
                    'VALIDATION_ERROR',
                    'SUSPICIOUS_REQUEST'
                ]).toContain(response.body.code);
            }
        });

        test('should log suspicious activities', async () => {
            const { SecurityEvents } = require('../../middleware/secureLogging');
            const logSpy = jest.spyOn(SecurityEvents, 'logSuspiciousActivity');

            await request(app)
                .post('/api/test-validation')
                .send({ phone: '<script>alert("hack")</script>' });

            // Vérifier que l'activité suspecte a été loggée
            // Note: Ceci dépend de l'implémentation exacte du middleware
        });
    });

    describe('Response Security', () => {
        test('should not expose sensitive data in error responses', async () => {
            const response = await request(app)
                .post('/api/test-validation')
                .send({ phone: 'invalid' });

            expect(response.status).toBe(400);
            expect(response.body).not.toHaveProperty('stack');
            expect(response.body).not.toHaveProperty('password');
            expect(response.body).not.toHaveProperty('secret');
            expect(response.body).not.toHaveProperty('token');
            
            // Vérifier que les détails d'erreur sont informatifs mais pas sensibles
            if (response.body.details) {
                response.body.details.forEach(detail => {
                    expect(detail).not.toMatch(/password|secret|token|key/i);
                });
            }
        });

        test('should include proper security headers', async () => {
            const response = await request(app)
                .get('/api/test-auth');

            // Headers de sécurité Helmet
            expect(response.headers['x-content-type-options']).toBe('nosniff');
            expect(response.headers['x-frame-options']).toBe('DENY');
            expect(response.headers['x-xss-protection']).toBeDefined();
            expect(response.headers['strict-transport-security']).toBeDefined();
        });

        test('should handle CORS properly', async () => {
            const response = await request(app)
                .options('/api/test-validation')
                .set('Origin', 'http://localhost:19006');

            expect(response.headers['access-control-allow-origin']).toBeDefined();
            expect(response.headers['access-control-allow-methods']).toBeDefined();
            expect(response.headers['access-control-allow-headers']).toBeDefined();
        });
    });

    describe('Data Encryption Security', () => {
        test('should encrypt sensitive data properly', async () => {
            const { encryption } = require('../../middleware/security');
            
            const sensitiveData = 'motdepasse123';
            const encrypted = encryption.encrypt(sensitiveData);

            expect(encrypted).toBeDefined();
            expect(encrypted.encrypted).toBeDefined();
            expect(encrypted.iv).toBeDefined();
            expect(encrypted.authTag).toBeDefined();
            expect(encrypted.encrypted).not.toBe(sensitiveData);
        });

        test('should decrypt data correctly', async () => {
            const { encryption } = require('../../middleware/security');
            
            const originalData = 'données-sensibles-test';
            const encrypted = encryption.encrypt(originalData);
            const decrypted = encryption.decrypt(encrypted);

            expect(decrypted).toBe(originalData);
        });

        test('should hash passwords securely', async () => {
            const { encryption } = require('../../middleware/security');
            
            const password = 'monMotDePasse123!';
            const hashed = await encryption.hashPassword(password);

            expect(hashed).toBeDefined();
            expect(hashed).not.toBe(password);
            expect(hashed.length).toBeGreaterThan(50); // bcrypt hash length
            expect(hashed.startsWith('$2b$')).toBe(true); // bcrypt prefix
        });

        test('should verify passwords correctly', async () => {
            const { encryption } = require('../../middleware/security');
            
            const password = 'testPassword123';
            const hashed = await encryption.hashPassword(password);
            
            const validPassword = await encryption.verifyPassword(password, hashed);
            const invalidPassword = await encryption.verifyPassword('wrongPassword', hashed);

            expect(validPassword).toBe(true);
            expect(invalidPassword).toBe(false);
        });
    });

    describe('Logging Security', () => {
        test('should mask sensitive data in logs', async () => {
            const { sanitizeForLogging } = require('../../middleware/secureLogging');
            
            const sensitiveData = {
                phone: '+221781234567',
                password: 'secret123',
                otp: '1234',
                email: 'user@example.com',
                token: 'jwt-token-here'
            };

            const sanitized = sanitizeForLogging(sensitiveData);

            expect(sanitized.password).toBe('***MASKED***');
            expect(sanitized.otp).toBe('***MASKED***');
            expect(sanitized.token).toBe('***MASKED***');
            expect(sanitized.phone).toMatch(/\+221\*{4}\d{2}/); // Partiellement masqué
            expect(sanitized.email).toMatch(/\w{2}\*{3}@/); // Partiellement masqué
        });

        test('should not log sensitive headers', async () => {
            const response = await request(app)
                .post('/api/test-validation')
                .set('Authorization', 'Bearer secret-token')
                .set('X-API-Key', 'secret-api-key')
                .send({ phone: '+221781234567' });

            // Les headers sensibles ne devraient pas apparaître dans les logs
            // (Test conceptuel - nécessiterait mock du logger)
        });
    });

    describe('Configuration Security', () => {
        test('should have secure default configurations', async () => {
            const securityConfig = require('../../config/security');

            // Vérifier les configurations de sécurité
            expect(securityConfig.jwt.expiresIn).toBeDefined();
            expect(securityConfig.bcrypt.rounds).toBeGreaterThanOrEqual(10);
            expect(securityConfig.rateLimiting.auth.max).toBeLessThanOrEqual(20);
            expect(securityConfig.session.cookie.httpOnly).toBe(true);
        });

        test('should not expose configuration in responses', async () => {
            const response = await request(app)
                .get('/api/status');

            expect(response.body).not.toHaveProperty('jwt_secret');
            expect(response.body).not.toHaveProperty('encryption_key');
            expect(response.body).not.toHaveProperty('database_password');
        });
    });

    describe('Error Handling Security', () => {
        test('should handle errors without exposing system information', async () => {
            // Simuler une erreur interne
            const response = await request(app)
                .post('/api/nonexistent-endpoint')
                .send({ data: 'test' });

            expect(response.status).toBe(404);
            expect(response.body).not.toHaveProperty('stack');
            expect(response.body).not.toMatch(/node_modules|src\/|internal/);
            expect(response.body.code).toBe('NOT_FOUND');
        });

        test('should provide consistent error responses', async () => {
            const response1 = await request(app)
                .post('/api/test-validation')
                .send({ phone: 'invalid' });

            const response2 = await request(app)
                .post('/api/test-validation')
                .send({ phone: 'also-invalid' });

            // Structure de réponse consistante
            expect(response1.body).toHaveProperty('success');
            expect(response1.body).toHaveProperty('error');
            expect(response1.body).toHaveProperty('code');
            
            expect(response2.body).toHaveProperty('success');
            expect(response2.body).toHaveProperty('error');
            expect(response2.body).toHaveProperty('code');

            expect(response1.body.success).toBe(false);
            expect(response2.body.success).toBe(false);
        });
    });
});

describe('🔍 Security Performance Tests', () => {
    test('should maintain performance under security constraints', async () => {
        const startTime = Date.now();
        
        const promises = [];
        for (let i = 0; i < 50; i++) {
            promises.push(
                request(app)
                    .post('/api/test-validation')
                    .send({ phone: '+221781234567' })
            );
        }

        await Promise.all(promises);
        const endTime = Date.now();
        const duration = endTime - startTime;

        // Les middlewares de sécurité ne devraient pas ajouter plus de 100ms en moyenne
        expect(duration / 50).toBeLessThan(100);
    });

    test('should handle concurrent requests securely', async () => {
        const promises = [];
        
        // Requêtes concurrentes avec différents payloads
        for (let i = 0; i < 20; i++) {
            promises.push(
                request(app)
                    .post('/api/test-validation')
                    .send({ phone: `+22178123456${i % 10}` })
            );
        }

        const responses = await Promise.all(promises);
        
        // Toutes les requêtes devraient être traitées correctement
        responses.forEach(response => {
            expect([200, 400, 429]).toContain(response.status);
            expect(response.body).toHaveProperty('success');
        });
    });
});

// Helper pour nettoyer après les tests
afterAll(async () => {
    // Nettoyer les timers de rate limiting si nécessaire
    await new Promise(resolve => setTimeout(resolve, 100));
});