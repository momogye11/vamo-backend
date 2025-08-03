-- Ajouter la colonne en_livraison à la table Livreur
ALTER TABLE Livreur ADD COLUMN en_livraison BOOLEAN DEFAULT FALSE;

-- Commentaire explicatif
COMMENT ON COLUMN Livreur.en_livraison IS 'Indique si le livreur est actuellement en cours de livraison'; 