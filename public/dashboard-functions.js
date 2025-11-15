// 🚀 VAMO ADMIN - FONCTIONS DASHBOARD COMPLET
// Toutes les fonctions pour gérer le dashboard admin

const API_BASE = VAMO_CONFIG.API_BASE;

// ============================================
// NAVIGATION & UI
// ============================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

function showPage(pageName) {
    // Hide all pages
    document.querySelectorAll('.page-section').forEach(page => {
        page.classList.remove('active');
    });

    // Show selected page
    const page = document.getElementById(`page-${pageName}`);
    if (page) {
        page.classList.add('active');
    }

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.closest('.nav-item')?.classList.add('active');

    // Update page title
    const titles = {
        'dashboard': 'Dashboard Principal',
        'clients': 'Gestion Clients',
        'chauffeurs': 'Gestion Chauffeurs',
        'livreurs': 'Gestion Livreurs',
        'courses': 'Gestion Courses',
        'livraisons': 'Gestion Livraisons',
        'finances': 'Gestion Finances',
        'map': 'Map Temps Réel',
        'analytics': 'Analytics Avancées',
        'messages': 'Messages & Support',
        'settings': 'Paramètres Système'
    };

    document.getElementById('pageTitle').textContent = titles[pageName] || 'Vamo Admin';

    // Close sidebar on mobile
    if (window.innerWidth < 768) {
        toggleSidebar();
    }

    // Load page data
    loadPageData(pageName);
}

// Cache pour éviter de recharger inutilement
let lastLoadedPage = null;
let pageLoadTimestamps = {};

function loadPageData(pageName) {
    // Éviter de recharger la même page si elle vient d'être chargée (< 5 secondes)
    const now = Date.now();
    const lastLoad = pageLoadTimestamps[pageName] || 0;

    if (pageName === lastLoadedPage && (now - lastLoad) < 5000) {
        // console.log(`⏭️ Skipping reload of ${pageName} (recently loaded)`);
        return;
    }

    lastLoadedPage = pageName;
    pageLoadTimestamps[pageName] = now;

    switch(pageName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'clients':
            loadClients();
            break;
        case 'chauffeurs':
            loadChauffeurs();
            break;
        case 'livreurs':
            loadLivreurs();
            break;
        case 'courses':
            loadCourses();
            break;
        case 'livraisons':
            loadLivraisons();
            break;
        case 'finances':
            loadFinances();
            break;
        case 'analytics':
            loadAnalytics();
            break;
    }
}

// ============================================
// DASHBOARD PRINCIPAL
// ============================================

async function loadDashboard() {
    // console.log('📊 Loading dashboard...');

    try {
        // Load all dashboard stats
        await Promise.all([
            loadDashboardStats(),
            loadDashboardCharts(),
            loadRecentActivity()
        ]);
    } catch (error) {
        // console.error('❌ Error loading dashboard:', error);
        showNotification('Erreur de chargement du dashboard', 'error');
    }
}

async function loadDashboardStats() {
    try {
        // Clients
        const clientsRes = await fetch(`${API_BASE}/client`);
        const clientsData = await clientsRes.json();
        document.getElementById('stat-clients').textContent = clientsData.length || 0;

        // Chauffeurs
        const chauffeursRes = await fetch(`${API_BASE}/debug/chauffeurs`);
        const chauffeursData = await chauffeursRes.json();
        const totalChauffeurs = chauffeursData.chauffeurs?.length || 0;
        const chauffeursOnline = chauffeursData.chauffeurs?.filter(c => c.disponibilite).length || 0;
        document.getElementById('stat-chauffeurs').textContent = totalChauffeurs;
        document.getElementById('chauffeurs-online').textContent = chauffeursOnline;

        // Courses actives
        const coursesRes = await fetch(`${API_BASE}/trips`);
        const coursesData = await coursesRes.json();
        const coursesActives = coursesData.filter(c => c.etat_course === 'en_cours').length || 0;
        document.getElementById('stat-courses-actives').textContent = coursesActives;

        // Revenus du jour
        const today = new Date().toISOString().split('T')[0];
        const revenusJour = await calculateRevenusJour(today);
        document.getElementById('stat-revenus-jour').textContent = formatCFA(revenusJour);

    } catch (error) {
        // console.error('❌ Error loading dashboard stats:', error);
    }
}

async function calculateRevenusJour(date) {
    try {
        const res = await fetch(`${API_BASE}/trips`);
        const trips = await res.json();

        const tripsToday = trips.filter(trip => {
            const tripDate = new Date(trip.date_heure_depart).toISOString().split('T')[0];
            return tripDate === date && trip.etat_course === 'terminee';
        });

        return tripsToday.reduce((sum, trip) => sum + (parseFloat(trip.prix) || 0), 0);
    } catch (error) {
        // console.error('Error calculating revenus:', error);
        return 0;
    }
}

// Store chart instances globally to destroy them later
let revenusChartInstance = null;
let activityChartInstance = null;

async function loadDashboardCharts() {
    try {
        // ✅ VRAIES DONNÉES - Charger depuis backend
        const [coursesRes, livraisonsRes] = await Promise.all([
            fetch(`${API_BASE}/trips`),
            fetch(`${API_BASE}/livraison`)
        ]);

        const courses = await coursesRes.json();
        const livraisons = await livraisonsRes.json() || [];

        // ✅ GRAPHIQUE REVENUS - 7 derniers jours avec VRAIES données
        const revenusCtx = document.getElementById('revenusChart');
        if (revenusCtx) {
            // Détruire l'ancien graphique s'il existe
            if (revenusChartInstance) {
                revenusChartInstance.destroy();
            }

            const last7Days = getLast7Days();
            const revenusData = last7Days.map(date => {
                return calculateRevenusByDate(courses, livraisons, date);
            });

            revenusChartInstance = new Chart(revenusCtx, {
                type: 'line',
                data: {
                    labels: last7Days.map(d => formatDayLabel(d)),
                    datasets: [{
                        label: 'Revenus (CFA)',
                        data: revenusData,
                        borderColor: '#C6B383',
                        backgroundColor: 'rgba(198, 179, 131, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return formatCFA(context.parsed.y);
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return formatCFA(value);
                                }
                            }
                        }
                    }
                }
            });
        }

        // ✅ GRAPHIQUE ACTIVITÉ - VRAIES données courses vs livraisons
        const activityCtx = document.getElementById('activityChart');
        if (activityCtx) {
            // Détruire l'ancien graphique s'il existe
            if (activityChartInstance) {
                activityChartInstance.destroy();
            }

            const coursesTerminees = courses.filter(c => c.etat_course === 'terminee').length;
            const livraisonsTerminees = livraisons.filter(l => l.etat_livraison === 'livree').length;

            activityChartInstance = new Chart(activityCtx, {
                type: 'bar',
                data: {
                    labels: ['Courses', 'Livraisons'],
                    datasets: [{
                        label: 'Nombre',
                        data: [coursesTerminees, livraisonsTerminees],
                        backgroundColor: ['#C6B383', '#D4C096']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    }
                }
            });
        }

    } catch (error) {
        // console.error('❌ Error loading dashboard charts:', error);
    }
}

async function loadRecentActivity() {
    const container = document.getElementById('recentActivity');

    try {
        // ✅ VRAIES DONNÉES - Charger les dernières activités réelles
        const [coursesRes, clientsRes, livraisonsRes] = await Promise.all([
            fetch(`${API_BASE}/trips`),
            fetch(`${API_BASE}/client`),
            fetch(`${API_BASE}/livraison`)
        ]);

        const courses = await coursesRes.json();
        const clients = await clientsRes.json();
        const livraisons = await livraisonsRes.json();

        const activities = [];

        // Dernières courses (5 plus récentes)
        const recentCourses = courses
            .sort((a, b) => new Date(b.date_heure_depart) - new Date(a.date_heure_depart))
            .slice(0, 5);

        recentCourses.forEach(course => {
            const timeAgo = getTimeAgo(course.date_heure_depart);
            activities.push({
                icon: '🚗',
                text: `Course #${course.id_course} - ${course.etat_course}`,
                time: timeAgo,
                timestamp: new Date(course.date_heure_depart)
            });
        });

        // Dernières livraisons (5 plus récentes)
        if (livraisons && livraisons.length > 0) {
            const recentLivraisons = livraisons
                .sort((a, b) => new Date(b.date_heure_depart) - new Date(a.date_heure_depart))
                .slice(0, 5);

            recentLivraisons.forEach(liv => {
                const timeAgo = getTimeAgo(liv.date_heure_depart);
                activities.push({
                    icon: '📦',
                    text: `Livraison #${liv.id_livraison} - ${liv.etat_livraison}`,
                    time: timeAgo,
                    timestamp: new Date(liv.date_heure_depart)
                });
            });
        }

        // Trier par date (plus récent en premier)
        activities.sort((a, b) => b.timestamp - a.timestamp);

        // Afficher top 10 activités
        const displayActivities = activities.slice(0, 10);

        if (displayActivities.length === 0) {
            container.innerHTML = '<p class="text-center py-8 text-gray-500">Aucune activité récente</p>';
            return;
        }

        container.innerHTML = displayActivities.map(a => `
            <div class="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition">
                <span class="text-2xl">${a.icon}</span>
                <div class="flex-1">
                    <p class="text-sm font-medium">${a.text}</p>
                    <p class="text-xs text-gray-500">${a.time}</p>
                </div>
            </div>
        `).join('');

    } catch (error) {
        // console.error('❌ Error loading recent activity:', error);
        container.innerHTML = '<p class="text-center py-8 text-red-500">Erreur de chargement</p>';
    }
}

// ============================================
// GESTION CLIENTS
// ============================================

let clientsPage = 1;
const clientsPerPage = 20;

async function loadClients() {
    // console.log('👥 Loading clients...');

    try {
        // ✅ VRAIES DONNÉES - Charger clients + courses + livraisons
        const [clientsRes, coursesRes, livraisonsRes] = await Promise.all([
            fetch(`${API_BASE}/client`),
            fetch(`${API_BASE}/trips`),
            fetch(`${API_BASE}/livraison`)
        ]);

        const clients = await clientsRes.json();
        const allCourses = await coursesRes.json();
        const allLivraisons = await livraisonsRes.json() || [];

        // console.log('Clients loaded:', clients.length);

        // Update total
        document.getElementById('clientsTotal').textContent = clients.length;

        // Render table
        const tbody = document.getElementById('clientsTableBody');

        if (clients.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-8 text-gray-500">
                        Aucun client trouvé
                    </td>
                </tr>
            `;
            return;
        }

        // ✅ Calculer les vraies stats pour chaque client
        tbody.innerHTML = clients.map(client => {
            // Compter courses du client
            const clientCourses = allCourses.filter(c => c.id_client === client.id_client);
            const nbCourses = clientCourses.length;

            // Compter livraisons du client
            const clientLivraisons = allLivraisons.filter(l => l.id_client === client.id_client);
            const nbLivraisons = clientLivraisons.length;

            // Calculer total dépensé
            const totalDepense =
                clientCourses.reduce((sum, c) => sum + (parseFloat(c.prix) || 0), 0) +
                clientLivraisons.reduce((sum, l) => sum + (parseFloat(l.prix) || 0), 0);

            return `
                <tr onclick="showClientDetails(${client.id_client})" class="cursor-pointer">
                    <td>${client.id_client}</td>
                    <td class="font-medium">${client.nom} ${client.prenom}</td>
                    <td>${client.telephone}</td>
                    <td>
                        <span class="badge badge-info">${nbCourses} course${nbCourses > 1 ? 's' : ''}</span>
                        ${nbLivraisons > 0 ? `<span class="badge badge-warning ml-1">${nbLivraisons} liv.</span>` : ''}
                    </td>
                    <td class="font-semibold" style="color: var(--vamo-gold);">${formatCFA(totalDepense)}</td>
                    <td class="text-sm text-gray-500">-</td>
                    <td>
                        <button onclick="event.stopPropagation(); showClientDetails(${client.id_client})"
                                class="btn-secondary text-xs px-3 py-1">
                            Détails
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        // console.error('❌ Error loading clients:', error);
        document.getElementById('clientsTableBody').innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-8 text-red-500">
                    Erreur de chargement
                </td>
            </tr>
        `;
    }
}

function searchClients() {
    const query = document.getElementById('searchClients').value.toLowerCase();
    const status = document.getElementById('filterClientsStatus').value;

    // console.log('Searching clients:', query, status);
    // Implement search logic
    loadClients();
}

async function showClientDetails(clientId) {
    // console.log('Show client details:', clientId);

    // Afficher modal avec chargement
    showModal('Détails Client #' + clientId, '<div class="text-center py-8"><p>Chargement des données...</p></div>');

    try {
        // ✅ VRAIES DONNÉES - Charger toutes les infos du client
        const [clientRes, coursesRes, livraisonsRes] = await Promise.all([
            fetch(`${API_BASE}/client`),
            fetch(`${API_BASE}/trips`),
            fetch(`${API_BASE}/livraison`)
        ]);

        const clients = await clientRes.json();
        const allCourses = await coursesRes.json();
        const allLivraisons = await livraisonsRes.json() || [];

        const client = clients.find(c => c.id_client === clientId);

        if (!client) {
            document.getElementById('modalContent').innerHTML = '<p class="text-red-500">Client non trouvé</p>';
            return;
        }

        // Filtrer courses et livraisons du client
        const clientCourses = allCourses.filter(c => c.id_client === clientId);
        const clientLivraisons = allLivraisons.filter(l => l.id_client === clientId);

        // Calculer stats
        const totalDepense =
            clientCourses.reduce((sum, c) => sum + (parseFloat(c.prix) || 0), 0) +
            clientLivraisons.reduce((sum, l) => sum + (parseFloat(l.prix) || 0), 0);

        const modalContent = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-sm text-gray-600">Nom complet</p>
                        <p class="font-semibold">${client.nom} ${client.prenom}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Téléphone</p>
                        <p class="font-semibold">${client.telephone}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Email</p>
                        <p class="font-semibold">${client.email || 'N/A'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Date inscription</p>
                        <p class="font-semibold">${formatDate(client.date_inscription)}</p>
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                    <div class="text-center">
                        <p class="text-2xl font-bold text-blue-600">${clientCourses.length}</p>
                        <p class="text-sm text-gray-600">Courses</p>
                    </div>
                    <div class="text-center">
                        <p class="text-2xl font-bold text-orange-600">${clientLivraisons.length}</p>
                        <p class="text-sm text-gray-600">Livraisons</p>
                    </div>
                    <div class="text-center">
                        <p class="text-2xl font-bold" style="color: var(--vamo-gold);">${formatCFA(totalDepense)}</p>
                        <p class="text-sm text-gray-600">Total dépensé</p>
                    </div>
                </div>

                <div>
                    <h4 class="font-semibold mb-2">📜 Historique Courses (${clientCourses.length})</h4>
                    ${clientCourses.length === 0 ? '<p class="text-sm text-gray-500">Aucune course</p>' : `
                        <div class="max-h-48 overflow-y-auto space-y-2">
                            ${clientCourses.slice(0, 10).map(course => `
                                <div class="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                                    <div>
                                        <p class="font-medium">Course #${course.id_course}</p>
                                        <p class="text-xs text-gray-500">${formatDate(course.date_heure_depart)}</p>
                                    </div>
                                    <div class="text-right">
                                        <p class="font-semibold" style="color: var(--vamo-gold);">${formatCFA(course.prix)}</p>
                                        <span class="badge ${getBadgeClass(course.etat_course)} text-xs">${course.etat_course}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>

                <div>
                    <h4 class="font-semibold mb-2">📦 Historique Livraisons (${clientLivraisons.length})</h4>
                    ${clientLivraisons.length === 0 ? '<p class="text-sm text-gray-500">Aucune livraison</p>' : `
                        <div class="max-h-48 overflow-y-auto space-y-2">
                            ${clientLivraisons.slice(0, 10).map(liv => `
                                <div class="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                                    <div>
                                        <p class="font-medium">Livraison #${liv.id_livraison}</p>
                                        <p class="text-xs text-gray-500">${formatDate(liv.date_heure_depart)}</p>
                                    </div>
                                    <div class="text-right">
                                        <p class="font-semibold" style="color: var(--vamo-gold);">${formatCFA(liv.prix)}</p>
                                        <span class="badge ${getBadgeClass(liv.etat_livraison)} text-xs">${liv.etat_livraison}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>
        `;

        document.getElementById('modalContent').innerHTML = modalContent;

    } catch (error) {
        // console.error('Error loading client details:', error);
        document.getElementById('modalContent').innerHTML = '<p class="text-red-500">Erreur de chargement</p>';
    }
}

// ============================================
// GESTION CHAUFFEURS
// ============================================

async function loadChauffeurs() {
    // console.log('🚗 Loading chauffeurs...');

    try {
        const res = await fetch(`${API_BASE}/debug/chauffeurs`);
        const data = await res.json();
        const chauffeurs = data.chauffeurs || [];

        const content = document.getElementById('chauffeursContent');

        if (chauffeurs.length === 0) {
            content.innerHTML = '<p class="text-center py-8 text-gray-500">Aucun chauffeur trouvé</p>';
            return;
        }

        content.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${chauffeurs.map(c => `
                    <div class="card p-4">
                        <div class="flex items-start justify-between mb-3">
                            <div>
                                <h4 class="font-semibold">${c.nom} ${c.prenom}</h4>
                                <p class="text-sm text-gray-600">${c.telephone}</p>
                            </div>
                            <span class="status-dot ${c.disponibilite ? 'online' : 'offline'}"></span>
                        </div>
                        <div class="space-y-2 text-sm">
                            <p><span class="text-gray-600">Statut:</span>
                                <span class="badge ${getBadgeClass(c.statut_validation)}">${c.statut_validation}</span>
                            </p>
                            <p><span class="text-gray-600">Véhicule:</span> ${c.marque_vehicule || 'N/A'}</p>
                            <p><span class="text-gray-600">Plaque:</span> ${c.plaque_immatriculation || 'N/A'}</p>
                        </div>
                        <div class="mt-4 flex gap-2">
                            ${c.statut_validation === 'en_attente' ? `
                                <button onclick="approveChauffeur(${c.id_chauffeur})" class="btn-primary text-xs flex-1">
                                    Approuver
                                </button>
                                <button onclick="rejectChauffeur(${c.id_chauffeur})" class="btn-secondary text-xs flex-1">
                                    Rejeter
                                </button>
                            ` : `
                                <button onclick="showChauffeurDetails(${c.id_chauffeur})" class="btn-secondary text-xs flex-1">
                                    Détails
                                </button>
                            `}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

    } catch (error) {
        // console.error('❌ Error loading chauffeurs:', error);
    }
}

async function approveChauffeur(id) {
    if (!confirm('Approuver ce chauffeur?')) return;

    try {
        const res = await fetch(`${API_BASE}/admin/chauffeur/${id}/approve`, {
            method: 'PUT'
        });

        if (res.ok) {
            showNotification('Chauffeur approuvé avec succès', 'success');
            loadChauffeurs();
        } else {
            throw new Error('Erreur lors de l\'approbation');
        }
    } catch (error) {
        // console.error('Error:', error);
        showNotification('Erreur lors de l\'approbation', 'error');
    }
}

async function rejectChauffeur(id) {
    if (!confirm('Rejeter ce chauffeur?')) return;

    try {
        const res = await fetch(`${API_BASE}/admin/chauffeur/${id}/reject`, {
            method: 'PUT'
        });

        if (res.ok) {
            showNotification('Chauffeur rejeté', 'success');
            loadChauffeurs();
        } else {
            throw new Error('Erreur lors du rejet');
        }
    } catch (error) {
        // console.error('Error:', error);
        showNotification('Erreur lors du rejet', 'error');
    }
}

async function showChauffeurDetails(chauffeurId) {
    // console.log('Show chauffeur details:', chauffeurId);

    showModal('Détails Chauffeur #' + chauffeurId, '<div class="text-center py-8"><p>Chargement des données...</p></div>');

    try {
        const res = await fetch(`${API_BASE}/debug/chauffeurs`);
        const data = await res.json();
        const chauffeurs = data.chauffeurs || [];

        const chauffeur = chauffeurs.find(c => c.id_chauffeur === chauffeurId);

        if (!chauffeur) {
            document.getElementById('modalContent').innerHTML = '<p class="text-red-500">Chauffeur non trouvé</p>';
            return;
        }

        const modalContent = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-sm text-gray-600">Nom complet</p>
                        <p class="font-semibold">${chauffeur.nom} ${chauffeur.prenom}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Téléphone</p>
                        <p class="font-semibold">${chauffeur.telephone}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Email</p>
                        <p class="font-semibold">${chauffeur.email || 'N/A'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Statut</p>
                        <span class="badge ${getBadgeClass(chauffeur.statut_validation)}">${chauffeur.statut_validation}</span>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Disponibilité</p>
                        <span class="status-dot ${chauffeur.disponibilite ? 'online' : 'offline'}"></span>
                        ${chauffeur.disponibilite ? 'En ligne' : 'Hors ligne'}
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Date inscription</p>
                        <p class="font-semibold">${formatDate(chauffeur.date_inscription)}</p>
                    </div>
                </div>

                <div class="p-4 bg-gray-50 rounded-lg">
                    <h4 class="font-semibold mb-2">🚗 Informations Véhicule</h4>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <p class="text-xs text-gray-600">Marque</p>
                            <p class="text-sm font-medium">${chauffeur.marque_vehicule || 'N/A'}</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-600">Modèle</p>
                            <p class="text-sm font-medium">${chauffeur.modele_vehicule || 'N/A'}</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-600">Couleur</p>
                            <p class="text-sm font-medium">${chauffeur.couleur_vehicule || 'N/A'}</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-600">Plaque</p>
                            <p class="text-sm font-medium">${chauffeur.plaque_immatriculation || 'N/A'}</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-600">Année</p>
                            <p class="text-sm font-medium">${chauffeur.annee_vehicule || 'N/A'}</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-600">Nb places</p>
                            <p class="text-sm font-medium">${chauffeur.nombre_places || 'N/A'}</p>
                        </div>
                    </div>
                </div>

                ${chauffeur.photo_vehicule ? `
                    <div>
                        <p class="text-sm text-gray-600 mb-2">📸 Photo véhicule</p>
                        <img src="${getImageUrl(chauffeur.photo_vehicule)}" alt="Véhicule" class="w-full max-h-64 object-cover rounded-lg">
                    </div>
                ` : ''}

                ${chauffeur.photo_cni ? `
                    <div>
                        <p class="text-sm text-gray-600 mb-2">🪪 Carte d'identité</p>
                        <img src="${getImageUrl(chauffeur.photo_cni)}" alt="CNI" class="w-full max-h-64 object-cover rounded-lg">
                    </div>
                ` : ''}

                ${chauffeur.photo_selfie ? `
                    <div>
                        <p class="text-sm text-gray-600 mb-2">📸 Photo selfie</p>
                        <img src="${getImageUrl(chauffeur.photo_selfie)}" alt="Selfie" class="w-full max-h-64 object-cover rounded-lg">
                    </div>
                ` : ''}

                <!-- Actions Admin -->
                <div class="border-t pt-4 mt-4">
                    <h4 class="font-semibold mb-3">👮 Actions Administrateur</h4>
                    <div class="flex gap-2 flex-wrap">
                        ${chauffeur.statut_validation !== 'approuve' ? `
                            <button onclick="updateChauffeurStatus(${chauffeur.id_chauffeur}, 'approve')"
                                    class="btn-primary text-sm px-4 py-2">
                                ✅ Approuver
                            </button>
                        ` : ''}
                        ${chauffeur.statut_validation !== 'rejete' ? `
                            <button onclick="updateChauffeurStatus(${chauffeur.id_chauffeur}, 'reject')"
                                    class="bg-red-500 text-white text-sm px-4 py-2 rounded hover:bg-red-600">
                                ❌ Rejeter
                            </button>
                        ` : ''}
                        ${chauffeur.statut_validation !== 'suspendu' ? `
                            <button onclick="updateChauffeurStatus(${chauffeur.id_chauffeur}, 'suspend')"
                                    class="bg-orange-500 text-white text-sm px-4 py-2 rounded hover:bg-orange-600">
                                ⏸️ Suspendre
                            </button>
                        ` : ''}
                        ${chauffeur.statut_validation === 'suspendu' ? `
                            <button onclick="updateChauffeurStatus(${chauffeur.id_chauffeur}, 'approve')"
                                    class="bg-green-500 text-white text-sm px-4 py-2 rounded hover:bg-green-600">
                                ▶️ Réactiver
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('modalContent').innerHTML = modalContent;

    } catch (error) {
        // console.error('Error loading chauffeur details:', error);
        document.getElementById('modalContent').innerHTML = '<p class="text-red-500">Erreur de chargement</p>';
    }
}

// Fonction pour mettre à jour le statut d'un chauffeur
async function updateChauffeurStatus(chauffeurId, action) {
    const actionMessages = {
        approve: 'Approuver ce chauffeur ?',
        reject: 'Rejeter ce chauffeur ?',
        suspend: 'Suspendre ce chauffeur ?'
    };

    const successMessages = {
        approve: 'Chauffeur approuvé avec succès ✅',
        reject: 'Chauffeur rejeté ❌',
        suspend: 'Chauffeur suspendu ⏸️'
    };

    if (!confirm(actionMessages[action])) return;

    try {
        // console.log(`🔄 Updating chauffeur ${chauffeurId} with action: ${action}`);

        const res = await fetch(`${API_BASE}/admin/drivers/${chauffeurId}/verify`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action })
        });

        const data = await res.json();

        if (res.ok) {
            showNotification(successMessages[action], 'success');

            // Fermer le modal
            document.getElementById('detailModal').classList.add('hidden');

            // Recharger les chauffeurs et les demandes en attente
            await loadChauffeurs();
            loadPendingRequests();

            // console.log('✅ Chauffeur status updated successfully');
        } else {
            throw new Error(data.error || 'Erreur lors de la mise à jour');
        }
    } catch (error) {
        // console.error('❌ Error updating chauffeur status:', error);
        showNotification('Erreur lors de la mise à jour du statut', 'error');
    }
}

// ============================================
// GESTION LIVREURS
// ============================================

async function loadLivreurs() {
    // console.log('🏍️ Loading livreurs...');

    try {
        const res = await fetch(`${API_BASE}/debug/livreurs`);
        const data = await res.json();
        const livreurs = data.livreurs || [];

        const content = document.getElementById('livreursContent');

        if (livreurs.length === 0) {
            content.innerHTML = '<p class="text-center py-8 text-gray-500">Aucun livreur trouvé</p>';
            return;
        }

        content.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${livreurs.map(l => `
                    <div class="card p-4">
                        <div class="flex items-start justify-between mb-3">
                            <div>
                                <h4 class="font-semibold">${l.nom} ${l.prenom}</h4>
                                <p class="text-sm text-gray-600">${l.telephone}</p>
                            </div>
                            <span class="status-dot ${l.disponibilite ? 'online' : 'offline'}"></span>
                        </div>
                        <div class="space-y-2 text-sm">
                            <p><span class="text-gray-600">Statut:</span>
                                <span class="badge ${getBadgeClass(l.statut_validation)}">${l.statut_validation}</span>
                            </p>
                            <p><span class="text-gray-600">Type:</span> ${l.type_vehicule || 'N/A'}</p>
                        </div>
                        <div class="mt-4 flex gap-2">
                            ${l.statut_validation === 'en_attente' ? `
                                <button onclick="approveLivreur(${l.id_livreur})" class="btn-primary text-xs flex-1">
                                    Approuver
                                </button>
                                <button onclick="rejectLivreur(${l.id_livreur})" class="btn-secondary text-xs flex-1">
                                    Rejeter
                                </button>
                            ` : `
                                <button onclick="showLivreurDetails(${l.id_livreur})" class="btn-secondary text-xs flex-1">
                                    Détails
                                </button>
                            `}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

    } catch (error) {
        // console.error('❌ Error loading livreurs:', error);
    }
}

async function approveLivreur(id) {
    if (!confirm('Approuver ce livreur?')) return;

    try {
        const res = await fetch(`${API_BASE}/admin/livreur/${id}/approve`, {
            method: 'PUT'
        });

        if (res.ok) {
            showNotification('Livreur approuvé avec succès', 'success');
            loadLivreurs();
        }
    } catch (error) {
        // console.error('Error:', error);
        showNotification('Erreur lors de l\'approbation', 'error');
    }
}

async function rejectLivreur(id) {
    if (!confirm('Rejeter ce livreur?')) return;

    try {
        const res = await fetch(`${API_BASE}/admin/livreur/${id}/reject`, {
            method: 'PUT'
        });

        if (res.ok) {
            showNotification('Livreur rejeté', 'success');
            loadLivreurs();
        }
    } catch (error) {
        // console.error('Error:', error);
        showNotification('Erreur lors du rejet', 'error');
    }
}

async function showLivreurDetails(livreurId) {
    // console.log('Show livreur details:', livreurId);

    showModal('Détails Livreur #' + livreurId, '<div class="text-center py-8"><p>Chargement des données...</p></div>');

    try {
        const res = await fetch(`${API_BASE}/debug/livreurs`);
        const data = await res.json();
        const livreurs = data.livreurs || [];

        const livreur = livreurs.find(l => l.id_livreur === livreurId);

        if (!livreur) {
            document.getElementById('modalContent').innerHTML = '<p class="text-red-500">Livreur non trouvé</p>';
            return;
        }

        const modalContent = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-sm text-gray-600">Nom complet</p>
                        <p class="font-semibold">${livreur.nom} ${livreur.prenom}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Téléphone</p>
                        <p class="font-semibold">${livreur.telephone}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Email</p>
                        <p class="font-semibold">${livreur.email || 'N/A'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Statut</p>
                        <span class="badge ${getBadgeClass(livreur.statut_validation)}">${livreur.statut_validation}</span>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Disponibilité</p>
                        <span class="status-dot ${livreur.disponibilite ? 'online' : 'offline'}"></span>
                        ${livreur.disponibilite ? 'En ligne' : 'Hors ligne'}
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Date inscription</p>
                        <p class="font-semibold">${formatDate(livreur.date_inscription)}</p>
                    </div>
                </div>

                <div class="p-4 bg-gray-50 rounded-lg">
                    <h4 class="font-semibold mb-2">🏍️ Informations Véhicule</h4>
                    <div class="grid grid-cols-1 gap-2">
                        <div>
                            <p class="text-xs text-gray-600">Type véhicule</p>
                            <p class="text-sm font-medium">${livreur.type_vehicule || 'N/A'}</p>
                        </div>
                    </div>
                </div>

                ${livreur.photo_vehicule ? `
                    <div>
                        <p class="text-sm text-gray-600 mb-2">📸 Photo véhicule</p>
                        <img src="${getImageUrl(livreur.photo_vehicule)}" alt="Véhicule" class="w-full max-h-64 object-cover rounded-lg">
                    </div>
                ` : ''}

                ${livreur.photo_cni ? `
                    <div>
                        <p class="text-sm text-gray-600 mb-2">🪪 Carte d'identité</p>
                        <img src="${getImageUrl(livreur.photo_cni)}" alt="CNI" class="w-full max-h-64 object-cover rounded-lg">
                    </div>
                ` : ''}

                ${livreur.photo_selfie ? `
                    <div>
                        <p class="text-sm text-gray-600 mb-2">📸 Photo selfie</p>
                        <img src="${getImageUrl(livreur.photo_selfie)}" alt="Selfie" class="w-full max-h-64 object-cover rounded-lg">
                    </div>
                ` : ''}

                <!-- Actions Admin -->
                <div class="border-t pt-4 mt-4">
                    <h4 class="font-semibold mb-3">👮 Actions Administrateur</h4>
                    <div class="flex gap-2 flex-wrap">
                        ${livreur.statut_validation !== 'approuve' ? `
                            <button onclick="updateLivreurStatus(${livreur.id_livreur}, 'approve')"
                                    class="btn-primary text-sm px-4 py-2">
                                ✅ Approuver
                            </button>
                        ` : ''}
                        ${livreur.statut_validation !== 'rejete' ? `
                            <button onclick="updateLivreurStatus(${livreur.id_livreur}, 'reject')"
                                    class="bg-red-500 text-white text-sm px-4 py-2 rounded hover:bg-red-600">
                                ❌ Rejeter
                            </button>
                        ` : ''}
                        ${livreur.statut_validation !== 'suspendu' ? `
                            <button onclick="updateLivreurStatus(${livreur.id_livreur}, 'suspend')"
                                    class="bg-orange-500 text-white text-sm px-4 py-2 rounded hover:bg-orange-600">
                                ⏸️ Suspendre
                            </button>
                        ` : ''}
                        ${livreur.statut_validation === 'suspendu' ? `
                            <button onclick="updateLivreurStatus(${livreur.id_livreur}, 'approve')"
                                    class="bg-green-500 text-white text-sm px-4 py-2 rounded hover:bg-green-600">
                                ▶️ Réactiver
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('modalContent').innerHTML = modalContent;

    } catch (error) {
        // console.error('Error loading livreur details:', error);
        document.getElementById('modalContent').innerHTML = '<p class="text-red-500">Erreur de chargement</p>';
    }
}

// Fonction pour mettre à jour le statut d'un livreur
async function updateLivreurStatus(livreurId, action) {
    const actionMessages = {
        approve: 'Approuver ce livreur ?',
        reject: 'Rejeter ce livreur ?',
        suspend: 'Suspendre ce livreur ?'
    };

    const successMessages = {
        approve: 'Livreur approuvé avec succès ✅',
        reject: 'Livreur rejeté ❌',
        suspend: 'Livreur suspendu ⏸️'
    };

    if (!confirm(actionMessages[action])) return;

    try {
        // console.log(`🔄 Updating livreur ${livreurId} with action: ${action}`);

        const res = await fetch(`${API_BASE}/admin/delivery-persons/${livreurId}/verify`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action })
        });

        const data = await res.json();

        if (res.ok) {
            showNotification(successMessages[action], 'success');

            // Fermer le modal
            document.getElementById('detailModal').classList.add('hidden');

            // Recharger les livreurs et les demandes en attente
            await loadLivreurs();
            loadPendingRequests();

            // console.log('✅ Livreur status updated successfully');
        } else {
            throw new Error(data.error || 'Erreur lors de la mise à jour');
        }
    } catch (error) {
        // console.error('❌ Error updating livreur status:', error);
        showNotification('Erreur lors de la mise à jour du statut', 'error');
    }
}

// ============================================
// GESTION COURSES
// ============================================

async function loadCourses() {
    // console.log('🚕 Loading courses...');

    try {
        const res = await fetch(`${API_BASE}/trips`);
        const courses = await res.json();

        const tbody = document.getElementById('coursesTableBody');

        if (courses.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-8 text-gray-500">
                        Aucune course trouvée
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = courses.map(course => `
            <tr onclick="showCourseDetails(${course.id_course})">
                <td>${course.id_course}</td>
                <td>${course.id_client || 'N/A'}</td>
                <td>${course.id_chauffeur || 'N/A'}</td>
                <td class="text-sm">
                    ${truncate(course.adresse_depart, 20)}<br>
                    → ${truncate(course.adresse_arrivee, 20)}
                </td>
                <td class="font-semibold" style="color: var(--vamo-gold);">${formatCFA(course.prix)}</td>
                <td>
                    <span class="badge ${getBadgeClass(course.etat_course)}">${course.etat_course}</span>
                </td>
                <td class="text-sm text-gray-600">${formatDate(course.date_heure_depart)}</td>
                <td>
                    <button onclick="event.stopPropagation(); showCourseDetails(${course.id_course})"
                            class="btn-secondary text-xs px-3 py-1">
                        Détails
                    </button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        // console.error('❌ Error loading courses:', error);
    }
}

async function showCourseDetails(courseId) {
    // console.log('Show course details:', courseId);

    // Afficher modal avec chargement
    showModal('Détails Course #' + courseId, '<div class="text-center py-8"><p>Chargement des données...</p></div>');

    try {
        // ✅ VRAIES DONNÉES - Charger les infos complètes de la course
        const [coursesRes, clientsRes, chauffeursRes] = await Promise.all([
            fetch(`${API_BASE}/trips`),
            fetch(`${API_BASE}/client`),
            fetch(`${API_BASE}/debug/chauffeurs`)
        ]);

        const courses = await coursesRes.json();
        const clients = await clientsRes.json();
        const chauffeursData = await chauffeursRes.json();
        const chauffeurs = chauffeursData.chauffeurs || [];

        const course = courses.find(c => c.id_course === courseId);

        if (!course) {
            document.getElementById('modalContent').innerHTML = '<p class="text-red-500">Course non trouvée</p>';
            return;
        }

        // Trouver client et chauffeur
        const client = clients.find(c => c.id_client === course.id_client);
        const chauffeur = chauffeurs.find(ch => ch.id_chauffeur === course.id_chauffeur);

        const modalContent = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-sm text-gray-600">ID Course</p>
                        <p class="font-semibold">#${course.id_course}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Statut</p>
                        <span class="badge ${getBadgeClass(course.etat_course)}">${course.etat_course}</span>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Client</p>
                        <p class="font-semibold">${client ? `${client.nom} ${client.prenom}` : 'N/A'}</p>
                        <p class="text-xs text-gray-500">${client?.telephone || ''}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Chauffeur</p>
                        <p class="font-semibold">${chauffeur ? `${chauffeur.nom} ${chauffeur.prenom}` : 'N/A'}</p>
                        <p class="text-xs text-gray-500">${chauffeur?.telephone || ''}</p>
                    </div>
                </div>

                <div class="p-4 bg-gray-50 rounded-lg">
                    <h4 class="font-semibold mb-2">🗺️ Trajet</h4>
                    <div class="space-y-2">
                        <div>
                            <p class="text-xs text-gray-600">Départ</p>
                            <p class="text-sm font-medium">${course.adresse_depart || 'N/A'}</p>
                            ${course.latitude_depart ? `<p class="text-xs text-gray-500">📍 ${course.latitude_depart}, ${course.longitude_depart}</p>` : ''}
                        </div>
                        <div class="flex items-center justify-center py-1">
                            <span class="text-2xl">↓</span>
                        </div>
                        <div>
                            <p class="text-xs text-gray-600">Arrivée</p>
                            <p class="text-sm font-medium">${course.adresse_arrivee || 'N/A'}</p>
                            ${course.latitude_arrivee ? `<p class="text-xs text-gray-500">📍 ${course.latitude_arrivee}, ${course.longitude_arrivee}</p>` : ''}
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-4">
                    <div class="text-center p-3 bg-gray-50 rounded-lg">
                        <p class="text-xs text-gray-600">Distance</p>
                        <p class="text-lg font-bold text-blue-600">${course.distance_km ? course.distance_km + ' km' : 'N/A'}</p>
                    </div>
                    <div class="text-center p-3 bg-gray-50 rounded-lg">
                        <p class="text-xs text-gray-600">Durée</p>
                        <p class="text-lg font-bold text-green-600">${course.duree_estimee ? course.duree_estimee + ' min' : 'N/A'}</p>
                    </div>
                    <div class="text-center p-3 bg-gray-50 rounded-lg">
                        <p class="text-xs text-gray-600">Prix</p>
                        <p class="text-lg font-bold" style="color: var(--vamo-gold);">${formatCFA(course.prix)}</p>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-sm text-gray-600">Date/Heure départ</p>
                        <p class="font-semibold">${formatDate(course.date_heure_depart)}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Date/Heure arrivée</p>
                        <p class="font-semibold">${course.date_heure_arrivee ? formatDate(course.date_heure_arrivee) : 'N/A'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Mode paiement</p>
                        <p class="font-semibold">${course.mode_paiement || 'N/A'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Type course</p>
                        <p class="font-semibold">${course.type_vehicule_demande || 'Standard'}</p>
                    </div>
                </div>

                ${course.note_chauffeur ? `
                    <div class="p-3 bg-yellow-50 rounded-lg">
                        <p class="text-sm text-gray-600">⭐ Note chauffeur</p>
                        <p class="font-semibold">${course.note_chauffeur}/5</p>
                        ${course.commentaire_note ? `<p class="text-sm text-gray-700 mt-1">"${course.commentaire_note}"</p>` : ''}
                    </div>
                ` : ''}
            </div>
        `;

        document.getElementById('modalContent').innerHTML = modalContent;

    } catch (error) {
        // console.error('Error loading course details:', error);
        document.getElementById('modalContent').innerHTML = '<p class="text-red-500">Erreur de chargement</p>';
    }
}

// ============================================
// GESTION LIVRAISONS
// ============================================

async function loadLivraisons() {
    // console.log('📦 Loading livraisons...');

    try {
        const res = await fetch(`${API_BASE}/livraison`);
        const livraisons = await res.json();

        const tbody = document.getElementById('livraisonsTableBody');

        if (!livraisons || livraisons.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-8 text-gray-500">
                        Aucune livraison trouvée
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = livraisons.map(liv => {
            // ✅ VRAIES DONNÉES: Utiliser les noms joints au lieu des IDs
            const clientNom = liv.client_nom && liv.client_prenom
                ? `${liv.client_nom} ${liv.client_prenom}`
                : 'N/A';

            const livreurNom = liv.livreur_nom && liv.livreur_prenom
                ? `${liv.livreur_nom} ${liv.livreur_prenom}`
                : (liv.etat_livraison === 'en_attente' ? 'En attente' : 'N/A');

            const destinataire = liv.destinataire_nom || clientNom;

            return `
            <tr onclick="showLivraisonDetails(${liv.id_livraison})">
                <td>${liv.id_livraison}</td>
                <td class="text-sm">${clientNom}</td>
                <td class="text-sm">${livreurNom}</td>
                <td class="text-sm">${destinataire}</td>
                <td>
                    <span class="badge badge-info">${liv.taille_colis || 'M'}</span>
                </td>
                <td>
                    <span class="badge ${liv.id_type === 1 ? 'badge-warning' : 'badge-info'}">
                        ${liv.id_type === 1 ? 'Express' : 'Flex'}
                    </span>
                </td>
                <td class="font-semibold" style="color: var(--vamo-gold);">${formatCFA(liv.prix)}</td>
                <td>
                    <span class="badge ${getBadgeClass(liv.etat_livraison)}">${liv.etat_livraison}</span>
                </td>
                <td>
                    <button onclick="event.stopPropagation(); showLivraisonDetails(${liv.id_livraison})"
                            class="btn-secondary text-xs px-3 py-1">
                        Détails
                    </button>
                </td>
            </tr>
            `;
        }).join('');

    } catch (error) {
        // console.error('❌ Error loading livraisons:', error);
    }
}

async function showLivraisonDetails(livraisonId) {
    // console.log('Show livraison details:', livraisonId);

    // Afficher modal avec chargement
    showModal('Détails Livraison #' + livraisonId, '<div class="text-center py-8"><p>Chargement des données...</p></div>');

    try {
        // ✅ OPTIMISATION: Un seul appel API - le backend retourne déjà les données jointes
        const livraisonsRes = await fetch(`${API_BASE}/livraison`);
        const livraisons = await livraisonsRes.json();

        const livraison = livraisons.find(l => l.id_livraison === livraisonId);

        if (!livraison) {
            document.getElementById('modalContent').innerHTML = '<p class="text-red-500">Livraison non trouvée</p>';
            return;
        }

        // ✅ VRAIES DONNÉES: Utiliser les noms déjà joints par le backend
        const clientNom = livraison.client_nom && livraison.client_prenom
            ? `${livraison.client_nom} ${livraison.client_prenom}`
            : 'N/A';

        const livreurNom = livraison.livreur_nom && livraison.livreur_prenom
            ? `${livraison.livreur_nom} ${livraison.livreur_prenom}`
            : (livraison.etat_livraison === 'en_attente' ? 'En attente d\'assignation' : 'N/A');

        // ✅ CALCUL DISTANCE: Si pas en DB, calculer à partir des coordonnées GPS
        let distance = livraison.distance_km;
        if (!distance && livraison.latitude_depart && livraison.longitude_depart &&
            livraison.latitude_arrivee && livraison.longitude_arrivee) {
            distance = calculateDistance(
                livraison.latitude_depart,
                livraison.longitude_depart,
                livraison.latitude_arrivee,
                livraison.longitude_arrivee
            );
        }

        // ✅ CALCUL DURÉE: Si pas en DB, estimer à partir de la distance
        let duree = livraison.duree_estimee;
        if (!duree && distance) {
            duree = estimateDuration(distance);
        }

        const modalContent = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-sm text-gray-600">ID Livraison</p>
                        <p class="font-semibold">#${livraison.id_livraison}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Statut</p>
                        <span class="badge ${getBadgeClass(livraison.etat_livraison)}">${livraison.etat_livraison}</span>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Type</p>
                        <span class="badge ${livraison.id_type === 1 ? 'badge-warning' : 'badge-info'}">
                            ${livraison.id_type === 1 ? 'Express' : 'Flex'}
                        </span>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Taille colis</p>
                        <span class="badge badge-info">${livraison.taille_colis || 'M'}</span>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-sm text-gray-600">Client</p>
                        <p class="font-semibold">${clientNom}</p>
                        ${livraison.id_client ? `<p class="text-xs text-gray-500">ID: ${livraison.id_client}</p>` : ''}
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Livreur</p>
                        <p class="font-semibold">${livreurNom}</p>
                        ${livraison.id_livreur ? `<p class="text-xs text-gray-500">ID: ${livraison.id_livreur}</p>` : ''}
                    </div>
                </div>

                ${(livraison.description_colis || livraison.poids_colis || livraison.instructions_speciales) ? `
                    <div class="p-4 bg-gray-50 rounded-lg">
                        <h4 class="font-semibold mb-2">📦 Informations Colis</h4>
                        <div class="space-y-2">
                            <div class="grid grid-cols-2 gap-2">
                                ${livraison.description_colis ? `
                                    <div>
                                        <p class="text-xs text-gray-600">Description</p>
                                        <p class="text-sm font-medium">${livraison.description_colis}</p>
                                    </div>
                                ` : ''}
                                ${livraison.poids_colis ? `
                                    <div>
                                        <p class="text-xs text-gray-600">Poids</p>
                                        <p class="text-sm font-medium">${livraison.poids_colis} kg</p>
                                    </div>
                                ` : ''}
                            </div>
                            ${livraison.instructions_speciales ? `
                                <div>
                                    <p class="text-xs text-gray-600">Instructions spéciales</p>
                                    <p class="text-sm italic">"${livraison.instructions_speciales}"</p>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : '<div class="p-4 bg-gray-50 rounded-lg text-center text-sm text-gray-500">📦 Aucune information détaillée sur le colis</div>'}

                ${(livraison.destinataire_nom || livraison.destinataire_telephone) ? `
                    <div class="p-4 bg-blue-50 rounded-lg">
                        <h4 class="font-semibold mb-2">👤 Destinataire</h4>
                        <div class="space-y-1">
                            ${livraison.destinataire_nom ? `<p class="font-medium">${livraison.destinataire_nom}</p>` : ''}
                            ${livraison.destinataire_telephone ? `<p class="text-sm text-gray-600">${livraison.destinataire_telephone}</p>` : ''}
                        </div>
                    </div>
                ` : '<div class="p-4 bg-blue-50 rounded-lg text-center text-sm text-gray-500">👤 Destinataire = Client (pas de destinataire différent)</div>'}

                <div class="p-4 bg-gray-50 rounded-lg">
                    <h4 class="font-semibold mb-2">🗺️ Trajet</h4>
                    <div class="space-y-2">
                        <div>
                            <p class="text-xs text-gray-600">Départ (Pickup)</p>
                            <p class="text-sm font-medium">${livraison.adresse_depart || 'N/A'}</p>
                            ${livraison.latitude_depart ? `<p class="text-xs text-gray-500">📍 ${livraison.latitude_depart}, ${livraison.longitude_depart}</p>` : ''}
                        </div>
                        <div class="flex items-center justify-center py-1">
                            <span class="text-2xl">↓</span>
                        </div>
                        <div>
                            <p class="text-xs text-gray-600">Arrivée (Delivery)</p>
                            <p class="text-sm font-medium">${livraison.adresse_arrivee || 'N/A'}</p>
                            ${livraison.latitude_arrivee ? `<p class="text-xs text-gray-500">📍 ${livraison.latitude_arrivee}, ${livraison.longitude_arrivee}</p>` : ''}
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-4">
                    <div class="text-center p-3 bg-gray-50 rounded-lg">
                        <p class="text-xs text-gray-600">Distance</p>
                        <p class="text-lg font-bold text-blue-600">${distance ? distance + ' km' : 'N/A'}</p>
                    </div>
                    <div class="text-center p-3 bg-gray-50 rounded-lg">
                        <p class="text-xs text-gray-600">Durée estimée</p>
                        <p class="text-lg font-bold text-green-600">${duree ? duree + ' min' : 'N/A'}</p>
                    </div>
                    <div class="text-center p-3 bg-gray-50 rounded-lg">
                        <p class="text-xs text-gray-600">Prix</p>
                        <p class="text-lg font-bold" style="color: var(--vamo-gold);">${formatCFA(livraison.prix)}</p>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-sm text-gray-600">Date/Heure départ</p>
                        <p class="font-semibold">${formatDate(livraison.date_heure_depart)}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Date/Heure arrivée</p>
                        <p class="font-semibold">${livraison.date_heure_arrivee ? formatDate(livraison.date_heure_arrivee) : 'N/A'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Mode paiement</p>
                        <p class="font-semibold">${livraison.mode_paiement || 'N/A'}</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600">Photo preuve</p>
                        <p class="font-semibold">${livraison.photo_preuve_livraison ? '✅ Oui' : '❌ Non'}</p>
                    </div>
                </div>

                ${livraison.note_livreur ? `
                    <div class="p-3 bg-yellow-50 rounded-lg">
                        <p class="text-sm text-gray-600">⭐ Note livreur</p>
                        <p class="font-semibold">${livraison.note_livreur}/5</p>
                        ${livraison.commentaire_note ? `<p class="text-sm text-gray-700 mt-1">"${livraison.commentaire_note}"</p>` : ''}
                    </div>
                ` : ''}
            </div>
        `;

        document.getElementById('modalContent').innerHTML = modalContent;

    } catch (error) {
        // console.error('Error loading livraison details:', error);
        document.getElementById('modalContent').innerHTML = '<p class="text-red-500">Erreur de chargement</p>';
    }
}

// ============================================
// FINANCES
// ============================================

async function loadFinances() {
    // console.log('💰 Loading finances...');

    try {
        // ✅ OPTIMISATION: Charger une seule fois les données
        const [coursesRes, livraisonsRes] = await Promise.all([
            fetch(`${API_BASE}/trips`),
            fetch(`${API_BASE}/livraison`)
        ]);

        const courses = await coursesRes.json();
        const livraisons = await livraisonsRes.json();

        const coursesTerminees = courses.filter(c => c.etat_course === 'terminee');
        const revenusCourses = coursesTerminees.reduce((sum, c) => sum + (parseFloat(c.prix) || 0), 0);

        document.getElementById('finance-courses').textContent = formatCFA(revenusCourses);

        const livraisonsTerminees = livraisons.filter(l => l.etat_livraison === 'livree');
        const revenusLivraisons = livraisonsTerminees.reduce((sum, l) => sum + (parseFloat(l.prix) || 0), 0);

        document.getElementById('finance-livraisons').textContent = formatCFA(revenusLivraisons);

        // Total
        const total = revenusCourses + revenusLivraisons;
        document.getElementById('finance-total').textContent = formatCFA(total);

        // Commissions (20% example)
        const commissions = total * 0.20;
        document.getElementById('finance-commissions').textContent = formatCFA(commissions);

        // ✅ DERNIERS PAIEMENTS: Afficher les 10 derniers paiements
        loadDerniersPaiements(coursesTerminees, livraisonsTerminees);

        // ✅ OPTIMISATION: Passer les données déjà chargées aux graphiques
        loadFinanceCharts(courses, livraisons);

    } catch (error) {
        // console.error('❌ Error loading finances:', error);
    }
}

// Fonction pour afficher les derniers paiements
function loadDerniersPaiements(courses, livraisons) {
    const paymentsDiv = document.getElementById('paymentsContent');

    // Combiner courses et livraisons avec leurs dates de fin
    const allPayments = [
        ...courses.map(c => ({
            type: 'Course',
            id: c.id_course,
            date: c.date_heure_arrivee || c.date_heure_depart,
            client: c.client_nom && c.client_prenom ? `${c.client_nom} ${c.client_prenom}` : `Client #${c.id_client}`,
            montant: parseFloat(c.prix) || 0,
            mode_paiement: c.mode_paiement || 'N/A'
        })),
        ...livraisons.map(l => ({
            type: 'Livraison',
            id: l.id_livraison,
            date: l.date_heure_arrivee || l.date_heure_depart,
            client: l.client_nom && l.client_prenom ? `${l.client_nom} ${l.client_prenom}` : `Client #${l.id_client}`,
            montant: parseFloat(l.prix) || 0,
            mode_paiement: l.mode_paiement || 'N/A'
        }))
    ];

    // Trier par date décroissante
    allPayments.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Prendre les 10 derniers
    const derniers10 = allPayments.slice(0, 10);

    if (derniers10.length === 0) {
        paymentsDiv.innerHTML = '<p class="text-center py-8 text-gray-500">Aucun paiement trouvé</p>';
        return;
    }

    // Générer le tableau
    paymentsDiv.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full">
                <thead>
                    <tr class="border-b border-gray-200">
                        <th class="text-left py-3 px-2">Type</th>
                        <th class="text-left py-3 px-2">ID</th>
                        <th class="text-left py-3 px-2">Date</th>
                        <th class="text-left py-3 px-2">Client</th>
                        <th class="text-left py-3 px-2">Montant</th>
                        <th class="text-left py-3 px-2">Mode</th>
                    </tr>
                </thead>
                <tbody>
                    ${derniers10.map(p => `
                        <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                            <td class="py-3 px-2">
                                <span class="badge ${p.type === 'Course' ? 'badge-info' : 'badge-warning'}">
                                    ${p.type}
                                </span>
                            </td>
                            <td class="py-3 px-2 text-sm">#${p.id}</td>
                            <td class="py-3 px-2 text-sm text-gray-600">${formatDate(p.date)}</td>
                            <td class="py-3 px-2 text-sm">${p.client}</td>
                            <td class="py-3 px-2 font-semibold" style="color: var(--vamo-gold);">${formatCFA(p.montant)}</td>
                            <td class="py-3 px-2">
                                <span class="text-xs px-2 py-1 bg-gray-100 rounded">${p.mode_paiement}</span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Store finance chart instances globally
let financeChartInstance = null;
let paymentsChartInstance = null;

async function loadFinanceCharts(courses = null, livraisons = null) {
    try {
        // ✅ OPTIMISATION: Utiliser les données passées en paramètre ou les charger
        if (!courses || !livraisons) {
            const [coursesRes, livraisonsRes] = await Promise.all([
                fetch(`${API_BASE}/trips`),
                fetch(`${API_BASE}/livraison`)
            ]);

            courses = await coursesRes.json();
            livraisons = await livraisonsRes.json() || [];
        }

        // ✅ GRAPHIQUE FINANCES - Évolution réelle 6 derniers mois
        const financeCtx = document.getElementById('financeChart');
        if (financeCtx) {
            // Détruire l'ancien graphique s'il existe
            if (financeChartInstance) {
                financeChartInstance.destroy();
            }

            const last6Months = getLast6Months();
            const revenusData = last6Months.map(month => {
                return calculateRevenusByMonth(courses, livraisons, month);
            });

            financeChartInstance = new Chart(financeCtx, {
                type: 'line',
                data: {
                    labels: last6Months.map(m => formatMonthLabel(m)),
                    datasets: [{
                        label: 'Revenus (CFA)',
                        data: revenusData,
                        borderColor: '#C6B383',
                        backgroundColor: 'rgba(198, 179, 131, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return formatCFA(context.parsed.y);
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return formatCFA(value);
                                }
                            }
                        }
                    }
                }
            });
        }

        // ✅ GRAPHIQUE PAIEMENTS - Vraie répartition
        const paymentsCtx = document.getElementById('paymentsChart');
        if (paymentsCtx) {
            // Détruire l'ancien graphique s'il existe
            if (paymentsChartInstance) {
                paymentsChartInstance.destroy();
            }

            // Compter les modes de paiement depuis les courses terminées
            const paymentModes = {
                especes: 0,
                wave: 0,
                orange_money: 0
            };

            courses.forEach(course => {
                // Si pas de mode_paiement, on compte comme espèces par défaut
                const mode = course.mode_paiement || 'especes';
                if (mode === 'especes') paymentModes.especes++;
                else if (mode === 'wave') paymentModes.wave++;
                else if (mode === 'orange_money') paymentModes.orange_money++;
            });

            livraisons.forEach(liv => {
                const mode = liv.mode_paiement || 'especes';
                if (mode === 'especes') paymentModes.especes++;
                else if (mode === 'wave') paymentModes.wave++;
                else if (mode === 'orange_money') paymentModes.orange_money++;
            });

            paymentsChartInstance = new Chart(paymentsCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Espèces', 'Wave', 'Orange Money'],
                    datasets: [{
                        data: [paymentModes.especes, paymentModes.wave, paymentModes.orange_money],
                        backgroundColor: ['#C6B383', '#D4C096', '#B8A170']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

    } catch (error) {
        // console.error('❌ Error loading finance charts:', error);
    }
}

// ============================================
// ANALYTICS
// ============================================

async function loadAnalytics() {
    // console.log('📈 Loading analytics...');

    try {
        // Charger toutes les données nécessaires
        const [coursesRes, livraisonsRes, clientsRes, chauffeursRes] = await Promise.all([
            fetch(`${API_BASE}/trips`),
            fetch(`${API_BASE}/livraison`),
            fetch(`${API_BASE}/client`),
            fetch(`${API_BASE}/debug/chauffeurs`)
        ]);

        const courses = await coursesRes.json();
        const livraisons = await livraisonsRes.json();
        const clients = await clientsRes.json();
        const chauffeursData = await chauffeursRes.json();
        const chauffeurs = chauffeursData.chauffeurs || [];

        // Générer Top 10 Clients
        loadTopClients(courses, livraisons, clients);

        // Générer Top 10 Chauffeurs
        loadTopChauffeurs(courses, chauffeurs);

    } catch (error) {
        // console.error('❌ Error loading analytics:', error);
    }
}

// Top 10 Clients par nombre de courses/livraisons et montant total
function loadTopClients(courses, livraisons, clients) {
    const topClientsDiv = document.getElementById('topClientsContent');

    // Calculer stats par client
    const clientsStats = {};

    courses.forEach(c => {
        if (!clientsStats[c.id_client]) {
            const client = clients.find(cl => cl.id_client === c.id_client);
            clientsStats[c.id_client] = {
                id: c.id_client,
                nom: client ? `${client.nom} ${client.prenom}` : `Client #${c.id_client}`,
                nbCourses: 0,
                nbLivraisons: 0,
                totalDepense: 0
            };
        }
        clientsStats[c.id_client].nbCourses++;
        clientsStats[c.id_client].totalDepense += parseFloat(c.prix) || 0;
    });

    livraisons.forEach(l => {
        if (!clientsStats[l.id_client]) {
            const client = clients.find(cl => cl.id_client === l.id_client);
            clientsStats[l.id_client] = {
                id: l.id_client,
                nom: client ? `${client.nom} ${client.prenom}` : `Client #${l.id_client}`,
                nbCourses: 0,
                nbLivraisons: 0,
                totalDepense: 0
            };
        }
        clientsStats[l.id_client].nbLivraisons++;
        clientsStats[l.id_client].totalDepense += parseFloat(l.prix) || 0;
    });

    // Convertir en tableau et trier par total dépensé
    const top10 = Object.values(clientsStats)
        .sort((a, b) => b.totalDepense - a.totalDepense)
        .slice(0, 10);

    if (top10.length === 0) {
        topClientsDiv.innerHTML = '<p class="text-center py-8 text-gray-500">Aucun client trouvé</p>';
        return;
    }

    topClientsDiv.innerHTML = `
        <div class="space-y-3">
            ${top10.map((client, index) => `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold"
                             style="background-color: ${index < 3 ? 'var(--vamo-gold)' : '#E5E7EB'}; color: ${index < 3 ? 'white' : '#6B7280'};">
                            ${index + 1}
                        </div>
                        <div>
                            <p class="font-semibold">${client.nom}</p>
                            <p class="text-xs text-gray-500">
                                ${client.nbCourses} courses • ${client.nbLivraisons} livraisons
                            </p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="font-bold" style="color: var(--vamo-gold);">${formatCFA(client.totalDepense)}</p>
                        <p class="text-xs text-gray-500">${client.nbCourses + client.nbLivraisons} total</p>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Top 10 Chauffeurs par nombre de courses et revenus générés
function loadTopChauffeurs(courses, chauffeurs) {
    const topChauffeursDiv = document.getElementById('topChauffeursContent');

    // Calculer stats par chauffeur
    const chauffeursStats = {};

    courses.forEach(c => {
        if (c.id_chauffeur) {
            if (!chauffeursStats[c.id_chauffeur]) {
                const chauffeur = chauffeurs.find(ch => ch.id_chauffeur === c.id_chauffeur);
                chauffeursStats[c.id_chauffeur] = {
                    id: c.id_chauffeur,
                    nom: chauffeur ? `${chauffeur.nom} ${chauffeur.prenom}` : `Chauffeur #${c.id_chauffeur}`,
                    nbCourses: 0,
                    revenus: 0,
                    notesMoyenne: []
                };
            }
            chauffeursStats[c.id_chauffeur].nbCourses++;
            chauffeursStats[c.id_chauffeur].revenus += parseFloat(c.prix) || 0;
            if (c.note_chauffeur) {
                chauffeursStats[c.id_chauffeur].notesMoyenne.push(parseFloat(c.note_chauffeur));
            }
        }
    });

    // Convertir en tableau et trier par nombre de courses
    const top10 = Object.values(chauffeursStats)
        .map(ch => ({
            ...ch,
            moyenneNote: ch.notesMoyenne.length > 0
                ? (ch.notesMoyenne.reduce((a, b) => a + b, 0) / ch.notesMoyenne.length).toFixed(1)
                : 'N/A'
        }))
        .sort((a, b) => b.nbCourses - a.nbCourses)
        .slice(0, 10);

    if (top10.length === 0) {
        topChauffeursDiv.innerHTML = '<p class="text-center py-8 text-gray-500">Aucun chauffeur trouvé</p>';
        return;
    }

    topChauffeursDiv.innerHTML = `
        <div class="space-y-3">
            ${top10.map((chauffeur, index) => `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold"
                             style="background-color: ${index < 3 ? 'var(--vamo-gold)' : '#E5E7EB'}; color: ${index < 3 ? 'white' : '#6B7280'};">
                            ${index + 1}
                        </div>
                        <div>
                            <p class="font-semibold">${chauffeur.nom}</p>
                            <p class="text-xs text-gray-500">
                                ${chauffeur.nbCourses} courses
                                ${chauffeur.moyenneNote !== 'N/A' ? `• ⭐ ${chauffeur.moyenneNote}/5` : ''}
                            </p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="font-bold" style="color: var(--vamo-gold);">${formatCFA(chauffeur.revenus)}</p>
                        <p class="text-xs text-gray-500">Revenus générés</p>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Construire l'URL complète pour les photos
function getImageUrl(photoPath) {
    if (!photoPath) return null;

    // Si c'est déjà une URL complète (Cloudinary, placeholder, etc)
    if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
        return photoPath;
    }

    // Si c'est un chemin relatif, ajouter l'URL du backend
    const backendBase = API_BASE.replace('/api', ''); // Enlever /api
    return `${backendBase}/${photoPath}`;
}

function formatCFA(amount) {
    if (!amount) return '0 CFA';
    return new Intl.NumberFormat('fr-FR').format(Math.round(amount)) + ' CFA';
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function truncate(str, length) {
    if (!str) return 'N/A';
    return str.length > length ? str.substring(0, length) + '...' : str;
}

// Calculer la distance entre deux points GPS (formule Haversine)
function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;

    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    return Math.round(distance * 10) / 10; // Arrondi à 1 décimale
}

// Estimer la durée en minutes basée sur la distance (vitesse moyenne 30 km/h en ville)
function estimateDuration(distanceKm) {
    if (!distanceKm) return null;
    const avgSpeedKmh = 30;
    const durationMinutes = (distanceKm / avgSpeedKmh) * 60;
    return Math.round(durationMinutes);
}

function getBadgeClass(status) {
    const classes = {
        'en_attente': 'badge-warning',
        'en_cours': 'badge-info',
        'approuve': 'badge-success',
        'rejete': 'badge-danger',
        'terminee': 'badge-success',
        'annulee': 'badge-danger',
        'livree': 'badge-success'
    };
    return classes[status] || 'badge-info';
}

// ✅ NOUVELLES FONCTIONS POUR VRAIES DONNÉES

function getLast7Days() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        days.push(date.toISOString().split('T')[0]);
    }
    return days;
}

function getLast6Months() {
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        months.push(date.toISOString().slice(0, 7)); // YYYY-MM
    }
    return months;
}

function calculateRevenusByDate(courses, livraisons, targetDate) {
    let total = 0;

    // Revenus courses
    courses.forEach(course => {
        if (course.date_heure_depart && course.etat_course === 'terminee') {
            const courseDate = new Date(course.date_heure_depart).toISOString().split('T')[0];
            if (courseDate === targetDate) {
                total += parseFloat(course.prix) || 0;
            }
        }
    });

    // Revenus livraisons
    livraisons.forEach(liv => {
        if (liv.date_heure_depart && liv.etat_livraison === 'livree') {
            const livDate = new Date(liv.date_heure_depart).toISOString().split('T')[0];
            if (livDate === targetDate) {
                total += parseFloat(liv.prix) || 0;
            }
        }
    });

    return total;
}

function calculateRevenusByMonth(courses, livraisons, targetMonth) {
    let total = 0;

    // Revenus courses
    courses.forEach(course => {
        if (course.date_heure_depart && course.etat_course === 'terminee') {
            const courseMonth = new Date(course.date_heure_depart).toISOString().slice(0, 7);
            if (courseMonth === targetMonth) {
                total += parseFloat(course.prix) || 0;
            }
        }
    });

    // Revenus livraisons
    livraisons.forEach(liv => {
        if (liv.date_heure_depart && liv.etat_livraison === 'livree') {
            const livMonth = new Date(liv.date_heure_depart).toISOString().slice(0, 7);
            if (livMonth === targetMonth) {
                total += parseFloat(liv.prix) || 0;
            }
        }
    });

    return total;
}

function formatDayLabel(dateString) {
    const date = new Date(dateString);
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    return days[date.getDay()];
}

function formatMonthLabel(monthString) {
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const month = parseInt(monthString.split('-')[1]) - 1;
    return months[month];
}

function getTimeAgo(dateString) {
    if (!dateString) return 'N/A';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `Il y a ${diffDays} jours`;
    return formatDate(dateString);
}

async function calculateClientStats(clientId) {
    try {
        // Compter les courses du client
        const coursesRes = await fetch(`${API_BASE}/trips`);
        const courses = await coursesRes.json();
        const clientCourses = courses.filter(c => c.id_client === clientId);

        // Compter les livraisons du client
        const livraisonsRes = await fetch(`${API_BASE}/livraison`);
        const livraisons = await livraisonsRes.json() || [];
        const clientLivraisons = livraisons.filter(l => l.id_client === clientId);

        // Calculer total dépensé
        const totalDepense =
            clientCourses.reduce((sum, c) => sum + (parseFloat(c.prix) || 0), 0) +
            clientLivraisons.reduce((sum, l) => sum + (parseFloat(l.prix) || 0), 0);

        return {
            nbCourses: clientCourses.length,
            nbLivraisons: clientLivraisons.length,
            totalDepense: totalDepense
        };
    } catch (error) {
        // console.error('Error calculating client stats:', error);
        return {
            nbCourses: 0,
            nbLivraisons: 0,
            totalDepense: 0
        };
    }
}

// ============================================
// MODAL FUNCTIONS
// ============================================

function showModal(title, content) {
    const modal = document.getElementById('detailsModal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalContent').innerHTML = content;
    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('detailsModal').classList.remove('active');
}

// Close modal on overlay click
document.getElementById('detailsModal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        closeModal();
    }
});

// ============================================
// NOTIFICATIONS
// ============================================

function showNotification(message, type = 'info') {
    // Simple notification system
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
        type === 'success' ? 'bg-green-500' :
        type === 'error' ? 'bg-red-500' :
        'bg-blue-500'
    } text-white`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// ============================================
// REFRESH & INIT
// ============================================

function refreshData() {
    // console.log('♻️ Refreshing all data...');
    const activePage = document.querySelector('.page-section.active');
    if (activePage) {
        const pageId = activePage.id.replace('page-', '');
        loadPageData(pageId);
    }
    showNotification('Données actualisées', 'success');
}

// ============================================
// SETTINGS FUNCTIONS
// ============================================

function testBackendConnection() {
    // console.log('Testing backend connection...');
    fetch(`${API_BASE}/debug/test`)
        .then(res => res.json())
        .then(data => {
            showNotification('✅ Backend connecté', 'success');
            // console.log('Backend response:', data);
        })
        .catch(error => {
            showNotification('❌ Erreur de connexion', 'error');
            // console.error('Connection error:', error);
        });
}

function exportAllData() {
    // console.log('Exporting all data...');
    showNotification('Export en cours...', 'info');
    // TODO: Implement data export
}

function clearCache() {
    if (confirm('Vider le cache?')) {
        localStorage.clear();
        showNotification('Cache vidé', 'success');
    }
}

function testNotification() {
    showNotification('Test de notification réussi!', 'success');
}

// ============================================
// EXPORT FUNCTIONS
// ============================================

function exportClients() {
    // console.log('Exporting clients...');
    showNotification('Export clients en cours...', 'info');
}

// ============================================
// PAGINATION
// ============================================

function prevPageClients() {
    if (clientsPage > 1) {
        clientsPage--;
        loadClients();
    }
}

function nextPageClients() {
    clientsPage++;
    loadClients();
}

// ============================================
// MAP FUNCTIONS
// ============================================

function showMapLayer(layer) {
    // console.log('Showing map layer:', layer);
    showNotification(`Affichage: ${layer}`, 'info');
}

// ============================================
// SECURITY - LOGOUT
// ============================================

function logout() {
    if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
        // Get token
        const token = localStorage.getItem('vamo_admin_token');

        // Call API to invalidate session server-side
        if (token) {
            fetch(`${API_BASE}/api/admin/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-token': token
                }
            }).catch(() => {
                // Ignore errors - proceed with logout anyway
            });
        }

        // Clear local storage
        localStorage.removeItem('vamo_admin_token');
        sessionStorage.clear();

        // Redirect to login
        window.location.replace('/login.html');
    }
}

// ============================================
// INIT ON LOAD
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // console.log('🚀 Vamo Admin Dashboard initialized');

    // Load dashboard by default
    loadDashboard();

    // ✅ Auto refresh every 30 seconds - TOUTES les données du dashboard
    setInterval(() => {
        const activePage = document.querySelector('.page-section.active');
        if (activePage && activePage.id === 'page-dashboard') {
            // console.log('🔄 Auto-refresh dashboard stats...');
            loadDashboardStats(); // Stats principales
            loadRecentActivity(); // Activités récentes
            // Note: Ne pas recharger les graphiques car Chart.js doit être détruit avant de recréer
            // Les graphiques seront mis à jour lors du prochain chargement complet
        }
    }, 30000);

    // ✅ Auto refresh autres pages toutes les 60 secondes
    setInterval(() => {
        const activePage = document.querySelector('.page-section.active');
        if (activePage) {
            const pageId = activePage.id.replace('page-', '');
            // Refresh données des autres pages
            if (pageId === 'clients') {
                // console.log('🔄 Auto-refresh clients...');
                loadClients();
            } else if (pageId === 'chauffeurs') {
                // console.log('🔄 Auto-refresh chauffeurs...');
                loadChauffeurs();
            } else if (pageId === 'livreurs') {
                // console.log('🔄 Auto-refresh livreurs...');
                loadLivreurs();
            } else if (pageId === 'courses') {
                // console.log('🔄 Auto-refresh courses...');
                loadCourses();
            } else if (pageId === 'livraisons') {
                // console.log('🔄 Auto-refresh livraisons...');
                loadLivraisons();
            } else if (pageId === 'finances') {
                // console.log('🔄 Auto-refresh finances...');
                loadFinances();
            }
        }
    }, 60000); // Toutes les 60 secondes pour les autres pages
});

// ============================================
// DEMANDES EN ATTENTE
// ============================================

async function loadPendingRequests() {
    // console.log('⏳ Loading pending requests...');

    try {
        const [chauffeursRes, livreursRes] = await Promise.all([
            fetch(`${API_BASE}/debug/chauffeurs`),
            fetch(`${API_BASE}/debug/livreurs`)
        ]);

        const chauffeursData = await chauffeursRes.json();
        const livreursData = await livreursRes.json();

        const chauffeurs = chauffeursData.chauffeurs || [];
        const livreurs = livreursData.livreurs || [];

        // Filtrer ceux en attente
        const chauffeursPending = chauffeurs.filter(c => c.statut_validation === 'en_attente');
        const livreursPending = livreurs.filter(l => l.statut_validation === 'en_attente');

        const container = document.getElementById('pendingRequests');

        if (chauffeursPending.length === 0 && livreursPending.length === 0) {
            container.innerHTML = '<p class="text-center py-8 text-gray-500">✅ Aucune demande en attente</p>';
            return;
        }

        let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';

        // Section Chauffeurs
        if (chauffeursPending.length > 0) {
            html += `
                <div>
                    <h4 class="font-bold text-lg mb-4 flex items-center" style="color: #C6B383;">
                        <span class="mr-2">🚗</span>
                        Chauffeurs (${chauffeursPending.length})
                    </h4>
                    <div class="space-y-3">
                        ${chauffeursPending.map(c => `
                            <div class="bg-white rounded-lg p-4 border border-gray-200 hover:border-[#C6B383] transition-all cursor-pointer"
                                 onclick="showChauffeurDetails(${c.id_chauffeur})">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <p class="font-semibold text-gray-800">${c.nom} ${c.prenom}</p>
                                        <p class="text-sm text-gray-600">${c.telephone}</p>
                                        <p class="text-xs text-gray-500 mt-1">
                                            Inscrit le ${formatDate(c.date_inscription)}
                                        </p>
                                    </div>
                                    <div class="flex gap-2">
                                        <button onclick="event.stopPropagation(); updateChauffeurStatus(${c.id_chauffeur}, 'approve')"
                                                class="bg-green-500 text-white px-3 py-1 rounded text-xs hover:bg-green-600">
                                            ✅
                                        </button>
                                        <button onclick="event.stopPropagation(); updateChauffeurStatus(${c.id_chauffeur}, 'reject')"
                                                class="bg-red-500 text-white px-3 py-1 rounded text-xs hover:bg-red-600">
                                            ❌
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Section Livreurs
        if (livreursPending.length > 0) {
            html += `
                <div>
                    <h4 class="font-bold text-lg mb-4 flex items-center" style="color: #C6B383;">
                        <span class="mr-2">🏍️</span>
                        Livreurs (${livreursPending.length})
                    </h4>
                    <div class="space-y-3">
                        ${livreursPending.map(l => `
                            <div class="bg-white rounded-lg p-4 border border-gray-200 hover:border-[#C6B383] transition-all cursor-pointer"
                                 onclick="showLivreurDetails(${l.id_livreur})">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <p class="font-semibold text-gray-800">${l.nom} ${l.prenom}</p>
                                        <p class="text-sm text-gray-600">${l.telephone}</p>
                                        <p class="text-xs text-gray-500 mt-1">
                                            Inscrit le ${formatDate(l.date_inscription)}
                                        </p>
                                    </div>
                                    <div class="flex gap-2">
                                        <button onclick="event.stopPropagation(); updateLivreurStatus(${l.id_livreur}, 'approve')"
                                                class="bg-green-500 text-white px-3 py-1 rounded text-xs hover:bg-green-600">
                                            ✅
                                        </button>
                                        <button onclick="event.stopPropagation(); updateLivreurStatus(${l.id_livreur}, 'reject')"
                                                class="bg-red-500 text-white px-3 py-1 rounded text-xs hover:bg-red-600">
                                            ❌
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        html += '</div>';
        container.innerHTML = html;

        // console.log(`✅ Loaded ${chauffeursPending.length} chauffeur(s) and ${livreursPending.length} livreur(s) pending`);

    } catch (error) {
        // console.error('❌ Error loading pending requests:', error);
        document.getElementById('pendingRequests').innerHTML =
            '<p class="text-center py-8 text-red-500">Erreur de chargement des demandes</p>';
    }
}
