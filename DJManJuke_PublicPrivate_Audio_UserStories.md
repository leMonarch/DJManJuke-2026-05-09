# DJManJuke — User stories : audio lieu vs téléphone (public / privé)

## Contexte produit

Aujourd’hui, les modes **public** et **privé** diffèrent surtout par des **flags** (`playback_mode`, `master_socket_id`) et un **toggle UX**, alors que la **lecture synchronisée** peut faire jouer l’audio sur **plusieurs appareils**. Ce document formalise une trajectoire produit : en **lieu public**, une **seule sortie son forte** (enceintes) ; les téléphones invités sont **télécommandes / pré‑écoute / priorités**, avec **écoute sur téléphone** uniquement en **opt‑in**, tout en restant **alignés sur la timeline serveur**.

---

## Principes

| Principe | Description |
|----------|-------------|
| **Une sono officielle** | En mode **public**, exactement **un** flux audio principal destiné aux **HP du lieu** (device maître désigné). |
| **Téléphones invités par défaut sans diffusion principale** | Pas de double diffusion parasite depuis les téléphones tant que l’utilisateur n’a pas opt‑in. |
| **Opt‑in « Écouter sur mon téléphone »** | Réglage explicite ; désactivé par défaut pour les invité·es en public. |
| **Synchro** | Tous les appareils qui jouent le flux principal partagent la **même vérité serveur** (`playback:start`, horodatage, corrections de drift). |
| **Tolérance réelle** | La synchro **ressentie** peut être plus flotte sur téléphone (BT, arrière‑plan, réseau) ; le produit fixe des **objectifs de tolérance** documentés. |

---

## Epic P — Mode **public** (lieu)

| ID | En tant que | Je veux | Afin de | Critères d’acceptation |
|----|-------------|---------|---------|-------------------------|
| **US-P1** | visiteur·e dans un lieu | comprendre **sans ambiguïté** que le son « officiel » sort **ailleurs** qu sur mon téléphone | éviter de monter le volume pensant alimenter la sono | À l’arrivée sur le slug en **public** : message ou bloc UX du type « Le son du lieu est géré par le poste DJ / sono » + lien ou aide courte |
| **US-P2** | système | que la lecture **principale** sur téléphones **invités** soit **inactive ou muette** par défaut | une seule sortie forte dans la pièce | Device non‑maître + sans opt‑in : pas de `play()` audible sur le lecteur principal OU gain forcé à 0 / muted avec comportement documenté ; pas de double ambiance forte |
| **US-P3** | DJ / proprio du lieu | **désigner ou retrouver** clairement le **device relié aux HP** | une installation plug‑and‑play | Indicateur visible « Poste lieu » / « Maître » + flux pour prendre ou transférer le rôle (cohérent avec `requestMaster` ou équivalent) |
| **US-P4** | visiteur·e | **pré‑écouter un extrait** puis **acheter une priorité** comme aujourd’hui | choisir un titre avant de payer | Parcours preview + priorité inchangé fonctionnellement ; preview **ne** déclenche **pas** la diffusion principale lieu pour les invité·es |
| **US-P5** | visiteur·e | activer **« Écouter aussi sur mon téléphone »** | suivre la musique au casque / hors champ sono | Toggle persisté (session ou compte) ; avant activation : information « Lecture synchronisée avec le lieu ; qualité dépend du réseau / Bluetooth » |
| **US-P6** | visiteur·e ayant opt‑in | que ma lecture téléphone soit **sur la même timeline** que la sono | ne pas entendre un décalage choquant avec la pièce | Même `startedAt` / même corrections métier que le maître ; mesure cible documentée (ex. majorité des sessions sous seuil X ms hors BT) |
| **US-P7** | visiteur·e | **désactiver** l’écoute téléphone en un geste | revenir au mode « télécommande silencieuse » | Coupure immédiate du média principal sur ce device ; pas d’impact sur la file ni la sono |

---

## Epic Q — Mode **privé**

| ID | En tant que | Je veux | Afin de | Critères d’acceptation |
|----|-------------|---------|---------|-------------------------|
| **US-Q1** | utilisateur | une métaphore **« session personnelle / cercle restreint »** sans jargon technique | distinguer mental privé vs lieu public | Copy onboarding courte différente de US‑P1 (pas de « sono du lieu » implicite) |
| **US-Q2** | utilisateur | que **chaque participant** puisse écouter sur **son appareil** si le produit le permet dans ce mode | usage salon / amis | Comportement actuel ou évolution documentée : soit tous jouent (cohérent « privé »), soit paramétrable ; **pas** la même règle « mute invités » qu’en public sauf décision produit explicite |
| **US-Q3** | proprio | garder le **toggle public / privé** avec effet **visible** | changer de contexte d’usage | Après bascule : messages US‑P1 vs US‑Q1 + comportement audio conforme aux epics P / Q |

---

## Epic R — Non‑régression & technique

| ID | En tant que | Je veux | Afin de | Critères d’acceptation |
|----|-------------|---------|---------|-------------------------|
| **US-R1** | développeur·se | une **matrice de tests manuels** (public/privé × maître × invité × opt‑in × preview × priorité) | éviter les régressions synchro | Document QA avec cases cochées avant release |
| **US-R2** | équipe | tracer les **limites connues** (onglet arrière‑plan, BT, Safari, etc.) | support client réaliste | Section « Limitations » dans doc interne ou aide |
| **US-R3** | utilisateur ice | une synchro **acceptable** quand je suis en **opt‑in** mais pas au premier plan | usages réels | Comportement défini (pause ? drift ?) quand `document.visibilityState !== visible` — au minimum pas de crash ni boucle `playback:start` |

---

## Hors périmètre immédiat (backlog idées)

- Transfert de maître « en douceur » sans coupure (handoff).
- Volume lieu délégué à une **sortie système** (sans lecture HTML dupliquée).
- Mode « ambiance uniquement » sans waveform sur invités.

---

## Synthèse

Les user stories ci‑dessus décrivent une **différence audio et UX réelle** entre **public** (lieu, une sono, téléphones muets par défaut, opt‑in synchro) et **privé** (session perso / cercle, métaphore et règles distinctes). L’implémentation peut s’appuyer sur les mécanismes existants (`master_socket_id`, `playback:start`, drift) en ajoutant **gates audio** et **copy** clairs par rôle.

*DJManJuke — document de travail — Mai 2026*
