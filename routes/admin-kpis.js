const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware d'authentification (importé depuis admin.js)
const authenticateAdmin = (req, res, next) => {
    const token = req.headers['x-auth-token'] || req.cookies?.vamo_admin_token || req.query.token;
    if (!token) {
        return res.status(401).json({ error: 'Token d\'accès requis' });
    }
    const activeSessions = require('../index').activeSessions;
    if (!activeSessions || !activeSessions.has(token)) {
        return res.status(403).json({ error: 'Token invalide ou expiré' });
    }
    req.admin = { authenticated: true };
    next();
};

// ============================================
// ENDPOINT PRINCIPAL KPIs
// ============================================
router.get('/all', authenticateAdmin, async (req, res) => {
    try {
        const period = req.query.period || 'today'; // today, week, month, custom
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;

        // Calculer la plage de dates
        const dateRange = getDateRange(period, startDate, endDate);

        // Calculer tous les KPIs en parallèle
        const [
            // Ride-sharing KPIs
            activeDrivers,
            activeRiders,
            completedRides,
            matchingTime,
            acceptanceRate,
            cancellationRate,
            driverRetention,
            riderRetention,
            dau_wau_mau,
            supplyDemandRatio,
            activationRates,
            // Delivery KPIs
            activeDeliveryPersons,
            activeDeliveryClients,
            completedDeliveries,
            deliveryMatchingTime,
            deliveryAcceptanceRate,
            deliveryCancellationRate,
            deliveryPersonRetention,
            deliveryClientRetention,
            deliveryDAU_WAU_MAU,
            deliverySupplyDemandRatio,
            deliveryActivationRates,
            // Global KPIs (Combined)
            globalActiveWorkers,
            globalActiveUsers,
            globalCompletedJobs,
            globalRetention,
            globalDAU_WAU_MAU
        ] = await Promise.all([
            // Ride-sharing
            getActiveDriversPerDay(dateRange),
            getActiveRidersPerDay(dateRange),
            getCompletedRidesPerDay(dateRange),
            getMatchingTime(dateRange),
            getAcceptanceRate(dateRange),
            getCancellationRate(dateRange),
            getDriverRetention(),
            getRiderRetention(),
            getDAU_WAU_MAU(),
            getSupplyDemandRatio(dateRange),
            getActivationRates(),
            // Delivery
            getActiveDeliveryPersonsPerDay(dateRange),
            getActiveDeliveryClientsPerDay(dateRange),
            getCompletedDeliveriesPerDay(dateRange),
            getDeliveryMatchingTime(dateRange),
            getDeliveryAcceptanceRate(dateRange),
            getDeliveryCancellationRate(dateRange),
            getDeliveryPersonRetention(),
            getDeliveryClientRetention(),
            getDeliveryDAU_WAU_MAU(),
            getDeliverySupplyDemandRatio(dateRange),
            getDeliveryActivationRates(),
            // Global
            getGlobalActiveWorkersPerDay(dateRange),
            getGlobalActiveUsersPerDay(dateRange),
            getGlobalCompletedJobsPerDay(dateRange),
            getGlobalRetention(),
            getGlobalDAU_WAU_MAU()
        ]);

        res.json({
            success: true,
            period: period,
            dateRange: dateRange,
            kpis: {
                // Ride-sharing
                ridesharing: {
                    activeDrivers,
                    activeRiders,
                    completedRides,
                    matchingTime,
                    acceptanceRate,
                    cancellationRate,
                    driverRetention,
                    riderRetention,
                    dau_wau_mau,
                    supplyDemandRatio,
                    activationRates
                },
                // Delivery
                delivery: {
                    activeDeliveryPersons,
                    activeDeliveryClients,
                    completedDeliveries,
                    deliveryMatchingTime,
                    deliveryAcceptanceRate,
                    deliveryCancellationRate,
                    deliveryPersonRetention,
                    deliveryClientRetention,
                    deliveryDAU_WAU_MAU,
                    deliverySupplyDemandRatio,
                    deliveryActivationRates
                },
                // Global (Combined)
                global: {
                    activeWorkers: globalActiveWorkers,
                    activeUsers: globalActiveUsers,
                    completedJobs: globalCompletedJobs,
                    retention: globalRetention,
                    dau_wau_mau: globalDAU_WAU_MAU
                }
            }
        });

    } catch (error) {
        console.error('❌ Erreur KPIs:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du calcul des KPIs'
        });
    }
});

// ============================================
// FONCTIONS DE CALCUL DES KPIs
// ============================================

// 🟦 1. Active Drivers / day
async function getActiveDriversPerDay(dateRange) {
    const result = await db.query(`
        SELECT
            DATE(date_heure_depart) as date,
            COUNT(DISTINCT id_chauffeur) as active_drivers
        FROM Course
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_course != 'annulee'
        GROUP BY DATE(date_heure_depart)
        ORDER BY date DESC
    `, [dateRange.start, dateRange.end]);

    const total = result.rows.reduce((sum, row) => sum + parseInt(row.active_drivers), 0);
    const avg = result.rows.length > 0 ? total / result.rows.length : 0;

    return {
        current: result.rows[0]?.active_drivers || 0,
        average: Math.round(avg),
        trend: result.rows.slice(0, 7).map(r => ({
            date: r.date,
            value: parseInt(r.active_drivers)
        })),
        benchmark: getBenchmark(avg, [
            { threshold: 5, level: 'critical', label: 'Mort' },
            { threshold: 50, level: 'warning', label: 'MVP OK' },
            { threshold: 200, level: 'good', label: 'Domination locale' },
            { threshold: 1000, level: 'excellent', label: 'Rivalise avec Bolt' }
        ])
    };
}

// 🟦 2. Active Riders / day
async function getActiveRidersPerDay(dateRange) {
    const result = await db.query(`
        SELECT
            DATE(date_heure_depart) as date,
            COUNT(DISTINCT id_client) as active_riders
        FROM Course
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_course != 'annulee'
        GROUP BY DATE(date_heure_depart)
        ORDER BY date DESC
    `, [dateRange.start, dateRange.end]);

    const total = result.rows.reduce((sum, row) => sum + parseInt(row.active_riders), 0);
    const avg = result.rows.length > 0 ? total / result.rows.length : 0;

    return {
        current: result.rows[0]?.active_riders || 0,
        average: Math.round(avg),
        trend: result.rows.slice(0, 7).map(r => ({
            date: r.date,
            value: parseInt(r.active_riders)
        }))
    };
}

// 🟨 3. Completed Rides / day
async function getCompletedRidesPerDay(dateRange) {
    const result = await db.query(`
        SELECT
            DATE(date_heure_depart) as date,
            COUNT(*) as completed_rides
        FROM Course
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_course = 'terminee'
        GROUP BY DATE(date_heure_depart)
        ORDER BY date DESC
    `, [dateRange.start, dateRange.end]);

    const total = result.rows.reduce((sum, row) => sum + parseInt(row.completed_rides), 0);
    const avg = result.rows.length > 0 ? total / result.rows.length : 0;

    return {
        current: result.rows[0]?.completed_rides || 0,
        average: Math.round(avg),
        total: total,
        trend: result.rows.slice(0, 7).map(r => ({
            date: r.date,
            value: parseInt(r.completed_rides)
        })),
        benchmark: getBenchmark(avg, [
            { threshold: 20, level: 'critical', label: 'Trop faible' },
            { threshold: 50, level: 'warning', label: 'Début de traction' },
            { threshold: 200, level: 'good', label: 'Real business (YC)' },
            { threshold: 1000, level: 'excellent', label: 'Top 3 du marché' }
        ])
    };
}

// 🟧 4. Matching Time (Temps d'attente moyen)
async function getMatchingTime(dateRange) {
    const result = await db.query(`
        SELECT
            AVG(
                EXTRACT(EPOCH FROM (
                    CASE
                        WHEN date_heure_depart IS NOT NULL
                        THEN date_heure_depart - date_creation
                        ELSE NULL
                    END
                )) / 60
            ) as avg_matching_time_minutes
        FROM Course
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_course != 'annulee'
        AND date_heure_depart IS NOT NULL
        AND date_creation IS NOT NULL
    `, [dateRange.start, dateRange.end]);

    const avgMinutes = parseFloat(result.rows[0]?.avg_matching_time_minutes) || 0;

    // Note: Avec données de test, le temps peut être < 1 min
    const displayValue = avgMinutes < 0.1 ? '< 0.1' : Math.round(avgMinutes * 10) / 10;

    return {
        value: displayValue,
        unit: 'minutes',
        benchmark: getBenchmark(avgMinutes, [
            { threshold: 2, level: 'excellent', label: 'Killer app' },
            { threshold: 4, level: 'good', label: 'Excellent' },
            { threshold: 7, level: 'warning', label: 'Acceptable' },
            { threshold: 12, level: 'critical', label: 'Nul' }
        ])
    };
}

// 🟥 5. Acceptance Rate
async function getAcceptanceRate(dateRange) {
    const result = await db.query(`
        SELECT
            COUNT(*) FILTER (WHERE etat_course IN ('acceptee', 'en_cours', 'arrivee_pickup', 'terminee')) as accepted,
            COUNT(*) as total
        FROM Course
        WHERE DATE(date_creation) >= $1 AND DATE(date_creation) <= $2
    `, [dateRange.start, dateRange.end]);

    const accepted = parseInt(result.rows[0]?.accepted) || 0;
    const total = parseInt(result.rows[0]?.total) || 0;
    const rate = total > 0 ? (accepted / total) * 100 : 0;

    return {
        value: Math.round(rate * 10) / 10,
        unit: '%',
        accepted: accepted,
        total: total,
        benchmark: getBenchmark(rate, [
            { threshold: 50, level: 'critical', label: 'Très mauvais' },
            { threshold: 70, level: 'warning', label: 'Moyen' },
            { threshold: 85, level: 'good', label: 'Bon' },
            { threshold: 90, level: 'excellent', label: 'Excellent' }
        ])
    };
}

// 🟪 6. Cancellation Rate
async function getCancellationRate(dateRange) {
    const result = await db.query(`
        SELECT
            COUNT(*) FILTER (WHERE etat_course = 'annulee') as cancelled,
            COUNT(*) as total
        FROM Course
        WHERE DATE(date_creation) >= $1 AND DATE(date_creation) <= $2
    `, [dateRange.start, dateRange.end]);

    const cancelled = parseInt(result.rows[0]?.cancelled) || 0;
    const total = parseInt(result.rows[0]?.total) || 0;
    const rate = total > 0 ? (cancelled / total) * 100 : 0;

    return {
        value: Math.round(rate * 10) / 10,
        unit: '%',
        cancelled: cancelled,
        total: total,
        benchmark: getBenchmark(rate, [
            { threshold: 5, level: 'excellent', label: 'Excellent' },
            { threshold: 10, level: 'good', label: 'Bon' },
            { threshold: 15, level: 'warning', label: 'Acceptable' },
            { threshold: 25, level: 'critical', label: 'Problème' }
        ], true) // true = inverse (plus bas = mieux)
    };
}

// 🟫 7. Driver Retention
async function getDriverRetention() {
    // Cohorte: chauffeurs qui ont fait leur première course il y a X jours
    const result = await db.query(`
        WITH first_rides AS (
            SELECT
                id_chauffeur,
                MIN(DATE(date_heure_depart)) as first_ride_date
            FROM Course
            WHERE etat_course = 'terminee'
            GROUP BY id_chauffeur
        ),
        retention_metrics AS (
            SELECT
                -- Day 1 retention
                COUNT(DISTINCT CASE
                    WHEN EXISTS (
                        SELECT 1 FROM Course c2
                        WHERE c2.id_chauffeur = fr.id_chauffeur
                        AND DATE(c2.date_heure_depart) = fr.first_ride_date + 1
                        AND c2.etat_course = 'terminee'
                    )
                    AND fr.first_ride_date <= CURRENT_DATE - 1
                    THEN fr.id_chauffeur
                END) as day1_retained,
                COUNT(DISTINCT CASE WHEN fr.first_ride_date <= CURRENT_DATE - 1 THEN fr.id_chauffeur END) as day1_cohort,

                -- Week 1 retention (7 days)
                COUNT(DISTINCT CASE
                    WHEN EXISTS (
                        SELECT 1 FROM Course c2
                        WHERE c2.id_chauffeur = fr.id_chauffeur
                        AND DATE(c2.date_heure_depart) BETWEEN fr.first_ride_date + 1 AND fr.first_ride_date + 7
                        AND c2.etat_course = 'terminee'
                    )
                    AND fr.first_ride_date <= CURRENT_DATE - 7
                    THEN fr.id_chauffeur
                END) as week1_retained,
                COUNT(DISTINCT CASE WHEN fr.first_ride_date <= CURRENT_DATE - 7 THEN fr.id_chauffeur END) as week1_cohort,

                -- Week 4 retention (28 days)
                COUNT(DISTINCT CASE
                    WHEN EXISTS (
                        SELECT 1 FROM Course c2
                        WHERE c2.id_chauffeur = fr.id_chauffeur
                        AND DATE(c2.date_heure_depart) BETWEEN fr.first_ride_date + 21 AND fr.first_ride_date + 28
                        AND c2.etat_course = 'terminee'
                    )
                    AND fr.first_ride_date <= CURRENT_DATE - 28
                    THEN fr.id_chauffeur
                END) as week4_retained,
                COUNT(DISTINCT CASE WHEN fr.first_ride_date <= CURRENT_DATE - 28 THEN fr.id_chauffeur END) as week4_cohort,

                -- Month 2 retention (60 days)
                COUNT(DISTINCT CASE
                    WHEN EXISTS (
                        SELECT 1 FROM Course c2
                        WHERE c2.id_chauffeur = fr.id_chauffeur
                        AND DATE(c2.date_heure_depart) BETWEEN fr.first_ride_date + 30 AND fr.first_ride_date + 60
                        AND c2.etat_course = 'terminee'
                    )
                    AND fr.first_ride_date <= CURRENT_DATE - 60
                    THEN fr.id_chauffeur
                END) as month2_retained,
                COUNT(DISTINCT CASE WHEN fr.first_ride_date <= CURRENT_DATE - 60 THEN fr.id_chauffeur END) as month2_cohort
            FROM first_rides fr
        )
        SELECT * FROM retention_metrics
    `);

    const data = result.rows[0] || {};

    return {
        day1: {
            rate: data.day1_cohort > 0 ? Math.round((data.day1_retained / data.day1_cohort) * 100) : 0,
            retained: parseInt(data.day1_retained) || 0,
            cohort: parseInt(data.day1_cohort) || 0
        },
        week1: {
            rate: data.week1_cohort > 0 ? Math.round((data.week1_retained / data.week1_cohort) * 100) : 0,
            retained: parseInt(data.week1_retained) || 0,
            cohort: parseInt(data.week1_cohort) || 0
        },
        week4: {
            rate: data.week4_cohort > 0 ? Math.round((data.week4_retained / data.week4_cohort) * 100) : 0,
            retained: parseInt(data.week4_retained) || 0,
            cohort: parseInt(data.week4_cohort) || 0
        },
        month2: {
            rate: data.month2_cohort > 0 ? Math.round((data.month2_retained / data.month2_cohort) * 100) : 0,
            retained: parseInt(data.month2_retained) || 0,
            cohort: parseInt(data.month2_cohort) || 0
        }
    };
}

// 🟨 8. Rider Retention
async function getRiderRetention() {
    const result = await db.query(`
        WITH rider_stats AS (
            SELECT
                id_client,
                COUNT(*) as total_rides,
                MIN(DATE(date_heure_depart)) as first_ride_date,
                MAX(DATE(date_heure_depart)) as last_ride_date
            FROM Course
            WHERE etat_course = 'terminee'
            GROUP BY id_client
        )
        SELECT
            COUNT(CASE WHEN total_rides >= 2 THEN 1 END) as repeat_riders,
            COUNT(*) as total_riders,
            AVG(total_rides) as avg_rides_per_rider
        FROM rider_stats
        WHERE first_ride_date >= CURRENT_DATE - 30
    `);

    const data = result.rows[0] || {};
    const repeatRiders = parseInt(data.repeat_riders) || 0;
    const totalRiders = parseInt(data.total_riders) || 0;
    const retentionRate = totalRiders > 0 ? (repeatRiders / totalRiders) * 100 : 0;

    return {
        rate: Math.round(retentionRate),
        repeatRiders: repeatRiders,
        totalRiders: totalRiders,
        avgRidesPerRider: parseFloat(data.avg_rides_per_rider) || 0
    };
}

// 🟦 9. DAU / WAU / MAU
async function getDAU_WAU_MAU() {
    const result = await db.query(`
        SELECT
            -- DAU (Daily Active Users)
            COUNT(DISTINCT CASE
                WHEN DATE(date_heure_depart) = CURRENT_DATE
                THEN id_client
            END) as dau,

            -- WAU (Weekly Active Users)
            COUNT(DISTINCT CASE
                WHEN DATE(date_heure_depart) >= CURRENT_DATE - 7
                THEN id_client
            END) as wau,

            -- MAU (Monthly Active Users)
            COUNT(DISTINCT CASE
                WHEN DATE(date_heure_depart) >= CURRENT_DATE - 30
                THEN id_client
            END) as mau
        FROM Course
        WHERE etat_course = 'terminee'
    `);

    const data = result.rows[0] || {};
    const dau = parseInt(data.dau) || 0;
    const wau = parseInt(data.wau) || 0;
    const mau = parseInt(data.mau) || 0;

    return {
        dau: dau,
        wau: wau,
        mau: mau,
        stickiness: wau > 0 ? Math.round((dau / wau) * 100) : 0 // DAU/WAU ratio
    };
}

// 🔵 10. Supply/Demand Ratio
async function getSupplyDemandRatio(dateRange) {
    const result = await db.query(`
        SELECT
            COUNT(DISTINCT id_client) as demand_clients,
            (SELECT COUNT(*) FROM Chauffeur WHERE statut_validation = 'approuve') as supply_drivers,
            COUNT(*) as total_rides
        FROM Course
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_course != 'annulee'
    `, [dateRange.start, dateRange.end]);

    const data = result.rows[0] || {};
    const totalRides = parseInt(data.total_rides) || 0;
    const supplyDrivers = parseInt(data.supply_drivers) || 0;
    const ratio = totalRides > 0 ? supplyDrivers / (totalRides / 7) : 0; // drivers per avg daily rides

    return {
        ratio: Math.round(ratio * 10) / 10,
        supply: supplyDrivers,
        demandRides: totalRides,
        benchmark: getRatioBenchmark(ratio)
    };
}

// ⭐ 11. Activation Rate
async function getActivationRates() {
    // Chauffeurs
    const driverResult = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM Chauffeur) as total_registered,
            (SELECT COUNT(*) FROM Chauffeur WHERE photo_cni IS NOT NULL AND photo_selfie IS NOT NULL) as docs_submitted,
            (SELECT COUNT(*) FROM Chauffeur WHERE statut_validation = 'approuve') as approved,
            COUNT(DISTINCT id_chauffeur) as completed_ride
        FROM Course
        WHERE etat_course = 'terminee'
    `);

    // Clients
    const clientResult = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM Client) as total_registered,
            COUNT(DISTINCT id_client) as completed_ride
        FROM Course
        WHERE etat_course = 'terminee'
    `);

    const driverData = driverResult.rows[0] || {};
    const clientData = clientResult.rows[0] || {};

    return {
        drivers: {
            registered: parseInt(driverData.total_registered) || 0,
            docsSubmitted: parseInt(driverData.docs_submitted) || 0,
            approved: parseInt(driverData.approved) || 0,
            completedFirstRide: parseInt(driverData.completed_ride) || 0,
            activationRate: driverData.total_registered > 0
                ? Math.round((driverData.completed_ride / driverData.total_registered) * 100)
                : 0
        },
        clients: {
            registered: parseInt(clientData.total_registered) || 0,
            completedFirstRide: parseInt(clientData.completed_ride) || 0,
            activationRate: clientData.total_registered > 0
                ? Math.round((clientData.completed_ride / clientData.total_registered) * 100)
                : 0
        }
    };
}

// ============================================
// DELIVERY KPIs
// ============================================

// 🟩 1. Active Delivery Persons / day
async function getActiveDeliveryPersonsPerDay(dateRange) {
    const result = await db.query(`
        SELECT
            DATE(date_heure_depart) as date,
            COUNT(DISTINCT id_livreur) as active_delivery_persons
        FROM Livraison
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_livraison != 'annulee'
        GROUP BY DATE(date_heure_depart)
        ORDER BY date DESC
    `, [dateRange.start, dateRange.end]);

    const total = result.rows.reduce((sum, row) => sum + parseInt(row.active_delivery_persons), 0);
    const avg = result.rows.length > 0 ? total / result.rows.length : 0;

    return {
        current: result.rows[0]?.active_delivery_persons || 0,
        average: Math.round(avg),
        trend: result.rows.slice(0, 7),
        benchmark: getBenchmark(avg, [
            { threshold: 3, level: 'critical', label: 'Insuffisant' },
            { threshold: 20, level: 'warning', label: 'En croissance' },
            { threshold: 100, level: 'good', label: 'Bon niveau' },
            { threshold: 500, level: 'excellent', label: 'Excellent' }
        ])
    };
}

// 🟩 2. Active Delivery Clients / day
async function getActiveDeliveryClientsPerDay(dateRange) {
    const result = await db.query(`
        SELECT
            DATE(date_heure_depart) as date,
            COUNT(DISTINCT id_client) as active_clients
        FROM Livraison
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_livraison != 'annulee'
        GROUP BY DATE(date_heure_depart)
        ORDER BY date DESC
    `, [dateRange.start, dateRange.end]);

    const total = result.rows.reduce((sum, row) => sum + parseInt(row.active_clients), 0);
    const avg = result.rows.length > 0 ? total / result.rows.length : 0;

    return {
        current: result.rows[0]?.active_clients || 0,
        average: Math.round(avg),
        trend: result.rows.slice(0, 7)
    };
}

// 🟩 3. Completed Deliveries / day
async function getCompletedDeliveriesPerDay(dateRange) {
    const result = await db.query(`
        SELECT
            DATE(date_heure_depart) as date,
            COUNT(*) as deliveries
        FROM Livraison
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_livraison = 'terminee'
        GROUP BY DATE(date_heure_depart)
        ORDER BY date DESC
    `, [dateRange.start, dateRange.end]);

    const totalResult = await db.query(`
        SELECT COUNT(*) as total
        FROM Livraison
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_livraison = 'terminee'
    `, [dateRange.start, dateRange.end]);

    const total = result.rows.reduce((sum, row) => sum + parseInt(row.deliveries), 0);
    const avg = result.rows.length > 0 ? total / result.rows.length : 0;

    return {
        average: Math.round(avg),
        total: parseInt(totalResult.rows[0]?.total) || 0,
        trend: result.rows.slice(0, 7),
        benchmark: getBenchmark(avg, [
            { threshold: 5, level: 'critical', label: 'Très faible' },
            { threshold: 50, level: 'warning', label: 'Croissance à suivre' },
            { threshold: 200, level: 'good', label: 'Bon volume' },
            { threshold: 1000, level: 'excellent', label: 'Forte activité' }
        ])
    };
}

// 🟩 4. Delivery Matching Time
async function getDeliveryMatchingTime(dateRange) {
    const result = await db.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (date_heure_depart - date_heure_demande)) / 60) as avg_minutes
        FROM Livraison
        WHERE DATE(date_heure_demande) >= $1 AND DATE(date_heure_demande) <= $2
        AND etat_livraison != 'annulee'
        AND date_heure_depart IS NOT NULL
        AND date_heure_demande IS NOT NULL
    `, [dateRange.start, dateRange.end]);

    const avgMinutes = parseFloat(result.rows[0]?.avg_minutes) || 0;

    return {
        value: Math.round(avgMinutes * 10) / 10,
        benchmark: getBenchmark(avgMinutes, [
            { threshold: 1, level: 'excellent', label: 'Excellent (< 1 min)' },
            { threshold: 3, level: 'good', label: 'Bon (1-3 min)' },
            { threshold: 5, level: 'warning', label: 'Acceptable (3-5 min)' },
            { threshold: 999, level: 'critical', label: 'Trop lent (> 5 min)' }
        ], true)
    };
}

// 🟩 5. Delivery Acceptance Rate
async function getDeliveryAcceptanceRate(dateRange) {
    const result = await db.query(`
        SELECT
            COUNT(*) as total_requests,
            COUNT(*) FILTER (WHERE etat_livraison NOT IN ('annulee', 'en_attente')) as accepted
        FROM Livraison
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
    `, [dateRange.start, dateRange.end]);

    const data = result.rows[0] || {};
    const total = parseInt(data.total_requests) || 0;
    const accepted = parseInt(data.accepted) || 0;
    const rate = total > 0 ? Math.round((accepted / total) * 100) : 0;

    return {
        value: rate,
        total: total,
        accepted: accepted,
        benchmark: getBenchmark(rate, [
            { threshold: 50, level: 'critical', label: 'Critique (< 50%)' },
            { threshold: 70, level: 'warning', label: 'À améliorer (50-70%)' },
            { threshold: 85, level: 'good', label: 'Bon (70-85%)' },
            { threshold: 90, level: 'excellent', label: 'Excellent (> 85%)' }
        ])
    };
}

// 🟩 6. Delivery Cancellation Rate
async function getDeliveryCancellationRate(dateRange) {
    const result = await db.query(`
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE etat_livraison = 'annulee') as cancelled
        FROM Livraison
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
    `, [dateRange.start, dateRange.end]);

    const data = result.rows[0] || {};
    const total = parseInt(data.total) || 0;
    const cancelled = parseInt(data.cancelled) || 0;
    const rate = total > 0 ? Math.round((cancelled / total) * 100) : 0;

    return {
        value: rate,
        cancelled: cancelled,
        benchmark: getBenchmark(rate, [
            { threshold: 5, level: 'excellent', label: 'Excellent (< 5%)' },
            { threshold: 10, level: 'good', label: 'Bon (5-10%)' },
            { threshold: 20, level: 'warning', label: 'Attention (10-20%)' },
            { threshold: 999, level: 'critical', label: 'Critique (> 20%)' }
        ], true)
    };
}

// 🟩 7. Delivery Person Retention
async function getDeliveryPersonRetention() {
    const result = await db.query(`
        WITH first_deliveries AS (
            SELECT id_livreur, MIN(DATE(date_heure_depart)) as first_delivery_date
            FROM Livraison WHERE etat_livraison = 'terminee'
            GROUP BY id_livreur
        )
        SELECT
            COUNT(DISTINCT fd.id_livreur) as cohort_size,
            COUNT(DISTINCT CASE WHEN l.date_heure_depart >= fd.first_delivery_date + INTERVAL '1 day' THEN fd.id_livreur END) as day1_retained,
            COUNT(DISTINCT CASE WHEN l.date_heure_depart >= fd.first_delivery_date + INTERVAL '7 days' THEN fd.id_livreur END) as week1_retained,
            COUNT(DISTINCT CASE WHEN l.date_heure_depart >= fd.first_delivery_date + INTERVAL '28 days' THEN fd.id_livreur END) as week4_retained,
            COUNT(DISTINCT CASE WHEN l.date_heure_depart >= fd.first_delivery_date + INTERVAL '60 days' THEN fd.id_livreur END) as month2_retained
        FROM first_deliveries fd
        LEFT JOIN Livraison l ON l.id_livreur = fd.id_livreur AND l.etat_livraison = 'terminee'
    `);

    const data = result.rows[0] || {};
    const cohort = parseInt(data.cohort_size) || 1;

    return {
        day1: {
            rate: Math.round((parseInt(data.day1_retained) / cohort) * 100),
            retained: parseInt(data.day1_retained) || 0,
            cohort: cohort
        },
        week1: {
            rate: Math.round((parseInt(data.week1_retained) / cohort) * 100),
            retained: parseInt(data.week1_retained) || 0,
            cohort: cohort
        },
        week4: {
            rate: Math.round((parseInt(data.week4_retained) / cohort) * 100),
            retained: parseInt(data.week4_retained) || 0,
            cohort: cohort
        },
        month2: {
            rate: Math.round((parseInt(data.month2_retained) / cohort) * 100),
            retained: parseInt(data.month2_retained) || 0,
            cohort: cohort
        }
    };
}

// 🟩 8. Delivery Client Retention
async function getDeliveryClientRetention() {
    const result = await db.query(`
        SELECT
            COUNT(DISTINCT id_client) as total_clients,
            COUNT(DISTINCT CASE WHEN delivery_count > 1 THEN id_client END) as repeat_clients,
            AVG(delivery_count) as avg_deliveries_per_client
        FROM (
            SELECT id_client, COUNT(*) as delivery_count
            FROM Livraison
            WHERE etat_livraison = 'terminee'
            AND date_heure_depart >= NOW() - INTERVAL '30 days'
            GROUP BY id_client
        ) client_deliveries
    `);

    const data = result.rows[0] || {};
    const total = parseInt(data.total_clients) || 0;
    const repeat = parseInt(data.repeat_clients) || 0;
    const rate = total > 0 ? Math.round((repeat / total) * 100) : 0;

    return {
        rate: rate,
        totalClients: total,
        repeatClients: repeat,
        avgDeliveriesPerClient: parseFloat(data.avg_deliveries_per_client) || 0
    };
}

// 🟩 9. Delivery DAU/WAU/MAU
async function getDeliveryDAU_WAU_MAU() {
    const result = await db.query(`
        SELECT
            COUNT(DISTINCT CASE WHEN DATE(date_heure_depart) = CURRENT_DATE THEN id_livreur END) as dau,
            COUNT(DISTINCT CASE WHEN date_heure_depart >= NOW() - INTERVAL '7 days' THEN id_livreur END) as wau,
            COUNT(DISTINCT CASE WHEN date_heure_depart >= NOW() - INTERVAL '30 days' THEN id_livreur END) as mau
        FROM Livraison
        WHERE etat_livraison = 'terminee'
    `);

    const data = result.rows[0] || {};
    const dau = parseInt(data.dau) || 0;
    const wau = parseInt(data.wau) || 1;
    const mau = parseInt(data.mau) || 1;

    return {
        dau: dau,
        wau: wau,
        mau: mau,
        stickiness: Math.round((dau / wau) * 100)
    };
}

// 🟩 10. Delivery Supply/Demand Ratio
async function getDeliverySupplyDemandRatio(dateRange) {
    const result = await db.query(`
        SELECT
            COUNT(*) as total_deliveries,
            (SELECT COUNT(*) FROM Livreur WHERE statut_validation = 'approuve') as supply_delivery_persons
        FROM Livraison
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_livraison != 'annulee'
    `, [dateRange.start, dateRange.end]);

    const data = result.rows[0] || {};
    const totalDeliveries = parseInt(data.total_deliveries) || 0;
    const supplyDeliveryPersons = parseInt(data.supply_delivery_persons) || 0;
    const ratio = totalDeliveries > 0 ? supplyDeliveryPersons / (totalDeliveries / 7) : 0;

    return {
        ratio: Math.round(ratio * 10) / 10,
        supply: supplyDeliveryPersons,
        demandDeliveries: totalDeliveries,
        benchmark: getRatioBenchmark(ratio)
    };
}

// 🟩 11. Delivery Activation Rate
async function getDeliveryActivationRates() {
    const deliveryPersonResult = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM Livreur) as total_registered,
            (SELECT COUNT(*) FROM Livreur WHERE photo_cni IS NOT NULL AND photo_selfie IS NOT NULL) as docs_submitted,
            (SELECT COUNT(*) FROM Livreur WHERE statut_validation = 'approuve') as approved,
            COUNT(DISTINCT id_livreur) as completed_delivery
        FROM Livraison
        WHERE etat_livraison = 'terminee'
    `);

    const clientResult = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM Client) as total_registered,
            COUNT(DISTINCT id_client) as completed_delivery
        FROM Livraison
        WHERE etat_livraison = 'terminee'
    `);

    const deliveryPersonData = deliveryPersonResult.rows[0] || {};
    const clientData = clientResult.rows[0] || {};

    return {
        deliveryPersons: {
            registered: parseInt(deliveryPersonData.total_registered) || 0,
            docsSubmitted: parseInt(deliveryPersonData.docs_submitted) || 0,
            approved: parseInt(deliveryPersonData.approved) || 0,
            completedFirstDelivery: parseInt(deliveryPersonData.completed_delivery) || 0,
            activationRate: deliveryPersonData.total_registered > 0
                ? Math.round((deliveryPersonData.completed_delivery / deliveryPersonData.total_registered) * 100)
                : 0
        },
        clients: {
            registered: parseInt(clientData.total_registered) || 0,
            completedFirstDelivery: parseInt(clientData.completed_delivery) || 0,
            activationRate: clientData.total_registered > 0
                ? Math.round((clientData.completed_delivery / clientData.total_registered) * 100)
                : 0
        }
    };
}

// ============================================
// GLOBAL KPIs (COMBINED RIDE-SHARING + DELIVERY)
// ============================================

// 🌍 1. Global Active Workers (Drivers + Delivery Persons)
async function getGlobalActiveWorkersPerDay(dateRange) {
    const driversResult = await db.query(`
        SELECT COUNT(DISTINCT id_chauffeur) as count
        FROM Course
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_course != 'annulee'
    `, [dateRange.start, dateRange.end]);

    const deliveryPersonsResult = await db.query(`
        SELECT COUNT(DISTINCT id_livreur) as count
        FROM Livraison
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_livraison != 'annulee'
    `, [dateRange.start, dateRange.end]);

    const drivers = parseInt(driversResult.rows[0]?.count) || 0;
    const deliveryPersons = parseInt(deliveryPersonsResult.rows[0]?.count) || 0;

    return {
        total: drivers + deliveryPersons,
        drivers: drivers,
        deliveryPersons: deliveryPersons
    };
}

// 🌍 2. Global Active Users (Clients)
async function getGlobalActiveUsersPerDay(dateRange) {
    const ridesResult = await db.query(`
        SELECT COUNT(DISTINCT id_client) as count
        FROM Course
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_course != 'annulee'
    `, [dateRange.start, dateRange.end]);

    const deliveriesResult = await db.query(`
        SELECT COUNT(DISTINCT id_client) as count
        FROM Livraison
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_livraison != 'annulee'
    `, [dateRange.start, dateRange.end]);

    const ridesClients = parseInt(ridesResult.rows[0]?.count) || 0;
    const deliveryClients = parseInt(deliveriesResult.rows[0]?.count) || 0;

    return {
        total: ridesClients + deliveryClients,
        ridesClients: ridesClients,
        deliveryClients: deliveryClients
    };
}

// 🌍 3. Global Completed Jobs (Rides + Deliveries)
async function getGlobalCompletedJobsPerDay(dateRange) {
    const ridesResult = await db.query(`
        SELECT COUNT(*) as count
        FROM Course
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_course = 'terminee'
    `, [dateRange.start, dateRange.end]);

    const deliveriesResult = await db.query(`
        SELECT COUNT(*) as count
        FROM Livraison
        WHERE DATE(date_heure_depart) >= $1 AND DATE(date_heure_depart) <= $2
        AND etat_livraison = 'terminee'
    `, [dateRange.start, dateRange.end]);

    const rides = parseInt(ridesResult.rows[0]?.count) || 0;
    const deliveries = parseInt(deliveriesResult.rows[0]?.count) || 0;

    return {
        total: rides + deliveries,
        rides: rides,
        deliveries: deliveries
    };
}

// 🌍 4. Global Retention
async function getGlobalRetention() {
    // Worker retention
    const workerResult = await db.query(`
        WITH first_jobs AS (
            SELECT id_chauffeur as worker_id, MIN(DATE(date_heure_depart)) as first_job_date
            FROM Course WHERE etat_course = 'terminee'
            GROUP BY id_chauffeur
            UNION ALL
            SELECT id_livreur, MIN(DATE(date_heure_depart))
            FROM Livraison WHERE etat_livraison = 'terminee'
            GROUP BY id_livreur
        )
        SELECT
            COUNT(*) as cohort,
            COUNT(CASE WHEN first_job_date >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as active_30d
        FROM first_jobs
    `);

    const workerData = workerResult.rows[0] || {};
    const workerCohort = parseInt(workerData.cohort) || 1;
    const workerActive = parseInt(workerData.active_30d) || 0;

    return {
        workers: {
            rate: Math.round((workerActive / workerCohort) * 100),
            cohort: workerCohort,
            active: workerActive
        }
    };
}

// 🌍 5. Global DAU/WAU/MAU
async function getGlobalDAU_WAU_MAU() {
    const result = await db.query(`
        SELECT
            COUNT(DISTINCT CASE WHEN DATE(c.date_heure_depart) = CURRENT_DATE THEN c.id_chauffeur END) +
            COUNT(DISTINCT CASE WHEN DATE(l.date_heure_depart) = CURRENT_DATE THEN l.id_livreur END) as dau,

            COUNT(DISTINCT CASE WHEN c.date_heure_depart >= NOW() - INTERVAL '7 days' THEN c.id_chauffeur END) +
            COUNT(DISTINCT CASE WHEN l.date_heure_depart >= NOW() - INTERVAL '7 days' THEN l.id_livreur END) as wau,

            COUNT(DISTINCT CASE WHEN c.date_heure_depart >= NOW() - INTERVAL '30 days' THEN c.id_chauffeur END) +
            COUNT(DISTINCT CASE WHEN l.date_heure_depart >= NOW() - INTERVAL '30 days' THEN l.id_livreur END) as mau
        FROM Course c
        FULL OUTER JOIN Livraison l ON 1=1
        WHERE (c.etat_course = 'terminee' OR l.etat_livraison = 'terminee')
    `);

    const data = result.rows[0] || {};
    const dau = parseInt(data.dau) || 0;
    const wau = parseInt(data.wau) || 1;
    const mau = parseInt(data.mau) || 1;

    return {
        dau: dau,
        wau: wau,
        mau: mau,
        stickiness: Math.round((dau / wau) * 100)
    };
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function getDateRange(period, startDate, endDate) {
    const today = new Date().toISOString().split('T')[0];

    switch (period) {
        case 'today':
            return { start: today, end: today };
        case 'week':
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return { start: weekAgo.toISOString().split('T')[0], end: today };
        case 'month':
            const monthAgo = new Date();
            monthAgo.setDate(monthAgo.getDate() - 30);
            return { start: monthAgo.toISOString().split('T')[0], end: today };
        case 'custom':
            return { start: startDate || today, end: endDate || today };
        default:
            return { start: today, end: today };
    }
}

function getBenchmark(value, thresholds, inverse = false) {
    if (inverse) {
        // Pour les métriques où plus bas = mieux (ex: cancellation rate)
        for (let i = 0; i < thresholds.length; i++) {
            if (value <= thresholds[i].threshold) {
                return {
                    level: thresholds[i].level,
                    label: thresholds[i].label,
                    color: getLevelColor(thresholds[i].level)
                };
            }
        }
    } else {
        // Pour les métriques où plus haut = mieux
        for (let i = thresholds.length - 1; i >= 0; i--) {
            if (value >= thresholds[i].threshold) {
                return {
                    level: thresholds[i].level,
                    label: thresholds[i].label,
                    color: getLevelColor(thresholds[i].level)
                };
            }
        }
    }

    return {
        level: 'critical',
        label: 'Très faible',
        color: '#EF4444'
    };
}

function getRatioBenchmark(ratio) {
    if (ratio >= 1.5 && ratio <= 2.5) {
        return { level: 'excellent', label: 'Équilibre optimal', color: '#10B981' };
    } else if (ratio >= 1 && ratio < 1.5) {
        return { level: 'warning', label: 'Pas assez de chauffeurs', color: '#F59E0B' };
    } else if (ratio > 2.5) {
        return { level: 'warning', label: 'Trop de chauffeurs', color: '#F59E0B' };
    } else {
        return { level: 'critical', label: 'Déséquilibre majeur', color: '#EF4444' };
    }
}

function getLevelColor(level) {
    switch (level) {
        case 'excellent': return '#10B981';
        case 'good': return '#3B82F6';
        case 'warning': return '#F59E0B';
        case 'critical': return '#EF4444';
        default: return '#6B7280';
    }
}

module.exports = router;
