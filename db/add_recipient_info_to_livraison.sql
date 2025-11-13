-- Ajouter les colonnes pour les informations du destinataire dans la table Livraison
-- Pour être cohérent avec la table Course qui a: passager_nom, passager_prenom, passager_telephone, passager_est_client

-- Ajouter prenom du destinataire (nom existe déjà)
ALTER TABLE Livraison
ADD COLUMN IF NOT EXISTS destinataire_prenom VARCHAR(100);

-- Ajouter flag pour savoir si le destinataire est le client
ALTER TABLE Livraison
ADD COLUMN IF NOT EXISTS destinataire_est_client BOOLEAN DEFAULT TRUE;

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_livraison_destinataire ON Livraison(destinataire_telephone);
