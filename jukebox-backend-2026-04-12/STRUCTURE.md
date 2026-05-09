# 📁 Structure des fichiers à copier

## Fichiers à copier depuis `backend/` vers `backend-production/`

```
backend/
├── src/                    ← COPIEZ TOUT CE DOSSIER
│   ├── app.js
│   ├── server.js
│   ├── assets/            ← Inclut audio/ et images/
│   ├── config/
│   ├── controllers/
│   ├── db/
│   ├── lib/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   └── ws/
└── package.json           ← Déjà inclus dans backend-production/

backend-production/        ← Dossier de déploiement
├── src/                   ← À COPIER depuis backend/src/
├── package.json           ← Déjà inclus
├── .env.production         ← Déjà inclus
├── .gitignore             ← Déjà inclus
├── README_DEPLOIEMENT.md  ← Déjà inclus
├── INSTALLATION.md        ← Déjà inclus
└── STRUCTURE.md           ← Ce fichier
```

## ⚠️ Fichiers à NE PAS copier

- `node_modules/` (sera installé via `npm install`)
- `.env` (sera créé depuis `.env.production`)
- `.git/` (si présent)
- `*.log` (fichiers de logs)
- `src.zip` (archive temporaire)

## 📝 Instructions de copie

### Sur Windows (PowerShell) :
```powershell
# Depuis la racine du projet
Copy-Item -Path "backend\src" -Destination "backend-production\src" -Recurse -Force
```

### Sur Mac/Linux :
```bash
# Depuis la racine du projet
cp -r backend/src backend-production/
```

### Manuellement :
1. Ouvrez `backend/src/`
2. Sélectionnez tous les fichiers et dossiers
3. Copiez-les
4. Collez-les dans `backend-production/src/`


