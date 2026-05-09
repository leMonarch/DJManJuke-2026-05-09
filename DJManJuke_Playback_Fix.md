# 🎵 DJManJuke — Playback Sync Fix
## Cursor Prompts v2 — Backend as Source of Truth

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
                                                            local
  │                                        │
  ▼                                        ▼
[2] Aligner       [4] Socket join     [6] Hydrater
    playback:start     au boot             état initial

                                        │
                                        ▼
                                    [7] Cas limites
```

---

## 📋 Les 8 Prompts

---

### PROMPT 1 — Centraliser les transitions de lecture

**Fichier cible :** `src/services/jukeboxService.js`
**Type :** Refactor backend — aucun impact WebSocket ni frontend

**Problème résolu :**
`prioritizeSong` et l'ajout d'une chanson à une queue vide ne déclenchent
pas la mise à jour de `current_song_id` / `playback_started_at` —
contrairement à `skipToNext` et `completeSong` qui le font déjà.

```
Context: in jukebox-backend-2026-04-12/src/services/jukeboxService.js,
playback transitions (skip, completeSong) already update current_song_id,
playback_started_at and playback_status in the jukeboxes table.
However, prioritizeSong and song-added-to-empty-queue do NOT trigger
this update — causing the first commanded song to never start properly.

Task:
1. Extract the playback start logic from skipToNext / completeSong
   into a single reusable function: startPlaybackForQueueHead(slug, db)
2. This function must:
   - Query the current queue head for this slug
   - If queue is empty: set playback_status = "idle", current_song_id = null,
     playback_started_at = null — return null
   - If same song is already active AND playback_status = "playing": return
     current state without changes (idempotent)
   - Otherwise: UPDATE jukeboxes SET current_song_id, playback_started_at = NOW(),
     playback_status = "playing" WHERE slug = ?
   - Return { song, playback_started_at }
3. Replace the existing inline logic in skipToNext, skipToPrevious,
   completeSong with calls to startPlaybackForQueueHead()
4. Call startPlaybackForQueueHead() at the end of prioritizeSong
5. Call startPlaybackForQueueHead() when a song is added to a
   previously empty queue

Constraints:
- No WebSocket changes in this prompt
- No frontend changes
- Do not break existing skipToNext / completeSong behavior
- Log the transition source (skip | prioritize | addToEmptyQueue | complete)
  and slug for each call
```

---

### PROMPT 2 — Aligner l'émission de `playback:start`

**Fichier cible :** `src/ws/jukeboxSockets.js` + services concernés
**Type :** Extension WebSocket — aucun impact frontend

**Problème résolu :**
`playback:start` existe déjà mais n'est émis qu'après `skip` et `completeSong`.
Après le Prompt 1, tous les chemins passent par `startPlaybackForQueueHead()` —
l'émission doit suivre le même pattern.

```
Context: playback:start already exists in src/ws/jukeboxSockets.js
and is emitted after skipToNext, skipToPrevious and completeSong.
After Prompt 1, startPlaybackForQueueHead() is now the single
transition function. The emit must follow the same pattern.

Task:
1. Ensure playback:start is emitted from ALL callers of
   startPlaybackForQueueHead() — including the new ones
   (prioritizeSong, addToEmptyQueue)
2. Standardize the payload to: { song_id, track, startedAt }
   — align with existing payload { track, startedAt } by adding song_id
3. Do NOT emit playback:start if startPlaybackForQueueHead() returned
   null (empty queue) or returned without changes (idempotent case)
4. Do NOT replace or remove existing queue:update events

Constraints:
- No frontend changes yet
- Emit always happens AFTER DB update is confirmed
- One emit per transition, no duplicates
```

---

### PROMPT 3 — Étendre l'endpoint playlist existant

**Fichier cible :** Controller/service de `GET /jukebox/:slug/playlist`
**Type :** Fix lecture seule — aucun impact WebSocket ni frontend

**Problème résolu :**
`playbackState` retourné par l'endpoint peut avoir `current_song_id = null`
alors que la queue est non vide — le client n'a pas de source de vérité fiable au chargement.

```
Context: GET /jukebox/:slug/playlist already returns playlist and
playbackState. The playbackState must always reflect DB truth,
especially current_song_id, playback_started_at and playback_status.

Task:
1. Ensure the playbackState object returned always includes:
   { current_song_id, playback_started_at, playback_status }
   fetched directly from the jukeboxes table — not derived from queue
2. If current_song_id is set but not present in active queue,
   treat as idle: return playback_status = "idle", current_song_id = null
3. Do NOT create a new endpoint — extend the existing response only

Constraints:
- No WebSocket changes
- No frontend changes
- Read-only fix on existing endpoint
```

---

### PROMPT 4 — Synchroniser `join` socket avec l'état DB

**Fichier cible :** `src/ws/jukeboxSockets.js` — handler `join`
**Type :** Extension WebSocket — aucun impact frontend

**Problème résolu :**
Quand un client rejoint une room, `state:full` est envoyé mais
`activeTrackId` est dérivé de la queue et non de `current_song_id` en DB.

```
Context: in src/ws/jukeboxSockets.js, when a client joins a room,
the server emits state:full with { activeTrackId, playlist,
playbackMode, isMasterDevice }. This state must now include
the full playback state from DB.

Task:
1. In the join handler, after fetching playlist, also fetch
   current_song_id, playback_started_at, playback_status
   from the jukeboxes table for this slug
2. Include these fields in the state:full payload:
   { activeTrackId, playlist, playbackMode, isMasterDevice,
     playback_started_at, playback_status }
3. Ensure activeTrackId = current_song_id from DB
   (not derived from queue[0])

Constraints:
- Only the join handler in jukeboxSockets.js
- No frontend changes yet
- No changes to other WebSocket events
```

---

### PROMPT 5 — Frontend : écouter `playback:start`

**Fichier cible :** `djman-mini-prod/src/components/PlaceJukebox.tsx`
**Type :** Extension frontend — sans supprimer l'existant

**Problème résolu :**
Le `useEffect` client ignore `playbackState` si `current_song_id !== activeTrackId` —
bloquant la synchro sur la première chanson commandée.

```
Context: in djman-mini-prod/src/components/PlaceJukebox.tsx,
a useEffect syncs with playbackState only if
activeTrackId === playbackState.current_song_id — causing the
first commanded song to never sync because current_song_id was null.

After Prompts 1–2, the backend now emits playback:start reliably.

Task:
1. Add a Socket.io listener for playback:start in PlaceJukebox.tsx
2. When received: set active track to event.song_id,
   set playback timing to event.startedAt,
   update local playback state — backend takes priority
3. Remove the condition that blocks sync when
   current_song_id !== activeTrackId: always apply
   server state when playback:start arrives
4. Do NOT remove existing autoplay logic yet

Constraints:
- Only PlaceJukebox.tsx
- Do not modify other components
- Do not remove queue:update handler
```

---

### PROMPT 6 — Frontend : hydrater l'état au chargement

**Fichier cible :** `PlaceJukebox.tsx` + `usePlaylist` si applicable
**Type :** Fix frontend — chargement initial et reconnexion

**Problème résolu :**
Au chargement de la page et à la reconnexion socket, l'état de lecture
serveur n'est pas appliqué correctement si une chanson est déjà active en DB.

```
Context: on page load and socket reconnect, PlaceJukebox.tsx
fetches playlist but may not correctly initialize playback state
when current_song_id is already set in DB.

Task:
1. After fetching initial playlist (GET /jukebox/:slug/playlist),
   read playback_started_at and playback_status from the response
2. If playback_status = "playing" AND current_song_id is set:
   immediately set active track and playback timing from server state
3. On socket reconnect event: re-fetch playlist and re-apply server state
4. Backend state always overrides local state on load/reconnect

Constraints:
- Only PlaceJukebox.tsx and its hooks (usePlaylist if applicable)
- No new API calls — use existing playlist endpoint extended in Prompt 3
```

---

### PROMPT 7 — Gérer les cas limites de la queue

**Fichier cible :** `src/services/jukeboxService.js`
**Type :** Robustesse backend — edge cases

**Problème résolu :**
Comportements inconsistants sur queue vide, chanson unique,
et priorisation sans changement de tête de file.

```
Context: edge cases in playback transitions can cause
inconsistent state across devices.

Task: in jukeboxService.js, handle explicitly:

1. Empty queue after completeSong:
   - playback_status = "idle", current_song_id = null
   - emit queue:update with empty playlist
   - do NOT emit playback:start

2. Single song — same song stays active after rotation:
   - do not reset playback_started_at
   - do not emit duplicate playback:start

3. prioritizeSong when same song is already at head and playing:
   - do not restart playback
   - only emit queue:update if order changed

Constraints:
- Backend only — no frontend changes
- All cases must log clearly (slug + case name + song_id)
```

---

### PROMPT 8 — Nettoyage final : supprimer l'autoplay local

**Fichier cible :** `PlaceJukebox.tsx` + hooks directs
**Type :** Nettoyage frontend — dernière étape

> ⚠️ **Ne pas exécuter avant que les Prompts 1–7 soient validés et commités.**

**Problème résolu :**
L'ancienne logique d'autoplay local entre en conflit avec le backend
maintenant autoritaire — risque de double déclenchement ou de drift.

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
- [ ] Queue vide après dernière chanson → état idle propre
- [ ] Console navigateur → aucune erreur `play()` rejetée

---

*DJManJuke — www.djmanjuke.com*
*Playback Sync Fix — Mai 2026*
