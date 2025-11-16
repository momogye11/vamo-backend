/**
 * Gestion des Courses Bloquées - Dashboard Admin
 */

let stuckCoursesData = null;
let currentStuckTab = 'en_cours';

// Charger les courses bloquées au démarrage
document.addEventListener('DOMContentLoaded', () => {
    loadStuckCourses();
});

// Charger toutes les courses bloquées
async function loadStuckCourses() {
    try {
        const token = localStorage.getItem('vamo_admin_token');
        if (!token) {
            console.error('❌ No admin token found');
            return;
        }

        console.log('📊 Chargement des courses bloquées...');

        const response = await fetch(`${API_BASE}/admin/stuck-courses`, {
            headers: {
                'x-auth-token': token
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        stuckCoursesData = data;

        console.log('✅ Courses bloquées chargées:', data);

        // Afficher le résumé
        displayStuckCoursesSummary(data.summary);

        // Afficher les tableaux
        displayStuckCoursesTable('en_cours', data.stuckCourses.enCours);
        displayStuckCoursesTable('en_attente', data.stuckCourses.enAttente);
        displayStuckCoursesTable('acceptee', data.stuckCourses.acceptee);

        // Mettre à jour les compteurs dans les tabs
        document.getElementById('count-en_cours').textContent = data.summary.enCoursCount;
        document.getElementById('count-en_attente').textContent = data.summary.enAttenteCount;
        document.getElementById('count-acceptee').textContent = data.summary.accepteeCount;

    } catch (error) {
        console.error('❌ Erreur chargement courses bloquées:', error);
        alert('Erreur lors du chargement des courses bloquées');
    }
}

// Afficher le résumé
function displayStuckCoursesSummary(summary) {
    const summaryContainer = document.getElementById('stuck-courses-summary');

    summaryContainer.innerHTML = `
        <div class="stat-card bg-red-50 border-l-4 border-red-500">
            <div class="stat-value text-red-600">${summary.total}</div>
            <div class="stat-label">Total Courses Bloquées</div>
        </div>
        <div class="stat-card bg-orange-50 border-l-4 border-orange-500">
            <div class="stat-value text-orange-600">${summary.categories.anomalies}</div>
            <div class="stat-label">Anomalies Timestamps</div>
            <div class="text-xs text-orange-600 mt-1">Arrivée avant début course</div>
        </div>
        <div class="stat-card bg-yellow-50 border-l-4 border-yellow-500">
            <div class="stat-value text-yellow-600">${summary.categories.tresAnciennes}</div>
            <div class="stat-label">Très Anciennes</div>
            <div class="text-xs text-yellow-600 mt-1">Plus de 7 jours</div>
        </div>
        <div class="stat-card bg-blue-50 border-l-4 border-blue-500">
            <div class="stat-value text-blue-600">${summary.categories.recentes}</div>
            <div class="stat-label">Récentes</div>
            <div class="text-xs text-blue-600 mt-1">Moins de 24h</div>
        </div>
    `;
}

// Afficher le tableau pour une catégorie
function displayStuckCoursesTable(type, courses) {
    const tbody = document.getElementById(`table-${type}`);

    if (courses.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-8 text-center text-gray-500">
                    ✅ Aucune course bloquée dans cette catégorie
                </td>
            </tr>
        `;
        return;
    }

    if (type === 'en_cours') {
        tbody.innerHTML = courses.map(course => {
            const categoryBadge = getCategoryBadge(course.categorie);
            const heuresBloquee = Math.round(course.heures_depuis_arrivee);
            const joursBloquee = Math.floor(heuresBloquee / 24);

            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        #${course.id_course}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        ${categoryBadge}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-900">
                        ${course.chauffeur_nom || '-'} ${course.chauffeur_prenom || ''}<br>
                        <span class="text-xs text-gray-500">${course.chauffeur_telephone || '-'}</span>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-900">
                        ${course.client_nom || '-'} ${course.client_prenom || ''}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-700">
                        <div class="max-w-xs truncate">${course.adresse_depart || '-'}</div>
                        <div class="text-xs text-gray-500">→</div>
                        <div class="max-w-xs truncate">${course.adresse_arrivee || '-'}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                        <span class="font-bold text-red-600">
                            ${joursBloquee > 0 ? `${joursBloquee}j ${heuresBloquee % 24}h` : `${heuresBloquee}h`}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button onclick="forceCompleteCourse(${course.id_course})" class="text-green-600 hover:text-green-900">
                            ✅ Terminer
                        </button>
                        <button onclick="forceCancelCourse(${course.id_course})" class="text-red-600 hover:text-red-900">
                            ❌ Annuler
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } else if (type === 'en_attente') {
        tbody.innerHTML = courses.map(course => {
            const minutes = Math.round(course.minutes_depuis_demande);

            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        #${course.id_course}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-900">
                        ${course.client_nom || '-'} ${course.client_prenom || ''}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-700">
                        <div class="max-w-xs truncate">${course.adresse_depart || '-'}</div>
                        <div class="text-xs text-gray-500">→</div>
                        <div class="max-w-xs truncate">${course.adresse_arrivee || '-'}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                        <span class="font-bold text-orange-600">${minutes} min</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button onclick="forceCancelCourse(${course.id_course})" class="text-red-600 hover:text-red-900">
                            ❌ Annuler
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } else if (type === 'acceptee') {
        tbody.innerHTML = courses.map(course => {
            const minutes = Math.round(course.minutes_depuis_acceptation);

            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        #${course.id_course}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-900">
                        ${course.chauffeur_nom || '-'} ${course.chauffeur_prenom || ''}<br>
                        <span class="text-xs text-gray-500">${course.chauffeur_telephone || '-'}</span>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-900">
                        ${course.client_nom || '-'} ${course.client_prenom || ''}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-700">
                        <div class="max-w-xs truncate">${course.adresse_depart || '-'}</div>
                        <div class="text-xs text-gray-500">→</div>
                        <div class="max-w-xs truncate">${course.adresse_arrivee || '-'}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                        <span class="font-bold text-orange-600">${minutes} min</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button onclick="forceCancelCourse(${course.id_course})" class="text-red-600 hover:text-red-900">
                            ❌ Annuler
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

// Badge pour catégorie
function getCategoryBadge(categorie) {
    const badges = {
        'ANOMALIE_TIMESTAMPS': '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">🚨 ANOMALIE</span>',
        'TRES_ANCIENNE': '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">⏰ 7+ jours</span>',
        'ANCIENNE': '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">⏱️ 1+ jour</span>',
        'RECENTE': '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">🆕 Récente</span>'
    };
    return badges[categorie] || categorie;
}

// Changer de tab
function showStuckTab(tabName) {
    // Masquer tous les tabs
    document.querySelectorAll('.stuck-tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });

    // Retirer la classe active de tous les boutons
    document.querySelectorAll('.stuck-tab').forEach(btn => {
        btn.classList.remove('active', 'border-red-500', 'text-red-600');
        btn.classList.add('border-transparent', 'text-gray-500');
    });

    // Afficher le tab sélectionné
    document.getElementById(`stuck-tab-${tabName}`).classList.remove('hidden');

    // Activer le bouton
    const btn = document.getElementById(`tab-${tabName}`);
    btn.classList.add('active', 'border-red-500', 'text-red-600');
    btn.classList.remove('border-transparent', 'text-gray-500');

    currentStuckTab = tabName;
}

// Forcer la terminaison d'une course
async function forceCompleteCourse(courseId) {
    if (!confirm(`Êtes-vous sûr de vouloir marquer la course #${courseId} comme terminée ?`)) {
        return;
    }

    try {
        const token = localStorage.getItem('vamo_admin_token');
        const response = await fetch(`${API_BASE}/admin/force-complete-course/${courseId}`, {
            method: 'POST',
            headers: {
                'x-auth-token': token,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (result.success) {
            alert(`✅ Course #${courseId} marquée comme terminée`);
            loadStuckCourses(); // Recharger la liste
        } else {
            alert(`❌ Erreur: ${result.error}`);
        }
    } catch (error) {
        console.error('❌ Erreur forçage terminaison:', error);
        alert('Erreur lors du forçage de terminaison');
    }
}

// Forcer l'annulation d'une course
async function forceCancelCourse(courseId) {
    if (!confirm(`Êtes-vous sûr de vouloir annuler la course #${courseId} ?`)) {
        return;
    }

    try {
        const token = localStorage.getItem('vamo_admin_token');
        const response = await fetch(`${API_BASE}/admin/force-cancel-course/${courseId}`, {
            method: 'POST',
            headers: {
                'x-auth-token': token,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (result.success) {
            alert(`✅ Course #${courseId} annulée`);
            loadStuckCourses(); // Recharger la liste
        } else {
            alert(`❌ Erreur: ${result.error}`);
        }
    } catch (error) {
        console.error('❌ Erreur forçage annulation:', error);
        alert('Erreur lors du forçage d\'annulation');
    }
}

// Nettoyage automatique des courses anciennes
async function cleanupOldCourses() {
    const daysThreshold = prompt('Nettoyer les courses de plus de combien de jours ?', '7');

    if (!daysThreshold || isNaN(daysThreshold)) {
        return;
    }

    if (!confirm(`⚠️ ATTENTION: Ceci va nettoyer TOUTES les courses bloquées de plus de ${daysThreshold} jours.\n\nContinuer ?`)) {
        return;
    }

    try {
        const token = localStorage.getItem('vamo_admin_token');
        const response = await fetch(`${API_BASE}/admin/cleanup-old-courses`, {
            method: 'POST',
            headers: {
                'x-auth-token': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ daysThreshold: parseInt(daysThreshold) })
        });

        const result = await response.json();

        if (result.success) {
            alert(`✅ Nettoyage terminé:\n\n` +
                  `- ${result.cleaned.terminee} courses marquées terminées\n` +
                  `- ${result.cleaned.annuleeAttente + result.cleaned.annuleeAcceptee} courses annulées\n` +
                  `- Total: ${result.cleaned.total} courses nettoyées`);
            loadStuckCourses(); // Recharger la liste
        } else {
            alert(`❌ Erreur: ${result.error}`);
        }
    } catch (error) {
        console.error('❌ Erreur nettoyage automatique:', error);
        alert('Erreur lors du nettoyage automatique');
    }
}
