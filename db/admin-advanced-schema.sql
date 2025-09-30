-- Tables pour l'administration avancée Vamo

-- Table pour l'historique des actions sur les chauffeurs
CREATE TABLE IF NOT EXISTS HistoriqueActionsChauffeur (
    id_action SERIAL PRIMARY KEY,
    id_chauffeur INTEGER REFERENCES Chauffeur(id_chauffeur),
    action VARCHAR(50) NOT NULL, -- 'approuver', 'suspendre', 'rejeter', 'reapprouver'
    ancien_statut VARCHAR(20),
    nouveau_statut VARCHAR(20),
    raison TEXT,
    admin_email VARCHAR(100),
    date_action TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table pour l'historique des actions sur les livreurs
CREATE TABLE IF NOT EXISTS HistoriqueActionsLivreur (
    id_action SERIAL PRIMARY KEY,
    id_livreur INTEGER REFERENCES Livreur(id_livreur),
    action VARCHAR(50) NOT NULL,
    ancien_statut VARCHAR(20),
    nouveau_statut VARCHAR(20),
    raison TEXT,
    admin_email VARCHAR(100),
    date_action TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table pour les notes administratives
CREATE TABLE IF NOT EXISTS NotesAdmin (
    id_note SERIAL PRIMARY KEY,
    type_entite VARCHAR(20) NOT NULL, -- 'chauffeur' ou 'livreur'
    id_entite INTEGER NOT NULL,
    note TEXT NOT NULL,
    priorite VARCHAR(20) DEFAULT 'normale', -- 'basse', 'normale', 'haute', 'critique'
    admin_email VARCHAR(100),
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table pour les notifications admin
CREATE TABLE IF NOT EXISTS NotificationsAdmin (
    id_notification SERIAL PRIMARY KEY,
    titre VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'inscription', 'probleme', 'revenus', 'alerte'
    priorite VARCHAR(20) DEFAULT 'normale',
    lu BOOLEAN DEFAULT FALSE,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ajouter des colonnes manquantes si elles n'existent pas
ALTER TABLE Chauffeur ADD COLUMN IF NOT EXISTS date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE Chauffeur ADD COLUMN IF NOT EXISTS date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE Chauffeur ADD COLUMN IF NOT EXISTS notes_admin TEXT;

ALTER TABLE Livreur ADD COLUMN IF NOT EXISTS date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE Livreur ADD COLUMN IF NOT EXISTS date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE Livreur ADD COLUMN IF NOT EXISTS notes_admin TEXT;

-- Améliorer la table Vehicule si elle existe
ALTER TABLE Vehicule ADD COLUMN IF NOT EXISTS numero_plaque VARCHAR(20);
ALTER TABLE Vehicule ADD COLUMN IF NOT EXISTS photo_avant TEXT;
ALTER TABLE Vehicule ADD COLUMN IF NOT EXISTS photo_arriere TEXT;
ALTER TABLE Vehicule ADD COLUMN IF NOT EXISTS photo_cote_gauche TEXT;
ALTER TABLE Vehicule ADD COLUMN IF NOT EXISTS photo_cote_droit TEXT;
ALTER TABLE Vehicule ADD COLUMN IF NOT EXISTS photo_plaque TEXT;

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_historique_chauffeur ON HistoriqueActionsChauffeur(id_chauffeur, date_action);
CREATE INDEX IF NOT EXISTS idx_historique_livreur ON HistoriqueActionsLivreur(id_livreur, date_action);
CREATE INDEX IF NOT EXISTS idx_notes_admin ON NotesAdmin(type_entite, id_entite);
CREATE INDEX IF NOT EXISTS idx_chauffeur_statut ON Chauffeur(statut_validation);
CREATE INDEX IF NOT EXISTS idx_livreur_statut ON Livreur(statut_validation);

-- Vues pour les statistiques rapides
CREATE OR REPLACE VIEW vue_stats_chauffeurs AS
SELECT 
    statut_validation,
    COUNT(*) as nombre,
    COUNT(*) FILTER (WHERE disponibilite = true) as disponibles
FROM Chauffeur 
GROUP BY statut_validation;

CREATE OR REPLACE VIEW vue_stats_livreurs AS
SELECT 
    statut_validation,
    COUNT(*) as nombre,
    COUNT(*) FILTER (WHERE disponibilite = true) as disponibles
FROM Livreur 
GROUP BY statut_validation;

-- Vue pour les revenus quotidiens
CREATE OR REPLACE VIEW vue_revenus_quotidiens AS
SELECT 
    DATE(date_heure_debut) as date,
    COUNT(*) as nombre_courses,
    SUM(prix_total) as revenus_total,
    AVG(prix_total) as prix_moyen
FROM Course 
WHERE statut = 'terminee'
GROUP BY DATE(date_heure_debut)
ORDER BY date DESC;