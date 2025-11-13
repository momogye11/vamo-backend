-- ======================================
--   AJOUT COLONNES PASSAGER (Qui monte ?)
-- ======================================

-- Ajouter les colonnes pour stocker les informations du passager
-- dans les tables Course et Livraison

-- Pour les courses (rides)
ALTER TABLE Course
ADD COLUMN IF NOT EXISTS passager_nom VARCHAR(100),
ADD COLUMN IF NOT EXISTS passager_prenom VARCHAR(100),
ADD COLUMN IF NOT EXISTS passager_telephone VARCHAR(20),
ADD COLUMN IF NOT EXISTS passager_est_client BOOLEAN DEFAULT TRUE;

-- Pour les livraisons
ALTER TABLE Livraison
ADD COLUMN IF NOT EXISTS destinataire_nom VARCHAR(100),
ADD COLUMN IF NOT EXISTS destinataire_prenom VARCHAR(100),
ADD COLUMN IF NOT EXISTS destinataire_telephone VARCHAR(20),
ADD COLUMN IF NOT EXISTS destinataire_est_client BOOLEAN DEFAULT TRUE;

-- Commentaires pour documentation
COMMENT ON COLUMN Course.passager_nom IS 'Nom du passager qui monte (peut être le client lui-même ou un proche)';
COMMENT ON COLUMN Course.passager_prenom IS 'Prénom du passager';
COMMENT ON COLUMN Course.passager_telephone IS 'Téléphone du passager (pour contact par le chauffeur)';
COMMENT ON COLUMN Course.passager_est_client IS 'TRUE si le passager est le client lui-même, FALSE si c''est un proche';

COMMENT ON COLUMN Livraison.destinataire_nom IS 'Nom du destinataire de la livraison';
COMMENT ON COLUMN Livraison.destinataire_prenom IS 'Prénom du destinataire';
COMMENT ON COLUMN Livraison.destinataire_telephone IS 'Téléphone du destinataire';
COMMENT ON COLUMN Livraison.destinataire_est_client IS 'TRUE si le destinataire est le client lui-même, FALSE si c''est un proche';
