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

    // 1. Active Drivers
    displayKPICard('kpi-active-drivers-card', {
        title: 'Chauffeurs Actifs (Moyenne)',
        value: kpisData.activeDrivers.average,
        unit: 'chauffeurs/jour',
        benchmark: kpisData.activeDrivers.benchmark,
        subtitle: `Aujourd'hui: ${kpisData.activeDrivers.current}`
    });
    displayTrendChart('chart-active-drivers', kpisData.activeDrivers.trend, 'Chauffeurs Actifs', '#3B82F6');

    // 2. Active Riders
    displayKPICard('kpi-active-riders-card', {
        title: 'Clients Actifs (Moyenne)',
        value: kpisData.activeRiders.average,
        unit: 'clients/jour',
        subtitle: `Aujourd'hui: ${kpisData.activeRiders.current}`
    });
    displayTrendChart('chart-active-riders', kpisData.activeRiders.trend, 'Clients Actifs', '#10B981');

    // 3. Completed Rides
    displayKPICard('kpi-completed-rides-card', {
        title: 'Courses Complétées (Moyenne)',
        value: kpisData.completedRides.average,
        unit: 'courses/jour',
        benchmark: kpisData.completedRides.benchmark,
        subtitle: `Total: ${kpisData.completedRides.total} courses`
    });
    displayTrendChart('chart-completed-rides', kpisData.completedRides.trend, 'Courses Complétées', '#C6B383');

    // 4. Matching Time
    displayKPICard('kpi-matching-time-card', {
        title: 'Temps d\'Attente Moyen',
        value: kpisData.matchingTime.value,
        unit: 'minutes',
        benchmark: kpisData.matchingTime.benchmark
    });

    // 5. Acceptance Rate
    displayKPICard('kpi-acceptance-rate-card', {
        title: 'Taux d\'Acceptation',
        value: kpisData.acceptanceRate.value,
        unit: '%',
        benchmark: kpisData.acceptanceRate.benchmark,
        subtitle: `${kpisData.acceptanceRate.accepted} / ${kpisData.acceptanceRate.total} demandes`
    });

    // 6. Cancellation Rate
    displayKPICard('kpi-cancellation-rate-card', {
        title: 'Taux d\'Annulation',
        value: kpisData.cancellationRate.value,
        unit: '%',
        benchmark: kpisData.cancellationRate.benchmark,
        subtitle: `${kpisData.cancellationRate.cancelled} annulées`
    });

    // 7. Driver Retention
    displayRetentionCards('kpi-driver-retention-cards', kpisData.driverRetention, 'Chauffeurs');

    // 8. Rider Retention
    displayKPICard('kpi-rider-retention-card', {
        title: 'Rétention Clients (30j)',
        value: kpisData.riderRetention.rate,
        unit: '%',
        subtitle: `${kpisData.riderRetention.repeatRiders} / ${kpisData.riderRetention.totalRiders} clients reviennent`,
        additionalInfo: `Moyenne: ${kpisData.riderRetention.avgRidesPerRider.toFixed(1)} courses/client`
    });

    // 9. DAU/WAU/MAU
    displayDAU_WAU_MAU('kpi-dau-wau-mau-cards', kpisData.dau_wau_mau);

    // 10. Supply/Demand Ratio
    displayKPICard('kpi-supply-demand-card', {
        title: 'Ratio Offre/Demande',
        value: kpisData.supplyDemandRatio.ratio,
        unit: '',
        benchmark: kpisData.supplyDemandRatio.benchmark,
        subtitle: `${kpisData.supplyDemandRatio.supply} chauffeurs pour ${kpisData.supplyDemandRatio.demandRides} courses`
    });

    // 11. Activation Rates
    displayActivationRates('kpi-activation-cards', kpisData.activationRates);
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

// Gérer l'affichage des dates custom
document.getElementById('kpi-period-filter')?.addEventListener('change', function() {
    const customDates = document.getElementById('kpi-custom-dates');
    if (this.value === 'custom') {
        customDates.style.display = 'flex';
    } else {
        customDates.style.display = 'none';
    }
});
