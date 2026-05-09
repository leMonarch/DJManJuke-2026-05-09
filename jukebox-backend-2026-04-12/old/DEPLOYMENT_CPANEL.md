# Guide de déploiement sur cPanel - Variables d'environnement

## Structure des endpoints

Avec le backend dans `/public_html/api/` et accessible via `djmanjuke.com/api/` :

- **API Base URL** : `https://djmanjuke.com/api`
- **Socket.io URL** : `https://djmanjuke.com`
- **Webhook Stripe** : `https://djmanjuke.com/api/payment/webhook`

## Variables d'environnement pour cPanel

### Variables essentielles (à remplir absolument)

| Variable | Valeur | Comment obtenir |
|----------|--------|-----------------|
| `NODE_ENV` | `development` | Mode développement |
| `PORT` | `4000` | cPanel peut ignorer, mais gardez cette valeur |
| `CLIENT_URL` | `https://djman-mini-frontend-bw8k.vercel.app` | URL de votre frontend Vercel |
| `CLIENT_ORIGINS` | `https://djman-mini-frontend-bw8k.vercel.app,https://djmanjuke.com,http://localhost:5173` | URLs autorisées pour CORS (séparées par virgule) |
| `APP_BASE_URL` | `https://djmanjuke.com` | URL de base de votre backend |
| `SESSION_SECRET` | `[GÉNÉRER]` | Secret aléatoire sécurisé (voir ci-dessous) |
| `JWT_SECRET` | `[GÉNÉRER]` | Secret aléatoire sécurisé (voir ci-dessous) |
| `DB_HOST` | `localhost` | Toujours `localhost` sur cPanel |
| `DB_PORT` | `3306` | Port MySQL standard |
| `DB_USER` | `[VOTRE_USER]` | Nom complet de l'utilisateur MySQL (ex: `djmawdrx_dbuser`) |
| `DB_PASSWORD` | `[VOTRE_PASSWORD]` | Mot de passe MySQL |
| `DB_NAME` | `[VOTRE_DB]` | Nom complet de la base (ex: `djmawdrx_placejukebox`) |

### Variables Stripe (mode test)

| Variable | Valeur | Comment obtenir |
|----------|--------|-----------------|
| `STRIPE_SECRET_KEY` | `sk_test_VOTRE_CLE_SECRETE_ICI` | Depuis le Stripe Dashboard (ne pas committer la vraie clé) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | À obtenir après configuration du webhook dans Stripe Dashboard |
| `STRIPE_CONNECT_CLIENT_ID` | `[VIDE]` | Laissez vide pour l'instant |
| `STRIPE_PLATFORM_ACCOUNT_ID` | `[VIDE]` | Laissez vide pour l'instant |
| `STRIPE_DEFAULT_CURRENCY` | `cad` | Devise par défaut |
| `STRIPE_CONNECT_DEFAULT_COUNTRY` | `CA` | Pays par défaut |
| `MIN_PAYOUT_AMOUNT` | `5` | Montant minimum de payout |
| `STRIPE_PRO_PRICE_ID` | `price_1SXlAzP9TcVVYrcoAwq9njf5` | ID du prix Stripe Pro |

### Variables optionnelles

| Variable | Valeur | Comment obtenir |
|----------|--------|-----------------|
| `PLATFORM_USER_EMAIL` | `louis.lemonarch@gmail.com` | Email du propriétaire de la plateforme |
| `ANONYMOUS_PAYER_EMAIL` | `djmanjuke@placejukebox.dev` | Email pour les paiements anonymes |
| `GEOCODING_BASE_URL` | `[VIDE]` | Laissez vide si non utilisé |

## Comment obtenir les valeurs manquantes

### 1. Générer SESSION_SECRET et JWT_SECRET

**Via Terminal de cPanel :**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Exécutez cette commande **deux fois** pour obtenir deux secrets différents :
- Premier résultat → `SESSION_SECRET`
- Deuxième résultat → `JWT_SECRET`

**Exemple de résultat :**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

### 2. Obtenir les identifiants MySQL

1. Dans cPanel, allez dans **"MySQL Databases"**
2. Créez une base de données (ex: `placejukebox`)
3. Créez un utilisateur MySQL
4. Ajoutez l'utilisateur à la base avec **tous les privilèges**
5. Notez :
   - **DB_NAME** : Le nom complet (ex: `djmawdrx_placejukebox`)
   - **DB_USER** : Le nom complet de l'utilisateur (ex: `djmawdrx_dbuser`)
   - **DB_PASSWORD** : Le mot de passe que vous avez créé

### 3. Configurer le webhook Stripe

1. Allez sur https://dashboard.stripe.com/test/webhooks
2. Cliquez sur **"Add endpoint"**
3. URL : `https://djmanjuke.com/api/payment/webhook`
4. Sélectionnez les événements :
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
5. Copiez le **"Signing secret"** (commence par `whsec_`)
6. Mettez-le dans `STRIPE_WEBHOOK_SECRET`

## Liste complète pour copier-coller dans cPanel

```
NODE_ENV=development
PORT=4000
CLIENT_URL=https://djman-mini-frontend-bw8k.vercel.app
CLIENT_ORIGINS=https://djman-mini-frontend-bw8k.vercel.app,https://djmanjuke.com,http://localhost:5173
APP_BASE_URL=https://djmanjuke.com
SESSION_SECRET=[GÉNÉRER VIA TERMINAL]
JWT_SECRET=[GÉNÉRER VIA TERMINAL]
DB_HOST=localhost
DB_PORT=3306
DB_USER=[VOTRE_USER_MYSQL_COMPLET]
DB_PASSWORD=[VOTRE_PASSWORD_MYSQL]
DB_NAME=[VOTRE_DB_MYSQL_COMPLETE]
STRIPE_SECRET_KEY=sk_test_VOTRE_CLE_SECRETE_ICI
STRIPE_WEBHOOK_SECRET=whsec_placeholder
STRIPE_CONNECT_CLIENT_ID=
STRIPE_PLATFORM_ACCOUNT_ID=
STRIPE_DEFAULT_CURRENCY=cad
STRIPE_CONNECT_DEFAULT_COUNTRY=CA
MIN_PAYOUT_AMOUNT=5
STRIPE_PRO_PRICE_ID=price_1SXlAzP9TcVVYrcoAwq9njf5
PLATFORM_USER_EMAIL=louis.lemonarch@gmail.com
ANONYMOUS_PAYER_EMAIL=djmanjuke@placejukebox.dev
```

## URLs des endpoints après déploiement

- **API Base** : `https://djmanjuke.com/api`
- **Auth** : `https://djmanjuke.com/api/auth/login`
- **Songs** : `https://djmanjuke.com/api/songs`
- **Jukebox** : `https://djmanjuke.com/api/jukebox`
- **Payment** : `https://djmanjuke.com/api/payment`
- **Webhook Stripe** : `https://djmanjuke.com/api/payment/webhook`
- **Socket.io** : `https://djmanjuke.com/ws/jukebox`
- **Assets Images** : `https://djmanjuke.com/api/assets/images/...`
- **Assets Audio** : `https://djmanjuke.com/api/assets/audio/...`

## Configuration frontend (Vercel)

Dans votre frontend, configurez :

```env
VITE_API_URL=https://djmanjuke.com/api
VITE_API_WS_URL=https://djmanjuke.com
VITE_ASSETS_BASE_URL=https://djmanjuke.com/api
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51PQFkaP9TcVVYrconHrB3HVKsTaCTnoTfptoR6Bc2sFlCXDPJ3Cv0r44TKJAu09in3jxVO9GI5u6LP8wJuyF0y0H00WqpLSzwz
```


