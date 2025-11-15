-- ============================================
-- NETTOYAGE DES DONNÉES DE TEST - VAMO
-- ============================================
-- Date: 2025-11-15
-- Description: Nettoie les courses et livraisons de test bloquées

-- AVANT DE LANCER: Ce script va supprimer les données de test!
-- Vérifie bien que tu veux faire ça.

-- ============================================
-- 1. STATISTIQUES AVANT NETTOYAGE
-- ============================================

SELECT 'AVANT NETTOYAGE - COURSES:' as info;
SELECT
    etat_course,
    COUNT(*) as nombre,
    MIN(date_heure_depart) as plus_ancienne,
    MAX(date_heure_depart) as plus_recente
FROM Course
GROUP BY etat_course
ORDER BY nombre DESC;

SELECT 'AVANT NETTOYAGE - LIVRAISONS:' as info;
SELECT
    etat_livraison,
    COUNT(*) as nombre
FROM Livraison
GROUP BY etat_livraison
ORDER BY nombre DESC;

-- ============================================
-- 2. ARCHIVER LES COURSES DE TEST
-- ============================================

-- Archiver les courses "en_attente" et "acceptee" anciennes (> 1 heure)
-- Ces courses n'ont jamais vraiment démarré
BEGIN;

-- Compter combien on va archiver
SELECT 'Courses à archiver (en_attente/acceptee > 1h):' as info, COUNT(*) as nombre
FROM Course
WHERE etat_course IN ('en_attente', 'acceptee')
AND (date_heure_depart IS NULL OR date_heure_depart < NOW() - INTERVAL '1 hour');

-- Marquer comme annulées les courses bloquées
UPDATE Course
SET etat_course = 'annulee'
WHERE etat_course IN ('en_attente', 'acceptee')
AND (date_heure_depart IS NULL OR date_heure_depart < NOW() - INTERVAL '1 hour');

-- Compter combien on va archiver (en_cours > 24h)
SELECT 'Courses à marquer terminées (en_cours > 24h):' as info, COUNT(*) as nombre
FROM Course
WHERE etat_course IN ('en_cours', 'arrivee_pickup')
AND date_heure_depart < NOW() - INTERVAL '24 hours';

-- Marquer comme terminées les courses "en_cours" anciennes (> 24h)
UPDATE Course
SET
    etat_course = 'terminee',
    date_heure_arrivee = date_heure_depart + INTERVAL '30 minutes'
WHERE etat_course IN ('en_cours', 'arrivee_pickup')
AND date_heure_depart < NOW() - INTERVAL '24 hours'
AND date_heure_arrivee IS NULL;

COMMIT;

-- ============================================
-- 3. ARCHIVER LES LIVRAISONS DE TEST
-- ============================================

BEGIN;

-- Compter livraisons à archiver
SELECT 'Livraisons à archiver (en_attente/acceptee > 1h):' as info, COUNT(*) as nombre
FROM Livraison
WHERE etat_livraison IN ('en_attente', 'acceptee')
AND (date_heure_depart IS NULL OR date_heure_depart < NOW() - INTERVAL '1 hour');

-- Annuler les livraisons en attente anciennes
UPDATE Livraison
SET etat_livraison = 'annulee'
WHERE etat_livraison IN ('en_attente', 'acceptee')
AND (date_heure_depart IS NULL OR date_heure_depart < NOW() - INTERVAL '1 hour');

-- Marquer terminées les livraisons en cours anciennes
SELECT 'Livraisons à marquer terminées (en_cours > 24h):' as info, COUNT(*) as nombre
FROM Livraison
WHERE etat_livraison = 'en_cours'
AND date_heure_depart < NOW() - INTERVAL '24 hours';

UPDATE Livraison
SET
    etat_livraison = 'terminee',
    date_heure_arrivee = date_heure_depart + INTERVAL '30 minutes'
WHERE etat_livraison = 'en_cours'
AND date_heure_depart < NOW() - INTERVAL '24 hours'
AND date_heure_arrivee IS NULL;

COMMIT;

-- ============================================
-- 4. RÉINITIALISER LA DISPONIBILITÉ DES CHAUFFEURS
-- ============================================

-- Mettre tous les chauffeurs offline (ils devront se reconnecter)
UPDATE Chauffeur
SET disponibilite = false
WHERE disponibilite = true;

UPDATE Livreur
SET disponibilite = false
WHERE disponibilite = true;

-- ============================================
-- 5. STATISTIQUES APRÈS NETTOYAGE
-- ============================================

SELECT 'APRÈS NETTOYAGE - COURSES:' as info;
SELECT
    etat_course,
    COUNT(*) as nombre
FROM Course
GROUP BY etat_course
ORDER BY nombre DESC;

SELECT 'APRÈS NETTOYAGE - LIVRAISONS:' as info;
SELECT
    etat_livraison,
    COUNT(*) as nombre
FROM Livraison
GROUP BY etat_livraison
ORDER BY nombre DESC;

SELECT 'CHAUFFEURS ET LIVREURS:' as info;
SELECT
    (SELECT COUNT(*) FROM Chauffeur WHERE disponibilite = true) as chauffeurs_online,
    (SELECT COUNT(*) FROM Livreur WHERE disponibilite = true) as livreurs_online;

-- ============================================
-- RÉSUMÉ
-- ============================================

SELECT '✅ NETTOYAGE TERMINÉ!' as info;
