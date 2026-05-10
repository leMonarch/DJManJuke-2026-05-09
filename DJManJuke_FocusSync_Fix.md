# 🎵 DJManJuke — Focus Sync Fix
## Cursor Prompt — Throttling navigateur sur onglet sans focus

> **Indépendant** de la séquence Playback Sync (8 prompts).
> Peut être exécuté après le commit du Prompt 4.

---

### 🔍 Diagnostic

**Symptôme :** Le 2ᵉ onglet se synchronise seulement quand l'utilisateur
interagit avec la page (mouvement souris, clic).

**Cause :** Un onglet visible mais **sans focus** est throttlé par le navigateur
(Chrome / Edge / Firefox) — les timers JS et certains traitements sont ralentis
ou mis en file d'attente. Dès que l'onglet reçoit le focus, le JS reprend et
les événements WS en attente sont traités.

**Ce n'est pas un bug de code** — c'est une limitation navigateur documentée.
La correction consiste à écouter les événements `visibilitychange` et `focus`
pour forcer un re-fetch de l'état serveur au moment où l'onglet redevient actif.

---

### 📁 Fichier cible

`djman-mini-prod/src/components/PlaceJukebox.tsx`

---

### 📋 Prompt Cursor

```
Context: in djman-mini-prod/src/components/PlaceJukebox.tsx,
a second browser tab showing the same jukebox slug only syncs
its queue and playback state when the user interacts with the page.

Root cause: browser focus throttling — a visible-but-unfocused tab
has its JS timers and event processing throttled. WebSocket events
may queue up and only process when the tab regains focus.

Task:
1. Add a useEffect that listens to two browser events:
   - document.addEventListener('visibilitychange', ...)
     → trigger when document.visibilityState === 'visible'
   - window.addEventListener('focus', ...)
     → trigger on window focus

2. When either event fires, re-fetch server state:
   - Call the existing GET /jukebox/:slug/playlist endpoint
   - Apply the returned playbackState (current_song_id,
     playback_started_at, playback_status) to local state
   - Apply the returned playlist to local queue state
   - This must use the same hydration logic already in place
     from the initial page load (do not duplicate — extract
     into a shared function if needed: applyServerState())

3. Also re-emit the socket join event or request a fresh
   state:full from the server if the socket is already connected,
   so the server-side join handler (fixed in Prompt 4) can
   re-send the authoritative state:full payload.

4. Debounce the handler by 300 ms to avoid double-firing
   (visibilitychange + focus can fire together).

5. Clean up both event listeners on component unmount.

Constraints:
- Only PlaceJukebox.tsx (and its direct hooks if hydration is extracted)
- Do not remove existing playback:start or queue:update listeners
- Do not trigger a re-fetch on every focus if the tab was only
  unfocused for < 2 s (add a timestamp guard: skip if last focus
  was less than 2000 ms ago)
- No backend changes required
- Log: "[FocusSync] tab refocused, re-fetching server state" on trigger
```

---

### ✅ Critères de validation

- [ ] Onglet 2 visible mais sans focus pendant 15–20 s → interagir → synchro en < 500 ms
- [ ] Deux onglets au premier plan alternativement → aucune régression sur la synchro normale
- [ ] Rafraîchissement page → comportement inchangé
- [ ] Console : log `[FocusSync]` visible au moment du focus
- [ ] Aucune erreur `play()` rejetée au re-focus

---

### 📝 Notes

- Ce fix améliore la **perception produit** mais ne résout pas le throttling navigateur
  lui-même — c'est une compensation applicative.
- Si l'usage principal est un **DJ booth mono-écran**, cette correction est
  un nice-to-have, pas un bloquant.
- Pour un usage **multi-écran sans interaction**, une solution plus robuste serait
  un polling léger (ex. toutes les 5 s via `setInterval`) combiné à ce fix —
  à évaluer selon les besoins.

---

*DJManJuke — www.djmanjuke.com*
*Focus Sync Fix — Mai 2026*
