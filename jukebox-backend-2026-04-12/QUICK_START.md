# ⚡ Démarrage Rapide - Backend Production

## 🎯 En 5 minutes

### 1. Upload
- Uploadez **tout le contenu** de `backend-production.zip` dans `public_html/api/`

### 2. Configuration
```bash
cd ~/public_html/api
# Renommez env.production.txt en .env
mv env.production.txt .env
# Éditez .env et remplissez les valeurs
```

### 3. Installation
```bash
npm install --production
```

### 4. Base de données
- Exécutez `src/db/schema.sql` dans phpMyAdmin

### 5. Démarrer
- Via Node.js Selector dans cPanel OU
```bash
node src/server.js
```

## ✅ Vérification

Testez : `https://djmanjuke.com/api/`

## 📚 Documentation complète

Voir `README_DEPLOIEMENT.md` pour tous les détails.


