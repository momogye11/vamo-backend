-- Migration: Ajouter colonnes bénéficiaire à la table Course
-- Pour supporter la fonctionnalité "Pour qui est la course?"
-- Le client peut commander une course pour quelqu'un d'autre (bénéficiaire)

-- Ajouter les colonnes pour le bénéficiaire
ALTER TABLE Course
ADD COLUMN IF NOT EXISTS beneficiaire_nom VARCHAR(200),
ADD COLUMN IF NOT EXISTS beneficiaire_telephone VARCHAR(20);

-- Ajouter un commentaire sur les colonnes
COMMENT ON COLUMN Course.beneficiaire_nom IS 'Nom complet du bénéficiaire de la course (celui qui va monter)';
COMMENT ON COLUMN Course.beneficiaire_telephone IS 'Numéro de téléphone du bénéficiaire';

-- Créer un index pour rechercher les courses par téléphone du bénéficiaire
CREATE INDEX IF NOT EXISTS idx_course_beneficiaire_telephone ON Course(beneficiaire_telephone);

-- Afficher les colonnes de la table Course pour vérification
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'course'
ORDER BY ordinal_position;
