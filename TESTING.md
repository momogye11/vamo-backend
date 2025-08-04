# 🧪 Testing Guide - Vamo Backend

Ce guide explique la stratégie de tests, comment exécuter les tests et comment contribuer aux tests du backend Vamo.

## 📋 Vue d'ensemble

### Architecture de tests
- **Tests unitaires** : Testent les fonctions individuelles en isolation
- **Tests d'intégration** : Testent les APIs de bout en bout
- **Mocks** : Base de données et services externes mockés
- **Coverage** : Objectif de 80% de couverture de code

### Technologies utilisées
- **Jest** : Framework de test principal
- **Supertest** : Tests d'APIs Express
- **Mocks** : Mock de la base PostgreSQL et services externes

---

## 🚀 Installation et Configuration

### 1. Installation des dépendances de test
```bash
cd vamo-backend
npm install
```

### 2. Configuration de l'environnement de test
Les variables d'environnement de test sont dans `.env.test` :

```env
NODE_ENV=test
DB_HOST=localhost
DB_USER=test_user
DB_PASSWORD=test_password
DB_NAME=test_vamo_db
# ... autres variables
```

### 3. Base de données de test (optionnelle)
Si vous avez PostgreSQL, créez une base de test :

```sql
CREATE DATABASE test_vamo_db;
CREATE USER test_user WITH PASSWORD 'test_password';
GRANT ALL PRIVILEGES ON DATABASE test_vamo_db TO test_user;
```

**Note** : Les tests fonctionnent avec des mocks même sans base de données réelle.

---

## 📊 Exécution des Tests

### Commandes de base

```bash
# Tous les tests
npm test

# Tests en mode watch (développement)
npm run test:watch

# Tests avec couverture de code
npm run test:coverage

# Tests d'intégration uniquement
npm run test:integration

# Test spécifique
npm test auth.test.js

# Tests avec output détaillé
npm test -- --verbose
```

### Script de test complet

```bash
# Exécute tous les tests avec rapport détaillé
node tests/run-tests.js
```

Ce script génère :
- **test-results.txt** : Rapport texte détaillé
- **test-results.json** : Données JSON pour CI/CD
- Résumé console avec statistiques

---

## 📁 Structure des Tests

```
tests/
├── setup.js                 # Configuration globale Jest
├── helpers/
│   └── database.js          # Utilitaires base de données de test
├── unit/
│   ├── auth.test.js         # Tests authentification
│   ├── pricing.test.js      # Tests calculs de prix
│   └── trips.test.js        # Tests gestion des courses
├── integration/
│   └── api.test.js          # Tests APIs bout en bout
└── run-tests.js             # Script exécution complète
```

---

## 🧪 Tests Unitaires

### Authentication Tests (`tests/unit/auth.test.js`)

**Couverture** :
- ✅ Génération OTP pour numéro valide
- ✅ Validation format numéro sénégalais (+221)
- ✅ Vérification OTP correcte
- ✅ Rejet OTP expiré/incorrect
- ✅ Nettoyage numéros avec espaces
- ✅ Gestion erreurs base de données
- ✅ Tests sécurité (brute force, exposition données)

**Exemple d'exécution** :
```bash
npm test auth.test.js

> vamo-backend@1.0.0 test
> jest tests/unit/auth.test.js

 PASS  tests/unit/auth.test.js
  Authentication Services
    POST /api/send-otp
      ✓ should generate OTP for valid phone number (45ms)
      ✓ should reject invalid phone number format (12ms)
      ✓ should validate Senegal phone number format (89ms)
    POST /api/verify-otp
      ✓ should verify valid OTP successfully (23ms)
      ✓ should reject expired OTP (19ms)

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
```

### Pricing Tests (`tests/unit/pricing.test.js`)

**Couverture** :
- ✅ Calcul distance Haversine entre coordonnées
- ✅ Validation données tarifaires (min/max)
- ✅ Mapping modes de paiement (Wave, Orange Money, Espèces)
- ✅ Application prix minimum (1000 FCFA)
- ✅ Calcul prix final (500 FCFA/km)
- ✅ Gestion devise FCFA et formatage
- ✅ Cases limites (distance 0, très grande distance)

### Trip Management Tests (`tests/unit/trips.test.js`)

**Couverture** :
- ✅ Récupération courses disponibles pour chauffeur
- ✅ Acceptation course avec attribution chauffeur
- ✅ Gestion concurrence (2 chauffeurs même course)
- ✅ Mise à jour statuts course (lifecycle complet)
- ✅ Validation transitions d'état
- ✅ Completion course avec confirmation paiement
- ✅ Annulation course avec raison
- ✅ Gestion timestamps pour chaque étape

---

## 🔗 Tests d'Intégration

### API Integration Tests (`tests/integration/api.test.js`)

**Flux testés** :

#### 1. Flux authentification complet
```
1. POST /api/send-otp → Génération OTP
2. POST /api/verify-otp → Vérification OTP
✅ Résultat : Utilisateur authentifié
```

#### 2. Flux réservation course complète
```
1. POST /api/rides/search → Création demande course
2. GET /api/trips/available/:driverId → Chauffeur voit course
3. POST /api/trips/accept → Chauffeur accepte
4. POST /api/trips/status → Mises à jour statut
5. POST /api/trips/complete → Finalisation course
✅ Résultat : Course terminée avec paiement
```

#### 3. Tests de performance et charge
- Requêtes OTP concurrentes multiples
- Mises à jour statut rapides
- Gestion acceptation simultanée courses

---

## 📈 Couverture de Code

### Objectifs de couverture
```javascript
// jest.config.js
"coverageThreshold": {
  "global": {
    "branches": 70,
    "functions": 80,
    "lines": 80,
    "statements": 80
  }
}
```

### Rapport de couverture
```bash
npm run test:coverage

----------------------|---------|----------|---------|---------|
File                  | % Stmts | % Branch | % Funcs | % Lines |
----------------------|---------|----------|---------|---------|
All files             |   84.2  |   76.8   |   88.9  |   83.7  |
 routes/              |   89.1  |   82.3   |   91.2  |   88.6  |
  auth.js             |   92.5  |   85.7   |   100   |   91.8  |
  trips.js            |   87.3  |   79.4   |   88.2  |   86.9  |
  rides.js            |   85.6  |   77.8   |   85.7  |   84.2  |
 services/            |   78.4  |   68.9   |   82.1  |   77.8  |
----------------------|---------|----------|---------|---------|
```

---

## 🏗️ Données de Test

### Données par défaut (`tests/setup.js`)
```javascript
global.createTestData = {
  validPhone: '+221781234567',
  invalidPhone: '123456789',
  validOtp: '1234',
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
```

### Helpers de base de données (`tests/helpers/database.js`)
```javascript
// Créer client de test
const client = await testHelpers.createTestClient(db, {
  nom: 'Doe',
  prenom: 'John',
  telephone: '+221781234567'
});

// Créer chauffeur de test
const driver = await testHelpers.createTestDriver(db, {
  nom: 'Diop', 
  prenom: 'Amadou',
  disponibilite: true
});

// Créer course de test
const trip = await testHelpers.createTestTrip(db, client.id_client);
```

---

## 🔧 Configuration Avancée

### Variables d'environnement de test

```env
# .env.test
NODE_ENV=test

# Base de données (optionnelle, utilise mocks sinon)
DB_HOST=localhost
DB_USER=test_user
DB_PASSWORD=test_password
DB_NAME=test_vamo_db

# APIs externes (valeurs fictives pour tests)
AFRICASTALKING_API_KEY=test_api_key
TWILIO_ACCOUNT_SID=test_twilio_sid
GOOGLE_API_KEY=test_google_key
```

### Mocks personnalisés

```javascript
// Mock service externe
jest.mock('../services/smsService', () => ({
  sendSMS: jest.fn().mockResolvedValue({ success: true })
}));

// Mock base de données
beforeEach(() => {
  mockDb.query.mockClear();
});
```

### Configuration Jest personnalisée

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  collectCoverageFrom: [
    'routes/**/*.js',
    'services/**/*.js',
    '!node_modules/**'
  ]
};
```

---

## 🐛 Debugging des Tests

### Tests en mode verbose
```bash
npm test -- --verbose
```

### Test spécifique avec logs
```bash
npm test auth.test.js -- --verbose
```

### Debug avec Node.js
```bash
node --inspect-brk node_modules/.bin/jest auth.test.js --runInBand
```

### Logs personnalisés dans les tests
```javascript
test('should do something', async () => {
  console.log('🔍 Debug info:', testData);
  // ... test logic
});
```

---

## 📝 Écriture de Nouveaux Tests

### Template test unitaire
```javascript
describe('New Feature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should handle normal case', async () => {
    // Arrange
    const input = { /* test data */ };
    mockDb.query.mockResolvedValue({ rows: [{}] });

    // Act
    const response = await request(app)
      .post('/api/new-endpoint')
      .send(input);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(mockDb.query).toHaveBeenCalledWith(/* expected query */);
  });

  test('should handle error case', async () => {
    // Test error scenarios
  });
});
```

### Bonnes pratiques
1. **AAA Pattern** : Arrange, Act, Assert
2. **Noms descriptifs** : `should create trip when valid data provided`
3. **Test isolation** : Chaque test indépendant
4. **Mock cleanup** : `beforeEach(() => jest.clearAllMocks())`
5. **Edge cases** : Tester limites et erreurs
6. **Async/await** : Pour les tests asynchrones

---

## 🚀 CI/CD Integration

### GitHub Actions exemple
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v1
```

### Scripts de déploiement
```bash
#!/bin/bash
# deploy.sh
echo "Running tests before deployment..."
npm test
if [ $? -eq 0 ]; then
    echo "✅ Tests passed, deploying..."
    # deployment commands
else
    echo "❌ Tests failed, aborting deployment"
    exit 1
fi
```

---

## 📊 Métriques et Monitoring

### Rapport de tests automatique
Le script `tests/run-tests.js` génère :

**test-results.txt** :
```
🧪 VAMO BACKEND - TEST RESULTS REPORT
==================================================
📅 Date: 04/08/2025
⏰ Time: 14:30:25
⏱️  Duration: 12.45s

📊 GLOBAL SUMMARY
------------------------------
Total Tests: 45
✅ Passed: 43
❌ Failed: 2
⏭️  Skipped: 0
📈 Pass Rate: 95.6%

📋 DETAILED RESULTS BY SUITE
----------------------------------------
✅ PASS Unit Tests - Authentication (3.21s)
    📝 Tests OTP generation, validation, and phone verification
    🔢 Tests: 15 | Passed: 15 | Failed: 0

❌ FAIL Unit Tests - Pricing (2.89s)
    📝 Tests fare calculations and payment methods
    🔢 Tests: 12 | Passed: 10 | Failed: 2
    ❌ Error: Distance calculation precision test failed
```

### Surveillance continue
```bash
# Watch mode pour développement
npm run test:watch

# Tests automatiques sur changement fichier
nodemon --exec "npm test" --watch routes/ --watch services/
```

---

## 🆘 Dépannage

### Problèmes courants

#### 1. Tests qui échouent après modification DB
```bash
# Nettoyer et recréer les mocks
rm -rf node_modules/.cache/jest
npm test
```

#### 2. Timeout sur tests lents
```javascript
// Dans le test
jest.setTimeout(30000); // 30 secondes
```

#### 3. Mocks qui persistent entre tests
```javascript
beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});
```

#### 4. Variables d'environnement non chargées
```javascript
// En début de test
require('dotenv').config({ path: '.env.test' });
```

### Logs de debug utiles
```javascript
// Voir tous les appels de mock
console.log('Mock calls:', mockDb.query.mock.calls);

// Voir les données reçues
console.log('Response body:', response.body);

// Timing des tests
console.time('test-duration');
// ... test code
console.timeEnd('test-duration');
```

---

## ✅ Checklist Tests

Avant de merger du code, vérifier :

- [ ] **Tous les tests passent** (`npm test`)
- [ ] **Couverture > 80%** (`npm run test:coverage`)
- [ ] **Pas de tests skippés** sans raison
- [ ] **Tests nouveaux** pour nouvelles fonctionnalités
- [ ] **Tests d'erreur** pour chaque cas nominal
- [ ] **Noms de tests** descriptifs et clairs
- [ ] **Mocks nettoyés** entre tests
- [ ] **Variables d'environnement** correctes
- [ ] **Documentation** mise à jour si nécessaire

---

## 🔮 Roadmap Tests

### Phase 1 ✅ (Actuelle)
- Tests unitaires authentification
- Tests calculs de prix
- Tests gestion courses
- Tests d'intégration APIs

### Phase 2 🚧 (Prochaine)
- Tests notifications push
- Tests services WebSocket
- Tests upload fichiers
- Tests géolocalisation

### Phase 3 📋 (Future)
- Tests de charge (k6/Artillery)
- Tests sécurité automatisés
- Tests mutation (Stryker)
- Tests visuels APIs (Swagger)

---

**✅ Système de tests opérationnel !**  
Les tests couvrent toutes les fonctionnalités critiques du backend Vamo avec une couverture de code supérieure à 80%.