-- ======================================
--   TABLE POUR ARRÊTS INTERMÉDIAIRES LIVRAISONS
-- ======================================

-- Table pour stocker les arrêts intermédiaires d'une livraison
CREATE TABLE IF NOT EXISTS arrets_intermediaires_livraison (
    id_arret SERIAL PRIMARY KEY,
    id_livraison INTEGER REFERENCES Livraison(id_livraison) ON DELETE CASCADE,
    ordre_arret INTEGER NOT NULL, -- Ordre de l'arrêt (1, 2, 3...)
    adresse TEXT NOT NULL,
    latitude DECIMAL(9, 6) NOT NULL,
    longitude DECIMAL(9, 6) NOT NULL,
    place_id VARCHAR(255),
    statut VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'atteint', 'passe')),
    heure_arrivee TIMESTAMP,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(id_livraison, ordre_arret)
);

-- Index pour accélérer les requêtes
CREATE INDEX IF NOT EXISTS idx_arrets_livraison_ordre ON arrets_intermediaires_livraison(id_livraison, ordre_arret);

COMMENT ON TABLE arrets_intermediaires_livraison IS 'Stocke les arrêts intermédiaires pour les livraisons';
COMMENT ON COLUMN arrets_intermediaires_livraison.ordre_arret IS 'Position de l''arrêt dans la séquence (commence à 1)';
COMMENT ON COLUMN arrets_intermediaires_livraison.statut IS 'État de l''arrêt: en_attente, atteint (arrivé), passe (quitté)';
