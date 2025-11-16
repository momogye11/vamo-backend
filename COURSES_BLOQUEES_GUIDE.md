# 🚨 Guide de Gestion des Courses Bloquées

## 📋 Vue d'ensemble

Ce système vous permet d'**analyser**, **diagnostiquer** et **nettoyer** les courses bloquées dans votre base de données Vamo.

### Types de courses bloquées détectées:

1. **Courses "en_cours" bloquées** 🔴
   - **Problème**: Courses avec `date_heure_arrivee` renseignée mais statut toujours "en_cours"
   - **Cause probable**: Bug, crash de l'app, ou tests mal nettoyés
   - **Solution**: Marquer comme "terminee" ou annuler

2. **Courses "en_attente" timeout** ⏰
   - **Problème**: Recherche de chauffeur qui n'aboutit jamais
   - **Cause**: Aucun chauffeur disponible ou tous refusent
   - **Solution**: Annuler automatiquement après 30 minutes

3. **Courses "acceptee" sans départ** 🚗
   - **Problème**: Chauffeur a accepté mais n'a jamais démarré
   - **Cause**: Chauffeur a fermé l'app ou problème réseau
   - **Solution**: Annuler après 15 minutes

---

## 🎯 Méthode 1: Dashboard Admin (Analyse Manuelle)

### Accès
1. Connectez-vous au dashboard admin: `https://vamo-admin.vercel.app`
2. Faites défiler jusqu'à la section **"🚨 COURSES BLOQUÉES"**

### Fonctionnalités

#### 📊 Résumé Global
- **Total courses bloquées**
- **Anomalies timestamps** (arrivée avant début course - bug évident)
- **Très anciennes** (7+ jours)
- **Récentes** (moins de 24h)

#### 📑 Onglets de Catégories

**Onglet "En Cours Bloquées":**
- Affiche toutes les courses terminées physiquement mais pas marquées
- Catégories:
  - 🚨 **ANOMALIE**: Timestamps incohérents (bug critique)
  - ⏰ **7+ jours**: Très anciennes (courses de test/abandonnées)
  - ⏱️ **1+ jour**: Anciennes (peut être un vrai problème)
  - 🆕 **Récente**: Moins de 24h (attention: peut être légitime!)

**Actions disponibles par course:**
- ✅ **Terminer**: Marquer la course comme terminée
- ❌ **Annuler**: Annuler la course

**Onglet "En Attente Timeout":**
- Courses en attente de chauffeur depuis 30+ minutes
- Action: ❌ Annuler uniquement

**Onglet "Acceptées Sans Départ":**
- Courses acceptées mais jamais démarrées (15+ minutes)
- Action: ❌ Annuler uniquement

#### 🧹 Nettoyage Automatique Global
Bouton: **"🧹 Nettoyer Courses Anciennes"**
- Nettoie TOUTES les courses de 7+ jours automatiquement
- Demande confirmation avant exécution
- Affiche le résumé après nettoyage

---

## 💻 Méthode 2: Script Shell (Nettoyage Automatique)

### Utilisation

#### Preview (Dry Run) - Par Défaut
```bash
cd vamo-backend
bash scripts/cleanup-courses.sh
```
➡️ Affiche ce qui serait fait **SANS modifier** la base de données

#### Preview avec Seuil Personnalisé
```bash
bash scripts/cleanup-courses.sh --days 14
```
➡️ Preview des courses de 14+ jours

#### Exécution (Nettoyer 7+ jours)
```bash
bash scripts/cleanup-courses.sh --execute
```
➡️ **MODIFIE** la base de données - courses de 7+ jours

#### Exécution avec Seuil Personnalisé
```bash
bash scripts/cleanup-courses.sh --execute 30
```
➡️ Nettoie les courses de 30+ jours (plus conservateur)

### Sortie Exemple

```
🧹 ========================================
🧹 NETTOYAGE INTELLIGENT DES COURSES
🧹 ========================================

⚠️  MODE DRY RUN - Aucune modification ne sera effectuée
⚠️  Utilisez --execute pour appliquer les changements
📅 Seuil: Courses de plus de 7 jours

1️⃣  Courses 'en_cours' terminées physiquement...
   ➤ Critère: date_heure_arrivee renseignée depuis + de 7 jours
   Trouvé: 61 courses bloquées
   Exemples (les plus anciennes):
    id_course | jours_depuis
   -----------+--------------
          411 |           98
          413 |           98
          414 |           98

   ⚠️  Ces 61 courses seraient marquées comme 'terminee'

2️⃣  Courses 'en_attente' en timeout...
   ➤ Critère: recherche de chauffeur depuis + de 7 jours
   Trouvé: 0 courses à annuler

🧹 ========================================
🧹 RÉSUMÉ
🧹 ========================================

📊 Total de courses à corriger: 61
   - 61 courses 'en_cours' → terminee
   - 0 courses 'en_attente' → annulee
```

---

## 🔍 API Endpoints (Pour Développeurs)

### GET `/api/admin/stuck-courses`
Récupère toutes les courses bloquées avec analyse détaillée

**Headers requis:**
```
x-auth-token: <admin_token>
```

**Réponse:**
```json
{
  "success": true,
  "stuckCourses": {
    "enCours": [...],
    "enAttente": [...],
    "acceptee": [...]
  },
  "summary": {
    "total": 80,
    "enCoursCount": 76,
    "enAttenteCount": 4,
    "accepteeCount": 0,
    "categories": {
      "anomalies": 12,
      "tresAnciennes": 61,
      "anciennes": 3,
      "recentes": 0
    }
  }
}
```

### POST `/api/admin/force-complete-course/:id`
Forcer la terminaison d'une course spécifique

### POST `/api/admin/force-cancel-course/:id`
Forcer l'annulation d'une course spécifique

### POST `/api/admin/cleanup-old-courses`
Nettoyage automatique des courses anciennes

**Body:**
```json
{
  "daysThreshold": 7
}
```

---

## 🎓 Recommandations d'Utilisation

### Analyse Régulière (Dashboard)
**Fréquence**: 1 fois par semaine
1. Ouvrir le dashboard admin
2. Aller à la section "Courses Bloquées"
3. Cliquer sur "🔄 Rafraîchir"
4. Examiner les courses récentes (moins de 24h)
   - Si anomalie timestamps → Bug à investiguer
   - Si course légitime récente → NE PAS toucher!

### Nettoyage Automatique (Script)
**Fréquence**: 1 fois par mois
```bash
# Preview d'abord
bash scripts/cleanup-courses.sh

# Si résultat OK, exécuter
bash scripts/cleanup-courses.sh --execute
```

### Urgence (Courses bloquées récentes)
**Si vous voyez des courses récentes bloquées:**
1. ✋ **NE PAS les nettoyer automatiquement**
2. 🔍 Vérifier manuellement dans le dashboard
3. 📞 Contacter le chauffeur/client si nécessaire
4. ✅ Action manuelle uniquement (bouton dans le dashboard)

### Courses de Test
**Nettoyage agressif des anciennes courses de test:**
```bash
# Nettoyer toutes les courses de 30+ jours (plus sûr)
bash scripts/cleanup-courses.sh --execute 30
```

---

## ⚠️ Précautions de Sécurité

### ❌ À NE JAMAIS FAIRE
- **Ne jamais** exécuter le script avec --execute sans preview d'abord
- **Ne jamais** nettoyer les courses de moins de 7 jours automatiquement
- **Ne jamais** forcer la terminaison d'une course sans vérifier les timestamps

### ✅ Bonnes Pratiques
- **Toujours** faire un dry run d'abord
- **Toujours** analyser les courses récentes manuellement
- **Toujours** vérifier qu'il n'y a pas de pattern d'anomalies (bug récurrent)
- **Documenter** les courses avec anomalies timestamps (potentiels bugs à fixer)

---

## 🐛 Détection de Bugs

### Anomalies Timestamps
Si vous voyez régulièrement des courses avec:
- `date_heure_arrivee < date_heure_debut_course`
- `date_heure_depart < date_heure_demande`

➡️ **C'est un BUG dans l'application** à investiguer!

### Pattern de Courses Bloquées
Si vous voyez beaucoup de courses récentes bloquées:
- Problème réseau?
- Bug dans l'app driver?
- Problème serveur backend?

➡️ **Vérifier les logs du backend** pour erreurs

---

## 📊 Statistiques Actuelles

Après chaque nettoyage, le script affiche l'état actuel:
```
📋 État actuel de la base de données:
  etat_course   | nombre
----------------+--------
 annulee        |    668
 en_cours       |     76    ← Courses bloquées potentielles
 terminee       |     67
 arrivee_pickup |     32
```

---

## 🆘 Support

Si vous rencontrez des problèmes:
1. Vérifier les logs backend
2. Tester en mode dry run d'abord
3. Examiner manuellement dans le dashboard
4. Consulter ce guide

**Fichiers importants:**
- Backend API: `/Users/mohamed/Documents/vamo/vamo-backend/routes/admin.js:722-982`
- Dashboard UI: `/Users/mohamed/Documents/vamo/vamo-backend/public/dashboard.html:1335-1439`
- Dashboard JS: `/Users/mohamed/Documents/vamo/vamo-backend/public/stuck-courses-functions.js`
- Script Shell: `/Users/mohamed/Documents/vamo/vamo-backend/scripts/cleanup-courses.sh`
