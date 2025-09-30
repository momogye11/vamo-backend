/**
 * Utilitaires pour la gestion de la base de données de test
 */

const { Pool } = require('pg');

class TestDatabase {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    /**
     * Initialise la connexion de test
     */
    async connect() {
        if (this.isConnected) return;

        try {
            this.pool = new Pool({
                host: process.env.DB_HOST || 'localhost',
                user: process.env.DB_USER || 'test_user',
                password: process.env.DB_PASSWORD || 'test_password',
                database: process.env.DB_NAME || 'test_vamo_db',
                port: process.env.DB_PORT || 5432,
            });

            // Test de connexion
            await this.pool.query('SELECT NOW()');
            this.isConnected = true;
            console.log('✅ Test database connected');
        } catch (error) {
            console.warn('⚠️ Test database not available:', error.message);
            console.log('📝 Using mocked database for tests');
        }
    }

    /**
     * Crée les tables de test
     */
    async createTables() {
        if (!this.isConnected) return;

        const createTableQueries = [
            // Table OTP
            `CREATE TABLE IF NOT EXISTS otp_codes (
                id SERIAL PRIMARY KEY,
                phone VARCHAR(20) UNIQUE NOT NULL,
                code VARCHAR(10) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Table Client
            `CREATE TABLE IF NOT EXISTS Client (
                id_client SERIAL PRIMARY KEY,
                nom VARCHAR(100),
                prenom VARCHAR(100),
                telephone VARCHAR(20) UNIQUE NOT NULL,
                email VARCHAR(100),
                date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                statut_validation VARCHAR(20) DEFAULT 'en_attente',
                push_token TEXT,
                platform VARCHAR(20),
                notification_preferences JSONB,
                last_token_update TIMESTAMP
            )`,

            // Table Chauffeur
            `CREATE TABLE IF NOT EXISTS Chauffeur (
                id_chauffeur SERIAL PRIMARY KEY,
                nom VARCHAR(100) NOT NULL,
                prenom VARCHAR(100) NOT NULL,
                telephone VARCHAR(20) UNIQUE NOT NULL,
                email VARCHAR(100),
                marque_vehicule VARCHAR(100),
                annee_vehicule INTEGER,
                plaque_immatriculation VARCHAR(20),
                photo_selfie TEXT,
                photo_cni TEXT,
                photo_vehicule TEXT,
                statut_validation VARCHAR(20) DEFAULT 'en_attente',
                disponibilite BOOLEAN DEFAULT false,
                date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                push_token TEXT,
                platform VARCHAR(20),
                notification_preferences JSONB,
                last_token_update TIMESTAMP
            )`,

            // Table Course
            `CREATE TABLE IF NOT EXISTS Course (
                id_course SERIAL PRIMARY KEY,
                id_client INTEGER REFERENCES Client(id_client),
                id_chauffeur INTEGER REFERENCES Chauffeur(id_chauffeur),
                adresse_depart TEXT NOT NULL,
                adresse_arrivee TEXT NOT NULL,
                distance_km NUMERIC(5,2),
                duree_min INTEGER,
                prix NUMERIC(10,2),
                mode_paiement VARCHAR(50) DEFAULT 'especes',
                mode_silencieux BOOLEAN DEFAULT false,
                latitude_depart NUMERIC(10,7),
                longitude_depart NUMERIC(10,7),
                latitude_arrivee NUMERIC(10,7),
                longitude_arrivee NUMERIC(10,7),
                telephone_client VARCHAR(20),
                nom_client VARCHAR(200),
                etat_course VARCHAR(50) DEFAULT 'en_attente',
                est_paye BOOLEAN DEFAULT false,
                date_heure_depart TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                date_heure_arrivee_pickup TIMESTAMP,
                date_heure_debut_course TIMESTAMP,
                date_heure_arrivee TIMESTAMP
            )`,

            // Table Livreur
            `CREATE TABLE IF NOT EXISTS Livreur (
                id_livreur SERIAL PRIMARY KEY,
                nom VARCHAR(100) NOT NULL,
                prenom VARCHAR(100) NOT NULL,
                telephone VARCHAR(20) UNIQUE NOT NULL,
                email VARCHAR(100),
                photo_selfie TEXT,
                photo_cni TEXT,
                photo_vehicule TEXT,
                statut_validation VARCHAR(20) DEFAULT 'en_attente',
                disponibilite BOOLEAN DEFAULT false,
                date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                push_token TEXT,
                platform VARCHAR(20),
                notification_preferences JSONB,
                last_token_update TIMESTAMP
            )`,

            // Table de logs de notifications
            `CREATE TABLE IF NOT EXISTS notification_log (
                id SERIAL PRIMARY KEY,
                recipient_type VARCHAR(20),
                recipient_id INTEGER,
                notification_type VARCHAR(50),
                title VARCHAR(255),
                body TEXT,
                data JSONB,
                status VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        try {
            for (const query of createTableQueries) {
                await this.pool.query(query);
            }
            console.log('✅ Test tables created');
        } catch (error) {
            console.error('❌ Error creating test tables:', error);
        }
    }

    /**
     * Nettoie les données de test
     */
    async cleanup() {
        if (!this.isConnected) return;

        const cleanupQueries = [
            'DELETE FROM Course',
            'DELETE FROM otp_codes',
            'DELETE FROM notification_log',
            'DELETE FROM Client',
            'DELETE FROM Chauffeur',
            'DELETE FROM Livreur'
        ];

        try {
            for (const query of cleanupQueries) {
                await this.pool.query(query);
            }
            console.log('🧹 Test data cleaned');
        } catch (error) {
            console.error('❌ Error cleaning test data:', error);
        }
    }

    /**
     * Insère des données de test
     */
    async seedTestData() {
        if (!this.isConnected) return;

        try {
            // Client de test
            await this.pool.query(`
                INSERT INTO Client (nom, prenom, telephone, email, statut_validation) 
                VALUES ('Doe', 'John', '+221781234567', 'john@test.com', 'approuve')
                ON CONFLICT (telephone) DO NOTHING
            `);

            // Chauffeur de test
            await this.pool.query(`
                INSERT INTO Chauffeur (nom, prenom, telephone, marque_vehicule, plaque_immatriculation, statut_validation, disponibilite) 
                VALUES ('Diop', 'Amadou', '+221771234567', 'Toyota Corolla', 'DK-123-AB', 'approuve', true)
                ON CONFLICT (telephone) DO NOTHING
            `);

            // Livreur de test
            await this.pool.query(`
                INSERT INTO Livreur (nom, prenom, telephone, statut_validation, disponibilite) 
                VALUES ('Sall', 'Fatou', '+221761234567', 'approuve', true)
                ON CONFLICT (telephone) DO NOTHING
            `);

            console.log('✅ Test data seeded');
        } catch (error) {
            console.error('❌ Error seeding test data:', error);
        }
    }

    /**
     * Ferme la connexion
     */
    async disconnect() {
        if (this.pool && this.isConnected) {
            await this.pool.end();
            this.isConnected = false;
            console.log('✅ Test database disconnected');
        }
    }

    /**
     * Exécute une query directement
     */
    async query(text, params) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }
        return this.pool.query(text, params);
    }

    /**
     * Obtient les statistiques de la base de test
     */
    async getStats() {
        if (!this.isConnected) return null;

        try {
            const results = await Promise.all([
                this.pool.query('SELECT COUNT(*) FROM Client'),
                this.pool.query('SELECT COUNT(*) FROM Chauffeur'),
                this.pool.query('SELECT COUNT(*) FROM Course'),
                this.pool.query('SELECT COUNT(*) FROM otp_codes'),
                this.pool.query('SELECT COUNT(*) FROM notification_log')
            ]);

            return {
                clients: parseInt(results[0].rows[0].count),
                chauffeurs: parseInt(results[1].rows[0].count),
                courses: parseInt(results[2].rows[0].count),
                otpCodes: parseInt(results[3].rows[0].count),
                notifications: parseInt(results[4].rows[0].count)
            };
        } catch (error) {
            console.error('❌ Error getting database stats:', error);
            return null;
        }
    }
}

// Utilitaires pour les tests
const testHelpers = {
    /**
     * Crée un client de test
     */
    async createTestClient(db, data = {}) {
        const defaultData = {
            nom: 'Test',
            prenom: 'Client',
            telephone: '+221781234567',
            email: 'test@client.com',
            statut_validation: 'approuve'
        };

        const clientData = { ...defaultData, ...data };
        
        const result = await db.query(`
            INSERT INTO Client (nom, prenom, telephone, email, statut_validation) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING *
        `, [clientData.nom, clientData.prenom, clientData.telephone, clientData.email, clientData.statut_validation]);

        return result.rows[0];
    },

    /**
     * Crée un chauffeur de test
     */
    async createTestDriver(db, data = {}) {
        const defaultData = {
            nom: 'Test',
            prenom: 'Driver',
            telephone: '+221771234567',
            marque_vehicule: 'Toyota Corolla',
            plaque_immatriculation: 'DK-TEST-01',
            statut_validation: 'approuve',
            disponibilite: true
        };

        const driverData = { ...defaultData, ...data };
        
        const result = await db.query(`
            INSERT INTO Chauffeur (nom, prenom, telephone, marque_vehicule, plaque_immatriculation, statut_validation, disponibilite) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING *
        `, [driverData.nom, driverData.prenom, driverData.telephone, driverData.marque_vehicule, driverData.plaque_immatriculation, driverData.statut_validation, driverData.disponibilite]);

        return result.rows[0];
    },

    /**
     * Crée une course de test
     */
    async createTestTrip(db, clientId, data = {}) {
        const defaultData = {
            adresse_depart: 'Almadies, Dakar',
            adresse_arrivee: 'Plateau, Dakar',
            distance_km: 8.5,
            duree_min: 18,
            prix: 2500,
            mode_paiement: 'wave',
            latitude_depart: 14.7275,
            longitude_depart: -17.5113,
            latitude_arrivee: 14.7167,
            longitude_arrivee: -17.4677,
            telephone_client: '+221781234567',
            nom_client: 'Test Client',
            etat_course: 'en_attente'
        };

        const tripData = { ...defaultData, ...data };
        
        const result = await db.query(`
            INSERT INTO Course (id_client, adresse_depart, adresse_arrivee, distance_km, duree_min, prix, mode_paiement, latitude_depart, longitude_depart, latitude_arrivee, longitude_arrivee, telephone_client, nom_client, etat_course) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
            RETURNING *
        `, [clientId, tripData.adresse_depart, tripData.adresse_arrivee, tripData.distance_km, tripData.duree_min, tripData.prix, tripData.mode_paiement, tripData.latitude_depart, tripData.longitude_depart, tripData.latitude_arrivee, tripData.longitude_arrivee, tripData.telephone_client, tripData.nom_client, tripData.etat_course]);

        return result.rows[0];
    }
};

module.exports = { TestDatabase, testHelpers };