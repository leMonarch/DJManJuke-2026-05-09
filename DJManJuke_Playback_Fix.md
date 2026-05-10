# 🎵 DJManJuke — Playback Sync Fix
## Cursor Prompts v3 — Backend as Source of Truth

> **Référence commit :** `6c4264c` — fix(playback): synchro client, ordre WS, suppression du crossfade

---

> **Objectif :** Faire du backend la seule source de vérité pour la lecture.
> Corriger le bug de la première chanson commandée en alignant les transitions
> de lecture côté serveur avant de toucher au frontend.

---

### 📁 Contexte technique

| Élément | Chemin |
|---------|--------|
| Backend | `jukebox-backend-2026-04-12/src/` |
| Frontend | `djman-mini-prod/src/` |
| WebSocket | `src/ws/jukeboxSockets.js` |
| Service principal | `src/services/jukeboxService.js` |
| Composant principal | `src/components/PlaceJukebox.tsx` |
| Base de données | MySQL — `src/db/schema.sql` |

### ⚠️ Règle d'exécution

```
Un prompt à la fois.
Tester manuellement → Self-review GitHub → Commit → Prompt suivant.
Ne jamais chaîner plusieurs prompts sans valider.
```

---

## Séquence de correction

```
BACKEND ──────────────────────────────────────── FRONTEND
  │                                                   │
  ▼                                                   ▼
[1] Centraliser      [3] Endpoint      [5] Écouter     [8] Nettoyer
    transitions   →      playlist   →      WS       →      autoplay
    ✅ DONE            ⚠️ PARTIEL        ⚠️ PARTIEL        local
                                                            ❌ TODO
  │                                        │
  ▼                                        ▼
[2] Aligner       [4] Socket join     [6] Hydrater
    playback:start     au boot    →       état initial
    ✅ DONE            ❌ TODO            ⚠️ PARTIEL

                                        │
                                        ▼
                                    [7] Cas limites
                                        ❌ TODO
```

---

## 📋 Les 8 Prompts

---

### ✅ PROMPT 1 — Centraliser les transitions de lecture
**Statut : DONE — commit `6c4264c`**

**Fichier modifié :** `src/services/jukeboxService.js` (~149 lignes)
**Ce qui a été fait :**
- `startPlaybackForQueueHead(slug, db)` extrait et centralisé
- `prioritizeSong` et ajout à queue vide appellent désormais cette fonction
- `skipToNext`, `skipToPrevious`, `completeSong` refactorisés pour passer par la même fonction
- Logs de transition (slug + source + song_id) en place

---

### ✅ PROMPT 2 — Aligner l'émission de `playback:start`
**Statut : DONE — commit `6c4264c`**

**Fichier modifié :** `src/services/jukeboxService.js`
**Note d'implémentation :** Les changements WS passent par des appels à
`emitQueueUpdate` / `emitPlaybackStart` importés depuis `jukeboxSockets.js` —
`jukeboxSockets.js` lui-même n'a pas été modifié.

**Ce qui a été fait :**
- `playback:start` émis depuis tous les chemins de `startPlaybackForQueueHead()`
- Payload standardisé : `{ song_id, track, startedAt }`
- `queue:update` émis avant `playback:start` (ordre garanti)
- Pas d'émission si queue vide ou cas idempotent

---

### ⚠️ PROMPT 3 — Étendre l'endpoint playlist existant
**Statut : PARTIEL — tâche 1 présente au commit initial, tâche 2 manquante**

**Fichier cible :** Controller/service de `GET /jukebox/:slug/playlist`

**Tâche 1 — `playbackState` depuis la table `jukeboxes` :** ✅ Déjà présent
`current_song_id`, `started_at`, `status` retournés via `getJukeboxBySlug`

**Tâche 2 — Normalisation orphelin :** ❌ Non fait
`jukeboxController.getPlaylist` ne normalise pas le cas où `current_song_id`
est absent de la queue active → retour idle manquant.

> **À exécuter après le Prompt 4.**

```
Context: GET /jukebox/:slug/playlist returns playbackState including
current_song_id, playback_started_at and playback_status from the DB
(already in place). One normalization case is missing.

Task:
In jukeboxController.getPlaylist (or the service layer it calls):
- After fetching playlist and playbackState, check whether
  current_song_id is present in the active queue
- If current_song_id is set but NOT found in the queue,
  return playback_status = "idle", current_song_id = null,
  playback_started_at = null
- Do NOT update the DB here — read-only normalization on the response

Constraints:
- No WebSocket changes
- No frontend changes
- Read-only fix on existing endpoint response
```

---

### ❌ PROMPT 4 — Synchroniser `join` socket avec l'état DB
**Statut : TODO — prochain prompt à exécuter**

**Fichier cible :** `src/ws/jukeboxSockets.js` — handler `join` (~ligne 214–221)

**Problème :** `activeTrackId` est encore dérivé de `playlist[0]` au lieu de
`current_song_id` en DB. Les champs `playback_started_at` et `playback_status`
sont absents du payload `state:full` envoyé au join.

```
Context: in jukebox-backend-2026-04-12/src/ws/jukeboxSockets.js,
the join handler (around line 214–221) emits state:full after a client
joins a room. Currently, activeTrackId is derived from playlist[0]
instead of current_song_id in the jukeboxes table. The payload also
lacks playback_started_at and playback_status.

Task:
1. In the join handler, after fetching the playlist, also query
   current_song_id, playback_started_at, playback_status
   from the jukeboxes table for this slug (reuse getJukeboxBySlug
   or a direct DB call — whichever is already available in this file)
2. Set activeTrackId = current_song_id from DB (not playlist[0])
3. Include playback_started_at and playback_status in the state:full
   payload sent to the joining client
4. If current_song_id is null or playback_status = "idle",
   activeTrackId should be null in the payload

Constraints:
- Only the join handler in jukeboxSockets.js
- No frontend changes
- No changes to other WebSocket events (queue:update, playback:start, etc.)
- Log: slug + current_song_id + playback_status on each join
```

---

### ⚠️ PROMPT 5 — Frontend : écouter `playback:start`
**Statut : PARTIEL — listener présent au commit initial, refonte au commit `6c4264c`**

**Fichier modifié :** `djman-mini-prod/src/components/PlaceJukebox.tsx` (~406 lignes)

**Ce qui a été fait au commit `6c4264c` :**
- Seek serveur différé (évite hard-seek immédiat)
- Fenêtre de tolérance sans hard-seek
- Arrêt du preview quand la piste devient #1 dans la queue

**À réévaluer après Prompt 4** — vérifier que :
- Le listener `playback:start` applique bien `event.song_id` / `event.startedAt` en priorité sur l'état local
- La condition qui bloquait la synchro quand `current_song_id !== activeTrackId` est bien retirée

> Patch ciblé seulement — ne pas refaire from scratch.

---

### ⚠️ PROMPT 6 — Frontend : hydrater l'état au chargement
**Statut : PARTIEL — synchro enrichie au commit `6c4264c`**

**Fichier cible :** `PlaceJukebox.tsx` + `usePlaylist` si applicable

**À réévaluer après Prompts 4 + 3(tâche 2)** — vérifier que :
- Le chargement initial lit bien `playback_started_at` et `playback_status` depuis l'endpoint
- La reconnexion socket re-fetche et réapplique l'état serveur
- L'état serveur overrides toujours l'état local au load/reconnect

> Si le comportement est correct après Prompt 4, ce prompt peut se réduire à une validation + commit de confirmation.

---

### ❌ PROMPT 7 — Gérer les cas limites de la queue
**Statut : TODO**

**Fichier cible :** `src/services/jukeboxService.js`

```
Context: edge cases in playback transitions can cause
inconsistent state across devices.

Task: in jukeboxService.js, handle explicitly:

1. Single song — same song stays active after rotation:
   - do not reset playback_started_at
   - do not emit duplicate playback:start

2. prioritizeSong when same song is already at head and playing:
   - do not restart playback
   - only emit queue:update if order changed

Note: "empty queue after completeSong" is NOT a valid case —
DJManJuke uses circular rotation: the completed song moves to
the end of the queue and is never removed by normal playback.
Queue idle state only applies when all songs are manually deleted.

Constraints:
- Backend only — no frontend changes
- All cases must log clearly (slug + case name + song_id)
```

---

### ❌ PROMPT 8 — Nettoyage final : supprimer l'autoplay local
**Statut : TODO**

> ⚠️ **Ne pas exécuter avant que les Prompts 4–7 soient validés et commités.**

**Fichier cible :** `PlaceJukebox.tsx` + hooks directs

```
Context: after Prompts 5–6, the backend is now the single source
of truth for playback. Local autoplay timing assumptions in
PlaceJukebox.tsx are now redundant and risk conflicting.

Task:
1. Remove or disable local logic that decides what plays next
   based on queue position alone
2. Remove local timer drift compensation if backend state exists
3. Keep only:
   - playback:start WebSocket listener (Prompt 5)
   - server state hydration on load/reconnect (Prompt 6)
   - HTML audio/video .play() call triggered by server state
4. Add a comment block: // PLAYBACK SOURCE OF TRUTH: backend only

Constraints:
- Only PlaceJukebox.tsx and its direct hooks
- Regression test: skip, completeSong, prioritizeSong must all
  still trigger correct playback on all connected devices
- Do not touch payment, Stripe, or queue ordering logic
```

---

## ✅ Checklist de validation finale

Après le Prompt 8, vérifier manuellement :

- [ ] Ajouter une chanson à une queue vide → lecture démarre automatiquement
- [ ] Payer une priorité → chanson monte et joue immédiatement
- [ ] Skip → chanson suivante joue sur tous les devices
- [ ] Deux fenêtres côte à côte → synchro visible en < 500ms
- [ ] Rafraîchir la page → état de lecture récupéré depuis le serveur
- [ ] Console navigateur → aucune erreur `play()` rejetée

---

*DJManJuke — www.djmanjuke.com*
*Playback Sync Fix — Mai 2026 — v3 post-commit 6c4264c*
