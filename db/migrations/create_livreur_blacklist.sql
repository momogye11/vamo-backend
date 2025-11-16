-- Migration: Créer la table LivreurBlacklistTemporaire pour blacklister temporairement les livreurs
-- Date: 2025-11-16
-- Description: Ajouter un système de blacklist temporaire (10 minutes) pour les livreurs
--              qui annulent des livraisons, similaire au système existant pour les chauffeurs

-- Créer la table si elle n'existe pas
CREATE TABLE IF NOT EXISTS LivreurBlacklistTemporaire (
    id_blacklist SERIAL PRIMARY KEY,
    id_livreur INTEGER REFERENCES Livreur(id_livreur) ON DELETE CASCADE,
    id_livraison INTEGER REFERENCES Livraison(id_livraison) ON DELETE CASCADE,
    id_client INTEGER REFERENCES Client(id_client) ON DELETE CASCADE,
    adresse_depart TEXT,
    adresse_arrivee TEXT,
    blacklist_jusqu_a TIMESTAMP NOT NULL,
    raison TEXT DEFAULT 'Annulation par le livreur',
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(id_livreur, id_livraison)
);

-- Créer les index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_livreur_blacklist_expiration ON LivreurBlacklistTemporaire(blacklist_jusqu_a);
CREATE INDEX IF NOT EXISTS idx_livreur_blacklist_livraison ON LivreurBlacklistTemporaire(id_livraison);
CREATE INDEX IF NOT EXISTS idx_livreur_blacklist_client_trajet ON LivreurBlacklistTemporaire(id_livreur, id_client, blacklist_jusqu_a);

-- Log de confirmation
DO $$
BEGIN
    RAISE NOTICE 'Table LivreurBlacklistTemporaire créée avec succès avec les index';
END $$;
