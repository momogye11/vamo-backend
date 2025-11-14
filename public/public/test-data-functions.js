// Test des fonctions avec données réelles
console.log('🧪 Test des fonctions de données...');

// Simulation d'un chauffeur avec données réelles
const chauffeurTest = {
    id_chauffeur: 1,
    nom: 'Diallo',
    prenom: 'Amadou',
    marque_vehicule: 'Toyota Corolla 2019',
    plaque_immatriculation: 'DK-1234-AB',
    // Données JOIN depuis table Vehicule (optionnelles)
    vehicule_marque: 'Toyota',
    vehicule_modele: 'Corolla',
    vehicule_plaque: 'DK-5678-CD',
    total_courses: 45,
    courses_terminees: 42,
    revenus_total: 1250000
};

// Inclure les fonctions
function getVehiculeInfo(personne) {
    if (personne.marque_vehicule) {
        return personne.marque_vehicule;
    }
    else if (personne.vehicule_marque && personne.vehicule_modele) {
        return `${personne.vehicule_marque} ${personne.vehicule_modele}`;
    } else if (personne.vehicule_marque) {
        return personne.vehicule_marque;
    } else {
        return 'Véhicule non renseigné';
    }
}

function getPlaqueInfo(personne) {
    if (personne.plaque_immatriculation) {
        return personne.plaque_immatriculation;
    }
    else if (personne.vehicule_plaque) {
        return personne.vehicule_plaque;
    } else if (personne.numero_plaque) {
        return personne.numero_plaque;
    } else {
        return 'Plaque non renseignée';
    }
}

// Test
console.log('Véhicule:', getVehiculeInfo(chauffeurTest));
console.log('Plaque:', getPlaqueInfo(chauffeurTest));
console.log('Courses totales:', chauffeurTest.total_courses);
console.log('Revenus:', chauffeurTest.revenus_total, 'CFA');

// Test avec données manquantes
const chauffeurVide = {
    id_chauffeur: 2,
    nom: 'Test',
    prenom: 'Sans vehicule'
};

console.log('\n--- Test données manquantes ---');
console.log('Véhicule:', getVehiculeInfo(chauffeurVide));
console.log('Plaque:', getPlaqueInfo(chauffeurVide));