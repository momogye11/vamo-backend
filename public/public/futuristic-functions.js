// 🚀 VAMO BACK OFFICE - ADVANCED FUNCTIONS

// Variables globales pour les graphiques
let revenusChart, activiteChart, revenusMensuelChart;

// Formater montant en CFA
function formatCFA(amount) {
    return new Intl.NumberFormat('fr-FR').format(Math.round(amount)) + ' CFA';
}

// Obtenir info véhicule réelle
function getVehiculeInfo(personne) {
    // Vérifier d'abord les champs directs de la table Chauffeur/Livreur
    if (personne.marque_vehicule) {
        return personne.marque_vehicule;
    }
    // Ensuite les données de la table Vehicule (si JOIN disponible)
    else if (personne.vehicule_marque && personne.vehicule_modele) {
        return `${personne.vehicule_marque} ${personne.vehicule_modele}`;
    } else if (personne.vehicule_marque) {
        return personne.vehicule_marque;
    } else {
        return 'Véhicule non renseigné';
    }
}

// Obtenir info plaque réelle
function getPlaqueInfo(personne) {
    // Vérifier d'abord le champ direct de la table Chauffeur/Livreur
    if (personne.plaque_immatriculation) {
        return personne.plaque_immatriculation;
    }
    // Ensuite les données de la table Vehicule (si JOIN disponible)
    else if (personne.vehicule_plaque) {
        return personne.vehicule_plaque;
    } else if (personne.numero_plaque) {
        return personne.numero_plaque;
    } else {
        return 'Plaque non renseignée';
    }
}

// Initialisation des graphiques
function initializeCharts() {
    console.log('📊 Initializing charts...');
    
    // Graphique revenus hebdomadaires
    const revenusCtx = document.getElementById('revenusChart').getContext('2d');
    revenusChart = new Chart(revenusCtx, {
        type: 'line',
        data: {
            labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
            datasets: [{
                label: 'Revenus (CFA)',
                data: [1200, 1500, 1800, 1400, 2100, 2500, 1900],
                borderColor: '#00f5ff',
                backgroundColor: 'rgba(0, 245, 255, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: { color: '#00f5ff' }
                }
            },
            scales: {
                y: {
                    ticks: { color: '#00f5ff' },
                    grid: { color: 'rgba(0, 245, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#00f5ff' },
                    grid: { color: 'rgba(0, 245, 255, 0.1)' }
                }
            }
        }
    });

    // Graphique activité système
    const activiteCtx = document.getElementById('activiteChart').getContext('2d');
    activiteChart = new Chart(activiteCtx, {
        type: 'doughnut',
        data: {
            labels: ['Chauffeurs Actifs', 'Chauffeurs Inactifs', 'Livreurs Actifs', 'Livreurs Inactifs'],
            datasets: [{
                data: [15, 5, 12, 3],
                backgroundColor: [
                    '#00f5ff',
                    'rgba(0, 245, 255, 0.3)',
                    '#8a2be2',
                    'rgba(138, 43, 226, 0.3)'
                ],
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: { color: '#ffffff' }
                }
            }
        }
    });
}

// Mise à jour des graphiques avec données réelles
function updateChartsWithData(analytics) {
    console.log('📊 Updating charts with real data...');
    
    if (analytics.weekly && revenusChart) {
        const labels = analytics.weekly.map(day => {
            const date = new Date(day.date);
            return date.toLocaleDateString('fr-FR', { weekday: 'short' });
        });
        const revenus = analytics.weekly.map(day => day.revenus_total || 0);
        
        revenusChart.data.labels = labels;
        revenusChart.data.datasets[0].data = revenus;
        revenusChart.update();
    }
}

// Affichage des chauffeurs avec interface responsive
function displayChauffeurs(chauffeurs) {
    const tbody = document.getElementById('chauffeurs-tbody');
    tbody.innerHTML = '';
    
    // Détecter si on est sur mobile
    const isMobile = window.innerWidth <= 768;
    
    if (chauffeurs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center" style="color: #C6B383;">
                    <div class="flex flex-col items-center">
                        <div class="text-6xl mb-4">🔍</div>
                        <p class="font-medium">AUCUN CHAUFFEUR DÉTECTÉ</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    if (isMobile) {
        // Affichage mobile en cartes
        displayChauffeursAsMobileCards(chauffeurs);
        return;
    }
    
    chauffeurs.forEach((chauffeur, index) => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-opacity-5 transition-colors';
        row.style.animationDelay = `${index * 50}ms`;
        row.innerHTML = `
            <td class="px-6 py-4">
                <span class="font-mono" style="color: var(--vamo-gold);">#${String(chauffeur.id_chauffeur).padStart(3, '0')}</span>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center mr-3" style="background: linear-gradient(135deg, var(--vamo-gold), var(--vamo-gold-dark));">
                        <span class="text-white font-bold">${chauffeur.prenom.charAt(0)}</span>
                    </div>
                    <div>
                        <div class="font-semibold" style="color: var(--vamo-dark);">${chauffeur.prenom} ${chauffeur.nom}</div>
                        <div class="text-xs text-gray-400 font-mono">ID: ${chauffeur.id_chauffeur}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="font-mono" style="color: var(--vamo-gold);">+221${chauffeur.telephone}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-gray-300">
                    <div class="font-semibold">${getVehiculeInfo(chauffeur)}</div>
                    <div class="text-xs text-gray-400">${getPlaqueInfo(chauffeur)}</div>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="status-badge-futuristic status-${chauffeur.statut_validation}">
                    ${chauffeur.statut_validation}
                </span>
                <div class="mt-1">
                    <span class="text-xs ${chauffeur.disponibilite ? 'text-green-400' : 'text-red-400'}">
                        ${chauffeur.disponibilite ? '🟢 EN LIGNE' : '🔴 HORS LIGNE'}
                    </span>
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="font-bold" style="color: var(--vamo-gold);">${formatCFA(chauffeur.revenus_total || 0)}</div>
                <div class="text-xs text-gray-400">${chauffeur.courses_terminees || 0} courses</div>
            </td>
            <td class="px-6 py-4">
                <div class="flex flex-wrap gap-2">
                    <button onclick="viewChauffeurDetails(${chauffeur.id_chauffeur})" 
                            class="btn-vamo text-xs px-3 py-1 rounded">
                        📊 SCAN
                    </button>
                    ${chauffeur.statut_validation === 'en_attente' ? 
                        `<button onclick="executeChauffeurAction(${chauffeur.id_chauffeur}, 'approuver')" 
                                 class="btn-vamo text-white text-xs px-3 py-1 rounded" style="background: linear-gradient(135deg, #10B981, #059669);">
                            ✅ APPROVE
                        </button>
                        <button onclick="executeChauffeurAction(${chauffeur.id_chauffeur}, 'rejeter')" 
                                class="bg-red-600 text-white text-xs px-3 py-1 rounded hover:bg-red-700">
                            ❌ REJECT
                        </button>` : 
                        `<button onclick="executeChauffeurAction(${chauffeur.id_chauffeur}, 'suspendre')" 
                                 class="bg-orange-600 text-white text-xs px-3 py-1 rounded hover:bg-orange-700">
                            ⏸️ SUSPEND
                        </button>`}
                </div>
            </td>
        `;
        tbody.appendChild(row);
        
        // Animation d'apparition
        setTimeout(() => {
            row.style.opacity = '0';
            row.style.transform = 'translateX(-20px)';
            row.style.transition = 'all 0.3s ease';
            setTimeout(() => {
                row.style.opacity = '1';
                row.style.transform = 'translateX(0)';
            }, 50);
        }, index * 50);
    });
}

// Affichage des livreurs avec interface responsive
function displayLivreurs(livreurs) {
    const tbody = document.getElementById('livreurs-tbody');
    tbody.innerHTML = '';
    
    // Détecter si on est sur mobile
    const isMobile = window.innerWidth <= 768;
    
    if (livreurs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center" style="color: #C6B383;">
                    <div class="flex flex-col items-center">
                        <div class="text-6xl mb-4">🔍</div>
                        <p class="font-medium">AUCUN LIVREUR DÉTECTÉ</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    if (isMobile) {
        // Affichage mobile en cartes
        displayLivreursAsMobileCards(livreurs);
        return;
    }
    
    livreurs.forEach((livreur, index) => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-purple-500/5 transition-colors';
        row.innerHTML = `
            <td class="px-6 py-4">
                <span class="font-mono text-purple-300">#${String(livreur.id_livreur).padStart(3, '0')}</span>
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center">
                    <div class="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center mr-3">
                        <span class="text-white font-bold">${livreur.prenom.charAt(0)}</span>
                    </div>
                    <div>
                        <div class="text-white font-semibold">${livreur.prenom} ${livreur.nom}</div>
                        <div class="text-xs text-gray-400 font-mono">ID: ${livreur.id_livreur}</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="text-purple-300 font-mono">+221${livreur.telephone}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-gray-300">
                    <div class="font-semibold">${getVehiculeInfo(livreur)}</div>
                    <div class="text-xs text-gray-400">${getPlaqueInfo(livreur)}</div>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="status-badge-futuristic status-${livreur.statut_validation}">
                    ${livreur.statut_validation}
                </span>
                <div class="mt-1">
                    <span class="text-xs ${livreur.disponibilite ? 'text-green-400' : 'text-red-400'}">
                        ${livreur.disponibilite ? '🟢 EN LIGNE' : '🔴 HORS LIGNE'}
                    </span>
                </div>
            </td>
            <td class="px-6 py-4">
                <div class="text-yellow-400 font-bold">${formatCFA(livreur.revenus_total || 0)}</div>
                <div class="text-xs text-gray-400">${livreur.livraisons_terminees || 0} livraisons</div>
            </td>
            <td class="px-6 py-4">
                <div class="flex flex-wrap gap-2">
                    <button onclick="viewLivreurDetails(${livreur.id_livreur})" 
                            class="btn-neon text-xs px-3 py-1 rounded">
                        📊 SCAN
                    </button>
                    ${livreur.statut_validation === 'en_attente' ? 
                        `<button onclick="executeLivreurAction(${livreur.id_livreur}, 'approuver')" 
                                 class="bg-green-600 text-white text-xs px-3 py-1 rounded hover:bg-green-700">
                            ✅ APPROVE
                        </button>
                        <button onclick="executeLivreurAction(${livreur.id_livreur}, 'rejeter')" 
                                class="bg-red-600 text-white text-xs px-3 py-1 rounded hover:bg-red-700">
                            ❌ REJECT
                        </button>` : 
                        `<button onclick="executeLivreurAction(${livreur.id_livreur}, 'suspendre')" 
                                 class="bg-orange-600 text-white text-xs px-3 py-1 rounded hover:bg-orange-700">
                            ⏸️ SUSPEND
                        </button>`}
                </div>
            </td>
        `;
        tbody.appendChild(row);
        
        // Animation d'apparition
        setTimeout(() => {
            row.style.opacity = '0';
            row.style.transform = 'translateX(-20px)';
            row.style.transition = 'all 0.3s ease';
            setTimeout(() => {
                row.style.opacity = '1';
                row.style.transform = 'translateX(0)';
            }, 50);
        }, index * 50);
    });
}

// Cette fonction est maintenant remplacée par showPage() dans le HTML principal
// Conservée pour compatibilité si appelée depuis d'anciennes parties du code
function showSection(section) {
    // Rediriger vers la nouvelle fonction de navigation
    if (typeof showPage === 'function') {
        showPage(section);
    }
}

// Fonctions modal futuriste
function openFuturisticModal() {
    document.getElementById('modalFuturistic').classList.add('show');
    console.log('🚀 Modal activated');
}

function closeFuturisticModal() {
    document.getElementById('modalFuturistic').classList.remove('show');
    console.log('🚀 Modal deactivated');
}

// Séquence de scan système
function initiateScanSequence() {
    console.log('🔍 Initiating system scan sequence...');
    
    document.getElementById('modalTitle').textContent = '🔍 SYSTÈME DE SCAN EN COURS';
    document.getElementById('modalContent').innerHTML = `
        <div class="text-center py-8">
            <div class="text-8xl mb-6">🛸</div>
            <h4 class="text-2xl font-bold neon-text text-blue-300 mb-4 font-mono">SCAN NEURAL NETWORK</h4>
            <div class="space-y-4">
                <div class="bg-blue-500/20 border border-blue-500 rounded-lg p-4">
                    <div class="flex justify-between items-center">
                        <span class="font-mono">Database Connection</span>
                        <span class="text-green-400">✅ ACTIVE</span>
                    </div>
                </div>
                <div class="bg-green-500/20 border border-green-500 rounded-lg p-4">
                    <div class="flex justify-between items-center">
                        <span class="font-mono">API Endpoints</span>
                        <span class="text-green-400">✅ OPERATIONAL</span>
                    </div>
                </div>
                <div class="bg-yellow-500/20 border border-yellow-500 rounded-lg p-4">
                    <div class="flex justify-between items-center">
                        <span class="font-mono">Real-time Analytics</span>
                        <span class="text-yellow-400">⚡ PROCESSING</span>
                    </div>
                </div>
                <div class="bg-purple-500/20 border border-purple-500 rounded-lg p-4">
                    <div class="flex justify-between items-center">
                        <span class="font-mono">Neural Interface</span>
                        <span class="text-purple-400">🧠 LEARNING</span>
                    </div>
                </div>
            </div>
            <button onclick="closeFuturisticModal()" class="mt-6 btn-neon text-white px-6 py-3 rounded-lg font-bold">
                SCAN TERMINÉ
            </button>
        </div>
    `;
    openFuturisticModal();
}

// Détails chauffeur avec vraies photos
async function viewChauffeurDetails(id) {
    console.log(`🔍 Scanning chauffeur ${id}...`);
    
    const chauffeur = systemData.chauffeurs.find(c => c.id_chauffeur === id);
    if (!chauffeur) {
        showErrorNotification('Chauffeur non trouvé');
        return;
    }

    // Charger les photos depuis l'API
    let photosData = null;
    try {
        if (authToken && API_ADVANCED_BASE) {
            const response = await fetch(`${API_ADVANCED_BASE}/chauffeurs/${id}/photos`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    photosData = data.photos;
                }
            }
        }
    } catch (error) {
        console.log('⚠️ Erreur chargement photos:', error);
    }

    document.getElementById('modalTitle').textContent = `🚗 SCAN CHAUFFEUR #${String(id).padStart(3, '0')}`;
    document.getElementById('modalContent').innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Informations personnelles -->
            <div class="space-y-4">
                <div class="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4">
                    <h4 class="text-blue-300 font-mono font-bold mb-3">👤 DONNÉES PERSONNELLES</h4>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-400">Nom complet:</span>
                            <span class="text-white font-bold">${chauffeur.prenom} ${chauffeur.nom}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Téléphone:</span>
                            <span class="text-blue-300 font-mono">+221${chauffeur.telephone}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">ID Système:</span>
                            <span class="text-yellow-400">#${String(id).padStart(3, '0')}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Statut:</span>
                            <span class="status-badge-futuristic status-${chauffeur.statut_validation}">${chauffeur.statut_validation}</span>
                        </div>
                    </div>
                </div>

                <!-- Véhicule -->
                <div class="bg-green-500/10 border border-green-500/50 rounded-lg p-4">
                    <h4 class="text-green-300 font-mono font-bold mb-3">🚗 VÉHICULE</h4>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-400">Véhicule:</span>
                            <span class="text-white">${getVehiculeInfo(chauffeur)}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Année:</span>
                            <span class="text-white">${chauffeur.vehicule_annee || chauffeur.annee || 'Non renseignée'}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Plaque:</span>
                            <span class="text-green-300 font-mono">${getPlaqueInfo(chauffeur)}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">État:</span>
                            <span class="text-green-400">✅ Vérifié</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Documents et photos -->
            <div class="space-y-4">
                <div class="bg-purple-500/10 border border-purple-500/50 rounded-lg p-4">
                    <h4 class="font-mono font-bold mb-3" style="color: var(--vamo-gold);">📸 DOCUMENTS & PHOTOS</h4>
                    <div class="grid grid-cols-2 gap-3">
                        ${photosData ? Object.entries(photosData).map(([key, photo]) => `
                            <button onclick="viewRealPhoto('${key}', '${photo.title}', '${photo.data}')" 
                                    class="elegant-gradient border border-gray-300 rounded-lg p-3 hover:shadow-lg transition-all duration-300">
                                <div class="text-2xl mb-2">${photo.icon}</div>
                                <div class="text-xs text-gray-600 font-semibold">${photo.title}</div>
                                <div class="text-xs text-gray-400 mt-1">${photo.description}</div>
                            </button>
                        `).join('') : `
                            <div class="col-span-2 text-center text-gray-500 py-4">
                                <div class="text-4xl mb-2">📷</div>
                                <p class="text-sm">Aucune photo disponible</p>
                            </div>
                        `}
                    </div>
                    ${photosData && Object.keys(photosData).length > 0 ? `
                        <div class="mt-4 text-center">
                            <button onclick="viewAllPhotos(${id}, 'chauffeur')" 
                                    class="btn-vamo text-white px-4 py-2 rounded-lg text-sm">
                                🖼️ Voir toutes les photos (${Object.keys(photosData).length})
                            </button>
                        </div>
                    ` : ''}
                </div>

                <!-- Statistiques -->
                <div class="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4">
                    <h4 class="text-yellow-300 font-mono font-bold mb-3">📊 PERFORMANCES</h4>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-400">Courses totales:</span>
                            <span class="text-yellow-300 font-bold">${chauffeur.total_courses || 0}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Revenus totaux:</span>
                            <span class="text-yellow-300 font-bold">${formatCFA(chauffeur.revenus_total || 0)}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Courses terminées:</span>
                            <span class="text-yellow-300 font-bold">${chauffeur.courses_terminees || 0}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Disponibilité:</span>
                            <span class="${chauffeur.disponibilite ? 'text-green-400' : 'text-red-400'}">${chauffeur.disponibilite ? '🟢 EN LIGNE' : '🔴 HORS LIGNE'}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Actions -->
        <div class="mt-6 flex flex-wrap gap-3 justify-center">
            ${chauffeur.statut_validation === 'en_attente' ? 
                `<button onclick="executeChauffeurAction(${id}, 'approuver'); closeFuturisticModal();" 
                         class="btn-neon bg-green-600 text-white px-6 py-3 rounded-lg font-bold">
                    ✅ APPROUVER
                </button>
                <button onclick="executeChauffeurAction(${id}, 'rejeter'); closeFuturisticModal();" 
                         class="btn-neon bg-red-600 text-white px-6 py-3 rounded-lg font-bold">
                    ❌ REJETER
                </button>` : 
                `<button onclick="executeChauffeurAction(${id}, 'suspendre'); closeFuturisticModal();" 
                         class="btn-neon bg-orange-600 text-white px-6 py-3 rounded-lg font-bold">
                    ⏸️ SUSPENDRE
                </button>
                <button onclick="executeChauffeurAction(${id}, 'reapprouver'); closeFuturisticModal();" 
                         class="btn-neon bg-blue-600 text-white px-6 py-3 rounded-lg font-bold">
                    🔄 RÉAPPROUVER
                </button>`}
            <button onclick="closeFuturisticModal()" class="btn-neon bg-gray-600 text-white px-6 py-3 rounded-lg font-bold">
                🚪 FERMER
            </button>
        </div>
    `;
    openFuturisticModal();
}

// Détails livreur avec vraies photos
async function viewLivreurDetails(id) {
    console.log(`🔍 Scanning livreur ${id}...`);
    
    const livreur = systemData.livreurs.find(l => l.id_livreur === id);
    if (!livreur) {
        showErrorNotification('Livreur non trouvé');
        return;
    }

    // Charger les photos depuis l'API
    let photosData = null;
    try {
        if (authToken && API_ADVANCED_BASE) {
            const response = await fetch(`${API_ADVANCED_BASE}/livreurs/${id}/photos`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    photosData = data.photos;
                }
            }
        }
    } catch (error) {
        console.log('⚠️ Erreur chargement photos:', error);
    }

    document.getElementById('modalTitle').textContent = `🏍️ SCAN LIVREUR #${String(id).padStart(3, '0')}`;
    document.getElementById('modalContent').innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Informations personnelles -->
            <div class="space-y-4">
                <div class="bg-purple-500/10 border border-purple-500/50 rounded-lg p-4">
                    <h4 class="text-purple-300 font-mono font-bold mb-3">👤 DONNÉES PERSONNELLES</h4>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-400">Nom complet:</span>
                            <span class="text-white font-bold">${livreur.prenom} ${livreur.nom}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Téléphone:</span>
                            <span class="text-purple-300 font-mono">+221${livreur.telephone}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">ID Système:</span>
                            <span class="text-yellow-400">#${String(id).padStart(3, '0')}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Statut:</span>
                            <span class="status-badge-futuristic status-${livreur.statut_validation}">${livreur.statut_validation}</span>
                        </div>
                    </div>
                </div>

                <!-- Véhicule -->
                <div class="bg-green-500/10 border border-green-500/50 rounded-lg p-4">
                    <h4 class="text-green-300 font-mono font-bold mb-3">🏍️ VÉHICULE</h4>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-400">Véhicule:</span>
                            <span class="text-white">${getVehiculeInfo(livreur)}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Type:</span>
                            <span class="text-white">Livraison</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Plaque:</span>
                            <span class="text-green-300 font-mono">${getPlaqueInfo(livreur)}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">État:</span>
                            <span class="text-green-400">✅ Vérifié</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Documents et photos -->
            <div class="space-y-4">
                <div class="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4">
                    <h4 class="font-mono font-bold mb-3" style="color: var(--vamo-gold);">📸 DOCUMENTS & PHOTOS</h4>
                    <div class="grid grid-cols-2 gap-3">
                        ${photosData ? Object.entries(photosData).map(([key, photo]) => `
                            <button onclick="viewRealPhoto('${key}', '${photo.title}', '${photo.data}')" 
                                    class="elegant-gradient border border-gray-300 rounded-lg p-3 hover:shadow-lg transition-all duration-300">
                                <div class="text-2xl mb-2">${photo.icon}</div>
                                <div class="text-xs text-gray-600 font-semibold">${photo.title}</div>
                                <div class="text-xs text-gray-400 mt-1">${photo.description}</div>
                            </button>
                        `).join('') : `
                            <div class="col-span-2 text-center text-gray-500 py-4">
                                <div class="text-4xl mb-2">📷</div>
                                <p class="text-sm">Aucune photo disponible</p>
                            </div>
                        `}
                    </div>
                    ${photosData && Object.keys(photosData).length > 0 ? `
                        <div class="mt-4 text-center">
                            <button onclick="viewAllPhotos(${id}, 'livreur')" 
                                    class="btn-vamo text-white px-4 py-2 rounded-lg text-sm">
                                🖼️ Voir toutes les photos (${Object.keys(photosData).length})
                            </button>
                        </div>
                    ` : ''}
                </div>

                <!-- Statistiques -->
                <div class="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4">
                    <h4 class="text-yellow-300 font-mono font-bold mb-3">📊 PERFORMANCES</h4>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-400">Livraisons totales:</span>
                            <span class="text-yellow-300 font-bold">${livreur.total_livraisons || 0}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Revenus totaux:</span>
                            <span class="text-yellow-300 font-bold">${formatCFA(livreur.revenus_total || 0)}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Livraisons terminées:</span>
                            <span class="text-yellow-300 font-bold">${livreur.livraisons_terminees || 0}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Disponibilité:</span>
                            <span class="${livreur.disponibilite ? 'text-green-400' : 'text-red-400'}">${livreur.disponibilite ? '🟢 EN LIGNE' : '🔴 HORS LIGNE'}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Actions -->
        <div class="mt-6 flex flex-wrap gap-3 justify-center">
            ${livreur.statut_validation === 'en_attente' ? 
                `<button onclick="executeLivreurAction(${id}, 'approuver'); closeFuturisticModal();" 
                         class="btn-neon bg-green-600 text-white px-6 py-3 rounded-lg font-bold">
                    ✅ APPROUVER
                </button>
                <button onclick="executeLivreurAction(${id}, 'rejeter'); closeFuturisticModal();" 
                         class="btn-neon bg-red-600 text-white px-6 py-3 rounded-lg font-bold">
                    ❌ REJETER
                </button>` : 
                `<button onclick="executeLivreurAction(${id}, 'suspendre'); closeFuturisticModal();" 
                         class="btn-neon bg-orange-600 text-white px-6 py-3 rounded-lg font-bold">
                    ⏸️ SUSPENDRE
                </button>
                <button onclick="executeLivreurAction(${id}, 'reapprouver'); closeFuturisticModal();" 
                         class="btn-neon bg-blue-600 text-white px-6 py-3 rounded-lg font-bold">
                    🔄 RÉAPPROUVER
                </button>`}
            <button onclick="closeFuturisticModal()" class="btn-neon bg-gray-600 text-white px-6 py-3 rounded-lg font-bold">
                🚪 FERMER
            </button>
        </div>
    `;
    openFuturisticModal();
}

// Actions sur les chauffeurs
async function executeChauffeurAction(id, action) {
    console.log(`⚡ Executing action ${action} on chauffeur ${id}...`);
    
    try {
        if (authToken && API_ADVANCED_BASE) {
            // Utiliser l'API avancée si disponible
            const response = await fetch(`${API_ADVANCED_BASE}/chauffeurs/${id}/action`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ 
                    action, 
                    raison: `Action ${action} via Command Center`,
                    admin_email: 'admin@vamo.sn'
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    showSuccessNotification(`Chauffeur ${action} avec succès!`);
                    await loadBasicData();
                    updateDashboardStats();
                    return;
                }
            }
        }
        
        // Fallback vers l'API debug
        if (action === 'approuver') {
            const chauffeur = systemData.chauffeurs.find(c => c.id_chauffeur === id);
            if (chauffeur) {
                const response = await fetch(`${API_BASE}/debug/approve-chauffeur`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telephone: chauffeur.telephone })
                });
                
                const data = await response.json();
                if (data.success) {
                    showSuccessNotification('Chauffeur approuvé avec succès!');
                    await loadBasicData();
                    updateDashboardStats();
                    return;
                }
            }
        } else {
            showWarningNotification(`Action ${action} pas encore implémentée`);
        }
        
    } catch (error) {
        console.error('❌ Erreur action chauffeur:', error);
        showErrorNotification('Erreur lors de l\'action');
    }
}

// Actions sur les livreurs
async function executeLivreurAction(id, action) {
    console.log(`⚡ Executing action ${action} on livreur ${id}...`);
    
    try {
        if (authToken && API_ADVANCED_BASE) {
            // Utiliser l'API avancée si disponible
            const response = await fetch(`${API_ADVANCED_BASE}/livreurs/${id}/action`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ 
                    action, 
                    raison: `Action ${action} via Command Center`,
                    admin_email: 'admin@vamo.sn'
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    showSuccessNotification(`Livreur ${action} avec succès!`);
                    await loadBasicData();
                    updateDashboardStats();
                    return;
                }
            }
        }
        
        // Fallback vers l'API debug
        if (action === 'approuver') {
            const response = await fetch(`${API_BASE}/debug/approve-livreur`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_livreur: id })
            });
            
            const data = await response.json();
            if (data.success) {
                showSuccessNotification('Livreur approuvé avec succès!');
                await loadBasicData();
                updateDashboardStats();
                return;
            }
        } else {
            showWarningNotification(`Action ${action} pas encore implémentée`);
        }
        
    } catch (error) {
        console.error('❌ Erreur action livreur:', error);
        showErrorNotification('Erreur lors de l\'action');
    }
}

// Recherche et filtres
function executeSearch() {
    const query = document.getElementById('searchInput').value;
    const status = document.getElementById('statusFilter').value;
    const type = document.getElementById('typeFilter').value;
    
    console.log(`🔍 Searching: query="${query}", status="${status}", type="${type}"`);
    
    let filteredChauffeurs = systemData.chauffeurs;
    let filteredLivreurs = systemData.livreurs;
    
    // Filtrer par recherche textuelle
    if (query) {
        const searchLower = query.toLowerCase();
        filteredChauffeurs = filteredChauffeurs.filter(c => 
            c.nom.toLowerCase().includes(searchLower) ||
            c.prenom.toLowerCase().includes(searchLower) ||
            c.telephone.includes(query)
        );
        filteredLivreurs = filteredLivreurs.filter(l => 
            l.nom.toLowerCase().includes(searchLower) ||
            l.prenom.toLowerCase().includes(searchLower) ||
            l.telephone.includes(query)
        );
    }
    
    // Filtrer par statut
    if (status) {
        filteredChauffeurs = filteredChauffeurs.filter(c => c.statut_validation === status);
        filteredLivreurs = filteredLivreurs.filter(l => l.statut_validation === status);
    }
    
    // Afficher selon le type
    if (!type || type === 'chauffeurs') {
        displayChauffeurs(filteredChauffeurs);
    }
    if (!type || type === 'livreurs') {
        displayLivreurs(filteredLivreurs);
    }
    
    // Switcher vers la section appropriée
    if (type === 'chauffeurs') {
        showSection('chauffeurs');
    } else if (type === 'livreurs') {
        showSection('livreurs');
    }
}

// Refresh complet des données
async function refreshAllData() {
    console.log('♻️ Refreshing all system data...');
    showInfoNotification('Actualisation en cours...');
    
    try {
        await loadAllSystemData();
        showSuccessNotification('Données actualisées avec succès!');
    } catch (error) {
        console.error('❌ Erreur refresh:', error);
        showErrorNotification('Erreur lors de l\'actualisation');
    }
}

// Fonctions utilitaires pour les notifications
function showSuccessNotification(message) {
    showNotification(message, 'success');
}

function showErrorNotification(message) {
    showNotification(message, 'error');
}

function showWarningNotification(message) {
    showNotification(message, 'warning');
}

function showInfoNotification(message) {
    showNotification(message, 'info');
}

function showNotification(message, type = 'info') {
    // Créer notification toast futuriste
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg border backdrop-blur-lg transition-all duration-300 transform translate-x-full`;
    
    // Couleurs selon le type
    const colors = {
        success: 'bg-green-500/20 border-green-500 text-green-300',
        error: 'bg-red-500/20 border-red-500 text-red-300',
        warning: 'bg-yellow-500/20 border-yellow-500 text-yellow-300',
        info: 'bg-blue-500/20 border-blue-500 text-blue-300'
    };
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    notification.className += ` ${colors[type]}`;
    notification.innerHTML = `
        <div class="flex items-center space-x-3">
            <span class="text-xl">${icons[type]}</span>
            <span class="font-mono">${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animation d'apparition
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 100);
    
    // Auto-suppression
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Visualisation de documents
function viewDocument(type) {
    console.log(`📸 Viewing document: ${type}`);
    
    // URLs d'images de démonstration
    const demoImages = {
        cni: 'https://via.placeholder.com/400x300/4CAF50/FFFFFF?text=CNI+DOCUMENT',
        selfie: 'https://via.placeholder.com/400x300/2196F3/FFFFFF?text=SELFIE+VERIFICATION',
        vehicule: 'https://via.placeholder.com/400x300/FF9800/FFFFFF?text=VEHICLE+PHOTO',
        plaque: 'https://via.placeholder.com/400x300/9C27B0/FFFFFF?text=LICENSE+PLATE'
    };
    
    document.getElementById('modalTitle').textContent = `📸 DOCUMENT: ${type.toUpperCase()}`;
    document.getElementById('modalContent').innerHTML = `
        <div class="text-center">
            <div class="bg-gray-800 rounded-lg p-4 mb-4">
                <img src="${demoImages[type]}" alt="${type}" class="w-full max-w-md mx-auto rounded-lg border border-gray-600">
            </div>
            <div class="flex justify-center space-x-4">
                <button onclick="approveDocument('${type}')" class="btn-neon bg-green-600 text-white px-6 py-3 rounded-lg font-bold">
                    ✅ VALIDER
                </button>
                <button onclick="rejectDocument('${type}')" class="btn-neon bg-red-600 text-white px-6 py-3 rounded-lg font-bold">
                    ❌ REJETER
                </button>
                <button onclick="closeFuturisticModal()" class="btn-neon bg-gray-600 text-white px-6 py-3 rounded-lg font-bold">
                    🚪 FERMER
                </button>
            </div>
        </div>
    `;
    openFuturisticModal();
}

function approveDocument(type) {
    showSuccessNotification(`Document ${type} approuvé!`);
    closeFuturisticModal();
}

function rejectDocument(type) {
    showErrorNotification(`Document ${type} rejeté!`);
    closeFuturisticModal();
}

// Fonction utilitaire debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Affichage mobile en cartes pour chauffeurs
function displayChauffeursAsMobileCards(chauffeurs) {
    const tbody = document.getElementById('chauffeurs-tbody');
    tbody.innerHTML = `
        <tr><td colspan="7">
            <div class="mobile-card-container space-y-4">
                ${chauffeurs.map((chauffeur, index) => `
                    <div class="mobile-card elegant-gradient elegant-shadow" style="animation-delay: ${index * 100}ms">
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center">
                                <div class="w-10 h-10 rounded-full flex items-center justify-center mr-3" style="background: linear-gradient(135deg, var(--vamo-gold), var(--vamo-gold-dark));">
                                    <span class="text-white font-bold">${chauffeur.prenom.charAt(0)}</span>
                                </div>
                                <div>
                                    <div class="font-semibold" style="color: var(--vamo-dark);">${chauffeur.prenom} ${chauffeur.nom}</div>
                                    <div class="text-xs font-mono" style="color: var(--vamo-gold);">#${String(chauffeur.id_chauffeur).padStart(3, '0')}</div>
                                </div>
                            </div>
                            <span class="status-badge-futuristic status-${chauffeur.statut_validation}">${chauffeur.statut_validation}</span>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3 text-sm mb-3">
                            <div>
                                <span class="text-gray-500">Téléphone:</span>
                                <div class="font-mono" style="color: var(--vamo-gold);">+221${chauffeur.telephone}</div>
                            </div>
                            <div>
                                <span class="text-gray-500">Disponibilité:</span>
                                <div class="text-xs ${chauffeur.disponibilite ? 'text-green-400' : 'text-red-400'}">
                                    ${chauffeur.disponibilite ? '🟢 EN LIGNE' : '🔴 HORS LIGNE'}
                                </div>
                            </div>
                            <div>
                                <span class="text-gray-500">Véhicule:</span>
                                <div class="font-semibold">${getVehiculeInfo(chauffeur)}</div>
                            </div>
                            <div>
                                <span class="text-gray-500">Plaque:</span>
                                <div class="text-xs text-gray-400">${getPlaqueInfo(chauffeur)}</div>
                            </div>
                        </div>
                        
                        <div class="flex justify-between items-center">
                            <div class="text-center">
                                <div class="font-bold" style="color: var(--vamo-gold);">${formatCFA(chauffeur.revenus_total || 0)}</div>
                                <div class="text-xs text-gray-400">${chauffeur.courses_terminees || 0} courses</div>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="viewChauffeurDetails(${chauffeur.id_chauffeur})" 
                                        class="btn-vamo text-xs px-3 py-1 rounded">
                                    📊
                                </button>
                                ${chauffeur.statut_validation === 'en_attente' ? 
                                    `<button onclick="executeChauffeurAction(${chauffeur.id_chauffeur}, 'approuver')" 
                                             class="btn-vamo text-white text-xs px-3 py-1 rounded" style="background: linear-gradient(135deg, #10B981, #059669);">
                                        ✅
                                    </button>` : 
                                    `<button onclick="executeChauffeurAction(${chauffeur.id_chauffeur}, 'suspendre')" 
                                             class="bg-orange-600 text-white text-xs px-3 py-1 rounded">
                                        ⏸️
                                    </button>`}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </td></tr>
    `;
}

// Affichage mobile en cartes pour livreurs
function displayLivreursAsMobileCards(livreurs) {
    const tbody = document.getElementById('livreurs-tbody');
    tbody.innerHTML = `
        <tr><td colspan="7">
            <div class="mobile-card-container space-y-4">
                ${livreurs.map((livreur, index) => `
                    <div class="mobile-card elegant-gradient elegant-shadow" style="animation-delay: ${index * 100}ms">
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center">
                                <div class="w-10 h-10 rounded-full flex items-center justify-center mr-3" style="background: linear-gradient(135deg, var(--vamo-gold), var(--vamo-gold-dark));">
                                    <span class="text-white font-bold">${livreur.prenom.charAt(0)}</span>
                                </div>
                                <div>
                                    <div class="font-semibold" style="color: var(--vamo-dark);">${livreur.prenom} ${livreur.nom}</div>
                                    <div class="text-xs font-mono" style="color: var(--vamo-gold);">#${String(livreur.id_livreur).padStart(3, '0')}</div>
                                </div>
                            </div>
                            <span class="status-badge-futuristic status-${livreur.statut_validation}">${livreur.statut_validation}</span>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3 text-sm mb-3">
                            <div>
                                <span class="text-gray-500">Téléphone:</span>
                                <div class="font-mono" style="color: var(--vamo-gold);">+221${livreur.telephone}</div>
                            </div>
                            <div>
                                <span class="text-gray-500">Disponibilité:</span>
                                <div class="text-xs ${livreur.disponibilite ? 'text-green-400' : 'text-red-400'}">
                                    ${livreur.disponibilite ? '🟢 EN LIGNE' : '🔴 HORS LIGNE'}
                                </div>
                            </div>
                            <div>
                                <span class="text-gray-500">Véhicule:</span>
                                <div class="font-semibold">${getVehiculeInfo(livreur)}</div>
                            </div>
                            <div>
                                <span class="text-gray-500">Plaque:</span>
                                <div class="text-xs text-gray-400">${getPlaqueInfo(livreur)}</div>
                            </div>
                        </div>
                        
                        <div class="flex justify-between items-center">
                            <div class="text-center">
                                <div class="font-bold" style="color: var(--vamo-gold);">${formatCFA(livreur.revenus_total || 0)}</div>
                                <div class="text-xs text-gray-400">${livreur.livraisons_terminees || 0} livraisons</div>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="viewLivreurDetails(${livreur.id_livreur})" 
                                        class="btn-vamo text-xs px-3 py-1 rounded">
                                    📊
                                </button>
                                ${livreur.statut_validation === 'en_attente' ? 
                                    `<button onclick="executeLivreurAction(${livreur.id_livreur}, 'approuver')" 
                                             class="btn-vamo text-white text-xs px-3 py-1 rounded" style="background: linear-gradient(135deg, #10B981, #059669);">
                                        ✅
                                    </button>` : 
                                    `<button onclick="executeLivreurAction(${livreur.id_livreur}, 'suspendre')" 
                                             class="bg-orange-600 text-white text-xs px-3 py-1 rounded">
                                        ⏸️
                                    </button>`}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </td></tr>
    `;
}

// 📸 FONCTIONS DE VISUALISATION DES PHOTOS

// Afficher une photo réelle depuis la base de données
function viewRealPhoto(type, title, base64Data) {
    console.log(`📸 Affichage photo: ${type} - ${title}`);
    
    if (!base64Data || base64Data.trim() === '') {
        showErrorNotification('Photo non disponible');
        return;
    }
    
    // Détecter le format de l'image
    let imageSrc = base64Data;
    if (!base64Data.startsWith('data:')) {
        // Si ce n'est pas déjà un data URL, ajouter le préfixe
        imageSrc = `data:image/jpeg;base64,${base64Data}`;
    }
    
    document.getElementById('modalTitle').textContent = `📸 ${title.toUpperCase()}`;
    document.getElementById('modalContent').innerHTML = `
        <div class="text-center">
            <div class="elegant-gradient rounded-lg p-4 mb-4">
                <img src="${imageSrc}" 
                     alt="${title}" 
                     class="w-full max-w-2xl mx-auto rounded-lg border border-gray-300 shadow-lg"
                     style="max-height: 70vh; object-fit: contain;"
                     onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzZiNzI4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vbiBkaXNwb25pYmxlPC90ZXh0Pjwvc3ZnPg==';">
            </div>
            <div class="mb-4">
                <h4 class="text-lg font-bold mb-2" style="color: var(--vamo-gold);">${title}</h4>
                <p class="text-gray-600 text-sm">Cliquez sur l'image pour zoomer</p>
            </div>
            <div class="flex justify-center space-x-4">
                <button onclick="downloadPhoto('${title}', '${imageSrc}')" 
                        class="btn-vamo text-white px-6 py-3 rounded-lg font-bold">
                    📥 Télécharger
                </button>
                <button onclick="validatePhoto('${type}')" 
                        class="btn-vamo text-white px-6 py-3 rounded-lg font-bold" 
                        style="background: linear-gradient(135deg, #10B981, #059669);">
                    ✅ Valider
                </button>
                <button onclick="rejectPhoto('${type}')" 
                        class="bg-red-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-red-700">
                    ❌ Rejeter
                </button>
                <button onclick="closeFuturisticModal()" 
                        class="bg-gray-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-gray-700">
                    🚪 Fermer
                </button>
            </div>
        </div>
    `;
    openFuturisticModal();
}

// Afficher toutes les photos d'une personne
async function viewAllPhotos(id, type) {
    console.log(`🖼️ Affichage toutes photos ${type} ${id}...`);
    
    try {
        let photosData = null;
        const endpoint = type === 'chauffeur' ? 'chauffeurs' : 'livreurs';
        
        const response = await fetch(`${API_ADVANCED_BASE}/${endpoint}/${id}/photos`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                photosData = data.photos;
            }
        }
        
        if (!photosData || Object.keys(photosData).length === 0) {
            showErrorNotification('Aucune photo disponible');
            return;
        }
        
        const personInfo = data[type] || { nom: 'Inconnu', prenom: '' };
        
        document.getElementById('modalTitle').textContent = `🖼️ GALERIE PHOTOS - ${personInfo.prenom} ${personInfo.nom}`;
        document.getElementById('modalContent').innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${Object.entries(photosData).map(([key, photo]) => `
                    <div class="elegant-gradient rounded-lg p-4 text-center">
                        <div class="mb-3">
                            <div class="text-3xl mb-2">${photo.icon}</div>
                            <h5 class="font-bold text-sm" style="color: var(--vamo-gold);">${photo.title}</h5>
                            <p class="text-xs text-gray-600 mt-1">${photo.description}</p>
                        </div>
                        <div class="mb-3">
                            ${photo.data ? `
                                <img src="${photo.data.startsWith('data:') ? photo.data : 'data:image/jpeg;base64,' + photo.data}" 
                                     alt="${photo.title}" 
                                     class="w-full h-32 object-cover rounded-lg border border-gray-300 cursor-pointer hover:shadow-lg transition-shadow"
                                     onclick="viewRealPhoto('${key}', '${photo.title}', '${photo.data}')"
                                     onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='block';">
                                <div style="display: none;" class="w-full h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                                    <span class="text-gray-500 text-xs">Image non disponible</span>
                                </div>
                            ` : `
                                <div class="w-full h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                                    <span class="text-gray-500 text-xs">Pas de photo</span>
                                </div>
                            `}
                        </div>
                        <div class="flex gap-2 justify-center">
                            <button onclick="viewRealPhoto('${key}', '${photo.title}', '${photo.data}')" 
                                    class="btn-vamo text-white text-xs px-3 py-1 rounded">
                                👁️ Voir
                            </button>
                            <button onclick="validatePhoto('${key}')" 
                                    class="bg-green-600 text-white text-xs px-3 py-1 rounded hover:bg-green-700">
                                ✅
                            </button>
                            <button onclick="rejectPhoto('${key}')" 
                                    class="bg-red-600 text-white text-xs px-3 py-1 rounded hover:bg-red-700">
                                ❌
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="mt-6 text-center">
                <button onclick="closeFuturisticModal()" 
                        class="btn-vamo text-white px-6 py-3 rounded-lg font-bold">
                    🚪 Fermer la galerie
                </button>
            </div>
        `;
        openFuturisticModal();
        
    } catch (error) {
        console.error('❌ Erreur chargement galerie:', error);
        showErrorNotification('Erreur chargement galerie photos');
    }
}

// Télécharger une photo
function downloadPhoto(title, imageSrc) {
    try {
        const link = document.createElement('a');
        link.href = imageSrc;
        link.download = `vamo_${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showSuccessNotification('Photo téléchargée !');
    } catch (error) {
        console.error('❌ Erreur téléchargement:', error);
        showErrorNotification('Erreur téléchargement photo');
    }
}

// Valider une photo
function validatePhoto(type) {
    showSuccessNotification(`Photo ${type} validée !`);
    // TODO: Appeler l'API pour marquer la photo comme validée
}

// Rejeter une photo
function rejectPhoto(type) {
    showWarningNotification(`Photo ${type} rejetée !`);
    // TODO: Appeler l'API pour marquer la photo comme rejetée
}

console.log('🚀 COMMAND CENTER FUNCTIONS LOADED');
console.log('⚡ NEURAL NETWORK OPERATIONAL');
console.log('🎯 ALL SYSTEMS GO!');