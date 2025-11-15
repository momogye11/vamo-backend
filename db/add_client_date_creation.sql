-- Migration: Ajouter date_creation à la table Client
-- Date: 2025-11-15
-- Description: Ajoute la colonne date_creation pour tracker la date d'inscription des clients

-- Ajouter la colonne date_creation avec valeur par défaut
ALTER TABLE Client
ADD COLUMN date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Pour les clients existants, mettre une date par défaut (aujourd'hui)
-- Si tu veux une date plus ancienne pour les clients existants, modifie cette ligne
UPDATE Client
SET date_creation = CURRENT_TIMESTAMP
WHERE date_creation IS NULL;

-- Vérifier que la colonne a été ajoutée
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'client' AND column_name = 'date_creation';
