// ============================================
// SERVICE AUTO-CLEANUP - VAMO
// ============================================
// Nettoie automatiquement les courses et livraisons abandonnées

const db = require('../db');

class AutoCleanupService {
    constructor() {
        this.cleanupInterval = null;
        this.isRunning = false;
    }

    // Démarrer le service de nettoyage automatique
    start(intervalMinutes = 60) {
        if (this.isRunning) {
            console.log('⚠️ Auto-cleanup service already running');
            return;
        }

        console.log(`🧹 Starting auto-cleanup service (every ${intervalMinutes} minutes)...`);
        this.isRunning = true;

        // Exécuter immédiatement au démarrage
        this.cleanup();

        // Puis exécuter à intervalle régulier
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, intervalMinutes * 60 * 1000);
    }

    // Arrêter le service
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            this.isRunning = false;
            console.log('🛑 Auto-cleanup service stopped');
        }
    }

    // Nettoyer les données abandonnées
    async cleanup() {
        try {
            console.log('🧹 Running auto-cleanup...');

            const results = await Promise.all([
                this.cleanupAbandonedCourses(),
                this.cleanupAbandonedLivraisons(),
                this.cleanupOfflineDrivers()
            ]);

            const [coursesCleanedUp, livraisonsCleanedUp, driversSetOffline] = results;

            console.log(`✅ Auto-cleanup completed:`);
            console.log(`   - ${coursesCleanedUp} courses nettoyées`);
            console.log(`   - ${livraisonsCleanedUp} livraisons nettoyées`);
            console.log(`   - ${driversSetOffline} chauffeurs/livreurs mis offline`);

        } catch (error) {
            console.error('❌ Error during auto-cleanup:', error.message);
        }
    }

    // Nettoyer les courses abandonnées
    async cleanupAbandonedCourses() {
        try {
            // Annuler les courses en_attente ou acceptee depuis plus de 1 heure
            const result1 = await db.query(`
                UPDATE Course
                SET etat_course = 'annulee'
                WHERE etat_course IN ('en_attente', 'acceptee')
                AND (date_heure_depart IS NULL OR date_heure_depart < NOW() - INTERVAL '1 hour')
                AND etat_course != 'annulee'
            `);

            // Marquer comme terminées les courses en_cours depuis plus de 6 heures
            const result2 = await db.query(`
                UPDATE Course
                SET
                    etat_course = 'terminee',
                    date_heure_arrivee = COALESCE(date_heure_arrivee, date_heure_depart + INTERVAL '30 minutes')
                WHERE etat_course IN ('en_cours', 'arrivee_pickup')
                AND date_heure_depart < NOW() - INTERVAL '6 hours'
                AND date_heure_arrivee IS NULL
            `);

            const totalCleaned = (result1.rowCount || 0) + (result2.rowCount || 0);
            return totalCleaned;

        } catch (error) {
            console.error('Error cleaning courses:', error.message);
            return 0;
        }
    }

    // Nettoyer les livraisons abandonnées
    async cleanupAbandonedLivraisons() {
        try {
            // Annuler les livraisons en_attente ou acceptee depuis plus de 1 heure
            const result1 = await db.query(`
                UPDATE Livraison
                SET etat_livraison = 'annulee'
                WHERE etat_livraison IN ('en_attente', 'acceptee')
                AND (date_heure_depart IS NULL OR date_heure_depart < NOW() - INTERVAL '1 hour')
                AND etat_livraison != 'annulee'
            `);

            // Marquer comme terminées les livraisons en_cours depuis plus de 6 heures
            const result2 = await db.query(`
                UPDATE Livraison
                SET
                    etat_livraison = 'terminee',
                    date_heure_arrivee = COALESCE(date_heure_arrivee, date_heure_depart + INTERVAL '30 minutes')
                WHERE etat_livraison IN ('en_cours', 'arrivee_pickup')
                AND date_heure_depart < NOW() - INTERVAL '6 hours'
                AND date_heure_arrivee IS NULL
            `);

            const totalCleaned = (result1.rowCount || 0) + (result2.rowCount || 0);
            return totalCleaned;

        } catch (error) {
            console.error('Error cleaning livraisons:', error.message);
            return 0;
        }
    }

    // Mettre offline les chauffeurs/livreurs sans position GPS récente
    async cleanupOfflineDrivers() {
        try {
            // Chauffeurs sans position GPS depuis plus de 15 minutes
            const result1 = await db.query(`
                UPDATE Chauffeur c
                SET disponibilite = false
                WHERE c.disponibilite = true
                AND NOT EXISTS (
                    SELECT 1 FROM PositionChauffeur p
                    WHERE p.id_chauffeur = c.id_chauffeur
                    AND p.derniere_maj > NOW() - INTERVAL '15 minutes'
                )
            `);

            // Livreurs sans position GPS depuis plus de 15 minutes
            const result2 = await db.query(`
                UPDATE Livreur l
                SET disponibilite = false
                WHERE l.disponibilite = true
                AND NOT EXISTS (
                    SELECT 1 FROM PositionLivreur p
                    WHERE p.id_livreur = l.id_livreur
                    AND p.derniere_maj > NOW() - INTERVAL '15 minutes'
                )
            `);

            const totalSetOffline = (result1.rowCount || 0) + (result2.rowCount || 0);
            return totalSetOffline;

        } catch (error) {
            console.error('Error setting drivers offline:', error.message);
            return 0;
        }
    }

    // Nettoyer manuellement (endpoint admin)
    async manualCleanup() {
        console.log('🧹 Manual cleanup triggered');
        await this.cleanup();
        return { success: true, message: 'Nettoyage manuel effectué' };
    }
}

// Exporter une instance singleton
const autoCleanupService = new AutoCleanupService();
module.exports = autoCleanupService;
