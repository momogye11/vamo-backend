/**
 * Script de nettoyage automatique des courses bloquées
 *
 * Problèmes résolus:
 * 1. Courses "en_cours" avec date_heure_arrivee (terminées physiquement mais statut non mis à jour)
 * 2. Courses "en_attente" depuis trop longtemps (aucun chauffeur trouvé)
 * 3. Courses "acceptee" qui ne démarrent jamais
 *
 * Utilisation:
 * - Mode DRY RUN (aperçu): node scripts/cleanup-stuck-courses.js
 * - Mode EXECUTION: node scripts/cleanup-stuck-courses.js --execute
 */

const db = require('../db');

// Configuration
const CONFIG = {
    // Courses "en_cours" avec arrivée depuis plus de X heures → marquer "terminee"
    EN_COURS_WITH_ARRIVAL_HOURS: 1, // 1 heure après l'arrivée

    // Courses "en_attente" depuis plus de X minutes → marquer "annulee"
    EN_ATTENTE_TIMEOUT_MINUTES: 30, // 30 minutes de recherche

    // Courses "acceptee" qui ne démarrent pas depuis X minutes → marquer "annulee"
    ACCEPTEE_TIMEOUT_MINUTES: 15, // 15 minutes pour démarrer

    // Courses "arrivee_pickup" bloquées depuis X minutes → marquer "annulee"
    ARRIVEE_PICKUP_TIMEOUT_MINUTES: 30,
};

const DRY_RUN = !process.argv.includes('--execute');

async function cleanupStuckCourses() {
    console.log('🧹 ========================================');
    console.log('🧹 NETTOYAGE DES COURSES BLOQUÉES');
    console.log('🧹 ========================================\n');

    if (DRY_RUN) {
        console.log('⚠️  MODE DRY RUN - Aucune modification ne sera effectuée');
        console.log('⚠️  Utilisez --execute pour appliquer les changements\n');
    } else {
        console.log('✅ MODE EXECUTION - Les modifications seront appliquées\n');
    }

    let totalFixed = 0;

    // ==========================================
    // 1. NETTOYER LES COURSES "EN_COURS" TERMINÉES
    // ==========================================
    console.log('1️⃣  Vérification des courses "en_cours" terminées...');

    const enCoursQuery = `
        SELECT id_course, date_heure_demande, date_heure_depart, date_heure_arrivee,
               EXTRACT(EPOCH FROM (NOW() - date_heure_arrivee))/3600 as heures_depuis_arrivee
        FROM Course
        WHERE etat_course = 'en_cours'
        AND date_heure_arrivee IS NOT NULL
        AND date_heure_arrivee < NOW() - INTERVAL '${CONFIG.EN_COURS_WITH_ARRIVAL_HOURS} hours'
    `;

    const enCoursResults = await db.query(enCoursQuery);

    console.log(`   Trouvé: ${enCoursResults.rows.length} courses à corriger`);

    if (enCoursResults.rows.length > 0) {
        console.log('   Détails:');
        enCoursResults.rows.forEach(row => {
            console.log(`   - Course #${row.id_course}: arrivée depuis ${Math.round(row.heures_depuis_arrivee)}h`);
        });

        if (!DRY_RUN) {
            const updateResult = await db.query(`
                UPDATE Course
                SET etat_course = 'terminee'
                WHERE etat_course = 'en_cours'
                AND date_heure_arrivee IS NOT NULL
                AND date_heure_arrivee < NOW() - INTERVAL '${CONFIG.EN_COURS_WITH_ARRIVAL_HOURS} hours'
            `);
            console.log(`   ✅ ${updateResult.rowCount} courses marquées comme "terminee"\n`);
            totalFixed += updateResult.rowCount;
        } else {
            console.log(`   ⚠️  ${enCoursResults.rows.length} courses seraient marquées comme "terminee"\n`);
        }
    } else {
        console.log('   ✅ Aucune course "en_cours" bloquée\n');
    }

    // ==========================================
    // 2. ANNULER LES COURSES "EN_ATTENTE" TIMEOUT
    // ==========================================
    console.log('2️⃣  Vérification des courses "en_attente" en timeout...');

    const enAttenteQuery = `
        SELECT id_course, date_heure_demande,
               EXTRACT(EPOCH FROM (NOW() - date_heure_demande))/60 as minutes_depuis
        FROM Course
        WHERE etat_course = 'en_attente'
        AND date_heure_demande < NOW() - INTERVAL '${CONFIG.EN_ATTENTE_TIMEOUT_MINUTES} minutes'
    `;

    const enAttenteResults = await db.query(enAttenteQuery);

    console.log(`   Trouvé: ${enAttenteResults.rows.length} courses à annuler`);

    if (enAttenteResults.rows.length > 0) {
        console.log('   Détails:');
        enAttenteResults.rows.forEach(row => {
            console.log(`   - Course #${row.id_course}: en attente depuis ${Math.round(row.minutes_depuis)} min`);
        });

        if (!DRY_RUN) {
            const updateResult = await db.query(`
                UPDATE Course
                SET etat_course = 'annulee'
                WHERE etat_course = 'en_attente'
                AND date_heure_demande < NOW() - INTERVAL '${CONFIG.EN_ATTENTE_TIMEOUT_MINUTES} minutes'
            `);
            console.log(`   ✅ ${updateResult.rowCount} courses annulées (timeout recherche)\n`);
            totalFixed += updateResult.rowCount;
        } else {
            console.log(`   ⚠️  ${enAttenteResults.rows.length} courses seraient annulées\n`);
        }
    } else {
        console.log('   ✅ Aucune course "en_attente" en timeout\n');
    }

    // ==========================================
    // 3. ANNULER LES COURSES "ACCEPTEE" QUI NE DÉMARRENT PAS
    // ==========================================
    console.log('3️⃣  Vérification des courses "acceptee" qui ne démarrent pas...');

    const accepteeQuery = `
        SELECT id_course, date_heure_acceptation,
               EXTRACT(EPOCH FROM (NOW() - date_heure_acceptation))/60 as minutes_depuis
        FROM Course
        WHERE etat_course = 'acceptee'
        AND date_heure_acceptation < NOW() - INTERVAL '${CONFIG.ACCEPTEE_TIMEOUT_MINUTES} minutes'
        AND date_heure_depart IS NULL
    `;

    const accepteeResults = await db.query(accepteeQuery);

    console.log(`   Trouvé: ${accepteeResults.rows.length} courses à annuler`);

    if (accepteeResults.rows.length > 0) {
        console.log('   Détails:');
        accepteeResults.rows.forEach(row => {
            console.log(`   - Course #${row.id_course}: acceptée depuis ${Math.round(row.minutes_depuis)} min sans départ`);
        });

        if (!DRY_RUN) {
            const updateResult = await db.query(`
                UPDATE Course
                SET etat_course = 'annulee'
                WHERE etat_course = 'acceptee'
                AND date_heure_acceptation < NOW() - INTERVAL '${CONFIG.ACCEPTEE_TIMEOUT_MINUTES} minutes'
                AND date_heure_depart IS NULL
            `);
            console.log(`   ✅ ${updateResult.rowCount} courses annulées (timeout démarrage)\n`);
            totalFixed += updateResult.rowCount;
        } else {
            console.log(`   ⚠️  ${accepteeResults.rows.length} courses seraient annulées\n`);
        }
    } else {
        console.log('   ✅ Aucune course "acceptee" bloquée\n');
    }

    // ==========================================
    // 4. ANNULER LES COURSES "ARRIVEE_PICKUP" BLOQUÉES
    // ==========================================
    console.log('4️⃣  Vérification des courses "arrivee_pickup" bloquées...');

    const arriveePickupQuery = `
        SELECT id_course, date_heure_arrivee_pickup,
               EXTRACT(EPOCH FROM (NOW() - date_heure_arrivee_pickup))/60 as minutes_depuis
        FROM Course
        WHERE etat_course = 'arrivee_pickup'
        AND date_heure_arrivee_pickup < NOW() - INTERVAL '${CONFIG.ARRIVEE_PICKUP_TIMEOUT_MINUTES} minutes'
        AND date_heure_depart IS NULL
    `;

    const arriveePickupResults = await db.query(arriveePickupQuery);

    console.log(`   Trouvé: ${arriveePickupResults.rows.length} courses à annuler`);

    if (arriveePickupResults.rows.length > 0) {
        console.log('   Détails:');
        arriveePickupResults.rows.forEach(row => {
            console.log(`   - Course #${row.id_course}: arrivée pickup depuis ${Math.round(row.minutes_depuis)} min sans départ`);
        });

        if (!DRY_RUN) {
            const updateResult = await db.query(`
                UPDATE Course
                SET etat_course = 'annulee'
                WHERE etat_course = 'arrivee_pickup'
                AND date_heure_arrivee_pickup < NOW() - INTERVAL '${CONFIG.ARRIVEE_PICKUP_TIMEOUT_MINUTES} minutes'
                AND date_heure_depart IS NULL
            `);
            console.log(`   ✅ ${updateResult.rowCount} courses annulées (timeout pickup)\n`);
            totalFixed += updateResult.rowCount;
        } else {
            console.log(`   ⚠️  ${arriveePickupResults.rows.length} courses seraient annulées\n`);
        }
    } else {
        console.log('   ✅ Aucune course "arrivee_pickup" bloquée\n');
    }

    // ==========================================
    // RÉSUMÉ
    // ==========================================
    console.log('🧹 ========================================');
    console.log('🧹 RÉSUMÉ');
    console.log('🧹 ========================================\n');

    if (DRY_RUN) {
        const total = enCoursResults.rows.length + enAttenteResults.rows.length +
                     accepteeResults.rows.length + arriveePickupResults.rows.length;
        console.log(`📊 Total de courses à corriger: ${total}`);
        console.log(`\n💡 Pour appliquer les changements, exécutez:`);
        console.log(`   node scripts/cleanup-stuck-courses.js --execute\n`);
    } else {
        console.log(`✅ Total de courses corrigées: ${totalFixed}\n`);
    }
}

// Exécuter le script
cleanupStuckCourses()
    .then(() => {
        console.log('✅ Script terminé avec succès');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Erreur lors du nettoyage:', error);
        process.exit(1);
    });
