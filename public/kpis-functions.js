// ============================================
// VAMO ADMIN - KPIs FUNCTIONS
// ============================================

let kpisData = null;
let kpisCharts = {};

// Charger les KPIs
async function loadKPIs() {
    try {
        document.getElementById('kpis-loading').style.display = 'block';
        document.getElementById('kpis-content').style.display = 'none';

        // Récupérer les paramètres
        const period = document.getElementById('kpi-period-filter').value;
        const startDate = document.getElementById('kpi-start-date').value;
        const endDate = document.getElementById('kpi-end-date').value;

        // Construire l'URL
        let url = `${API_BASE}/admin/kpis/all?period=${period}`;
        if (period === 'custom' && startDate && endDate) {
            url += `&startDate=${startDate}&endDate=${endDate}`;
        }

        // Charger les données
        const token = localStorage.getItem('vamo_admin_token');
        const response = await fetch(url, {
            headers: { 'x-auth-token': token }
        });

        if (!response.ok) {
            throw new Error('Erreur chargement KPIs');
        }

        const data = await response.json();
        kpisData = data.kpis;

        // Afficher les KPIs
        displayKPIs();

        document.getElementById('kpis-loading').style.display = 'none';
        document.getElementById('kpis-content').style.display = 'block';

    } catch (error) {
        showNotification('Erreur de chargement des KPIs', 'error');
        document.getElementById('kpis-loading').innerHTML = `
            <p class="text-red-600">❌ Erreur de chargement des KPIs</p>
            <button onclick="loadKPIs()" class="btn-primary mt-4">Réessayer</button>
        `;
    }
}

// Afficher tous les KPIs
function displayKPIs() {
    if (!kpisData) return;

    // ============================================
    // RIDE-SHARING KPIs
    // ============================================
    const rs = kpisData.ridesharing || kpisData; // Backward compatibility

    // 1. Active Drivers
    displayKPICard('kpi-active-drivers-card', {
        title: 'Chauffeurs Actifs (Moyenne)',
        value: rs.activeDrivers.average,
        unit: 'chauffeurs/jour',
        benchmark: rs.activeDrivers.benchmark,
        subtitle: `Aujourd'hui: ${rs.activeDrivers.current}`
    });
    displayTrendChart('chart-active-drivers', rs.activeDrivers.trend, 'Chauffeurs Actifs', '#3B82F6');

    // 2. Active Riders
    displayKPICard('kpi-active-riders-card', {
        title: 'Clients Actifs (Moyenne)',
        value: rs.activeRiders.average,
        unit: 'clients/jour',
        subtitle: `Aujourd'hui: ${rs.activeRiders.current}`
    });
    displayTrendChart('chart-active-riders', rs.activeRiders.trend, 'Clients Actifs', '#10B981');

    // 3. Completed Rides
    displayKPICard('kpi-completed-rides-card', {
        title: 'Courses Complétées (Moyenne)',
        value: rs.completedRides.average,
        unit: 'courses/jour',
        benchmark: rs.completedRides.benchmark,
        subtitle: `Total: ${rs.completedRides.total} courses`
    });
    displayTrendChart('chart-completed-rides', rs.completedRides.trend, 'Courses Complétées', '#C6B383');

    // 4. Matching Time
    displayKPICard('kpi-matching-time-card', {
        title: 'Temps d\'Attente Moyen',
        value: rs.matchingTime.value,
        unit: 'minutes',
        benchmark: rs.matchingTime.benchmark
    });

    // 5. Acceptance Rate
    displayKPICard('kpi-acceptance-rate-card', {
        title: 'Taux d\'Acceptation',
        value: rs.acceptanceRate.value,
        unit: '%',
        benchmark: rs.acceptanceRate.benchmark,
        subtitle: `${rs.acceptanceRate.accepted} / ${rs.acceptanceRate.total} demandes`
    });

    // 6. Cancellation Rate
    displayKPICard('kpi-cancellation-rate-card', {
        title: 'Taux d\'Annulation',
        value: rs.cancellationRate.value,
        unit: '%',
        benchmark: rs.cancellationRate.benchmark,
        subtitle: `${rs.cancellationRate.cancelled} annulées`
    });

    // 7. Driver Retention
    displayRetentionCards('kpi-driver-retention-cards', rs.driverRetention, 'Chauffeurs');

    // 8. Rider Retention
    displayKPICard('kpi-rider-retention-card', {
        title: 'Rétention Clients (30j)',
        value: rs.riderRetention.rate,
        unit: '%',
        subtitle: `${rs.riderRetention.repeatRiders} / ${rs.riderRetention.totalRiders} clients reviennent`,
        additionalInfo: `Moyenne: ${rs.riderRetention.avgRidesPerRider.toFixed(1)} courses/client`
    });

    // 9. DAU/WAU/MAU
    displayDAU_WAU_MAU('kpi-dau-wau-mau-cards', rs.dau_wau_mau);

    // 10. Supply/Demand Ratio
    displayKPICard('kpi-supply-demand-card', {
        title: 'Ratio Offre/Demande',
        value: rs.supplyDemandRatio.ratio,
        unit: '',
        benchmark: rs.supplyDemandRatio.benchmark,
        subtitle: `${rs.supplyDemandRatio.supply} chauffeurs pour ${rs.supplyDemandRatio.demandRides} courses`
    });

    // 11. Activation Rates
    displayActivationRates('kpi-activation-cards', rs.activationRates);

    // ============================================
    // DELIVERY KPIs
    // ============================================
    if (kpisData.delivery) {
        const dv = kpisData.delivery;

        // 1. Active Delivery Persons
        displayKPICard('kpi-active-delivery-persons-card', {
            title: 'Livreurs Actifs (Moyenne)',
            value: dv.activeDeliveryPersons.average,
            unit: 'livreurs/jour',
            benchmark: dv.activeDeliveryPersons.benchmark,
            subtitle: `Aujourd'hui: ${dv.activeDeliveryPersons.current}`
        });
        displayTrendChart('chart-active-delivery-persons', dv.activeDeliveryPersons.trend, 'Livreurs Actifs', '#8B5CF6');

        // 2. Active Delivery Clients
        displayKPICard('kpi-active-delivery-clients-card', {
            title: 'Clients Livraison Actifs',
            value: dv.activeDeliveryClients.average,
            unit: 'clients/jour',
            subtitle: `Aujourd'hui: ${dv.activeDeliveryClients.current}`
        });
        displayTrendChart('chart-active-delivery-clients', dv.activeDeliveryClients.trend, 'Clients Livraison', '#EC4899');

        // 3. Completed Deliveries
        displayKPICard('kpi-completed-deliveries-card', {
            title: 'Livraisons Complétées',
            value: dv.completedDeliveries.average,
            unit: 'livraisons/jour',
            benchmark: dv.completedDeliveries.benchmark,
            subtitle: `Total: ${dv.completedDeliveries.total} livraisons`
        });
        displayTrendChart('chart-completed-deliveries', dv.completedDeliveries.trend, 'Livraisons Complétées', '#F59E0B');

        // 4. Delivery Matching Time
        displayKPICard('kpi-delivery-matching-time-card', {
            title: 'Temps d\'Attente Livraison',
            value: dv.deliveryMatchingTime.value,
            unit: 'minutes',
            benchmark: dv.deliveryMatchingTime.benchmark
        });

        // 5. Delivery Acceptance Rate
        displayKPICard('kpi-delivery-acceptance-rate-card', {
            title: 'Taux d\'Acceptation Livraison',
            value: dv.deliveryAcceptanceRate.value,
            unit: '%',
            benchmark: dv.deliveryAcceptanceRate.benchmark,
            subtitle: `${dv.deliveryAcceptanceRate.accepted} / ${dv.deliveryAcceptanceRate.total} demandes`
        });

        // 6. Delivery Cancellation Rate
        displayKPICard('kpi-delivery-cancellation-rate-card', {
            title: 'Taux d\'Annulation Livraison',
            value: dv.deliveryCancellationRate.value,
            unit: '%',
            benchmark: dv.deliveryCancellationRate.benchmark,
            subtitle: `${dv.deliveryCancellationRate.cancelled} annulées`
        });

        // 7. Delivery Person Retention
        displayRetentionCards('kpi-delivery-person-retention-cards', dv.deliveryPersonRetention, 'Livreurs');

        // 8. Delivery Client Retention
        displayKPICard('kpi-delivery-client-retention-card', {
            title: 'Rétention Clients Livraison',
            value: dv.deliveryClientRetention.rate,
            unit: '%',
            subtitle: `${dv.deliveryClientRetention.repeatClients} / ${dv.deliveryClientRetention.totalClients} clients reviennent`,
            additionalInfo: `Moyenne: ${dv.deliveryClientRetention.avgDeliveriesPerClient.toFixed(1)} livraisons/client`
        });

        // 9. Delivery DAU/WAU/MAU
        displayDAU_WAU_MAU('kpi-delivery-dau-wau-mau-cards', dv.deliveryDAU_WAU_MAU);

        // 10. Delivery Supply/Demand Ratio
        displayKPICard('kpi-delivery-supply-demand-card', {
            title: 'Ratio Offre/Demande Livraison',
            value: dv.deliverySupplyDemandRatio.ratio,
            unit: '',
            benchmark: dv.deliverySupplyDemandRatio.benchmark,
            subtitle: `${dv.deliverySupplyDemandRatio.supply} livreurs pour ${dv.deliverySupplyDemandRatio.demandDeliveries} livraisons`
        });

        // 11. Delivery Activation Rates
        displayDeliveryActivationRates('kpi-delivery-activation-cards', dv.deliveryActivationRates);
    }

    // ============================================
    // GLOBAL KPIs
    // ============================================
    if (kpisData.global) {
        const gl = kpisData.global;

        // 1. Global Active Workers
        displayKPICard('kpi-global-workers-card', {
            title: 'Travailleurs Actifs (Total)',
            value: gl.activeWorkers.total,
            unit: 'personnes',
            subtitle: `${gl.activeWorkers.drivers} chauffeurs + ${gl.activeWorkers.deliveryPersons} livreurs`
        });

        // 2. Global Active Users
        displayKPICard('kpi-global-users-card', {
            title: 'Utilisateurs Actifs (Total)',
            value: gl.activeUsers.total,
            unit: 'clients',
            subtitle: `${gl.activeUsers.ridesClients} courses + ${gl.activeUsers.deliveryClients} livraisons`
        });

        // 3. Global Completed Jobs
        displayKPICard('kpi-global-jobs-card', {
            title: 'Jobs Complétés (Total)',
            value: gl.completedJobs.total,
            unit: 'jobs',
            subtitle: `${gl.completedJobs.rides} courses + ${gl.completedJobs.deliveries} livraisons`
        });

        // 4. Global DAU/WAU/MAU
        displayDAU_WAU_MAU('kpi-global-dau-wau-mau-cards', gl.dau_wau_mau);

        // 5. Global Retention
        displayKPICard('kpi-global-retention-card', {
            title: 'Rétention Globale (30j)',
            value: gl.retention.workers.rate,
            unit: '%',
            subtitle: `${gl.retention.workers.active} / ${gl.retention.workers.cohort} travailleurs actifs`
        });
    }
}

// Afficher une carte KPI avec benchmark
function displayKPICard(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const benchmarkHTML = data.benchmark ? `
        <div class="mt-4 p-3 rounded-lg" style="background: ${data.benchmark.color}15; border-left: 4px solid ${data.benchmark.color}">
            <p class="text-sm font-semibold" style="color: ${data.benchmark.color}">
                ${data.benchmark.label}
            </p>
        </div>
    ` : '';

    container.innerHTML = `
        <p class="text-gray-600 text-xs font-semibold uppercase">${data.title}</p>
        <p class="text-4xl font-bold mt-2" style="color: var(--vamo-gold);">
            ${data.value} ${data.unit}
        </p>
        ${data.subtitle ? `<p class="text-sm text-gray-600 mt-2">${data.subtitle}</p>` : ''}
        ${data.additionalInfo ? `<p class="text-xs text-gray-500 mt-1">${data.additionalInfo}</p>` : ''}
        ${benchmarkHTML}
    `;
}

// Afficher un graphique de tendance
function displayTrendChart(canvasId, trendData, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !trendData || trendData.length === 0) return;

    // Détruire le graphique existant
    if (kpisCharts[canvasId]) {
        kpisCharts[canvasId].destroy();
    }

    const ctx = canvas.getContext('2d');
    kpisCharts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendData.map(d => new Date(d.date).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })),
            datasets: [{
                label: label,
                data: trendData.map(d => d.value),
                borderColor: color,
                backgroundColor: color + '20',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Afficher les cartes de rétention
function displayRetentionCards(containerId, retentionData, label) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const periods = [
        { key: 'day1', title: 'Jour 1' },
        { key: 'week1', title: 'Semaine 1' },
        { key: 'week4', title: 'Semaine 4' },
        { key: 'month2', title: 'Mois 2' }
    ];

    container.innerHTML = periods.map(period => {
        const data = retentionData[period.key];
        const rate = data.rate || 0;
        const color = rate >= 60 ? '#10B981' : rate >= 40 ? '#F59E0B' : '#EF4444';

        return `
            <div class="stat-card">
                <p class="text-gray-600 text-xs font-semibold uppercase">${period.title}</p>
                <p class="text-3xl font-bold mt-2" style="color: ${color}">
                    ${rate}%
                </p>
                <p class="text-xs text-gray-500 mt-1">
                    ${data.retained} / ${data.cohort} ${label}
                </p>
            </div>
        `;
    }).join('');
}

// Afficher DAU/WAU/MAU
function displayDAU_WAU_MAU(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="stat-card">
            <p class="text-gray-600 text-xs font-semibold uppercase">DAU</p>
            <p class="text-3xl font-bold mt-2" style="color: var(--vamo-gold);">${data.dau}</p>
            <p class="text-xs text-gray-500 mt-1">Daily Active Users</p>
        </div>
        <div class="stat-card">
            <p class="text-gray-600 text-xs font-semibold uppercase">WAU</p>
            <p class="text-3xl font-bold mt-2" style="color: var(--vamo-gold);">${data.wau}</p>
            <p class="text-xs text-gray-500 mt-1">Weekly Active Users</p>
        </div>
        <div class="stat-card">
            <p class="text-gray-600 text-xs font-semibold uppercase">MAU</p>
            <p class="text-3xl font-bold mt-2" style="color: var(--vamo-gold);">${data.mau}</p>
            <p class="text-xs text-gray-500 mt-1">Monthly Active Users</p>
        </div>
        <div class="stat-card">
            <p class="text-gray-600 text-xs font-semibold uppercase">Stickiness</p>
            <p class="text-3xl font-bold mt-2" style="color: var(--vamo-gold);">${data.stickiness}%</p>
            <p class="text-xs text-gray-500 mt-1">DAU/WAU ratio</p>
        </div>
    `;
}

// Afficher les taux d'activation
function displayActivationRates(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Chauffeurs
    const driverFunnelHTML = `
        <div class="stat-card">
            <h4 class="text-sm font-bold mb-4 text-gray-700">Funnel Chauffeurs</h4>
            <div class="space-y-2">
                <div class="flex justify-between text-sm">
                    <span>Inscrits:</span>
                    <strong>${data.drivers.registered}</strong>
                </div>
                <div class="flex justify-between text-sm">
                    <span>Documents soumis:</span>
                    <strong>${data.drivers.docsSubmitted}</strong>
                </div>
                <div class="flex justify-between text-sm">
                    <span>Approuvés:</span>
                    <strong>${data.drivers.approved}</strong>
                </div>
                <div class="flex justify-between text-sm">
                    <span>Première course:</span>
                    <strong>${data.drivers.completedFirstRide}</strong>
                </div>
            </div>
            <div class="mt-4 p-3 rounded-lg bg-blue-50">
                <p class="text-2xl font-bold" style="color: var(--vamo-gold);">
                    ${data.drivers.activationRate}%
                </p>
                <p class="text-xs text-gray-600 mt-1">Taux d'activation</p>
            </div>
        </div>
    `;

    // Clients
    const clientFunnelHTML = `
        <div class="stat-card">
            <h4 class="text-sm font-bold mb-4 text-gray-700">Funnel Clients</h4>
            <div class="space-y-2">
                <div class="flex justify-between text-sm">
                    <span>Inscrits:</span>
                    <strong>${data.clients.registered}</strong>
                </div>
                <div class="flex justify-between text-sm">
                    <span>Première course:</span>
                    <strong>${data.clients.completedFirstRide}</strong>
                </div>
            </div>
            <div class="mt-4 p-3 rounded-lg bg-green-50">
                <p class="text-2xl font-bold" style="color: var(--vamo-gold);">
                    ${data.clients.activationRate}%
                </p>
                <p class="text-xs text-gray-600 mt-1">Taux d'activation</p>
            </div>
        </div>
    `;

    container.innerHTML = driverFunnelHTML + clientFunnelHTML;
}

// Afficher les taux d'activation pour les livraisons
function displayDeliveryActivationRates(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Livreurs
    const deliveryPersonFunnelHTML = `
        <div class="stat-card">
            <h4 class="text-sm font-bold mb-4 text-gray-700">Funnel Livreurs</h4>
            <div class="space-y-2">
                <div class="flex justify-between text-sm">
                    <span>Inscrits:</span>
                    <strong>${data.deliveryPersons.registered}</strong>
                </div>
                <div class="flex justify-between text-sm">
                    <span>Documents soumis:</span>
                    <strong>${data.deliveryPersons.docsSubmitted}</strong>
                </div>
                <div class="flex justify-between text-sm">
                    <span>Approuvés:</span>
                    <strong>${data.deliveryPersons.approved}</strong>
                </div>
                <div class="flex justify-between text-sm">
                    <span>Première livraison:</span>
                    <strong>${data.deliveryPersons.completedFirstDelivery}</strong>
                </div>
            </div>
            <div class="mt-4 p-3 rounded-lg bg-purple-50">
                <p class="text-2xl font-bold" style="color: var(--vamo-gold);">
                    ${data.deliveryPersons.activationRate}%
                </p>
                <p class="text-xs text-gray-600 mt-1">Taux d'activation</p>
            </div>
        </div>
    `;

    // Clients Livraison
    const clientFunnelHTML = `
        <div class="stat-card">
            <h4 class="text-sm font-bold mb-4 text-gray-700">Funnel Clients Livraison</h4>
            <div class="space-y-2">
                <div class="flex justify-between text-sm">
                    <span>Inscrits:</span>
                    <strong>${data.clients.registered}</strong>
                </div>
                <div class="flex justify-between text-sm">
                    <span>Première livraison:</span>
                    <strong>${data.clients.completedFirstDelivery}</strong>
                </div>
            </div>
            <div class="mt-4 p-3 rounded-lg bg-pink-50">
                <p class="text-2xl font-bold" style="color: var(--vamo-gold);">
                    ${data.clients.activationRate}%
                </p>
                <p class="text-xs text-gray-600 mt-1">Taux d'activation</p>
            </div>
        </div>
    `;

    container.innerHTML = deliveryPersonFunnelHTML + clientFunnelHTML;
}

// Gérer l'affichage des dates custom
document.getElementById('kpi-period-filter')?.addEventListener('change', function() {
    const customDates = document.getElementById('kpi-custom-dates');
    if (this.value === 'custom') {
        customDates.style.display = 'flex';
    } else {
        customDates.style.display = 'none';
    }
});
