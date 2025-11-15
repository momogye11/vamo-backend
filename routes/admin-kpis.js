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
        ] = await Promise.all([
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
            getActivationRates()
        ]);

        res.json({
            success: true,
            period: period,
            dateRange: dateRange,
            kpis: {
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
