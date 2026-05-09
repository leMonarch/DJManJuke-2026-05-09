/**
 * Gestion du conteneur fullscreen global
 * Ce conteneur reste toujours le même et met à jour son contenu lors des transitions
 */

type FullscreenContent = {
  type: 'audio' | 'video';
  imageSrc?: string | null;
  thumbnailSrc?: string | null;
  title: string;
  trackId: number | null;
  isActive: boolean;
};

let fullscreenContainerElement: HTMLElement | null = null;
let currentContent: FullscreenContent | null = null;
let isFullscreenActive = false;
let isPseudoFullscreen = false; // Mode pseudo-fullscreen CSS (pour transitions fluides)

export const setFullscreenContainer = (element: HTMLElement | null) => {
  // Ne mettre à jour que si l'élément change vraiment
  if (fullscreenContainerElement !== element) {
    fullscreenContainerElement = element;
    // Log supprimé pour réduire le bruit en développement
  }
};

export const getFullscreenContainer = (): HTMLElement | null => {
  return fullscreenContainerElement;
};

export const updateFullscreenContent = (content: FullscreenContent) => {
  currentContent = content;
  console.log('[fullscreenContainer] Contenu mis à jour', content);
  
  // Dispatcher un événement pour que le conteneur mette à jour son affichage
  window.dispatchEvent(new CustomEvent('fullscreenContentUpdate', { detail: content }));
};

export const getCurrentContent = (): FullscreenContent | null => {
  return currentContent;
};

export const setFullscreenActive = (active: boolean) => {
  isFullscreenActive = active;
  console.log('[fullscreenContainer] Fullscreen actif:', active);
};

export const getFullscreenActive = (): boolean => {
  return isFullscreenActive || isPseudoFullscreen;
};

export const setPseudoFullscreen = (active: boolean) => {
  isPseudoFullscreen = active;
  console.log('[fullscreenContainer] Pseudo-fullscreen:', active);
  
  // Mettre à jour le style du conteneur si disponible
  if (fullscreenContainerElement) {
    if (active) {
      fullscreenContainerElement.style.display = 'flex';
      fullscreenContainerElement.classList.add('pseudo-fullscreen-active');
    } else {
      fullscreenContainerElement.classList.remove('pseudo-fullscreen-active');
      // Ne pas cacher si le vrai fullscreen est actif
      if (!isFullscreenActive) {
        fullscreenContainerElement.style.display = 'none';
      }
    }
  }
};

export const getPseudoFullscreen = (): boolean => {
  return isPseudoFullscreen;
};

