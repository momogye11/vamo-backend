-- ======================================
--         SCHEMA COMPLET VAMO - TOUTES LES TABLES
-- ======================================

-- ======================================
--              AUTHENTIFICATION
-- ======================================
CREATE TABLE otp_codes (
    phone VARCHAR(20) PRIMARY KEY,
    code VARCHAR(4) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================
--              CLIENTS
-- ======================================
CREATE TABLE Client (
    id_client SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    telephone VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255),
    date_naissance DATE,
    sexe VARCHAR(10) CHECK (sexe IN ('homme', 'femme')),
    photo_profil TEXT,
    device_token TEXT,
    statut VARCHAR(20) DEFAULT 'actif' CHECK (statut IN ('actif', 'suspendu', 'bloque')),
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    derniere_connexion TIMESTAMP
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
    nombre_utilisations INTEGER DEFAULT 1,
    est_favori BOOLEAN DEFAULT FALSE
);

-- ======================================
--              CHAUFFEURS VTC
-- ======================================
CREATE TABLE Chauffeur (
    id_chauffeur SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    telephone VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255),
    date_naissance DATE,
    adresse TEXT,
    numero_permis VARCHAR(50),
    date_expiration_permis DATE,
    numero_carte_professionnelle VARCHAR(50),
    marque_vehicule VARCHAR(100),
    modele_vehicule VARCHAR(100),
    annee_vehicule INTEGER,
    couleur_vehicule VARCHAR(50),
    plaque_immatriculation VARCHAR(20),
    numero_assurance VARCHAR(100),
    date_expiration_assurance DATE,
    numero_visite_technique VARCHAR(100),
    date_expiration_visite_technique DATE,
    photo_vehicule TEXT,
    photo_cni TEXT,
    photo_selfie TEXT,
    photo_permis TEXT,
    photo_carte_professionnelle TEXT,
    photo_assurance TEXT,
    photo_visite_technique TEXT,
    statut_validation VARCHAR(20) DEFAULT 'en_attente' CHECK (statut_validation IN ('en_attente', 'approuve', 'rejete')),
    statut_approbation VARCHAR(20) DEFAULT 'en_attente' CHECK (statut_approbation IN ('en_attente', 'approuve', 'rejete')),
    disponibilite BOOLEAN DEFAULT FALSE,
    en_course BOOLEAN DEFAULT FALSE,
    device_token TEXT,
    note_moyenne DECIMAL(2,1) DEFAULT 0.0,
    nombre_courses_completees INTEGER DEFAULT 0,
    revenus_totaux DECIMAL(10, 2) DEFAULT 0.00,
    commission_rate DECIMAL(3,2) DEFAULT 0.15,
    statut VARCHAR(20) DEFAULT 'actif' CHECK (statut IN ('actif', 'suspendu', 'bloque')),
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    derniere_connexion TIMESTAMP,
    derniere_activite TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Vehicule (
    id_vehicule SERIAL PRIMARY KEY,
    id_chauffeur INTEGER REFERENCES Chauffeur(id_chauffeur) ON DELETE CASCADE,
    marque VARCHAR(100),
    modele VARCHAR(100),
    annee INTEGER,
    type VARCHAR(50) DEFAULT 'berline',
    plaque VARCHAR(20) UNIQUE,
    couleur VARCHAR(50),
    nombre_places INTEGER DEFAULT 4,
    climatisation BOOLEAN DEFAULT TRUE,
    statut VARCHAR(20) DEFAULT 'actif' CHECK (statut IN ('actif', 'maintenance', 'retire'))
);

CREATE TABLE PositionChauffeur (
    id_chauffeur INTEGER PRIMARY KEY REFERENCES Chauffeur(id_chauffeur) ON DELETE CASCADE,
    latitude DECIMAL(9, 6),
    longitude DECIMAL(9, 6),
    vitesse DECIMAL(5,2) DEFAULT 0.0,
    cap INTEGER DEFAULT 0,
    altitude DECIMAL(8,2),
    precision_gps DECIMAL(8,2),
    derniere_maj TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================
--              LIVREURS
-- ======================================
CREATE TABLE Livreur (
    id_livreur SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    telephone VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255),
    date_naissance DATE,
    adresse TEXT,
    numero_permis VARCHAR(50),
    type_vehicule VARCHAR(20) CHECK (type_vehicule IN ('bike', 'motorcycle', 'scooter')),
    marque_vehicule VARCHAR(100),
    modele_vehicule VARCHAR(100),
    plaque_vehicule VARCHAR(20),
    photo_vehicule TEXT,
    photo_cni TEXT,
    photo_selfie TEXT,
    photo_permis TEXT,
    statut_validation VARCHAR(20) DEFAULT 'en_attente' CHECK (statut_validation IN ('en_attente', 'approuve', 'rejete')),
    disponibilite BOOLEAN DEFAULT FALSE,
    en_livraison BOOLEAN DEFAULT FALSE,
    device_token TEXT,
    note_moyenne DECIMAL(2,1) DEFAULT 0.0,
    nombre_livraisons_completees INTEGER DEFAULT 0,
    revenus_totaux DECIMAL(10, 2) DEFAULT 0.00,
    statut VARCHAR(20) DEFAULT 'actif' CHECK (statut IN ('actif', 'suspendu', 'bloque')),
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    derniere_connexion TIMESTAMP,
    derniere_activite TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE PositionLivreur (
    id_livreur INTEGER PRIMARY KEY REFERENCES Livreur(id_livreur) ON DELETE CASCADE,
    latitude DECIMAL(9, 6),
    longitude DECIMAL(9, 6),
    vitesse DECIMAL(5,2) DEFAULT 0.0,
    cap INTEGER DEFAULT 0,
    altitude DECIMAL(8,2),
    precision_gps DECIMAL(8,2),
    derniere_maj TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================
--              COURSES VTC
-- ======================================
CREATE TABLE Course (
    id_course SERIAL PRIMARY KEY,
    id_client INTEGER REFERENCES Client(id_client) ON DELETE SET NULL,
    id_chauffeur INTEGER REFERENCES Chauffeur(id_chauffeur) ON DELETE SET NULL,
    adresse_depart TEXT NOT NULL,
    adresse_arrivee TEXT NOT NULL,
    latitude_depart DECIMAL(9, 6),
    longitude_depart DECIMAL(9, 6),
    latitude_arrivee DECIMAL(9, 6),
    longitude_arrivee DECIMAL(9, 6),
    distance_km DECIMAL(5, 2),
    duree_min INTEGER,
    duree_reelle_min INTEGER,
    prix DECIMAL(10, 2),
    prix_base DECIMAL(10, 2),
    frais_supplementaires DECIMAL(10, 2) DEFAULT 0.00,
    commission DECIMAL(10, 2) DEFAULT 0.00,
    pourboire DECIMAL(10, 2) DEFAULT 0.00,
    mode_paiement VARCHAR(20) DEFAULT 'especes' CHECK (mode_paiement IN ('wave', 'orange_money', 'especes', 'carte')),
    type_course VARCHAR(20) DEFAULT 'standard' CHECK (type_course IN ('standard', 'premium', 'economique')),
    nombre_passagers INTEGER DEFAULT 1,
    telephone_client VARCHAR(20),
    nom_client VARCHAR(100),
    mode_silencieux BOOLEAN DEFAULT FALSE,
    instructions_speciales TEXT,
    date_heure_demande TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_heure_depart TIMESTAMP,
    date_heure_debut_course TIMESTAMP,
    date_heure_arrivee TIMESTAMP,
    etat_course VARCHAR(20) DEFAULT 'en_attente' CHECK (etat_course IN (
        'en_attente', 'acceptee', 'en_route_pickup', 'arrivee_pickup', 
        'en_cours', 'terminee', 'annulee', 'expiree'
    )),
    annulee_par VARCHAR(20) CHECK (annulee_par IN ('client', 'chauffeur', 'systeme')),
    raison_annulation TEXT,
    est_paye BOOLEAN DEFAULT FALSE,
    course_programmee TIMESTAMP,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================
--              LIVRAISONS
-- ======================================
CREATE TABLE TypeLivraison (
    id_type SERIAL PRIMARY KEY,
    nom VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    prix_base DECIMAL(8,2),
    prix_par_km DECIMAL(8,2),
    temps_estimation_min INTEGER
);

INSERT INTO TypeLivraison (nom, description, prix_base, prix_par_km, temps_estimation_min)
VALUES 
    ('express', 'Livraison express en moins de 30 minutes', 500.00, 100.00, 30),
    ('standard', 'Livraison standard dans la journée', 300.00, 75.00, 120),
    ('flex', 'Livraison flexible sous 24h', 200.00, 50.00, 720);

CREATE TABLE Livraison (
    id_livraison SERIAL PRIMARY KEY,
    id_client INTEGER REFERENCES Client(id_client) ON DELETE SET NULL,
    id_livreur INTEGER REFERENCES Livreur(id_livreur) ON DELETE SET NULL,
    adresse_depart TEXT NOT NULL,
    latitude_depart DECIMAL(9, 6),
    longitude_depart DECIMAL(9, 6),
    contact_expediteur VARCHAR(100),
    telephone_expediteur VARCHAR(20),
    adresse_arrivee TEXT NOT NULL,
    latitude_arrivee DECIMAL(9, 6),
    longitude_arrivee DECIMAL(9, 6),
    destinataire_nom VARCHAR(100),
    destinataire_telephone VARCHAR(20),
    instructions TEXT,
    description_colis TEXT,
    taille_colis VARCHAR(10) CHECK (taille_colis IN ('S', 'M', 'L', 'XL')),
    poids_estime DECIMAL(5,2),
    valeur_declaree DECIMAL(10,2),
    fragile BOOLEAN DEFAULT FALSE,
    distance_km DECIMAL(5,2),
    duree_estimee_min INTEGER,
    duree_reelle_min INTEGER,
    prix DECIMAL(10, 2),
    prix_base DECIMAL(10, 2),
    frais_supplementaires DECIMAL(10, 2) DEFAULT 0.00,
    commission DECIMAL(10, 2) DEFAULT 0.00,
    pourboire DECIMAL(10, 2) DEFAULT 0.00,
    mode_paiement VARCHAR(20) DEFAULT 'especes' CHECK (mode_paiement IN ('wave', 'orange_money', 'especes', 'carte')),
    code_verification VARCHAR(6),
    photo_colis_depart TEXT,
    photo_colis_arrivee TEXT,
    signature_destinataire TEXT,
    date_heure_demande TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_heure_collecte TIMESTAMP,
    date_heure_debut_livraison TIMESTAMP,
    date_heure_arrivee TIMESTAMP,
    etat_livraison VARCHAR(20) DEFAULT 'en_attente' CHECK (etat_livraison IN (
        'en_attente', 'acceptee', 'en_route_collecte', 'collectee', 
        'en_route_livraison', 'livree', 'echec_livraison', 'annulee', 'expiree'
    )),
    annulee_par VARCHAR(20) CHECK (annulee_par IN ('client', 'livreur', 'systeme')),
    raison_annulation TEXT,
    id_type INTEGER REFERENCES TypeLivraison(id_type),
    est_paye BOOLEAN DEFAULT FALSE,
    livraison_programmee TIMESTAMP,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================
--              PAIEMENTS
-- ======================================
CREATE TABLE Paiement (
    id_paiement SERIAL PRIMARY KEY,
    id_course INTEGER REFERENCES Course(id_course) ON DELETE CASCADE,
    mode VARCHAR(20) CHECK (mode IN ('wave', 'orange_money', 'especes', 'carte')),
    montant DECIMAL(10, 2),
    statut VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'reussi', 'echec', 'rembourse')),
    reference_transaction VARCHAR(100),
    frais_transaction DECIMAL(10, 2) DEFAULT 0.00,
    date_paiement TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_traitement TIMESTAMP
);

CREATE TABLE PaiementLivraison (
    id_paiement SERIAL PRIMARY KEY,
    id_livraison INTEGER REFERENCES Livraison(id_livraison) ON DELETE CASCADE,
    mode VARCHAR(20) CHECK (mode IN ('wave', 'orange_money', 'especes', 'carte')),
    montant DECIMAL(10, 2),
    statut VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'reussi', 'echec', 'rembourse')),
    reference_transaction VARCHAR(100),
    frais_transaction DECIMAL(10, 2) DEFAULT 0.00,
    date_paiement TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_traitement TIMESTAMP
);

-- ======================================
--              EVALUATIONS
-- ======================================
CREATE TABLE Note (
    id_note SERIAL PRIMARY KEY,
    id_client INTEGER REFERENCES Client(id_client) ON DELETE SET NULL,
    id_chauffeur INTEGER REFERENCES Chauffeur(id_chauffeur) ON DELETE SET NULL,
    id_course INTEGER UNIQUE REFERENCES Course(id_course) ON DELETE SET NULL,
    note_client INTEGER CHECK (note_client >= 1 AND note_client <= 5),
    note_chauffeur INTEGER CHECK (note_chauffeur >= 1 AND note_chauffeur <= 5),
    commentaire_client TEXT,
    commentaire_chauffeur TEXT,
    qualite_conduite INTEGER CHECK (qualite_conduite >= 1 AND qualite_conduite <= 5),
    proprete_vehicule INTEGER CHECK (proprete_vehicule >= 1 AND proprete_vehicule <= 5),
    ponctualite INTEGER CHECK (ponctualite >= 1 AND ponctualite <= 5),  
    amabilite INTEGER CHECK (amabilite >= 1 AND amabilite <= 5),
    date_note TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE NoteLivraison (
    id_note SERIAL PRIMARY KEY,
    id_client INTEGER REFERENCES Client(id_client) ON DELETE SET NULL,
    id_livreur INTEGER REFERENCES Livreur(id_livreur) ON DELETE SET NULL,
    id_livraison INTEGER UNIQUE REFERENCES Livraison(id_livraison) ON DELETE SET NULL,
    note_client INTEGER CHECK (note_client >= 1 AND note_client <= 5),
    note_livreur INTEGER CHECK (note_livreur >= 1 AND note_livreur <= 5),
    commentaire_client TEXT,
    commentaire_livreur TEXT,
    rapidite INTEGER CHECK (rapidite >= 1 AND rapidite <= 5),
    soin_colis INTEGER CHECK (soin_colis >= 1 AND soin_colis <= 5),
    communication INTEGER CHECK (communication >= 1 AND communication <= 5),
    date_note TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================
--              HISTORIQUES
-- ======================================
CREATE TABLE HistoriqueCourse (
    id_course INTEGER PRIMARY KEY,
    id_client INTEGER,
    id_chauffeur INTEGER,
    adresse_depart TEXT,
    adresse_arrivee TEXT,
    latitude_depart DECIMAL(9, 6),
    longitude_depart DECIMAL(9, 6),
    latitude_arrivee DECIMAL(9, 6),
    longitude_arrivee DECIMAL(9, 6),
    distance_km DECIMAL(5, 2),
    duree_min INTEGER,
    duree_reelle_min INTEGER,
    prix DECIMAL(10, 2),
    commission DECIMAL(10, 2),
    pourboire DECIMAL(10, 2),
    mode_paiement VARCHAR(20),
    type_course VARCHAR(20),
    date_heure_demande TIMESTAMP,
    date_heure_depart TIMESTAMP,
    date_heure_arrivee TIMESTAMP,
    etat_course VARCHAR(20),
    note_finale INTEGER,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    distance_km DECIMAL(5,2),
    duree_estimee_min INTEGER,
    duree_reelle_min INTEGER,
    prix DECIMAL(10, 2),
    commission DECIMAL(10, 2),
    pourboire DECIMAL(10, 2),
    mode_paiement VARCHAR(20),
    date_heure_demande TIMESTAMP,
    date_heure_collecte TIMESTAMP,
    date_heure_arrivee TIMESTAMP,
    etat_livraison VARCHAR(20),
    id_type INTEGER,
    note_finale INTEGER,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================
--              STATISTIQUES & ANALYTICS
-- ======================================
CREATE TABLE StatistiquesJournailieres (
    id_stat SERIAL PRIMARY KEY,
    date_stat DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
    nombre_courses_total INTEGER DEFAULT 0,
    nombre_courses_completees INTEGER DEFAULT 0,
    nombre_courses_annulees INTEGER DEFAULT 0,
    nombre_livraisons_total INTEGER DEFAULT 0,
    nombre_livraisons_completees INTEGER DEFAULT 0,
    nombre_livraisons_annulees INTEGER DEFAULT 0,
    revenus_courses DECIMAL(12, 2) DEFAULT 0.00,
    revenus_livraisons DECIMAL(12, 2) DEFAULT 0.00,
    commission_totale DECIMAL(12, 2) DEFAULT 0.00,
    nombre_nouveaux_clients INTEGER DEFAULT 0,
    nombre_nouveaux_chauffeurs INTEGER DEFAULT 0,
    nombre_nouveaux_livreurs INTEGER DEFAULT 0,
    temps_attente_moyen_min INTEGER DEFAULT 0,
    distance_moyenne_km DECIMAL(5, 2) DEFAULT 0.00,
    note_moyenne_courses DECIMAL(2,1) DEFAULT 0.0,
    note_moyenne_livraisons DECIMAL(2,1) DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================
--              PROMOTIONS & CODES
-- ======================================
CREATE TABLE CodePromo (
    id_code SERIAL PRIMARY KEY,  
    code VARCHAR(20) UNIQUE NOT NULL,
    description TEXT,
    type_reduction VARCHAR(20) CHECK (type_reduction IN ('pourcentage', 'montant_fixe')),
    valeur_reduction DECIMAL(8, 2) NOT NULL,
    montant_minimum DECIMAL(8, 2) DEFAULT 0.00,
    montant_maximum_reduction DECIMAL(8, 2),
    limite_utilisations INTEGER,
    utilisations_actuelles INTEGER DEFAULT 0,
    date_debut TIMESTAMP NOT NULL,
    date_fin TIMESTAMP NOT NULL,
    actif BOOLEAN DEFAULT TRUE,
    applicable_courses BOOLEAN DEFAULT TRUE,
    applicable_livraisons BOOLEAN DEFAULT TRUE,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE UtilisationCodePromo (
    id_utilisation SERIAL PRIMARY KEY,
    id_code INTEGER REFERENCES CodePromo(id_code) ON DELETE CASCADE,
    id_client INTEGER REFERENCES Client(id_client) ON DELETE SET NULL,
    id_course INTEGER REFERENCES Course(id_course) ON DELETE SET NULL,
    id_livraison INTEGER REFERENCES Livraison(id_livraison) ON DELETE SET NULL,
    montant_reduction DECIMAL(8, 2),
    date_utilisation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================
--              NOTIFICATIONS
-- ======================================
CREATE TABLE Notification (
    id_notification SERIAL PRIMARY KEY,
    destinataire_type VARCHAR(20) CHECK (destinataire_type IN ('client', 'chauffeur', 'livreur', 'admin')),
    destinataire_id INTEGER NOT NULL,
    type_notification VARCHAR(50) NOT NULL,
    titre VARCHAR(200),
    message TEXT NOT NULL,
    data_supplementaires JSONB,
    lue BOOLEAN DEFAULT FALSE,
    date_lecture TIMESTAMP,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_expiration TIMESTAMP
);

-- ======================================
--              SUPPORT & SIGNALEMENTS
-- ======================================
CREATE TABLE Support (
    id_ticket SERIAL PRIMARY KEY,
    id_client INTEGER REFERENCES Client(id_client) ON DELETE SET NULL,
    id_chauffeur INTEGER REFERENCES Chauffeur(id_chauffeur) ON DELETE SET NULL,
    id_livreur INTEGER REFERENCES Livreur(id_livreur) ON DELETE SET NULL,
    id_course INTEGER REFERENCES Course(id_course) ON DELETE SET NULL,
    id_livraison INTEGER REFERENCES Livraison(id_livraison) ON DELETE SET NULL,
    type_demande VARCHAR(50) NOT NULL,
    sujet VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    statut VARCHAR(20) DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'en_cours', 'resolu', 'ferme')),
    priorite VARCHAR(20) DEFAULT 'normale' CHECK (priorite IN ('basse', 'normale', 'haute', 'urgente')),
    assigne_a VARCHAR(100),
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_resolution TIMESTAMP
);

CREATE TABLE Signalement (
    id_signalement SERIAL PRIMARY KEY,
    signale_par_type VARCHAR(20) CHECK (signale_par_type IN ('client', 'chauffeur', 'livreur')),
    signale_par_id INTEGER NOT NULL,
    signale_type VARCHAR(20) CHECK (signale_type IN ('client', 'chauffeur', 'livreur')),
    signale_id INTEGER NOT NULL,
    id_course INTEGER REFERENCES Course(id_course) ON DELETE SET NULL,
    id_livraison INTEGER REFERENCES Livraison(id_livraison) ON DELETE SET NULL,
    type_signalement VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    preuves JSONB,
    statut VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'en_cours', 'resolu', 'rejete')),
    action_prise TEXT,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_resolution TIMESTAMP
);

-- ======================================
--              CONFIGURATION SYSTÈME
-- ======================================
CREATE TABLE ConfigurationTarif (
    id_config SERIAL PRIMARY KEY,
    type_service VARCHAR(20) CHECK (type_service IN ('course', 'livraison')),
    zone VARCHAR(100) DEFAULT 'dakar',
    prix_base DECIMAL(8, 2) NOT NULL,
    prix_par_km DECIMAL(8, 2) NOT NULL,
    prix_par_minute DECIMAL(8, 2) DEFAULT 0.00,
    prix_minimum DECIMAL(8, 2) NOT NULL,
    commission_percentage DECIMAL(4, 2) DEFAULT 15.00,
    majoration_nuit DECIMAL(4, 2) DEFAULT 0.00,
    majoration_weekend DECIMAL(4, 2) DEFAULT 0.00,
    majoration_ferie DECIMAL(4, 2) DEFAULT 0.00,
    heure_debut_nuit TIME DEFAULT '22:00:00',
    heure_fin_nuit TIME DEFAULT '06:00:00',
    actif BOOLEAN DEFAULT TRUE,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insérer configurations par défaut basées sur la grille Yango
INSERT INTO ConfigurationTarif (type_service, prix_base, prix_par_km, prix_minimum) VALUES
('course', 500.00, 90.00, 500.00), -- Service Vamo
('livraison', 400.00, 80.00, 400.00); -- Livraison Standard

-- Ajouter des configurations pour les services premium
INSERT INTO ConfigurationTarif (type_service, prix_base, prix_par_km, prix_minimum, zone) VALUES
('course_confort', 600.00, 100.00, 600.00, 'city'),
('course_confort', 600.00, 170.00, 600.00, 'suburb'),
('livraison_express', 500.00, 90.00, 500.00, 'city'),
('livraison_express', 500.00, 160.00, 500.00, 'suburb');

-- ======================================
--              ZONES DE SERVICE
-- ======================================
CREATE TABLE ZoneService (
    id_zone SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    description TEXT,
    coordonnees_polygon JSONB NOT NULL, -- Coordonnées du polygone définissant la zone
    actif BOOLEAN DEFAULT TRUE,
    prix_base_course DECIMAL(8, 2),
    prix_base_livraison DECIMAL(8, 2),
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================
--              LOGS & AUDIT
-- ======================================
CREATE TABLE LogActivite (
    id_log SERIAL PRIMARY KEY,
    utilisateur_type VARCHAR(20) CHECK (utilisateur_type IN ('client', 'chauffeur', 'livreur', 'admin', 'systeme')),
    utilisateur_id INTEGER,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    ip_address INET,
    user_agent TEXT,
    donnees_supplementaires JSONB,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================
--              INDEX POUR PERFORMANCE
-- ======================================

-- Index pour recherches fréquentes
CREATE INDEX idx_client_telephone ON Client(telephone);
CREATE INDEX idx_chauffeur_telephone ON Chauffeur(telephone);
CREATE INDEX idx_livreur_telephone ON Livreur(telephone);
CREATE INDEX idx_chauffeur_disponibilite ON Chauffeur(disponibilite, statut_approbation);
CREATE INDEX idx_livreur_disponibilite ON Livreur(disponibilite, statut_validation);

-- Index pour les courses
CREATE INDEX idx_course_etat ON Course(etat_course);
CREATE INDEX idx_course_client ON Course(id_client);
CREATE INDEX idx_course_chauffeur ON Course(id_chauffeur);
CREATE INDEX idx_course_date ON Course(date_creation);

-- Index pour les livraisons  
CREATE INDEX idx_livraison_etat ON Livraison(etat_livraison);
CREATE INDEX idx_livraison_client ON Livraison(id_client);
CREATE INDEX idx_livraison_livreur ON Livraison(id_livreur);
CREATE INDEX idx_livraison_date ON Livraison(date_creation);

-- Index géospatiaux pour les positions
CREATE INDEX idx_position_chauffeur_coords ON PositionChauffeur(latitude, longitude);
CREATE INDEX idx_position_livreur_coords ON PositionLivreur(latitude, longitude);

-- Index pour OTP
CREATE INDEX idx_otp_phone_expires ON otp_codes(phone, expires_at);

-- Index pour historiques
CREATE INDEX idx_historique_course_date ON HistoriqueCourse(archived_at);
CREATE INDEX idx_historique_livraison_date ON HistoriqueLivraison(archived_at);

-- Index pour notifications
CREATE INDEX idx_notification_destinataire ON Notification(destinataire_type, destinataire_id, lue);
CREATE INDEX idx_notification_date ON Notification(date_creation);

-- ======================================
--              TRIGGERS
-- ======================================

-- Trigger pour mettre à jour la note moyenne des chauffeurs
CREATE OR REPLACE FUNCTION update_chauffeur_note_moyenne()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE Chauffeur 
    SET note_moyenne = (
        SELECT ROUND(AVG(note_client), 1)
        FROM Note 
        WHERE id_chauffeur = NEW.id_chauffeur
        AND note_client IS NOT NULL
    )
    WHERE id_chauffeur = NEW.id_chauffeur;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_chauffeur_note 
    AFTER INSERT OR UPDATE ON Note
    FOR EACH ROW
    EXECUTE FUNCTION update_chauffeur_note_moyenne();

-- Trigger pour mettre à jour la note moyenne des livreurs
CREATE OR REPLACE FUNCTION update_livreur_note_moyenne()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE Livreur 
    SET note_moyenne = (
        SELECT ROUND(AVG(note_client), 1)
        FROM NoteLivraison 
        WHERE id_livreur = NEW.id_livreur
        AND note_client IS NOT NULL
    )
    WHERE id_livreur = NEW.id_livreur;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_livreur_note 
    AFTER INSERT OR UPDATE ON NoteLivraison
    FOR EACH ROW
    EXECUTE FUNCTION update_livreur_note_moyenne();

-- Trigger pour archiver les courses terminées
CREATE OR REPLACE FUNCTION archive_course_terminee()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.etat_course = 'terminee' AND OLD.etat_course != 'terminee' THEN
        INSERT INTO HistoriqueCourse SELECT NEW.*, CURRENT_TIMESTAMP;
        
        -- Mettre à jour les statistiques du chauffeur
        UPDATE Chauffeur 
        SET nombre_courses_completees = nombre_courses_completees + 1,
            revenus_totaux = revenus_totaux + COALESCE(NEW.prix, 0)
        WHERE id_chauffeur = NEW.id_chauffeur;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_archive_course 
    AFTER UPDATE ON Course
    FOR EACH ROW
    EXECUTE FUNCTION archive_course_terminee();

-- Trigger pour archiver les livraisons terminées
CREATE OR REPLACE FUNCTION archive_livraison_terminee()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.etat_livraison = 'livree' AND OLD.etat_livraison != 'livree' THEN
        INSERT INTO HistoriqueLivraison SELECT NEW.*, CURRENT_TIMESTAMP;
        
        -- Mettre à jour les statistiques du livreur
        UPDATE Livreur 
        SET nombre_livraisons_completees = nombre_livraisons_completees + 1,
            revenus_totaux = revenus_totaux + COALESCE(NEW.prix, 0)
        WHERE id_livreur = NEW.id_livreur;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_archive_livraison 
    AFTER UPDATE ON Livraison
    FOR EACH ROW
    EXECUTE FUNCTION archive_livraison_terminee();

-- ======================================
--              VUES UTILES
-- ======================================

-- Vue pour les chauffeurs disponibles avec leur position
CREATE VIEW ChauffeursDiponibles AS
SELECT 
    c.id_chauffeur,
    c.nom,
    c.prenom,
    c.telephone,
    c.note_moyenne,
    c.nombre_courses_completees,
    v.marque,
    v.modele,
    v.couleur,
    v.plaque,
    pc.latitude,
    pc.longitude,
    pc.derniere_maj
FROM Chauffeur c
LEFT JOIN Vehicule v ON c.id_chauffeur = v.id_chauffeur
LEFT JOIN PositionChauffeur pc ON c.id_chauffeur = pc.id_chauffeur
WHERE c.disponibilite = true 
AND c.statut_approbation = 'approuve'
AND c.statut = 'actif'
AND c.en_course = false;

-- Vue pour les livreurs disponibles avec leur position  
CREATE VIEW LivreursDisponibles AS
SELECT 
    l.id_livreur,
    l.nom,
    l.prenom,
    l.telephone,
    l.type_vehicule,
    l.note_moyenne,
    l.nombre_livraisons_completees,
    pl.latitude,
    pl.longitude,
    pl.derniere_maj
FROM Livreur l
LEFT JOIN PositionLivreur pl ON l.id_livreur = pl.id_livreur
WHERE l.disponibilite = true 
AND l.statut_validation = 'approuve'
AND l.statut = 'actif'
AND l.en_livraison = false;

-- Vue pour les statistiques en temps réel
CREATE VIEW StatistiquesTempsReel AS
SELECT 
    (SELECT COUNT(*) FROM Course WHERE etat_course = 'en_attente') as courses_en_attente,
    (SELECT COUNT(*) FROM Course WHERE etat_course = 'en_cours') as courses_en_cours,
    (SELECT COUNT(*) FROM Livraison WHERE etat_livraison = 'en_attente') as livraisons_en_attente,
    (SELECT COUNT(*) FROM Livraison WHERE etat_livraison IN ('en_route_collecte', 'collectee', 'en_route_livraison')) as livraisons_en_cours,
    (SELECT COUNT(*) FROM Chauffeur WHERE disponibilite = true AND statut_approbation = 'approuve') as chauffeurs_disponibles,
    (SELECT COUNT(*) FROM Livreur WHERE disponibilite = true AND statut_validation = 'approuve') as livreurs_disponibles,
    (SELECT COUNT(*) FROM Client WHERE statut = 'actif') as clients_actifs;

-- ======================================
--              DONNÉES DE TEST
-- ======================================

-- Insérer un client de test
INSERT INTO Client (nom, prenom, telephone) VALUES 
('Test', 'Client', '+221781234567');

-- Insérer un chauffeur de test approuvé
INSERT INTO Chauffeur (nom, prenom, telephone, statut_validation, statut_approbation, disponibilite) VALUES 
('Test', 'Driver', '+221782345678', 'approuve', 'approuve', true);

-- Insérer un livreur de test approuvé  
INSERT INTO Livreur (nom, prenom, telephone, type_vehicule, statut_validation, disponibilite) VALUES 
('Test', 'Livreur', '+221783456789', 'motorcycle', 'approuve', true);