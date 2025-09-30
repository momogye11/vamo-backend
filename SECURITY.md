# 🔐 Guide de Sécurité - Vamo Backend

Ce guide détaille toutes les mesures de sécurité implémentées dans le backend Vamo et les bonnes pratiques à suivre.

## 📋 Vue d'ensemble

### Architecture de sécurité
- **Validation des inputs** : Joi pour validation robuste des données
- **Rate limiting** : Protection contre DDoS et attaques par force brute
- **Chiffrement** : bcrypt + crypto pour données sensibles
- **Authentification** : JWT avec refresh tokens
- **Logging sécurisé** : Winston avec masquage des données sensibles
- **Headers sécurisés** : Helmet.js pour protection OWASP

### Technologies utilisées
- **Joi** : Validation des schémas de données
- **express-rate-limit** : Limitation du taux de requêtes
- **bcryptjs** : Hachage sécurisé des mots de passe
- **jsonwebtoken** : Gestion des tokens JWT
- **helmet** : Sécurisation des headers HTTP
- **winston** : Logging avancé et sécurisé
- **crypto** (Node.js) : Chiffrement des données sensibles

---

## 🚀 Installation et Configuration

### 1. Installation des dépendances de sécurité

```bash
cd vamo-backend
npm install joi express-rate-limit helmet bcryptjs jsonwebtoken express-validator morgan winston
```

### 2. Variables d'environnement de sécurité

Créer/modifier le fichier `.env` :

```env
# JWT Configuration
JWT_SECRET=votre-cle-jwt-super-secrete-256-bits-minimum
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_EXPIRES_IN=7d

# Chiffrement
ENCRYPTION_KEY=votre-cle-chiffrement-32-bytes-hex
BCRYPT_ROUNDS=12

# Session
SESSION_SECRET=votre-secret-session-unique

# Environnement
NODE_ENV=production
LOG_LEVEL=info

# Rate Limiting (optionnel, valeurs par défaut disponibles)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000
```

### 3. Migration vers le serveur sécurisé

**Option 1 : Remplacer le serveur existant**
```bash
# Sauvegarder l'ancien serveur
mv index.js index-old.js

# Utiliser la version sécurisée
mv index-secure.js index.js

# Redémarrer le serveur
npm start
```

**Option 2 : Test en parallèle**
```bash
# Démarrer la version sécurisée sur un autre port
PORT=5002 node index-secure.js
```

---

## 🛡️ Fonctionnalités de Sécurité

### 1. Validation des Inputs (Joi)

**Schémas de validation automatique** :
- ✅ Numéros de téléphone sénégalais (+221XXXXXXXXX)
- ✅ Codes OTP (4 chiffres)
- ✅ Coordonnées GPS valides
- ✅ Formats email RFC compliant
- ✅ Noms avec caractères accentués français
- ✅ Plaques d'immatriculation sénégalaises

**Exemple d'utilisation** :
```javascript
// Dans une route
app.post('/api/send-otp', 
    validateInput('sendOtp'), // Validation automatique
    async (req, res) => {
        // req.body est automatiquement validé et nettoyé
        const { phone } = req.body;
        // ...
    }
);
```

**Protection contre** :
- Injections SQL
- Attaques XSS
- Données malformées
- Débordements de buffer

### 2. Rate Limiting

**Limites configurées** :

| Endpoint | Fenêtre | Max Requêtes | Protection |
|----------|---------|--------------|------------|
| Général | 15 min | 1000 | DDoS générale |
| Authentification | 15 min | 10 | Brute force |
| OTP Envoi | 10 min | 5 | Spam SMS |
| OTP Vérification | 5 min | 10 | Brute force OTP |
| Création course | 5 min | 20 | Spam courses |
| Actions chauffeur | 1 min | 60 | Actions rapides |
| Position GPS | 1 min | 120 | Spam position |
| Upload fichiers | 15 min | 10 | Spam uploads |

**Réponses automatiques** :
```json
{
    "success": false,
    "error": "Trop de requêtes, veuillez réessayer plus tard",
    "code": "RATE_LIMIT_EXCEEDED",
    "retryAfter": 900
}
```

### 3. Chiffrement et Hachage

**Mots de passe** (bcrypt avec 12 rounds) :
```javascript
const hashedPassword = await encryption.hashPassword(password);
const isValid = await encryption.verifyPassword(password, hashedPassword);
```

**Données sensibles** (AES-256-GCM) :
```javascript
const encrypted = encryption.encrypt(sensitiveData);
const decrypted = encryption.decrypt(encrypted);
```

**Tokens sécurisés** :
```javascript
const secureToken = encryption.generateSecureToken(32); // 256 bits
```

### 4. Authentification JWT

**Génération de tokens** :
```javascript
const accessToken = JWTManager.generateAccessToken({
    userId: user.id,
    userType: 'client',
    phone: user.phone
});

const refreshToken = JWTManager.generateRefreshToken({
    userId: user.id
});
```

**Middleware d'authentification** :
```javascript
app.get('/api/protected', 
    authenticateToken, // Vérification JWT automatique
    (req, res) => {
        // req.user contient les données décodées du token
        res.json({ user: req.user });
    }
);
```

**Gestion des rôles** :
```javascript
app.post('/api/admin-only',
    authenticateToken,
    requireRole(['admin']), // Restriction par rôle
    (req, res) => {
        // Seuls les admins peuvent accéder
    }
);
```

### 5. Logging Sécurisé

**Automatique pour toutes les actions** :
- 🔍 Tentatives d'authentification
- 📝 Génération et vérification OTP
- 🚗 Acceptation/annulation de courses
- 💰 Transactions de paiement
- ⚠️ Détection d'activités suspectes
- 🚫 Dépassements de rate limit

**Masquage automatique des données sensibles** :
```javascript
// Avant logging (automatique)
{
    phone: '+221781234567',
    otp: '1234',
    password: 'secret123'
}

// Après masquage
{
    phone: '+221****67',
    otp: '***MASKED***',
    password: '***MASKED***'
}
```

**Fichiers de logs** :
- `logs/security-events.log` : Événements de sécurité
- `logs/error.log` : Erreurs système
- `logs/combined.log` : Logs généraux

### 6. Protection Headers (Helmet)

**Headers automatiquement configurés** :
- ✅ Content Security Policy (CSP)
- ✅ HTTP Strict Transport Security (HSTS)
- ✅ X-Content-Type-Options: nosniff
- ✅ X-Frame-Options: DENY
- ✅ X-XSS-Protection: 1; mode=block
- ✅ Referrer-Policy: same-origin

---

## 🔒 Utilisation des Middlewares

### Application automatique par endpoint

```javascript
const { applyMiddlewares } = require('./middleware');

// Authentification OTP avec protection complète
app.post('/api/send-otp', 
    ...applyMiddlewares('auth', 'sendOtp'),
    // Votre contrôleur ici
);

// Course avec validation et authentification
app.post('/api/trips/accept',
    ...applyMiddlewares('ride', 'accept'),
    // Votre contrôleur ici
);
```

### Middlewares individuels

```javascript
const { 
    validateInput, 
    authenticateToken, 
    requireRole, 
    SecurityEvents 
} = require('./middleware');

// Validation seule
app.post('/api/custom', validateInput('createClient'), controller);

// Authentification seule
app.get('/api/protected', authenticateToken, controller);

// Combinaison personnalisée
app.post('/api/admin',
    authenticateToken,
    requireRole(['admin']),
    validateInput('adminAction'),
    controller
);
```

---

## 📊 Monitoring et Alertes

### Événements loggés automatiquement

```javascript
// Authentification
SecurityEvents.logAuthentication(req, success, { method: 'OTP' });

// Génération OTP
SecurityEvents.logOTPGeneration(req, phone, success);

// Activité suspecte
SecurityEvents.logSuspiciousActivity(req, 'MULTIPLE_FAILED_LOGINS');

// Accès aux données
SecurityEvents.logDataAccess(req, 'client', 'CREATE', success);
```

### Surveillance en temps réel

**Commandes utiles** :
```bash
# Surveiller les logs de sécurité
tail -f logs/security-events.log | jq '.'

# Filtrer les erreurs
grep "ERROR" logs/combined.log

# Surveiller les rate limits
grep "RATE_LIMIT_EXCEEDED" logs/security-events.log
```

---

## 🚨 Détection d'Attaques

### Patterns automatiquement détectés

Le système détecte automatiquement :
- ✅ Scripts JavaScript (`<script`, `eval(`, `exec(`)
- ✅ Injections SQL (`union select`, `drop table`)
- ✅ Traversée de dossiers (`../`, `..\\`)
- ✅ Vol de cookies (`document.cookie`)
- ✅ Tentatives XSS multiples

**Réponse automatique** :
```json
{
    "success": false,
    "error": "Requête suspecte détectée",
    "code": "SUSPICIOUS_REQUEST"
}
```

### Actions lors de détection

1. **Logging immédiat** dans `security-events.log`
2. **Blocage de la requête** avec code 400
3. **Alerte console** avec détails IP/User-Agent
4. **Compteurs internes** pour détection de patterns

---

## 🔧 Configuration Avancée

### Personnalisation des rate limits

```javascript
const customLimiter = createCustomLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requêtes max
    message: {
        success: false,
        error: 'Limite personnalisée atteinte',
        code: 'CUSTOM_LIMIT'
    }
});

app.use('/api/special', customLimiter, router);
```

### Bypass en développement

```javascript
// Header spécial pour bypass en dev
// X-Bypass-Rate-Limit: development
```

### Configuration CORS sécurisée

```javascript
// Origines autorisées (configurables)
const allowedOrigins = [
    'http://localhost:19006', // Expo dev
    'https://vamo-app.com',   // Production
    'capacitor://localhost'   // Mobile
];
```

---

## 🧪 Tests de Sécurité

### Tests d'intégration

```bash
# Lancer les tests de sécurité
npm run test:security

# Tester les rate limits
npm run test:rate-limits

# Tester la validation
npm run test:validation
```

### Tests manuels

**Rate limiting** :
```bash
# Tester limite OTP
for i in {1..10}; do
    curl -X POST http://localhost:5001/api/send-otp \
         -H "Content-Type: application/json" \
         -d '{"phone":"+221781234567"}'
done
```

**Validation des inputs** :
```bash
# Tester injection SQL
curl -X POST http://localhost:5001/api/send-otp \
     -H "Content-Type: application/json" \
     -d '{"phone":"' OR 1=1 --"}'
```

**Authentification JWT** :
```bash
# Tester token invalide
curl -X GET http://localhost:5001/api/protected \
     -H "Authorization: Bearer invalid-token"
```

---

## 📈 Métriques de Sécurité

### Dashboard de sécurité

Le système génère automatiquement des métriques :

```javascript
// Exemple de métriques disponibles
{
    "security_events": {
        "authentication_attempts": 1250,
        "authentication_failures": 45,
        "otp_generated": 890,
        "rate_limits_exceeded": 23,
        "suspicious_activities": 5,
        "successful_logins": 1205
    },
    "rate_limiting": {
        "blocked_requests": 156,
        "top_blocked_ips": [
            "192.168.1.100",
            "10.0.0.50"
        ]
    },
    "validation_errors": {
        "invalid_phone_formats": 78,
        "malformed_data": 34,
        "suspicious_patterns": 12
    }
}
```

---

## 🚀 Déploiement Sécurisé

### Variables d'environnement de production

```env
NODE_ENV=production
JWT_SECRET=votre-cle-ultra-secrete-production-256-bits
ENCRYPTION_KEY=votre-cle-chiffrement-production-32-bytes
SESSION_SECRET=votre-secret-session-production
LOG_LEVEL=info
```

### Checklist de déploiement

- [ ] **Variables d'environnement** configurées et sécurisées
- [ ] **HTTPS activé** avec certificats valides
- [ ] **Rate limiting** testé et configuré
- [ ] **Logs sécurisés** configurés avec rotation
- [ ] **Base de données** sécurisée (utilisateur dédié, permissions limitées)
- [ ] **Monitoring** configuré (alertes rate limit, erreurs)
- [ ] **Firewall** configuré (ports nécessaires uniquement)
- [ ] **Tests de sécurité** passés avec succès

### Configuration reverse proxy (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name api.vamo-app.com;
    
    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubdomains";
    
    # Rate limiting (niveau Nginx)
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;
    
    location / {
        proxy_pass http://localhost:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 🆘 Dépannage Sécurité

### Problèmes courants

#### 1. Rate limit trop strict
```javascript
// Solution temporaire : augmenter les limites en dev
if (process.env.NODE_ENV === 'development') {
    // Augmenter les limites
}
```

#### 2. Validation trop stricte
```javascript
// Vérifier les schémas Joi
const schema = validationSchemas.sendOtp;
const { error } = schema.validate(testData);
console.log(error.details);
```

#### 3. JWT expiré trop rapidement
```javascript
// Vérifier la configuration
console.log('JWT expires in:', process.env.JWT_EXPIRES_IN);
```

#### 4. Logs trop verbeux
```env
# Réduire le niveau de log
LOG_LEVEL=warn
```

### Debug des middlewares

```javascript
// Activer le debug des middlewares
app.use((req, res, next) => {
    console.log('🔍 Request:', req.method, req.path);
    console.log('🔍 Headers:', req.headers);
    console.log('🔍 Body:', req.body);
    next();
});
```

---

## 📚 Ressources et Bonnes Pratiques

### Références sécurité

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
- [JWT Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)

### Bonnes pratiques implémentées

1. ✅ **Validation stricte** de tous les inputs
2. ✅ **Rate limiting** sur tous les endpoints sensibles
3. ✅ **Logging sécurisé** avec masquage des données
4. ✅ **Chiffrement** des données sensibles
5. ✅ **Authentification** JWT avec expiration
6. ✅ **Headers sécurisés** OWASP compliant
7. ✅ **Détection d'attaques** automatique
8. ✅ **Monitoring** en temps réel
9. ✅ **Tests de sécurité** automatisés
10. ✅ **Configuration** centralisée et sécurisée

### Prochaines améliorations

- [ ] **2FA (Two-Factor Authentication)** pour les comptes admin
- [ ] **Chiffrement de bout en bout** pour les messages
- [ ] **Audit de sécurité** automatisé mensuel
- [ ] **Honeypot** pour attirer les attaquants
- [ ] **Geoblocking** pour limiter par pays
- [ ] **Machine Learning** pour détection d'anomalies

---

## ✅ Checklist de Sécurité

Avant la mise en production, vérifier :

### Configuration
- [ ] Variables d'environnement sécurisées
- [ ] Clés JWT/chiffrement générées aléatoirement
- [ ] HTTPS configuré avec certificats valides
- [ ] Rate limiting configuré et testé

### Code
- [ ] Validation des inputs sur tous les endpoints
- [ ] Authentification sur les routes protégées
- [ ] Logging sécurisé activé
- [ ] Gestion d'erreurs sans exposition de données

### Infrastructure
- [ ] Base de données sécurisée
- [ ] Firewall configuré
- [ ] Monitoring et alertes configurés
- [ ] Sauvegardes chiffrées

### Tests
- [ ] Tests de sécurité passés
- [ ] Audit de sécurité effectué
- [ ] Tests de charge avec rate limiting
- [ ] Tests d'intrusion basiques

---

**✅ Système de sécurité Vamo opérationnel !**  
Backend protégé contre les principales vulnérabilités OWASP avec monitoring en temps réel et logging sécurisé.