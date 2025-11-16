#!/bin/bash

# Script de nettoyage automatique des courses bloquées
# Utilise la connexion PostgreSQL externe

DB_HOST="trolley.proxy.rlwy.net"
DB_PORT="37759"
DB_USER="postgres"
DB_NAME="railway"
PGPASSWORD="niXOdfLhpaUvaOACtQPXXPwKfKXCHCLp"

export PGPASSWORD

echo "🧹 ========================================"
echo "🧹 NETTOYAGE DES COURSES BLOQUÉES"
echo "🧹 ========================================"
echo ""

# Mode dry run par défaut
DRY_RUN=1
if [ "$1" == "--execute" ]; then
    DRY_RUN=0
    echo "✅ MODE EXECUTION - Les modifications seront appliquées"
else
    echo "⚠️  MODE DRY RUN - Aucune modification ne sera effectuée"
    echo "⚠️  Utilisez --execute pour appliquer les changements"
fi
echo ""

# 1. Courses "en_cours" avec date_heure_arrivee
echo "1️⃣  Vérification des courses 'en_cours' terminées..."
QUERY1="SELECT COUNT(*) as count FROM Course WHERE etat_course = 'en_cours' AND date_heure_arrivee IS NOT NULL AND date_heure_arrivee < NOW() - INTERVAL '1 hours';"
COUNT1=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "$QUERY1" | xargs)
echo "   Trouvé: $COUNT1 courses à corriger"

if [ $COUNT1 -gt 0 ]; then
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT id_course, EXTRACT(EPOCH FROM (NOW() - date_heure_arrivee))/3600 as heures_depuis FROM Course WHERE etat_course = 'en_cours' AND date_heure_arrivee IS NOT NULL AND date_heure_arrivee < NOW() - INTERVAL '1 hours' LIMIT 10;" | head -15

    if [ $DRY_RUN -eq 0 ]; then
        UPDATE1="UPDATE Course SET etat_course = 'terminee' WHERE etat_course = 'en_cours' AND date_heure_arrivee IS NOT NULL AND date_heure_arrivee < NOW() - INTERVAL '1 hours';"
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "$UPDATE1"
        echo "   ✅ $COUNT1 courses marquées comme 'terminee'"
    else
        echo "   ⚠️  $COUNT1 courses seraient marquées comme 'terminee'"
    fi
fi
echo ""

# 2. Courses "en_attente" timeout
echo "2️⃣  Vérification des courses 'en_attente' en timeout..."
QUERY2="SELECT COUNT(*) as count FROM Course WHERE etat_course = 'en_attente' AND date_heure_demande < NOW() - INTERVAL '30 minutes';"
COUNT2=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "$QUERY2" | xargs)
echo "   Trouvé: $COUNT2 courses à annuler"

if [ $COUNT2 -gt 0 ]; then
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT id_course, EXTRACT(EPOCH FROM (NOW() - date_heure_demande))/60 as minutes_depuis FROM Course WHERE etat_course = 'en_attente' AND date_heure_demande < NOW() - INTERVAL '30 minutes';" | head -15

    if [ $DRY_RUN -eq 0 ]; then
        UPDATE2="UPDATE Course SET etat_course = 'annulee' WHERE etat_course = 'en_attente' AND date_heure_demande < NOW() - INTERVAL '30 minutes';"
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "$UPDATE2"
        echo "   ✅ $COUNT2 courses annulées (timeout recherche)"
    else
        echo "   ⚠️  $COUNT2 courses seraient annulées"
    fi
fi
echo ""

# 3. Courses "acceptee" qui ne démarrent pas
echo "3️⃣  Vérification des courses 'acceptee' qui ne démarrent pas..."
QUERY3="SELECT COUNT(*) as count FROM Course WHERE etat_course = 'acceptee' AND date_heure_acceptation < NOW() - INTERVAL '15 minutes' AND date_heure_depart IS NULL;"
COUNT3=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "$QUERY3" | xargs)
echo "   Trouvé: $COUNT3 courses à annuler"

if [ $COUNT3 -gt 0 ]; then
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT id_course, EXTRACT(EPOCH FROM (NOW() - date_heure_acceptation))/60 as minutes_depuis FROM Course WHERE etat_course = 'acceptee' AND date_heure_acceptation < NOW() - INTERVAL '15 minutes' AND date_heure_depart IS NULL;" | head -15

    if [ $DRY_RUN -eq 0 ]; then
        UPDATE3="UPDATE Course SET etat_course = 'annulee' WHERE etat_course = 'acceptee' AND date_heure_acceptation < NOW() - INTERVAL '15 minutes' AND date_heure_depart IS NULL;"
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "$UPDATE3"
        echo "   ✅ $COUNT3 courses annulées (timeout démarrage)"
    else
        echo "   ⚠️  $COUNT3 courses seraient annulées"
    fi
fi
echo ""

# 4. Courses "arrivee_pickup" bloquées
echo "4️⃣  Vérification des courses 'arrivee_pickup' bloquées..."
QUERY4="SELECT COUNT(*) as count FROM Course WHERE etat_course = 'arrivee_pickup' AND date_heure_arrivee_pickup < NOW() - INTERVAL '30 minutes' AND date_heure_depart IS NULL;"
COUNT4=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "$QUERY4" | xargs)
echo "   Trouvé: $COUNT4 courses à annuler"

if [ $COUNT4 -gt 0 ]; then
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT id_course, EXTRACT(EPOCH FROM (NOW() - date_heure_arrivee_pickup))/60 as minutes_depuis FROM Course WHERE etat_course = 'arrivee_pickup' AND date_heure_arrivee_pickup < NOW() - INTERVAL '30 minutes' AND date_heure_depart IS NULL;" | head -15

    if [ $DRY_RUN -eq 0 ]; then
        UPDATE4="UPDATE Course SET etat_course = 'annulee' WHERE etat_course = 'arrivee_pickup' AND date_heure_arrivee_pickup < NOW() - INTERVAL '30 minutes' AND date_heure_depart IS NULL;"
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "$UPDATE4"
        echo "   ✅ $COUNT4 courses annulées (timeout pickup)"
    else
        echo "   ⚠️  $COUNT4 courses seraient annulées"
    fi
fi
echo ""

echo "🧹 ========================================"
echo "🧹 RÉSUMÉ"
echo "🧹 ========================================"
echo ""

TOTAL=$((COUNT1 + COUNT2 + COUNT3 + COUNT4))

if [ $DRY_RUN -eq 1 ]; then
    echo "📊 Total de courses à corriger: $TOTAL"
    echo ""
    echo "💡 Pour appliquer les changements, exécutez:"
    echo "   bash scripts/cleanup-stuck-courses-direct.sh --execute"
else
    echo "✅ Total de courses corrigées: $TOTAL"
fi
echo ""
