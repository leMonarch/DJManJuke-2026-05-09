# DJManJuke — User stories : prix des priorités (gratuit / 0,25 $ / 0,50 $)

> Document de référence pour une implémentation ultérieure.  
> **Indépendant** de la séquence des 8 prompts *Playback Sync* (`DJManJuke_Playback_Fix.md`) : peut être fait avant, entre deux prompts (après commit/test), ou après.

---

## Story A — Réglage et persistance

**En tant que** propriétaire du jukebox (ou rôle équivalent défini par le produit)  
**Je veux** choisir le **coût d’une priorité** parmi **gratuit**, **0,25 $** et **0,50 $** dans l’interface d’administration  
**Afin de** fixer la politique tarifaire du lieu sans toucher au code.

### Périmètre suggéré

- Emplacement UI : onglet **Revenus** ou **Profil** (à trancher au moment de l’implémentation).
- Persistance : base de données (colonne sur `jukeboxes` ou table de config) ou mécanisme déjà existant — **une seule valeur active** à la fois pour le jukebox concerné.
- Libellés FR/EN cohérents avec le reste de l’app (`LanguageContext` ou équivalent).

### Critères d’acceptation

1. Trois options **mutuellement exclusives** : gratuit | 0,25 $ | 0,50 $.
2. Après enregistrement, un rechargement de page / nouvelle session affiche **la valeur sauvegardée**.
3. Droits : seul un utilisateur autorisé (ex. propriétaire du slug) peut modifier ce réglage.
4. Aucun impact encore sur les boutons « prioriser » du jukebox public tant que la **Story B** n’est pas livrée (ou livrer A+B dans le même lot si tu préfères un seul déploiement).

### Hors périmètre (Story A seule)

- Calcul Stripe, solde interne, appels `prioritizeSong` : réservés à la **Story B** si tu découpes strictement.

---

## Story B — Application métier (UI jukebox + backend + paiements)

**En tant qu’** auditeur / utilisateur connecté sur le jukebox  
**Je veux** que le montant affiché et facturé pour une priorité soit **exactement** celui défini par le propriétaire (gratuit, 0,25 $ ou 0,50 $)  
**Afin de** payer ou utiliser la priorité sans surprise ni incohérence avec l’admin.

### Périmètre suggéré

- **Frontend** : `Product` / grille des titres — `nextAmount`, libellés, modales de paiement.
- **Backend** : `prioritizeSong` et routes associées — minimums / normalisation (ex. ne plus forcer 0,50 $ si le réglage est 0,25 $ ou gratuit).
- **Paiements** : Stripe / solde interne alignés sur le montant effectif ; cas **gratuit** sans débit ni erreur « solde insuffisant ».

### Critères d’acceptation

1. Le montant affiché sur une carte « prioriser » = **réglage Story A** pour ce jukebox.
2. Une priorité **gratuite** ne déclenche pas de charge ; le flux métier (montée en file) reste valide selon les règles produit existantes.
3. **0,25 $** et **0,50 $** : le backend et le front utilisent la **même** valeur ; pas de second montant caché dans une constante.
4. Régression : priorisation depuis le solde et depuis Stripe fonctionnent pour chaque palier sélectionné.
5. Logs ou messages d’erreur utilisateur clairs si le réglage est incohérent (ex. migration manquante).

### Dépendance

- Nécessite que la **Story A** expose une **source de vérité** lisible par l’API (ex. GET jukebox ou champ dans une réponse déjà consommée par le front).

---

## Ordre de livraison recommandé

1. **Story A** d’abord (config stable).  
2. **Story B** ensuite (consommation de la config partout).

Alternative acceptable : **A + B** dans une même PR si l’équipe préfère un flux « réglage + application » d’un coup, avec tests manuels couvrant les trois paliers.

---

## Pistes techniques (repères code — à valider au moment du dev)

| Zone | Fichiers / zones souvent concernées |
|------|-------------------------------------|
| Grille jukebox | `djman-mini-prod/src/components/PlaceJukebox.tsx` (`nextAmount`, handlers priorité) |
| Admin chansons / revenus | `SongManager`, `RevenueDashboard`, `ProfileTab`, etc. |
| Backend priorité | `jukebox-backend-2026-04-12/src/services/jukeboxService.js` (`prioritizeSong`, montants) |
| i18n | `djman-mini-prod/src/context/LanguageContext.tsx` |

---

*DJManJuke — document local pour planification.*
