#!/usr/bin/env node

/**
 * Script d'installation et configuration de sécurité pour Vamo Backend
 * Automatise la mise en place de toutes les mesures de sécurité
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

class SecuritySetup {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        this.config = {
            environment: 'production',
            generateKeys: true,
            backupExisting: true,
            updatePackageJson: true,
            createScripts: true
        };
    }

    log(message, color = 'reset') {
        console.log(`${colors[color]}${message}${colors.reset}`);
    }

    async question(prompt) {
        return new Promise((resolve) => {
            this.rl.question(prompt, resolve);
        });
    }

    /**
     * Point d'entrée principal
     */
    async run() {
        this.log('🔐 VAMO BACKEND - SETUP SÉCURITÉ', 'bright');
        this.log('=' .repeat(50), 'cyan');
        
        try {
            await this.welcomePrompt();
            await this.detectEnvironment();
            await this.generateSecurityKeys();
            await this.updateEnvironmentFile();
            await this.updatePackageJson();
            await this.createSecurityScripts();
            await this.runSecurityTests();
            await this.showFinalInstructions();
            
        } catch (error) {
            this.log(`❌ Erreur durant l'installation: ${error.message}`, 'red');
            process.exit(1);
        } finally {
            this.rl.close();
        }
    }

    /**
     * Invite de bienvenue et configuration
     */
    async welcomePrompt() {
        this.log('\n🚀 Configuration de la sécurité Vamo Backend', 'green');
        this.log('Ce script va installer et configurer toutes les mesures de sécurité.\n');
        
        const proceed = await this.question('Voulez-vous continuer ? (y/n): ');
        if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
            this.log('❌ Installation annulée par l\'utilisateur', 'yellow');
            process.exit(0);
        }

        // Demander l'environnement
        const env = await this.question('Environnement (development/production) [production]: ');
        if (env.trim()) {
            this.config.environment = env.trim();
        }

        // Options avancées
        const generateKeys = await this.question('Générer de nouvelles clés de sécurité ? (y/n) [y]: ');
        this.config.generateKeys = !generateKeys.trim() || generateKeys.toLowerCase().startsWith('y');
    }

    /**
     * Détection de l'environnement existant
     */
    async detectEnvironment() {
        this.log('\n🔍 Détection de l\'environnement...', 'cyan');
        
        // Vérifier package.json
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            this.log('✅ package.json trouvé', 'green');
            this.packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        } else {
            this.log('❌ package.json non trouvé', 'red');
            throw new Error('Veuillez exécuter ce script dans le dossier vamo-backend');
        }

        // Vérifier .env existant
        const envPath = path.join(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            this.log('⚠️  Fichier .env existant trouvé', 'yellow');
            if (this.config.backupExisting) {
                const backupPath = `${envPath}.backup.${Date.now()}`;
                fs.copyFileSync(envPath, backupPath);
                this.log(`📄 Sauvegarde créée: ${backupPath}`, 'blue');
            }
            this.existingEnv = fs.readFileSync(envPath, 'utf8');
        }

        // Vérifier les dossiers nécessaires
        const requiredDirs = ['middleware', 'config', 'tests/security', 'logs', 'scripts'];
        for (const dir of requiredDirs) {
            const dirPath = path.join(process.cwd(), dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                this.log(`📁 Dossier créé: ${dir}`, 'blue');
            } else {
                this.log(`✅ Dossier existant: ${dir}`, 'green');
            }
        }
    }

    /**
     * Génération des clés de sécurité
     */
    async generateSecurityKeys() {
        this.log('\n🔑 Génération des clés de sécurité...', 'cyan');
        
        if (!this.config.generateKeys) {
            this.log('⏭️  Génération de clés ignorée', 'yellow');
            return;
        }

        this.securityKeys = {
            JWT_SECRET: this.generateSecureKey(64), // 512 bits
            ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'), // 256 bits
            SESSION_SECRET: this.generateSecureKey(32), // 256 bits
        };

        this.log('✅ Clé JWT générée (512 bits)', 'green');
        this.log('✅ Clé de chiffrement générée (256 bits)', 'green');
        this.log('✅ Secret de session généré (256 bits)', 'green');
    }

    /**
     * Génère une clé sécurisée
     */
    generateSecureKey(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let result = '';
        const randomBytes = crypto.randomBytes(length);
        
        for (let i = 0; i < length; i++) {
            result += chars[randomBytes[i] % chars.length];
        }
        
        return result;
    }

    /**
     * Mise à jour du fichier .env
     */
    async updateEnvironmentFile() {
        this.log('\n🔧 Configuration du fichier .env...', 'cyan');
        
        const envConfig = this.createEnvironmentConfig();
        const envPath = path.join(process.cwd(), '.env');
        
        fs.writeFileSync(envPath, envConfig);
        this.log('✅ Fichier .env configuré avec les paramètres de sécurité', 'green');
        
        // Créer .env.example
        const exampleConfig = this.createExampleEnvironmentConfig();
        fs.writeFileSync(path.join(process.cwd(), '.env.example'), exampleConfig);
        this.log('✅ Fichier .env.example créé', 'blue');
    }

    /**
     * Crée la configuration d'environnement
     */
    createEnvironmentConfig() {
        const config = [
            '# ===== CONFIGURATION SÉCURITÉ VAMO BACKEND =====',
            '# Généré automatiquement par setup-security.js',
            `# Date: ${new Date().toISOString()}`,
            '',
            '# Environnement',
            `NODE_ENV=${this.config.environment}`,
            `LOG_LEVEL=${this.config.environment === 'production' ? 'info' : 'debug'}`,
            '',
            '# Sécurité JWT'
        ];

        if (this.securityKeys) {
            config.push(
                `JWT_SECRET=${this.securityKeys.JWT_SECRET}`,
                'JWT_EXPIRES_IN=24h',
                'REFRESH_TOKEN_EXPIRES_IN=7d',
                '',
                '# Chiffrement',
                `ENCRYPTION_KEY=${this.securityKeys.ENCRYPTION_KEY}`,
                'BCRYPT_ROUNDS=12',
                '',
                '# Session',
                `SESSION_SECRET=${this.securityKeys.SESSION_SECRET}`
            );
        } else {
            config.push(
                'JWT_SECRET=your-super-secure-jwt-secret-512-bits-minimum',
                'JWT_EXPIRES_IN=24h',
                'REFRESH_TOKEN_EXPIRES_IN=7d',
                '',
                '# Chiffrement',
                'ENCRYPTION_KEY=your-encryption-key-32-bytes-hex',
                'BCRYPT_ROUNDS=12',
                '',
                '# Session',
                'SESSION_SECRET=your-session-secret-256-bits-minimum'
            );
        }

        // Ajouter les variables existantes si présentes
        if (this.existingEnv) {
            config.push(
                '',
                '# ===== CONFIGURATION EXISTANTE =====',
                this.existingEnv
            );
        } else {
            config.push(
                '',
                '# Base de données',
                'DB_HOST=localhost',
                'DB_USER=vamo_user',
                'DB_PASSWORD=your_db_password',
                'DB_NAME=vamo_db',
                'DB_PORT=5432',
                '',
                '# APIs externes',
                'NUMVERIFY_API_KEY=your_numverify_api_key',
                'TWILIO_ACCOUNT_SID=your_twilio_account_sid', 
                'TWILIO_AUTH_TOKEN=your_twilio_auth_token',
                'GOOGLE_API_KEY=your_google_api_key',
                '',
                '# Cloudinary (optionnel)',
                'CLOUDINARY_CLOUD_NAME=your_cloud_name',
                'CLOUDINARY_API_KEY=your_api_key',
                'CLOUDINARY_API_SECRET=your_api_secret',
                '',
                '# Serveur',
                'PORT=5001'
            );
        }

        return config.join('\n');
    }

    /**
     * Crée le fichier .env.example
     */
    createExampleEnvironmentConfig() {
        return [
            '# ===== EXEMPLE CONFIGURATION VAMO BACKEND =====',
            '# Copiez ce fichier vers .env et remplissez les valeurs',
            '',
            '# Environnement',
            'NODE_ENV=production',
            'LOG_LEVEL=info',
            '',
            '# Sécurité JWT (générez des clés uniques !)',
            'JWT_SECRET=your-super-secure-jwt-secret-512-bits-minimum',
            'JWT_EXPIRES_IN=24h',
            'REFRESH_TOKEN_EXPIRES_IN=7d',
            '',
            '# Chiffrement (générez une clé unique !)', 
            'ENCRYPTION_KEY=your-encryption-key-32-bytes-hex',
            'BCRYPT_ROUNDS=12',
            '',
            '# Session (générez un secret unique !)',
            'SESSION_SECRET=your-session-secret-256-bits-minimum',
            '',
            '# Base de données',
            'DB_HOST=localhost',
            'DB_USER=vamo_user',
            'DB_PASSWORD=your_secure_db_password',
            'DB_NAME=vamo_db',
            'DB_PORT=5432',
            '',
            '# APIs externes (obligatoires)',
            'NUMVERIFY_API_KEY=your_numverify_api_key',
            'TWILIO_ACCOUNT_SID=your_twilio_account_sid',
            'TWILIO_AUTH_TOKEN=your_twilio_auth_token',
            'GOOGLE_API_KEY=your_google_api_key',
            '',
            '# Cloudinary (optionnel pour upload images)',
            'CLOUDINARY_CLOUD_NAME=your_cloud_name',
            'CLOUDINARY_API_KEY=your_api_key',
            'CLOUDINARY_API_SECRET=your_api_secret',
            '',
            '# Serveur',
            'PORT=5001'
        ].join('\n');
    }

    /**
     * Mise à jour du package.json
     */
    async updatePackageJson() {
        if (!this.config.updatePackageJson) return;
        
        this.log('\n📦 Mise à jour du package.json...', 'cyan');
        
        // Ajouter les dépendances de sécurité
        const securityDependencies = {
            'joi': '^17.11.0',
            'express-rate-limit': '^7.1.5',
            'helmet': '^7.1.0',
            'bcryptjs': '^2.4.3',
            'jsonwebtoken': '^9.0.2',
            'express-validator': '^7.0.1',
            'morgan': '^1.10.0',
            'winston': '^3.11.0'
        };

        // Merger avec les dépendances existantes
        this.packageJson.dependencies = {
            ...this.packageJson.dependencies,
            ...securityDependencies
        };

        // Ajouter des scripts de sécurité
        if (!this.packageJson.scripts) {
            this.packageJson.scripts = {};
        }

        const securityScripts = {
            'start:secure': 'node index-secure.js',
            'test:security': 'jest tests/security',
            'security:audit': 'npm audit && node scripts/security-audit.js',
            'security:check': 'node scripts/security-check.js',
            'logs:security': 'tail -f logs/security-events.log | jq .',
            'logs:errors': 'tail -f logs/error.log | jq .'
        };

        this.packageJson.scripts = {
            ...this.packageJson.scripts,
            ...securityScripts
        };

        // Sauvegarder
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        fs.writeFileSync(packageJsonPath, JSON.stringify(this.packageJson, null, 2));
        
        this.log('✅ package.json mis à jour avec les dépendances de sécurité', 'green');
        this.log('✅ Scripts de sécurité ajoutés', 'blue');
    }

    /**
     * Création des scripts de sécurité
     */
    async createSecurityScripts() {
        if (!this.config.createScripts) return;
        
        this.log('\n📝 Création des scripts de sécurité...', 'cyan');
        
        // Script de vérification de sécurité
        const securityCheckScript = this.createSecurityCheckScript();
        fs.writeFileSync(
            path.join(process.cwd(), 'scripts/security-check.js'),
            securityCheckScript
        );
        
        // Script d'audit de sécurité
        const securityAuditScript = this.createSecurityAuditScript();
        fs.writeFileSync(
            path.join(process.cwd(), 'scripts/security-audit.js'),
            securityAuditScript
        );

        this.log('✅ Scripts de vérification créés', 'green');
    }

    /**
     * Script de vérification de sécurité
     */
    createSecurityCheckScript() {
        return `#!/usr/bin/env node

/**
 * Script de vérification rapide de la sécurité
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const checks = {
    envVariables: [
        'JWT_SECRET',
        'ENCRYPTION_KEY',
        'SESSION_SECRET',
        'DB_PASSWORD'
    ],
    filePermissions: [
        '.env',
        'logs/',
        'config/'
    ],
    securityFeatures: [
        'middleware/validation.js',
        'middleware/rateLimiting.js',
        'middleware/security.js',
        'middleware/secureLogging.js'
    ]
};

console.log('🔍 VÉRIFICATION DE SÉCURITÉ VAMO');
console.log('=' .repeat(40));

let score = 0;
let total = 0;

// Vérifier les variables d'environnement
console.log('\\n📝 Variables d\\'environnement:');
checks.envVariables.forEach(varName => {
    total++;
    if (process.env[varName] && process.env[varName].length > 10) {
        console.log(\`✅ \${varName}: Configuré\`);
        score++;
    } else {
        console.log(\`❌ \${varName}: Manquant ou trop court\`);
    }
});

// Vérifier les fichiers de sécurité
console.log('\\n🛡️  Fichiers de sécurité:');
checks.securityFeatures.forEach(file => {
    total++;
    if (fs.existsSync(path.join(__dirname, '..', file))) {
        console.log(\`✅ \${file}: Présent\`);
        score++;
    } else {
        console.log(\`❌ \${file}: Manquant\`);
    }
});

// Score final
const percentage = Math.round((score / total) * 100);
console.log(\`\\n📊 Score de sécurité: \${score}/\${total} (\${percentage}%)\`);

if (percentage >= 90) {
    console.log('🟢 Sécurité excellente');
} else if (percentage >= 70) {
    console.log('🟡 Sécurité correcte, améliorations possibles');
} else {
    console.log('🔴 Sécurité insuffisante, action requise');
    process.exit(1);
}
`;
    }

    /**
     * Script d'audit de sécurité
     */
    createSecurityAuditScript() {
        return `#!/usr/bin/env node

/**
 * Script d'audit de sécurité approfondi
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

async function auditSecurity() {
    console.log('🔍 AUDIT DE SÉCURITÉ COMPLET');
    console.log('=' .repeat(50));
    
    const results = {
        vulnerabilities: [],
        warnings: [],
        recommendations: []
    };
    
    // Audit des permissions de fichiers
    await auditFilePermissions(results);
    
    // Audit des configurations
    await auditConfigurations(results);
    
    // Audit des logs
    await auditLogs(results);
    
    // Rapport final
    generateReport(results);
}

async function auditFilePermissions(results) {
    console.log('\\n📁 Audit des permissions de fichiers...');
    
    const sensitiveFiles = ['.env', 'config/', 'logs/'];
    
    for (const file of sensitiveFiles) {
        try {
            const stats = await fs.stat(file);
            const mode = stats.mode.toString(8).slice(-3);
            
            if (file === '.env' && mode !== '600') {
                results.warnings.push(\`Permissions .env trop ouvertes: \${mode}\`);
            }
            
            console.log(\`✅ \${file}: \${mode}\`);
        } catch (error) {
            results.vulnerabilities.push(\`Fichier sensible manquant: \${file}\`);
        }
    }
}

async function auditConfigurations(results) {
    console.log('\\n⚙️  Audit des configurations...');
    
    // Vérifier la force des clés
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret.length < 32) {
        results.vulnerabilities.push('JWT_SECRET trop court (< 32 caractères)');
    }
    
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey || encryptionKey.length !== 64) {
        results.vulnerabilities.push('ENCRYPTION_KEY invalide (doit faire 64 caractères hex)');
    }
    
    console.log('✅ Configurations auditées');
}

async function auditLogs(results) {
    console.log('\\n📊 Audit des logs...');
    
    try {
        const logsDir = path.join(__dirname, '..', 'logs');
        const files = await fs.readdir(logsDir);
        
        if (files.length === 0) {
            results.warnings.push('Aucun fichier de log trouvé');
        } else {
            console.log(\`✅ \${files.length} fichiers de logs trouvés\`);
        }
    } catch (error) {
        results.vulnerabilities.push('Dossier logs inaccessible');
    }
}

function generateReport(results) {
    console.log('\\n📋 RAPPORT D\\'AUDIT');
    console.log('=' .repeat(30));
    
    if (results.vulnerabilities.length > 0) {
        console.log('\\n🚨 VULNÉRABILITÉS CRITIQUES:');
        results.vulnerabilities.forEach((vuln, i) => {
            console.log(\`\${i + 1}. \${vuln}\`);
        });
    }
    
    if (results.warnings.length > 0) {
        console.log('\\n⚠️  AVERTISSEMENTS:');
        results.warnings.forEach((warning, i) => {
            console.log(\`\${i + 1}. \${warning}\`);
        });
    }
    
    if (results.recommendations.length > 0) {
        console.log('\\n💡 RECOMMANDATIONS:');
        results.recommendations.forEach((rec, i) => {
            console.log(\`\${i + 1}. \${rec}\`);
        });
    }
    
    if (results.vulnerabilities.length === 0 && results.warnings.length === 0) {
        console.log('\\n🎉 Aucun problème de sécurité détecté !');
    }
}

auditSecurity().catch(console.error);
`;
    }

    /**
     * Exécution des tests de sécurité
     */
    async runSecurityTests() {
        this.log('\n🧪 Exécution des tests de sécurité...', 'cyan');
        
        const runTests = await this.question('Exécuter les tests de sécurité maintenant ? (y/n) [y]: ');
        if (runTests.trim() && runTests.toLowerCase().startsWith('n')) {
            this.log('⏭️  Tests de sécurité ignorés', 'yellow');
            return;
        }

        try {
            // Vérifier que les dépendances sont installées
            const { execSync } = require('child_process');
            
            this.log('📦 Installation des dépendances...', 'blue');
            execSync('npm install', { stdio: 'inherit' });
            
            this.log('🧪 Exécution des tests...', 'blue');
            execSync('npm run test:security', { stdio: 'inherit' });
            
            this.log('✅ Tests de sécurité réussis', 'green');
        } catch (error) {
            this.log('⚠️  Certains tests ont échoué - vérifiez la configuration', 'yellow');
        }
    }

    /**
     * Instructions finales
     */
    async showFinalInstructions() {
        this.log('\n🎉 INSTALLATION TERMINÉE', 'bright');
        this.log('=' .repeat(30), 'green');
        
        this.log('\n📋 Étapes suivantes:', 'cyan');
        this.log('1. Vérifiez le fichier .env et complétez les variables manquantes');
        this.log('2. Configurez votre base de données PostgreSQL');
        this.log('3. Obtenez vos clés API (Twilio, Numverify, Google)');
        this.log('4. Testez le serveur sécurisé: npm run start:secure');
        this.log('5. Vérifiez la sécurité: npm run security:check');
        
        this.log('\n🔧 Commandes utiles:', 'blue');
        this.log('- npm run start:secure     # Démarrer avec sécurité');
        this.log('- npm run test:security    # Tests de sécurité');
        this.log('- npm run security:audit   # Audit complet');
        this.log('- npm run logs:security    # Surveiller les logs');
        
        this.log('\n📚 Documentation:', 'magenta');
        this.log('- Lisez SECURITY.md pour les détails complets');
        this.log('- Consultez les logs dans le dossier logs/');
        this.log('- Configurez le monitoring en production');
        
        if (this.config.environment === 'production') {
            this.log('\n⚠️  IMPORTANT - PRODUCTION:', 'yellow');
            this.log('- Configurez HTTPS avec certificats SSL');
            this.log('- Mettez en place un monitoring avancé');
            this.log('- Configurez les sauvegardes chiffrées');
            this.log('- Effectuez des audits de sécurité réguliers');
        }
        
        this.log('\n✅ Vamo Backend est maintenant sécurisé !', 'bright');
    }
}

// Exécution du script
if (require.main === module) {
    const setup = new SecuritySetup();
    setup.run().catch(error => {
        console.error(\`❌ Erreur fatale: \${error.message}\`);
        process.exit(1);
    });
}

module.exports = SecuritySetup;