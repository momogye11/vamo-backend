-- Script pour approuver le chauffeur avec le numéro 782957169
-- Mettre à jour le statut de validation de 'en_attente' à 'approuve'

-- D'abord, vérifier l'état actuel du chauffeur
SELECT 
    id_chauffeur,
    nom,
    prenom,
    telephone,
    statut_validation,
    disponibilite,
    date_creation
FROM Chauffeur 
WHERE telephone LIKE '%782957169%' OR telephone = '+221782957169';

-- Mettre à jour le statut du chauffeur à 'approuve'
UPDATE Chauffeur 
SET 
    statut_validation = 'approuve',
    disponibilite = TRUE  -- Le rendre aussi disponible pour recevoir des courses
WHERE telephone LIKE '%782957169%' OR telephone = '+221782957169';

-- Vérifier que la mise à jour a été effectuée
SELECT 
    id_chauffeur,
    nom,
    prenom,
    telephone,
    statut_validation,
    disponibilite,
    date_creation
FROM Chauffeur 
WHERE telephone LIKE '%782957169%' OR telephone = '+221782957169';

-- Afficher tous les chauffeurs approuvés pour confirmation
SELECT 
    id_chauffeur,
    nom,
    prenom,
    telephone,
    statut_validation,
    disponibilite
FROM Chauffeur 
WHERE statut_validation = 'approuve'
ORDER BY date_creation DESC;