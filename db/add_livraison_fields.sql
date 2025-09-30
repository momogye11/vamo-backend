-- ======================================
-- AJOUT DES CHAMPS MANQUANTS À LA TABLE LIVRAISON
-- ======================================

-- Ajouter les champs manquants pour les informations de route et paiement
ALTER TABLE Livraison 
ADD COLUMN distance_km DECIMAL(5, 2),
ADD COLUMN duree_estimee_min INTEGER,
ADD COLUMN mode_paiement VARCHAR(20) CHECK (mode_paiement IN ('wave', 'orange_money', 'especes')),
ADD COLUMN description_colis TEXT,
ADD COLUMN date_heure_demande TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Ajouter des commentaires pour documenter les nouveaux champs
COMMENT ON COLUMN Livraison.distance_km IS 'Distance estimée du trajet en kilomètres';
COMMENT ON COLUMN Livraison.duree_estimee_min IS 'Durée estimée du trajet en minutes';
COMMENT ON COLUMN Livraison.mode_paiement IS 'Mode de paiement (wave, orange_money, especes)';
COMMENT ON COLUMN Livraison.description_colis IS 'Description détaillée du colis à livrer';
COMMENT ON COLUMN Livraison.date_heure_demande IS 'Date et heure de la demande de livraison';

-- Mettre à jour les enregistrements existants avec des valeurs par défaut
UPDATE Livraison 
SET 
    distance_km = 5.0,
    duree_estimee_min = 15,
    mode_paiement = 'especes',
    description_colis = 'Colis à livrer',
    date_heure_demande = CURRENT_TIMESTAMP
WHERE distance_km IS NULL;

-- Afficher la structure mise à jour de la table
\d Livraison; 