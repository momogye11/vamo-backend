-- Ajouter la colonne en_livraison à la table Livreur
ALTER TABLE Livreur ADD COLUMN IF NOT EXISTS en_livraison BOOLEAN DEFAULT FALSE;

-- Mettre à jour les livreurs existants
UPDATE Livreur SET en_livraison = FALSE WHERE en_livraison IS NULL;

-- Vérifier que la colonne a été ajoutée
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'livreur' AND column_name = 'en_livraison'; 