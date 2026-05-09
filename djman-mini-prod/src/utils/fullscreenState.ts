/**
 * État global partagé pour suivre si on était en fullscreen sur le rang 1
 * Cela permet de maintenir le fullscreen quand on passe à la chanson suivante
 */

let wasFullscreenOnActiveTrack = false;
let activeTrackIdWhenFullscreen: number | null = null;
let shouldPreserveFullscreen = false; // Flag pour préserver l'état même si le fullscreen se ferme temporairement
let isAutoClosing = false; // Flag pour indiquer si le fullscreen se ferme automatiquement (fin de chanson)

export const setFullscreenOnActiveTrack = (value: boolean, trackId?: number | null) => {
  wasFullscreenOnActiveTrack = value;
  if (value && trackId !== undefined && trackId !== null) {
    activeTrackIdWhenFullscreen = trackId;
    shouldPreserveFullscreen = true; // Activer le flag de préservation
    console.log('[fullscreenState] État fullscreen défini', { trackId, value });
  } else if (!value) {
    // Ne pas effacer immédiatement si on doit préserver
    if (!shouldPreserveFullscreen) {
      activeTrackIdWhenFullscreen = null;
      console.log('[fullscreenState] État fullscreen effacé');
    } else {
      console.log('[fullscreenState] État fullscreen préservé (transition en cours)');
    }
  }
};

export const getFullscreenOnActiveTrack = () => {
  return wasFullscreenOnActiveTrack || shouldPreserveFullscreen;
};

export const shouldMaintainFullscreen = (currentTrackId: number | null) => {
  // Si on était en fullscreen et que c'est une nouvelle chanson (différente de celle qui était en fullscreen)
  const wasInFullscreen = wasFullscreenOnActiveTrack || shouldPreserveFullscreen;
  const isNewTrack = currentTrackId !== null && currentTrackId !== activeTrackIdWhenFullscreen;
  const shouldMaintain = wasInFullscreen && isNewTrack;
  
  console.log('[fullscreenState] 🔍 shouldMaintainFullscreen appelé', {
    shouldMaintain,
    wasFullscreenOnActiveTrack,
    shouldPreserveFullscreen,
    wasInFullscreen,
    currentTrackId,
    activeTrackIdWhenFullscreen,
    isNewTrack,
    breakdown: {
      'wasInFullscreen': wasInFullscreen,
      'isNewTrack': isNewTrack,
      'currentTrackId !== null': currentTrackId !== null,
      'currentTrackId !== activeTrackIdWhenFullscreen': currentTrackId !== activeTrackIdWhenFullscreen
    }
  });
  
  // Si on doit maintenir, mettre à jour l'ID de la chanson mais NE PAS réinitialiser shouldPreserveFullscreen
  // car on veut préserver l'état jusqu'à ce que le fullscreen soit vraiment activé
  if (shouldMaintain && currentTrackId !== null) {
    console.log('[fullscreenState] ✅ État préparé pour la nouvelle chanson', { 
      currentTrackId,
      previousTrackId: activeTrackIdWhenFullscreen
    });
    activeTrackIdWhenFullscreen = currentTrackId;
    wasFullscreenOnActiveTrack = true;
    // Ne pas réinitialiser shouldPreserveFullscreen ici - il sera réinitialisé quand le fullscreen sera activé
  } else {
    console.log('[fullscreenState] ❌ Ne doit pas maintenir le fullscreen', {
      shouldMaintain,
      currentTrackId,
      activeTrackIdWhenFullscreen
    });
  }
  
  return shouldMaintain;
};

// Fonction pour confirmer que le fullscreen a été activé sur la nouvelle chanson
export const confirmFullscreenActivated = () => {
  shouldPreserveFullscreen = false;
  console.log('[fullscreenState] Fullscreen activé, flag de préservation réinitialisé');
};

export const clearFullscreenOnActiveTrack = () => {
  // Ne pas effacer si on doit préserver (transition entre chansons)
  if (!shouldPreserveFullscreen) {
    wasFullscreenOnActiveTrack = false;
    activeTrackIdWhenFullscreen = null;
    console.log('[fullscreenState] État effacé (clearFullscreenOnActiveTrack)');
  } else {
    console.log('[fullscreenState] État préservé (clearFullscreenOnActiveTrack ignoré)');
  }
};

export const setAutoClosing = (value: boolean) => {
  isAutoClosing = value;
  console.log('[fullscreenState] Auto-closing set to', value);
};

export const isAutoClosingFullscreen = () => {
  return isAutoClosing;
};

export const forceClearFullscreenOnActiveTrack = () => {
  // Forcer l'effacement (quand l'utilisateur sort manuellement du fullscreen)
  wasFullscreenOnActiveTrack = false;
  activeTrackIdWhenFullscreen = null;
  shouldPreserveFullscreen = false;
  isAutoClosing = false;
  console.log('[fullscreenState] État forcé à effacer (sortie manuelle)');
};

