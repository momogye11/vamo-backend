-- Modifier la table pour supporter le blacklist basé sur client + trajet
ALTER TABLE ChauffeurBlacklistTemporaire 
DROP CONSTRAINT IF EXISTS chauffeurblacklisttemporaire_id_course_fkey;

ALTER TABLE ChauffeurBlacklistTemporaire 
ALTER COLUMN id_course DROP NOT NULL;

-- Ajouter colonnes pour identifier le trajet
ALTER TABLE ChauffeurBlacklistTemporaire 
ADD COLUMN IF NOT EXISTS id_client INTEGER REFERENCES Client(id_client) ON DELETE CASCADE;

ALTER TABLE ChauffeurBlacklistTemporaire 
ADD COLUMN IF NOT EXISTS adresse_depart TEXT;

ALTER TABLE ChauffeurBlacklistTemporaire 
ADD COLUMN IF NOT EXISTS adresse_arrivee TEXT;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_blacklist_client_trajet 
ON ChauffeurBlacklistTemporaire(id_chauffeur, id_client, blacklist_jusqu_a);
