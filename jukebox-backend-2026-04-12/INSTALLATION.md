# 📦 Installation du Backend en Production

## ⚠️ IMPORTANT : Avant de commencer

Ce package contient uniquement les fichiers de configuration et la documentation.
**Vous devez copier manuellement le dossier `src/` depuis votre backend local.**

## 📋 Checklist de déploiement

### ✅ Étape 1 : Préparer les fichiers

1. Copiez le dossier `src/` complet depuis `backend/src/` vers `backend-production/src/`
2. Vérifiez que tous les fichiers sont présents :
   - `src/server.js`
   - `src/app.js`
   - `src/config/`
   - `src/controllers/`
   - `src/db/`
   - `src/middleware/`
   - `src/routes/`
   - `src/services/`
   - `src/utils/`
   - `src/ws/`
   - `src/assets/` (audio et images)

### ✅ Étape 2 : Upload sur cPanel

1. Connectez-vous à votre cPanel
2. Allez dans **File Manager**
3. Naviguez vers `public_html/`
4. Créez un dossier `api/` s'il n'existe pas
5. Uploadez **tous les fichiers** de `backend-production/` dans `public_html/api/`

### ✅ Étape 3 : Configuration

1. Dans `public_html/api/`, renommez `.env.production` en `.env`
2. Éditez `.env` et remplissez toutes les valeurs (voir README_DEPLOIEMENT.md)

### ✅ Étape 4 : Installation

Dans le Terminal de cPanel :
```bash
cd ~/public_html/api
npm install --production
```

### ✅ Étape 5 : Base de données

1. Exécutez `src/db/schema.sql` dans phpMyAdmin
2. Vérifiez que les colonnes suivantes existent dans `jukeboxes` :
   - `current_song_id`
   - `playback_started_at`
   - `playback_status`

### ✅ Étape 6 : Démarrer

Via Node.js Selector dans cPanel ou :
```bash
cd ~/public_html/api
node src/server.js
```

## 🔗 URLs de production

- API : `https://djmanjuke.com/api`
- Socket.io : `https://djmanjuke.com/api/socket.io`
- Webhook Stripe : `https://djmanjuke.com/api/payment/webhook`

## 📚 Documentation complète

Voir `README_DEPLOIEMENT.md` pour les détails complets.


