# Vamo Admin Dashboard

Interface d'administration pour la plateforme Vamo - Version Vanilla JavaScript

## Fonctionnalités

- ✅ **100% Vanilla JavaScript** - Aucune dépendance framework
- ✅ **Interface responsive** avec Tailwind CSS
- ✅ **Design glassmorphism** avec thème doré
- ✅ **Modals fonctionnels** - Tests garantis
- ✅ **Gestion des chauffeurs** - Approbation/Rejet
- ✅ **Gestion des livreurs** - Approbation/Rejet
- ✅ **Données en temps réel** depuis l'API PostgreSQL
- ✅ **Statistiques** - Compteurs dynamiques

## API Endpoints

L'interface utilise l'API Backend Vamo:
- `GET /api/debug/chauffeurs` - Liste des chauffeurs
- `GET /api/debug/livreurs` - Liste des livreurs
- `POST /api/debug/approve-chauffeur` - Approuver un chauffeur
- `POST /api/debug/approve-livreur` - Approuver un livreur

## Test du Modal

Cliquez sur le bouton **🧪 TEST MODAL** pour vérifier le fonctionnement.

## Déploiement sur Vercel

### Étapes de déploiement:

1. **Repository GitHub**: https://github.com/momogye11/vamo-admin
2. **Connecter à Vercel**: 
   - Aller sur [vercel.com](https://vercel.com)
   - "New Project" 
   - Importer depuis GitHub: `momogye11/vamo-admin`
   - Deploy!

### Configuration automatique:
- ✅ **Build**: Aucun build requis (site statique)
- ✅ **Output**: `index.html` est le point d'entrée
- ✅ **Routing**: Configuré dans `vercel.json`
- ✅ **Sécurité**: Headers de sécurité inclus

### API Backend:
- **Backend URL**: `https://vamo-backend-production.up.railway.app`
- **Endpoints**: `/api/debug/chauffeurs`, `/api/debug/livreurs`
- **CORS**: Déjà configuré pour accepter les domaines Vercel

### Compatible avec:
- Vercel ⭐ (Recommandé)
- Netlify
- GitHub Pages  
- Tout hébergeur statique