# Guide de configuration .env pour Frontend (Vercel)

## 📍 Où configurer les variables d'environnement

Le frontend est déployé sur **Vercel**. Les variables d'environnement doivent être configurées dans le dashboard Vercel, pas dans un fichier `.env` local (sauf pour le développement).

## 🚀 Configuration dans Vercel

### 1. Accéder aux variables d'environnement

1. Allez sur https://vercel.com
2. Sélectionnez votre projet frontend
3. Allez dans **Settings** → **Environment Variables**

### 2. Ajouter les variables

Ajoutez les 4 variables suivantes :

| Variable | Valeur Production | Description |
|----------|-------------------|-------------|
| `VITE_API_URL` | `https://djmanjuke.com/api` | URL de l'API backend |
| `VITE_API_WS_URL` | `https://djmanjuke.com` | URL pour WebSocket/Socket.io |
| `VITE_ASSETS_BASE_URL` | `https://djmanjuke.com/api` | URL pour les assets (images, audio) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` ou `pk_live_...` | Clé publique Stripe |

### 3. Configuration par environnement

Dans Vercel, vous pouvez définir différentes valeurs pour :
- **Production** : Pour `djmanjuke.com`
- **Preview** : Pour les branches de développement
- **Development** : Pour le développement local

## 📝 Variables détaillées

### `VITE_API_URL`
- **Production** : `https://djmanjuke.com/api`
- **Développement local** : `http://localhost:4000/api`
- **Description** : URL de base pour toutes les requêtes API REST

### `VITE_API_WS_URL`
- **Production** : `https://djmanjuke.com`
- **Développement local** : `http://localhost:4000`
- **⚠️ Important** : 
  - Ne pas mettre `/api` à la fin
  - Ne pas mettre `/ws/jukebox` à la fin
  - Socket.io ajoutera automatiquement le chemin `/api/socket.io` et le namespace `/ws/jukebox`

### `VITE_ASSETS_BASE_URL`
- **Production** : `https://djmanjuke.com/api`
- **Développement local** : `http://localhost:4000`
- **Description** : URL de base pour charger les images et fichiers audio
- **Exemple d'utilisation** : `${VITE_ASSETS_BASE_URL}/assets/images/song-1.jpg`

### `VITE_STRIPE_PUBLISHABLE_KEY`
- **Mode test** : `pk_test_51PQFkaP9TcVVYrconHrB3HVKsTaCTnoTfptoR6Bc2sFlCXDPJ3Cv0r44TKJAu09in3jxVO9GI5u6LP8wJuyF0y0H00WqpLSzwz`
- **Mode production** : `pk_live_...` (à obtenir depuis Stripe Dashboard)
- **Description** : Clé publique Stripe pour les paiements côté client

## 🔄 Redéploiement après modification

Après avoir modifié les variables d'environnement dans Vercel :
1. Les changements sont automatiquement appliqués au prochain déploiement
2. Pour forcer un redéploiement immédiat : **Deployments** → Cliquez sur les 3 points → **Redeploy**

## 🧪 Configuration pour développement local

Pour le développement local, créez un fichier `.env` dans le dossier `frontend/` :

```env
VITE_API_URL=http://localhost:4000/api
VITE_API_WS_URL=http://localhost:4000
VITE_ASSETS_BASE_URL=http://localhost:4000
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51PQFkaP9TcVVYrconHrB3HVKsTaCTnoTfptoR6Bc2sFlCXDPJ3Cv0r44TKJAu09in3jxVO9GI5u6LP8wJuyF0y0H00WqpLSzwz
```

## ✅ Checklist de vérification

Avant de déployer, vérifiez que :

- [ ] `VITE_API_URL` pointe vers `https://djmanjuke.com/api`
- [ ] `VITE_API_WS_URL` est `https://djmanjuke.com` (sans `/api`)
- [ ] `VITE_ASSETS_BASE_URL` est `https://djmanjuke.com/api`
- [ ] `VITE_STRIPE_PUBLISHABLE_KEY` est configurée (test ou production)
- [ ] Les variables sont définies pour l'environnement **Production** dans Vercel
- [ ] Un redéploiement a été effectué après modification

## 🔍 Vérification dans le code

Les variables sont utilisées dans :
- `src/services/apiClient.ts` → `VITE_API_URL`
- `src/components/PlaceJukebox.tsx` → `VITE_API_WS_URL`
- `src/components/JukeboxCard.tsx` → `VITE_ASSETS_BASE_URL`
- `src/hooks/usePlaylist.ts` → `VITE_ASSETS_BASE_URL`
- `src/services/stripeService.ts` → `VITE_STRIPE_PUBLISHABLE_KEY`

## 🆘 Dépannage

### Les variables ne sont pas prises en compte

- Vérifiez que les variables commencent par `VITE_` (obligatoire pour Vite)
- Redéployez l'application après modification
- Vérifiez que les variables sont définies pour le bon environnement (Production/Preview)

### Erreurs CORS

- Vérifiez que `VITE_API_URL` correspond à l'URL configurée dans `CLIENT_ORIGINS` du backend
- Vérifiez que `VITE_API_WS_URL` correspond à `APP_BASE_URL` du backend

### Socket.io ne se connecte pas

- Vérifiez que `VITE_API_WS_URL` ne contient pas `/api` ou `/ws/jukebox`
- Vérifiez que le backend autorise l'origine de votre frontend dans `CLIENT_ORIGINS`




