# Comment fixer la connexion PostgreSQL sur Railway

## Étape 1: Va sur Railway Dashboard
1. Ouvre https://railway.app
2. Va dans ton projet Vamo
3. Clique sur le service **PostgreSQL** (pas le backend!)

## Étape 2: Récupère les infos de connexion
Dans le service PostgreSQL:
1. Clique sur "Connect"
2. Tu vas voir des infos comme:
   - PGHOST=xxxxx.railway.internal
   - PGPORT=5432
   - PGUSER=postgres
   - PGPASSWORD=xxxxx
   - PGDATABASE=railway

## Étape 3: Configure le Backend
Dans ton service **Backend**:
1. Clique sur "Variables"
2. Vérifie si DATABASE_URL existe
3. Si elle n'existe pas ou semble bizarre, SUPPRIME-LA
4. Ajoute ces variables (copie-colle depuis PostgreSQL):
   - PGHOST
   - PGPORT  
   - PGUSER
   - PGPASSWORD
   - PGDATABASE

## Étape 4: Redéploie
Le backend va automatiquement redéployer.

Regarde les logs, tu DOIS voir:
✅ PostgreSQL database connected successfully
