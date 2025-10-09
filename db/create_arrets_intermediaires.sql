-- ======================================
--   TABLE POUR ARRÊTS INTERMÉDIAIRES
-- ======================================

-- Table pour stocker les arrêts intermédiaires d'une course
CREATE TABLE IF NOT EXISTS arrets_intermediaires (
    id_arret SERIAL PRIMARY KEY,
    id_course INTEGER REFERENCES Course(id_course) ON DELETE CASCADE,
    ordre INTEGER NOT NULL, -- Ordre de l'arrêt (1, 2, 3...)
    adresse TEXT NOT NULL,
    latitude DECIMAL(9, 6) NOT NULL,
    longitude DECIMAL(9, 6) NOT NULL,
    place_id VARCHAR(255),
    statut VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'atteint', 'passe')),
    heure_arrivee TIMESTAMP,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(id_course, ordre) -- Un seul arrêt par ordre pour chaque course
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_arrets_course ON arrets_intermediaires(id_course);
CREATE INDEX IF NOT EXISTS idx_arrets_ordre ON arrets_intermediaires(id_course, ordre);

-- Commentaires pour documentation
COMMENT ON TABLE arrets_intermediaires IS 'Table stockant les arrêts intermédiaires pour les courses avec plusieurs destinations';
COMMENT ON COLUMN arrets_intermediaires.ordre IS 'Ordre chronologique de l''arrêt dans la course (1 = premier arrêt, 2 = deuxième, etc.)';
COMMENT ON COLUMN arrets_intermediaires.statut IS 'Statut de l''arrêt : en_attente (pas encore atteint), atteint (chauffeur est arrivé), passe (arrêt terminé)';
