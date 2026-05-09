import { useCallback, useEffect, useRef, useState } from 'react';

type UseFullscreenOptions = {
  elementRef: React.RefObject<HTMLElement>;
  videoRef?: React.RefObject<HTMLVideoElement>;
  onEnterFullscreen?: () => void;
  onExitFullscreen?: () => void;
};

/**
 * Hook simple pour gérer le fullscreen
 * Gère uniquement l'activation/désactivation du fullscreen
 */
export const useFullscreen = ({
  elementRef,
  videoRef,
  onEnterFullscreen,
  onExitFullscreen,
}: UseFullscreenOptions) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const onEnterRef = useRef(onEnterFullscreen);
  const onExitRef = useRef(onExitFullscreen);

  // Mettre à jour les refs des callbacks
  useEffect(() => {
    onEnterRef.current = onEnterFullscreen;
    onExitRef.current = onExitFullscreen;
  }, [onEnterFullscreen, onExitFullscreen]);

  // Fonction pour obtenir l'API fullscreen du navigateur
  const getFullscreenAPI = useCallback(() => {
    const doc = document as any;
    return {
      request: (element: HTMLElement) => {
        if (element.requestFullscreen) {
          return element.requestFullscreen();
        } else if ((element as any).webkitRequestFullscreen) {
          return (element as any).webkitRequestFullscreen();
        } else if ((element as any).webkitEnterFullscreen && element instanceof HTMLVideoElement) {
          return (element as any).webkitEnterFullscreen();
        } else if (doc.documentElement.mozRequestFullScreen) {
          return doc.documentElement.mozRequestFullScreen();
        } else if (doc.documentElement.msRequestFullscreen) {
          return doc.documentElement.msRequestFullscreen();
        }
        return Promise.reject(new Error('Fullscreen API not supported'));
      },
      exit: () => {
        if (document.exitFullscreen) {
          return document.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          return doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          return doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          return doc.msExitFullscreen();
        }
        return Promise.reject(new Error('Fullscreen exit not supported'));
      },
      get element() {
        return (
          document.fullscreenElement ||
          doc.webkitFullscreenElement ||
          doc.mozFullScreenElement ||
          doc.msFullscreenElement ||
          null
        );
      },
    };
  }, []);

  // Vérifier si notre élément est en fullscreen
  const isOurElementFullscreen = useCallback(() => {
    const fullscreenAPI = getFullscreenAPI();
    const fullscreenElement = fullscreenAPI.element;
    
    return (
      fullscreenElement === elementRef.current ||
      fullscreenElement === videoRef?.current ||
      (fullscreenElement && elementRef.current && fullscreenElement.contains(elementRef.current))
    );
  }, [elementRef, videoRef, getFullscreenAPI]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(async () => {
    try {
      const fullscreenAPI = getFullscreenAPI();
      const isCurrentlyFullscreen = fullscreenAPI.element !== null;

      if (!isCurrentlyFullscreen) {
        // Entrer en fullscreen
        let elementToFullscreen: HTMLElement | null = null;

        if (videoRef?.current) {
          elementToFullscreen = videoRef.current;
          // S'assurer que la vidéo est visible
          const video = videoRef.current;
          if (video.style.opacity === '0' || video.classList.contains('opacity-0')) {
            video.style.opacity = '1';
            video.classList.remove('opacity-0', 'pointer-events-none');
          }
        } else if (elementRef.current) {
          elementToFullscreen = elementRef.current;
        }

        if (!elementToFullscreen) {
          console.warn('Aucun élément trouvé pour le fullscreen');
          return;
        }

        // Activer le fullscreen - l'événement fullscreenchange mettra à jour l'état
        await fullscreenAPI.request(elementToFullscreen);
      } else {
        // Sortir du fullscreen - l'événement fullscreenchange mettra à jour l'état
        await fullscreenAPI.exit();
      }
    } catch (error) {
      console.error('Erreur lors du toggle fullscreen:', error);
    }
  }, [elementRef, videoRef, getFullscreenAPI]);

  // Écouter les changements de fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      // Petit délai pour s'assurer que le navigateur a bien mis à jour l'état
      setTimeout(() => {
        const fullscreenAPI = getFullscreenAPI();
        const fullscreenElement = fullscreenAPI.element;
        const isCurrentlyFullscreen = fullscreenElement !== null;
        const isOurElement = isOurElementFullscreen();
        
        console.log('[useFullscreen] handleFullscreenChange', {
          isCurrentlyFullscreen,
          isOurElement,
          fullscreenElement,
          ourElement: elementRef.current,
          videoElement: videoRef?.current
        });
        
        // Si on est en fullscreen mais que ce n'est pas notre élément,
        // vérifier si on doit préserver le fullscreen (transition entre chansons)
        if (isCurrentlyFullscreen && !isOurElement) {
          // Vérifier si on doit maintenir le fullscreen (transition)
          import('../utils/fullscreenState').then(({ getFullscreenOnActiveTrack }) => {
            if (getFullscreenOnActiveTrack()) {
              console.log('[useFullscreen] ⚠️ Fullscreen actif mais pas notre élément, préservation pour transition');
              // Ne pas mettre à jour isFullscreen pour éviter de déclencher handleExitFullscreen
              return;
            }
          });
        }
        
        const currentlyFullscreen = isCurrentlyFullscreen && isOurElement;
        
        setIsFullscreen((prev) => {
          if (currentlyFullscreen !== prev) {
            console.log('[useFullscreen] État fullscreen changé', { from: prev, to: currentlyFullscreen });
            return currentlyFullscreen;
          }
          return prev;
        });
      }, 50);
    };

    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
    events.forEach((event) => {
      document.addEventListener(event, handleFullscreenChange);
    });

    // Vérifier l'état initial
    const fullscreenAPI = getFullscreenAPI();
    const fullscreenElement = fullscreenAPI.element;
    const isCurrentlyFullscreen = fullscreenElement !== null;
    const isOurElement = isOurElementFullscreen();
    
    // Si on est en fullscreen mais que ce n'est pas notre élément,
    // vérifier si on doit préserver le fullscreen (transition entre chansons)
    if (isCurrentlyFullscreen && !isOurElement) {
      // Vérifier si on doit maintenir le fullscreen (transition)
      import('../utils/fullscreenState').then(({ getFullscreenOnActiveTrack }) => {
        if (getFullscreenOnActiveTrack()) {
          console.log('[useFullscreen] ⚠️ Fullscreen actif mais pas notre élément, vérification pour transition');
          // Vérifier si notre élément devrait être en fullscreen (nouvelle chanson active)
          // Si oui, on considère qu'on est en fullscreen pour éviter de déclencher handleExitFullscreen
          const shouldBeFullscreen = getFullscreenOnActiveTrack();
          if (shouldBeFullscreen && elementRef.current) {
            console.log('[useFullscreen] ✅ Transition détectée, maintien du fullscreen sur le nouvel élément');
            setIsFullscreen(true);
          }
        }
      });
    } else {
      const currentlyFullscreen = isCurrentlyFullscreen && isOurElement;
      if (currentlyFullscreen !== isFullscreen) {
        setIsFullscreen(currentlyFullscreen);
      }
    }

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleFullscreenChange);
      });
    };
  }, [getFullscreenAPI, isOurElementFullscreen, isFullscreen]);

  // Appeler les callbacks quand isFullscreen change
  const prevIsFullscreenRef = useRef(isFullscreen);
  useEffect(() => {
    const wasFullscreen = prevIsFullscreenRef.current;
    prevIsFullscreenRef.current = isFullscreen;

    if (isFullscreen && !wasFullscreen) {
      // Entrer en fullscreen
      console.log('[useFullscreen] ✅ Entrée en fullscreen détectée');
      onEnterRef.current?.();
    } else if (!isFullscreen && wasFullscreen) {
      // Sortir du fullscreen - vérifier si c'est une transition
      console.log('[useFullscreen] ⚠️ Sortie du fullscreen détectée');
      
      // Vérifier si on doit préserver le fullscreen (transition entre chansons)
      import('../utils/fullscreenState').then(({ getFullscreenOnActiveTrack }) => {
        if (getFullscreenOnActiveTrack()) {
          console.log('[useFullscreen] ⚠️ Transition détectée, ne pas déclencher handleExitFullscreen');
          // Ne pas déclencher handleExitFullscreen car c'est une transition
          // Le fullscreen sera transféré vers le nouveau composant
          return;
        }
        
        // Si ce n'est pas une transition, déclencher handleExitFullscreen normalement
        console.log('[useFullscreen] ✅ Sortie réelle du fullscreen, déclenchement de handleExitFullscreen');
        onExitRef.current?.();
      });
    }
  }, [isFullscreen]);

  return {
    isFullscreen,
    toggleFullscreen,
  };
};
