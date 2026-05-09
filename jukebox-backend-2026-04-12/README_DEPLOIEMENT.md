# 🚀 Guide de Déploiement Backend - Production

## 📦 Contenu du package

Ce package contient le backend prêt pour la production sur **https://djmanjuke.com**

## 📍 Structure de déploiement

```
public_html/
  └── api/              ← Déployez tout le contenu de ce dossier ici
      ├── src/
      ├── package.json
      ├── .env          ← Créez ce fichier depuis .env.production
      └── ...
```

## 🔧 Étapes de déploiement

### 1. Upload des fichiers

1. Connectez-vous à votre cPanel (Stellar/Namecheap)
2. Allez dans **File Manager**
3. Naviguez vers `public_html/`
4. Créez un dossier `api/` s'il n'existe pas
5. Uploadez **tous les fichiers** de ce package dans `public_html/api/`

### 2. Installation des dépendances

1. Dans cPanel, allez dans **Terminal** (ou utilisez SSH)
2. Naviguez vers le dossier :
   ```bash
   cd ~/public_html/api
   ```
3. Installez les dépendances :
   ```bash
   npm install --production
   ```

### 3. Configuration de l'environnement

1. Dans **File Manager**, allez dans `public_html/api/`
2. Renommez `.env.production` en `.env`
3. Éditez le fichier `.env` et remplissez les valeurs :

#### 🔐 Générer les secrets de sécurité

Dans le Terminal de cPanel, exécutez **deux fois** :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- Premier résultat → `SESSION_SECRET`
- Deuxième résultat → `JWT_SECRET`

#### 🗄️ Configurer MySQL

1. Dans cPanel, allez dans **MySQL Databases**
2. Créez une base de données (ex: `placejukebox`)
3. Créez un utilisateur MySQL
4. Ajoutez l'utilisateur à la base avec **tous les privilèges**
5. Notez les valeurs complètes :
   - `DB_NAME` : Nom complet avec préfixe (ex: `djmawdrx_placejukebox`)
   - `DB_USER` : Nom complet de l'utilisateur (ex: `djmawdrx_dbuser`)
   - `DB_PASSWORD` : Mot de passe créé

#### 💳 Configurer Stripe Webhook

1. Allez sur https://dashboard.stripe.com/test/webhooks
2. Cliquez sur **"Add endpoint"**
3. URL : `https://djmanjuke.com/api/payment/webhook`
4. Sélectionnez les événements :
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copiez le **"Signing secret"** (commence par `whsec_`)
6. Mettez-le dans `STRIPE_WEBHOOK_SECRET` du fichier `.env`

### 4. Initialiser la base de données

1. Dans cPanel, allez dans **phpMyAdmin**
2. Sélectionnez votre base de données
3. Exécutez le script SQL : `src/db/schema.sql`
   - Cliquez sur l'onglet **SQL**
   - Copiez-collez le contenu de `schema.sql`
   - Cliquez sur **Exécuter**

### 5. Démarrer l'application

#### Option A : Via Terminal cPanel (recommandé)

```bash
cd ~/public_html/api
node src/server.js
```

#### Option B : Via Node.js Selector (cPanel)

1. Dans cPanel, allez dans **Node.js Selector**
2. Créez une nouvelle application :
   - **Node.js version** : 18.x ou 20.x
   - **Application root** : `public_html/api`
   - **Application URL** : `/api`
   - **Application startup file** : `src/server.js`
3. Cliquez sur **Create**
4. Cliquez sur **Run NPM install**
5. Cliquez sur **Start App**

### 6. Vérifier le déploiement

Testez les endpoints :
- **Health check** : `https://djmanjuke.com/api/`
- **API** : `https://djmanjuke.com/api/jukebox/[slug]/playlist`
- **Socket.io** : `https://djmanjuke.com/api/socket.io`

## 🔗 URLs de production

Une fois déployé, les URLs suivantes seront disponibles :

| Service | URL |
|---------|-----|
| API Base | `https://djmanjuke.com/api` |
| Auth | `https://djmanjuke.com/api/auth/login` |
| Jukebox | `https://djmanjuke.com/api/jukebox/[slug]/playlist` |
| Payment | `https://djmanjuke.com/api/payment` |
| Webhook Stripe | `https://djmanjuke.com/api/payment/webhook` |
| Socket.io | `https://djmanjuke.com/api/socket.io` |
| Assets Images | `https://djmanjuke.com/api/assets/images/...` |
| Assets Audio | `https://djmanjuke.com/api/assets/audio/...` |

## 📝 Configuration frontend (Vercel)

Dans votre frontend Vercel, configurez ces variables d'environnement :

```env
VITE_API_URL=https://djmanjuke.com/api
VITE_API_WS_URL=https://djmanjuke.com
VITE_ASSETS_BASE_URL=https://djmanjuke.com/api
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51PQFkaP9TcVVYrconHrB3HVKsTaCTnoTfptoR6Bc2sFlCXDPJ3Cv0r44TKJAu09in3jxVO9GI5u6LP8wJuyF0y0H00WqpLSzwz
```

## 🔍 Dépannage

### L'application ne démarre pas

1. Vérifiez les logs dans cPanel → **Node.js Selector** → **Logs**
2. Vérifiez que le fichier `.env` existe et est bien configuré
3. Vérifiez que les dépendances sont installées : `npm list`

### Erreur de connexion à la base de données

1. Vérifiez que `DB_HOST=localhost`
2. Vérifiez que les identifiants MySQL sont corrects
3. Testez la connexion depuis phpMyAdmin

### Erreur CORS

1. Vérifiez que `CLIENT_ORIGINS` contient l'URL de votre frontend
2. Vérifiez que `APP_BASE_URL=https://djmanjuke.com`

### Socket.io ne fonctionne pas

1. Vérifiez que le serveur HTTP écoute sur le bon port
2. Vérifiez que le chemin Socket.io est `/api/socket.io`
3. Vérifiez les logs du serveur pour les erreurs

## 📞 Support

En cas de problème, vérifiez :
- Les logs dans cPanel → **Node.js Selector** → **Logs**
- Les logs du serveur dans le Terminal
- La configuration du fichier `.env`


