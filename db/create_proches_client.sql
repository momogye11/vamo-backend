-- ======================================
--   TABLE PROCHES_CLIENT (Qui monte ?)
-- ======================================

-- Table pour stocker les proches/contacts enregistrés par un client
-- Permet de sélectionner "Qui monte ?" lors de la réservation d'une course

CREATE TABLE IF NOT EXISTS ProchesClient (
    id_proche SERIAL PRIMARY KEY,
    id_client INTEGER NOT NULL REFERENCES Client(id_client) ON DELETE CASCADE,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100),
    telephone VARCHAR(20) NOT NULL,
    date_ajout TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    derniere_utilisation TIMESTAMP,
    nombre_utilisations INTEGER DEFAULT 0,

    -- Index pour recherche rapide par client
    CONSTRAINT unique_proche_par_client UNIQUE(id_client, telephone)
);

-- Index pour améliorer les performances de recherche
CREATE INDEX IF NOT EXISTS idx_proches_client ON ProchesClient(id_client);
CREATE INDEX IF NOT EXISTS idx_proches_telephone ON ProchesClient(telephone);

-- Commentaires pour documentation
COMMENT ON TABLE ProchesClient IS 'Liste des proches/contacts enregistrés par chaque client pour la fonctionnalité "Qui monte ?"';
COMMENT ON COLUMN ProchesClient.id_proche IS 'Identifiant unique du proche';
COMMENT ON COLUMN ProchesClient.id_client IS 'Référence au client propriétaire';
COMMENT ON COLUMN ProchesClient.nom IS 'Nom du proche';
COMMENT ON COLUMN ProchesClient.prenom IS 'Prénom du proche (optionnel)';
COMMENT ON COLUMN ProchesClient.telephone IS 'Numéro de téléphone du proche (format international)';
COMMENT ON COLUMN ProchesClient.nombre_utilisations IS 'Nombre de fois que ce proche a été sélectionné comme passager';
