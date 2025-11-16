#!/bin/bash

# Script de nettoyage intelligent des courses bloquées
# Usage:
#   ./cleanup-courses.sh                    # Dry run (aperçu seulement) - 7 jours par défaut
#   ./cleanup-courses.sh --execute          # Exécution avec 7 jours
#   ./cleanup-courses.sh --execute 30       # Exécution avec 30 jours
#   ./cleanup-courses.sh --days 14          # Dry run avec 14 jours

DB_HOST="trolley.proxy.rlwy.net"
DB_PORT="37759"
DB_USER="postgres"
DB_NAME="railway"
PGPASSWORD="niXOdfLhpaUvaOACtQPXXPwKfKXCHCLp"

export PGPASSWORD

# Paramètres par défaut
DRY_RUN=1
DAYS_THRESHOLD=7

# Parser les arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --execute)
            DRY_RUN=0
            if [[ $2 =~ ^[0-9]+$ ]]; then
                DAYS_THRESHOLD=$2
                shift
            fi
            shift
            ;;
        --days)
            DAYS_THRESHOLD=$2
            shift 2
            ;;
        *)
            echo "⚠️  Argument inconnu: $1"
            shift
            ;;
    esac
done

echo "🧹 ========================================"
echo "🧹 NETTOYAGE INTELLIGENT DES COURSES"
echo "🧹 ========================================"
echo ""

if [ $DRY_RUN -eq 1 ]; then
    echo "⚠️  MODE DRY RUN - Aucune modification ne sera effectuée"
    echo "⚠️  Utilisez --execute pour appliquer les changements"
else
    echo "✅ MODE EXECUTION - Les modifications seront appliquées"
fi
echo "📅 Seuil: Courses de plus de ${DAYS_THRESHOLD} jours"
echo ""

# 1. Courses "en_cours" avec date_heure_arrivee (TERMINÉES PHYSIQUEMENT)
echo "1️⃣  Courses 'en_cours' terminées physiquement..."
echo "   ➤ Critère: date_heure_arrivee renseignée depuis + de ${DAYS_THRESHOLD} jours"

QUERY1="SELECT COUNT(*) FROM Course WHERE etat_course = 'en_cours' AND date_heure_arrivee IS NOT NULL AND date_heure_arrivee < NOW() - INTERVAL '${DAYS_THRESHOLD} days';"
COUNT1=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "$QUERY1" 2>&1 | grep -v WARNING | grep -v DETAIL | grep -v HINT | xargs)

echo "   Trouvé: $COUNT1 courses bloquées"

if [ "$COUNT1" -gt 0 ]; then
    echo "   Exemples (les plus anciennes):"
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT id_course, ROUND(EXTRACT(EPOCH FROM (NOW() - date_heure_arrivee))/86400) as jours_depuis FROM Course WHERE etat_course = 'en_cours' AND date_heure_arrivee IS NOT NULL AND date_heure_arrivee < NOW() - INTERVAL '${DAYS_THRESHOLD} days' ORDER BY date_heure_arrivee ASC LIMIT 5;" 2>&1 | grep -v WARNING

    if [ $DRY_RUN -eq 0 ]; then
        UPDATE1="UPDATE Course SET etat_course = 'terminee' WHERE etat_course = 'en_cours' AND date_heure_arrivee IS NOT NULL AND date_heure_arrivee < NOW() - INTERVAL '${DAYS_THRESHOLD} days';"
        RESULT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "$UPDATE1" 2>&1 | grep -v WARNING)
        echo "   ✅ $COUNT1 courses marquées comme 'terminee'"
        echo "   $RESULT"
    else
        echo "   ⚠️  Ces $COUNT1 courses seraient marquées comme 'terminee'"
    fi
fi
echo ""

# 2. Courses "en_attente" timeout (AUCUN CHAUFFEUR TROUVÉ)
echo "2️⃣  Courses 'en_attente' en timeout..."
echo "   ➤ Critère: recherche de chauffeur depuis + de ${DAYS_THRESHOLD} jours"

QUERY2="SELECT COUNT(*) FROM Course WHERE etat_course = 'en_attente' AND date_heure_demande < NOW() - INTERVAL '${DAYS_THRESHOLD} days';"
COUNT2=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "$QUERY2" 2>&1 | grep -v WARNING | grep -v DETAIL | grep -v HINT | xargs)

echo "   Trouvé: $COUNT2 courses à annuler"

if [ "$COUNT2" -gt 0 ]; then
    echo "   Exemples:"
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT id_course, ROUND(EXTRACT(EPOCH FROM (NOW() - date_heure_demande))/86400) as jours_depuis FROM Course WHERE etat_course = 'en_attente' AND date_heure_demande < NOW() - INTERVAL '${DAYS_THRESHOLD} days' LIMIT 10;" 2>&1 | grep -v WARNING

    if [ $DRY_RUN -eq 0 ]; then
        UPDATE2="UPDATE Course SET etat_course = 'annulee' WHERE etat_course = 'en_attente' AND date_heure_demande < NOW() - INTERVAL '${DAYS_THRESHOLD} days';"
        RESULT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "$UPDATE2" 2>&1 | grep -v WARNING)
        echo "   ✅ $COUNT2 courses annulées (timeout recherche)"
        echo "   $RESULT"
    else
        echo "   ⚠️  Ces $COUNT2 courses seraient annulées"
    fi
fi
echo ""

# RÉSUMÉ
echo "🧹 ========================================"
echo "🧹 RÉSUMÉ"
echo "🧹 ========================================"
echo ""

TOTAL=$((COUNT1 + COUNT2))

if [ $DRY_RUN -eq 1 ]; then
    echo "📊 Total de courses à corriger: $TOTAL"
    echo "   - $COUNT1 courses 'en_cours' → terminee"
    echo "   - $COUNT2 courses 'en_attente' → annulee"
    echo ""
    echo "💡 Pour appliquer les changements:"
    echo "   bash scripts/cleanup-courses.sh --execute          # Nettoyer courses de 7+ jours"
    echo "   bash scripts/cleanup-courses.sh --execute 30       # Nettoyer courses de 30+ jours"
    echo "   bash scripts/cleanup-courses.sh --days 14          # Preview avec 14 jours"
else
    echo "✅ Total de courses corrigées: $TOTAL"
    echo "   - $COUNT1 courses marquées comme terminées"
    echo "   - $COUNT2 courses annulées"
fi
echo ""
echo "📋 État actuel de la base de données:"
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT etat_course, COUNT(*) as nombre FROM Course GROUP BY etat_course ORDER BY nombre DESC;" 2>&1 | grep -v WARNING
echo ""
