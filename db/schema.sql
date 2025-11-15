-- ======================================
--         TABLES POUR VAMO - CLIENT / CHAUFFEUR
-- ======================================
CREATE TABLE Client (
    id_client SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    telephone VARCHAR(20) NOT NULL UNIQUE,
    device_token TEXT,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE HistoriqueAdresseClient (
    id_adresse SERIAL PRIMARY KEY,
    id_client INTEGER REFERENCES Client(id_client) ON DELETE CASCADE,
    adresse TEXT NOT NULL,
    adresse_detaillee TEXT,
    latitude DECIMAL(9, 6),
    longitude DECIMAL(9, 6),
    place_id VARCHAR(255),
    type_lieu VARCHAR(50) DEFAULT 'recent',
    date_utilisation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    nombre_utilisations INTEGER DEFAULT 1
);
CREATE TABLE Chauffeur (
    id_chauffeur SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    telephone VARCHAR(20) NOT NULL UNIQUE,
    marque_vehicule VARCHAR(100),
    annee_vehicule INTEGER,
    plaque_immatriculation VARCHAR(20),
    photo_vehicule TEXT,
    photo_cni TEXT,
    photo_selfie TEXT,
    statut_validation VARCHAR(20) DEFAULT 'en_attente' CHECK (statut_validation IN ('en_attente', 'approuve', 'rejete')),
    disponibilite BOOLEAN DEFAULT FALSE,
    device_token TEXT,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE Vehicule (
    id_vehicule SERIAL PRIMARY KEY,
    id_chauffeur INTEGER REFERENCES Chauffeur(id_chauffeur) ON DELETE CASCADE,
    marque VARCHAR(100),
    modele VARCHAR(100),
    type VARCHAR(50),
    plaque VARCHAR(20) UNIQUE,
    couleur VARCHAR(50)
);
CREATE TABLE PositionChauffeur (
    id_chauffeur INTEGER PRIMARY KEY REFERENCES Chauffeur(id_chauffeur) ON DELETE CASCADE,
    latitude DECIMAL(9, 6),
    longitude DECIMAL(9, 6),
    derniere_maj TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE Course (
    id_course SERIAL PRIMARY KEY,
    id_client INTEGER REFERENCES Client(id_client) ON DELETE
    SET NULL,
        id_chauffeur INTEGER REFERENCES Chauffeur(id_chauffeur) ON DELETE
    SET NULL,
        adresse_depart TEXT NOT NULL,
        adresse_arrivee TEXT NOT NULL,
        distance_km DECIMAL(5, 2),
        duree_min INTEGER,
        prix DECIMAL(10, 2),
        date_heure_depart TIMESTAMP,
        date_heure_arrivee TIMESTAMP,
        etat_course VARCHAR(20) DEFAULT 'en_attente',
        est_paye BOOLEAN DEFAULT FALSE,
        mode_silencieux BOOLEAN DEFAULT FALSE
);
CREATE TABLE Paiement (
    id_paiement SERIAL PRIMARY KEY,
    id_course INTEGER REFERENCES Course(id_course) ON DELETE CASCADE,
    mode VARCHAR(20) CHECK (mode IN ('wave', 'orange_money', 'especes')),
    date_paiement TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE Note (
    id_note SERIAL PRIMARY KEY,
    id_client INTEGER REFERENCES Client(id_client) ON DELETE
    SET NULL,
        id_chauffeur INTEGER REFERENCES Chauffeur(id_chauffeur) ON DELETE
    SET NULL,
        note INTEGER CHECK (
            note >= 1
            AND note <= 5
        ),
        commentaire TEXT,
        date_note TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        id_course INTEGER UNIQUE REFERENCES Course(id_course) ON DELETE
    SET NULL
);
CREATE TABLE ChauffeurBlacklistTemporaire (
    id_blacklist SERIAL PRIMARY KEY,
    id_chauffeur INTEGER REFERENCES Chauffeur(id_chauffeur) ON DELETE CASCADE,
    id_course INTEGER REFERENCES Course(id_course) ON DELETE CASCADE,
    id_client INTEGER REFERENCES Client(id_client) ON DELETE CASCADE,
    adresse_depart TEXT,
    adresse_arrivee TEXT,
    blacklist_jusqu_a TIMESTAMP NOT NULL,
    raison TEXT DEFAULT 'Annulation par le chauffeur',
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(id_chauffeur, id_course)
);

CREATE INDEX idx_blacklist_expiration ON ChauffeurBlacklistTemporaire(blacklist_jusqu_a);
CREATE INDEX idx_blacklist_course ON ChauffeurBlacklistTemporaire(id_course);
CREATE INDEX idx_blacklist_client_trajet ON ChauffeurBlacklistTemporaire(id_chauffeur, id_client, blacklist_jusqu_a);

CREATE TABLE HistoriqueCourse (
    id_course INTEGER PRIMARY KEY,
    id_client INTEGER,
    id_chauffeur INTEGER,
    adresse_depart TEXT,
    adresse_arrivee TEXT,
    distance_km DECIMAL(5, 2),
    duree_min INTEGER,
    prix DECIMAL(10, 2),
    date_heure_depart TIMESTAMP,
    date_heure_arrivee TIMESTAMP,
    etat_course VARCHAR(20),
    mode_silencieux BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- ======================================
--              LIVRAISON
-- ======================================
CREATE TABLE Livreur (
    id_livreur SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    telephone VARCHAR(20) NOT NULL UNIQUE,
    type_vehicule VARCHAR(20) CHECK (type_vehicule IN ('bike', 'motorcycle')),
    photo_vehicule TEXT,
    photo_cni TEXT,
    photo_selfie TEXT,
    statut_validation VARCHAR(20) DEFAULT 'en_attente' CHECK (statut_validation IN ('en_attente', 'approuve', 'rejete')),
    disponibilite BOOLEAN DEFAULT FALSE,
    device_token TEXT,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE PositionLivreur (
    id_livreur INTEGER PRIMARY KEY REFERENCES Livreur(id_livreur) ON DELETE CASCADE,
    latitude DECIMAL(9, 6),
    longitude DECIMAL(9, 6),
    derniere_maj TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE TypeLivraison (
    id_type SERIAL PRIMARY KEY,
    nom VARCHAR(50) UNIQUE NOT NULL
);
INSERT INTO TypeLivraison (nom)
VALUES ('express'),
    ('flex');
CREATE TABLE Livraison (
    id_livraison SERIAL PRIMARY KEY,
    id_client INTEGER REFERENCES Client(id_client) ON DELETE
    SET NULL,
        id_livreur INTEGER REFERENCES Livreur(id_livreur) ON DELETE
    SET NULL,
        adresse_depart TEXT NOT NULL,
        latitude_depart DECIMAL(9, 6),
        longitude_depart DECIMAL(9, 6),
        adresse_arrivee TEXT NOT NULL,
        latitude_arrivee DECIMAL(9, 6),
        longitude_arrivee DECIMAL(9, 6),
        destinataire_nom VARCHAR(100),
        destinataire_telephone VARCHAR(20),
        instructions TEXT,
        taille_colis VARCHAR(10) CHECK (taille_colis IN ('S', 'M', 'L')),
        prix DECIMAL(10, 2),
        date_heure_depart TIMESTAMP,
        date_heure_arrivee TIMESTAMP,
        etat_livraison VARCHAR(20) DEFAULT 'en_attente',
        id_type INTEGER REFERENCES TypeLivraison(id_type),
        est_paye BOOLEAN DEFAULT FALSE
);
CREATE TABLE PaiementLivraison (
    id_paiement SERIAL PRIMARY KEY,
    id_livraison INTEGER REFERENCES Livraison(id_livraison) ON DELETE CASCADE,
    mode VARCHAR(20) CHECK (mode IN ('wave', 'orange_money', 'especes')),
    date_paiement TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE HistoriqueLivraison (
    id_livraison INTEGER PRIMARY KEY,
    id_client INTEGER,
    id_livreur INTEGER,
    adresse_depart TEXT,
    latitude_depart DECIMAL(9, 6),
    longitude_depart DECIMAL(9, 6),
    adresse_arrivee TEXT,
    latitude_arrivee DECIMAL(9, 6),
    longitude_arrivee DECIMAL(9, 6),
    destinataire_nom VARCHAR(100),
    destinataire_telephone VARCHAR(20),
    instructions TEXT,
    taille_colis VARCHAR(10),
    prix DECIMAL(10, 2),
    date_heure_depart TIMESTAMP,
    date_heure_arrivee TIMESTAMP,
    etat_livraison VARCHAR(20),
    id_type INTEGER,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE NoteLivraison (
    id_note SERIAL PRIMARY KEY,
    id_client INTEGER REFERENCES Client(id_client) ON DELETE
    SET NULL,
        id_livreur INTEGER REFERENCES Livreur(id_livreur) ON DELETE
    SET NULL,
        note INTEGER CHECK (
            note >= 1
            AND note <= 5
        ),
        commentaire TEXT,
        date_note TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        id_livraison INTEGER UNIQUE REFERENCES Livraison(id_livraison) ON DELETE
    SET NULL
);
CREATE TABLE otp_codes (
    phone VARCHAR(20) PRIMARY KEY,
    code VARCHAR(4) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);