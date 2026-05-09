import { useEffect, useRef, useCallback } from 'react';
import { useFullscreen } from '../hooks/useFullscreen';
import { useLanguage } from '../context/LanguageContext';
import { setFullscreenOnActiveTrack, clearFullscreenOnActiveTrack, shouldMaintainFullscreen, forceClearFullscreenOnActiveTrack, setAutoClosing, isAutoClosingFullscreen, confirmFullscreenActivated } from '../utils/fullscreenState';
import { getFullscreenContainer, updateFullscreenContent as updateGlobalFullscreenContent, setFullscreenActive } from '../utils/fullscreenContainer';

type VideoCardProps = {
  videoSrc: string;
  thumbnailSrc?: string | null;
  title: string;
  isActive?: boolean;
  isPreviewing?: boolean;
  isPlayerPlaying?: boolean;
  playerPositionSeconds?: number;
  onPreview?: () => void;
  onPauseMainPlayer?: () => void;
  onResumeMainPlayer?: () => void;
  trackId?: number | null;
};

/**
 * VideoCard simplifié
 * - Affiche une miniature thumbnail
 * - Bouton fullscreen en bas à droite
 * - En fullscreen : unmute la vidéo et met en pause le player principal
 * - Extrait 15s (Free) ou entier (Pro) via onPreview
 */
export const VideoCard = ({
  videoSrc,
  thumbnailSrc,
  title,
  isActive = false,
  isPreviewing = false,
  isPlayerPlaying = false,
  playerPositionSeconds = 0,
  onPreview,
  onPauseMainPlayer,
  onResumeMainPlayer,
  trackId = null,
}: VideoCardProps) => {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Gérer l'entrée en fullscreen
  const handleEnterFullscreen = () => {
    console.log('[VideoCard] 🎬 handleEnterFullscreen appelé', { isActive, trackId });
    
    // Si c'est le rang 1, comportement différent : on ne modifie pas la vidéo
    // On met juste le conteneur en fullscreen et le lecteur principal continue à jouer
    if (isActive) {
      setFullscreenOnActiveTrack(true, trackId);
      // Confirmer que le fullscreen est activé
      confirmFullscreenActivated();
      console.log('[VideoCard] ✅ Rang 1 : fullscreen activé, lecteur principal continue à jouer', { trackId });
      // Ne pas mettre en pause le player principal pour le rang 1
      // La vidéo reste synchronisée avec le lecteur principal (muted, contrôlée par PlaceJukebox)
      return;
    }
    
    // Pour les autres rangs (extrait 15s ou entier), comportement normal
    console.log('[VideoCard] ⚠️ Pas le rang 1, comportement extrait/entier');
    
    // Mettre en pause le player principal
    onPauseMainPlayer?.();

    // Si ce n'est pas le rang 1, unmute et jouer pour preview
    if (videoRef.current) {
      const video = videoRef.current;
      video.muted = false;
      if (video.paused) {
        video.play().catch((error) => {
          console.warn('Erreur lors de la lecture vidéo en fullscreen:', error);
        });
      }
    }
  };

  // Gérer la sortie du fullscreen
  const handleExitFullscreen = () => {
    const wasAutoClosing = isAutoClosingFullscreen();
    console.log('[VideoCard] handleExitFullscreen', { isActive, trackId, wasAutoClosing });
    
    // Si c'est le rang 1, utiliser le conteneur global
    if (isActive) {
      setFullscreenActive(false);
      console.log('[VideoCard] Rang 1 : sortie du fullscreen, lecteur principal continue normalement');
      // Ne pas effacer l'état si c'est une transition vers une nouvelle chanson
      // L'état sera utilisé par la nouvelle chanson quand elle deviendra active
      return;
    }
    
    // Pour les autres rangs, arrêter la vidéo et remettre la thumbnail
    if (videoRef.current) {
      const video = videoRef.current;
      video.pause();
      video.currentTime = 0;
      video.muted = true;
      // S'assurer que la vidéo redevient invisible pour afficher la thumbnail
      video.style.opacity = '0';
      video.classList.add('opacity-0', 'pointer-events-none');
      video.style.pointerEvents = 'none';
    }

    // Si c'était une fermeture automatique (fin de chanson), ne pas reprendre le player principal
    // La nouvelle chanson va démarrer automatiquement
    if (wasAutoClosing) {
      console.log('[VideoCard] Fermeture automatique, ne pas reprendre le player principal');
      setAutoClosing(false); // Réinitialiser le flag
      // Préserver l'état pour que la nouvelle chanson active le fullscreen
      return;
    } else {
      // Si on n'est plus actif, vérifier si on doit effacer l'état
      // Vérifier si on est vraiment sorti du fullscreen
      const fullscreenAPI = {
        get element() {
          const doc = document as any;
          return (
            document.fullscreenElement ||
            doc.webkitFullscreenElement ||
            doc.mozFullScreenElement ||
            doc.msFullscreenElement ||
            null
          );
        },
      };
      
      // Si on n'est vraiment plus en fullscreen et qu'on n'est plus actif, effacer l'état
      // Mais seulement si ce n'est pas une transition vers une nouvelle chanson
      if (!fullscreenAPI.element) {
        // Attendre un peu pour voir si une nouvelle chanson va devenir active
        setTimeout(() => {
          // Vérifier à nouveau si on doit effacer (peut-être qu'une nouvelle chanson est devenue active entre temps)
          clearFullscreenOnActiveTrack();
        }, 1000);
      }
      
      // Reprendre le player principal seulement si on n'est plus actif
      onResumeMainPlayer?.();
    }
  };

  const { isFullscreen, toggleFullscreen } = useFullscreen({
    elementRef: containerRef,
    videoRef,
    onEnterFullscreen: handleEnterFullscreen,
    onExitFullscreen: handleExitFullscreen,
  });

  // Quand cette carte devient active (rang 1) et qu'on était en fullscreen sur la chanson précédente, activer le fullscreen
  const prevIsActiveRef = useRef(isActive);
  const prevTrackIdRef = useRef<number | null>(trackId);
  
  // Refs pour stabiliser les valeurs dans les callbacks
  const isActiveRef = useRef(isActive);
  const trackIdRef = useRef(trackId);
  const videoSrcRef = useRef(videoSrc);
  const thumbnailSrcRef = useRef(thumbnailSrc);
  const titleRef = useRef(title);
  const playerPositionSecondsRef = useRef(playerPositionSeconds);
  
  useEffect(() => {
    isActiveRef.current = isActive;
    trackIdRef.current = trackId;
    videoSrcRef.current = videoSrc;
    thumbnailSrcRef.current = thumbnailSrc;
    titleRef.current = title;
    playerPositionSecondsRef.current = playerPositionSeconds;
  }, [isActive, trackId, videoSrc, thumbnailSrc, title, playerPositionSeconds]);
  
  // Fonction pour mettre à jour le contenu en fullscreen (transition fluide)
  const updateFullscreenContent = useCallback(() => {
    const currentIsActive = isActiveRef.current;
    const currentTrackId = trackIdRef.current;
    const currentVideoSrc = videoSrcRef.current;
    
    if (!currentIsActive || currentTrackId === null || !containerRef.current || !videoRef.current) {
      return;
    }
    
    // Vérifier si on est en fullscreen
    const fullscreenAPI = {
      get element() {
        const doc = document as any;
        return (
          document.fullscreenElement ||
          doc.webkitFullscreenElement ||
          doc.mozFullScreenElement ||
          doc.msFullscreenElement ||
          null
        );
      },
    };
    
    const isInFullscreen = !!fullscreenAPI.element;
    const shouldMaintain = shouldMaintainFullscreen(currentTrackId);
    
    // Si on est déjà en fullscreen, mettre à jour le contenu sans fermer/rouvrir
    if (isInFullscreen && shouldMaintain) {
      // Pour le rang 1, on ne modifie pas la vidéo - le lecteur principal continue à jouer
      // La vidéo reste synchronisée avec le lecteur principal (muted, contrôlée par PlaceJukebox)
      // On met juste à jour l'image/thumbnail affichée (qui se met à jour automatiquement via les props)
      if (currentIsActive) {
        // Si on n'est plus en fullscreen, ne rien faire (le fullscreen a été fermé)
        if (!fullscreenAPI.element) {
          return;
        }
        
        // Pour le rang 1, utiliser le conteneur global
        const globalContainer = getFullscreenContainer();
        if (globalContainer) {
          updateGlobalFullscreenContent({
            type: 'video',
            thumbnailSrc: thumbnailSrcRef.current || null,
            title: titleRef.current,
            trackId: currentTrackId,
            isActive: true,
          });
          
          // Vérifier si le conteneur global est en fullscreen
          const isGlobalContainerFullscreen = fullscreenAPI.element === globalContainer;
          
          if (isGlobalContainerFullscreen) {
            confirmFullscreenActivated();
          } else {
            // Essayer d'activer le fullscreen sur le conteneur global
            const requestFullscreen = (element: HTMLElement) => {
              const doc = document as any;
              if (element.requestFullscreen) {
                return element.requestFullscreen();
              } else if ((element as any).webkitRequestFullscreen) {
                return (element as any).webkitRequestFullscreen();
              } else if (doc.documentElement.mozRequestFullScreen) {
                return doc.documentElement.mozRequestFullScreen();
              } else if (doc.documentElement.msRequestFullscreen) {
                return doc.documentElement.msRequestFullscreen();
              }
              return Promise.reject(new Error('Fullscreen API not supported'));
            };
            
            setTimeout(() => {
              requestFullscreen(globalContainer).then(() => {
                setFullscreenOnActiveTrack(true, currentTrackId);
                setFullscreenActive(true);
                confirmFullscreenActivated();
              }).catch(() => {
                // Ignorer les erreurs silencieusement
              });
            }, 100);
          }
        }
        return;
      }
      
      // Pour les autres rangs, mettre à jour la vidéo
      const video = videoRef.current;
      if (!video) {
        return;
      }
      
      const currentSrc = video.src || '';
      const newSrc = currentVideoSrc;
      
      // Toujours mettre à jour la source et recharger pour la nouvelle chanson
      if (currentSrc !== newSrc || !currentSrc) {
        video.pause();
        video.src = currentVideoSrc;
        video.load();
        
        // Synchroniser la position si nécessaire
        const position = playerPositionSecondsRef.current;
        if (Number.isFinite(position) && position >= 0) {
          const handleCanPlay = () => {
            video.removeEventListener('canplay', handleCanPlay);
            try {
              video.currentTime = position;
            } catch {
              // Ignorer les erreurs
            }
            video.muted = false;
            video.play().catch(() => {
              // Ignorer les erreurs
            });
          };
          video.addEventListener('canplay', handleCanPlay, { once: true });
        } else {
          const handleCanPlay = () => {
            video.removeEventListener('canplay', handleCanPlay);
            video.muted = false;
            video.play().catch(() => {
              // Ignorer les erreurs
            });
          };
          video.addEventListener('canplay', handleCanPlay, { once: true });
        }
      }
      
      // Confirmer que le fullscreen est toujours actif
      confirmFullscreenActivated();
    }
  }, []);
  
  // Fonction pour activer le fullscreen si nécessaire
  const activateFullscreenIfNeeded = useCallback(() => {
    const currentIsActive = isActiveRef.current;
    const currentTrackId = trackIdRef.current;
    
    if (!currentIsActive || currentTrackId === null || !containerRef.current) {
      return;
    }
    
    // Vérifier si on est déjà en fullscreen
    const fullscreenAPI = {
      get element() {
        const doc = document as any;
        return (
          document.fullscreenElement ||
          doc.webkitFullscreenElement ||
          doc.mozFullScreenElement ||
          doc.msFullscreenElement ||
          null
        );
      },
    };
    
    // Si on est déjà en fullscreen, mettre à jour le contenu
    if (fullscreenAPI.element && shouldMaintainFullscreen(currentTrackId)) {
      updateFullscreenContent();
      return;
    }
    
    // Sinon, activer le fullscreen normalement - utiliser le conteneur global pour le rang 1
    if (shouldMaintainFullscreen(currentTrackId)) {
      // Si c'est le rang 1, utiliser le conteneur global
      if (currentIsActive) {
        const globalContainer = getFullscreenContainer();
        if (globalContainer) {
          // Mettre à jour le contenu
          updateGlobalFullscreenContent({
            type: 'video',
            thumbnailSrc: thumbnailSrcRef.current || null,
            title: titleRef.current,
            trackId: currentTrackId,
            isActive: true,
          });
          
          // Vérifier si le conteneur global est déjà en fullscreen
          if (fullscreenAPI.element === globalContainer) {
            confirmFullscreenActivated();
          } else {
            // Activer le fullscreen sur le conteneur global
            const requestFullscreen = (element: HTMLElement) => {
              const doc = document as any;
              if (element.requestFullscreen) {
                return element.requestFullscreen();
              } else if ((element as any).webkitRequestFullscreen) {
                return (element as any).webkitRequestFullscreen();
              } else if (doc.documentElement.mozRequestFullScreen) {
                return doc.documentElement.mozRequestFullScreen();
              } else if (doc.documentElement.msRequestFullscreen) {
                return doc.documentElement.msRequestFullscreen();
              }
              return Promise.reject(new Error('Fullscreen API not supported'));
            };
            
            setTimeout(() => {
              requestFullscreen(globalContainer).then(() => {
                setFullscreenOnActiveTrack(true, currentTrackId);
                setFullscreenActive(true);
                confirmFullscreenActivated();
              }).catch(() => {
                // Ignorer les erreurs silencieusement
              });
            }, 100);
          }
        }
      } else {
        // Pour les autres rangs, utiliser le conteneur local
        if (!fullscreenAPI.element) {
          setTimeout(() => {
            if (containerRef.current && currentIsActive) {
              toggleFullscreen();
              setTimeout(() => {
                confirmFullscreenActivated();
              }, 100);
            }
          }, 500);
        } else {
          confirmFullscreenActivated();
        }
      }
    }
  }, [toggleFullscreen]);
  
  useEffect(() => {
    const wasActive = prevIsActiveRef.current;
    const prevTrackId = prevTrackIdRef.current;
    
    prevIsActiveRef.current = isActive;
    prevTrackIdRef.current = trackId;

    // Si on devient actif et que c'est une nouvelle chanson (trackId différent), vérifier si on doit maintenir le fullscreen
    // OU si on est actif et qu'on n'était pas actif avant (transition depuis une autre chanson)
    if (isActive && trackId !== null && containerRef.current) {
      // Vérifier si c'est une nouvelle chanson ou si on vient de devenir actif
      const isNewTrack = trackId !== prevTrackId;
      const justBecameActive = !wasActive && isActive;
      
      if (isNewTrack || justBecameActive) {
        // Vérifier si on est déjà en fullscreen pour faire une transition fluide
        const fullscreenAPI = {
          get element() {
            const doc = document as any;
            return (
              document.fullscreenElement ||
              doc.webkitFullscreenElement ||
              doc.mozFullScreenElement ||
              doc.msFullscreenElement ||
              null
            );
          },
        };
        
        const isInFullscreen = !!fullscreenAPI.element;
        const shouldMaintain = shouldMaintainFullscreen(trackId);
        
        if (isInFullscreen && shouldMaintain) {
          // Transition fluide : mettre à jour le contenu sans fermer/rouvrir
          setTimeout(() => {
            updateFullscreenContent();
          }, 100);
        } else if (shouldMaintain && !isInFullscreen) {
          // Mettre à jour le contenu visuellement même si on n'est pas en fullscreen
          setTimeout(() => {
            updateFullscreenContent();
          }, 100);
        } else if (shouldMaintain) {
          // Attendre un peu pour s'assurer que l'état est bien préservé
          const timeoutId = setTimeout(() => {
            activateFullscreenIfNeeded();
          }, 100);
          
          return () => clearTimeout(timeoutId);
        }
      }
    }
  }, [isActive, trackId, activateFullscreenIfNeeded, updateFullscreenContent]);
  
  // Écouter l'événement personnalisé pour réagir au changement de chanson active
  useEffect(() => {
    const handleActiveTrackChanged = (event: CustomEvent) => {
      const { newId, shouldMaintainFullscreen: shouldMaintain } = event.detail;
      
      // Utiliser les refs pour éviter les dépendances
      const currentIsActive = isActiveRef.current;
      const currentTrackId = trackIdRef.current;
      
      if (shouldMaintain && currentIsActive && currentTrackId === newId) {
        // Vérifier si on est déjà en fullscreen pour faire une transition fluide
        const fullscreenAPI = {
          get element() {
            const doc = document as any;
            return (
              document.fullscreenElement ||
              doc.webkitFullscreenElement ||
              doc.mozFullScreenElement ||
              doc.msFullscreenElement ||
              null
            );
          },
        };
        
        const isInFullscreen = !!fullscreenAPI.element;
        
        if (isInFullscreen) {
          // Transition fluide : mettre à jour le contenu sans fermer/rouvrir
          setTimeout(() => {
            updateFullscreenContent();
          }, 100);
        } else {
          // Mettre à jour le contenu visuellement même si on n'est pas en fullscreen
          setTimeout(() => {
            updateFullscreenContent();
          }, 100);
        }
      }
    };
    
    window.addEventListener('activeTrackChanged', handleActiveTrackChanged as EventListener);
    return () => {
      window.removeEventListener('activeTrackChanged', handleActiveTrackChanged as EventListener);
    };
  }, [updateFullscreenContent]);

  // Quand la vidéo devient active (rang 1), la rendre visible et démarrer la synchronisation
  useEffect(() => {
    if (!isActive || !videoRef.current) {
      return;
    }
    const el = videoRef.current;

    el.style.opacity = '1';
    el.classList.remove('opacity-0', 'pointer-events-none');
    el.style.pointerEvents = 'auto';
    el.muted = true; // Mute car l'audio vient du player audio global

    if (el.readyState < 2) {
      el.load();
      const handleCanPlay = () => {
        el.removeEventListener('canplay', handleCanPlay);
        if (isPlayerPlaying) {
          if (Number.isFinite(playerPositionSeconds)) {
            try {
              el.currentTime = playerPositionSeconds;
            } catch {
              // ignore seek errors
            }
          }
          el.play().catch(() => {});
        }
      };
      el.addEventListener('canplay', handleCanPlay);
    } else {
      if (isPlayerPlaying) {
        if (Number.isFinite(playerPositionSeconds)) {
          try {
            el.currentTime = playerPositionSeconds;
          } catch {
            // ignore seek errors
          }
        }
        el.play().catch(() => {});
      }
    }
  }, [isActive, isPlayerPlaying, playerPositionSeconds]);

  // Aperçu 15s pour une vidéo non active
  useEffect(() => {
    if (isActive || !videoRef.current) {
      return;
    }
    const el = videoRef.current;
    if (isPreviewing) {
      el.style.opacity = '1';
      el.classList.remove('opacity-0', 'pointer-events-none');
      el.style.pointerEvents = 'auto';
      el.muted = true;
      try {
        el.currentTime = 0;
      } catch {
        // ignore
      }
      el.play().catch(() => {});
    } else {
      el.pause();
      try {
        el.currentTime = 0;
      } catch {
        // ignore
      }
      el.style.opacity = '0';
      el.classList.add('opacity-0', 'pointer-events-none');
      el.style.pointerEvents = 'none';
    }
  }, [isActive, isPreviewing]);

  // S'assurer que la vidéo redevient invisible quand on sort du fullscreen (sauf si active ou en preview)
  useEffect(() => {
    if (!isFullscreen && !isActive && !isPreviewing && videoRef.current) {
      const el = videoRef.current;
      el.style.opacity = '0';
      el.classList.add('opacity-0', 'pointer-events-none');
      el.style.pointerEvents = 'none';
      el.pause();
      try {
        el.currentTime = 0;
      } catch {
        // ignore
      }
      el.muted = true;
    }
  }, [isFullscreen, isActive, isPreviewing]);

  // Synchronisation de la vidéo de la carte active avec le player audio global
  useEffect(() => {
    if (!isActive || !videoRef.current) {
      return;
    }

    // Si on est en fullscreen et que la vidéo n'est pas active, ne pas synchroniser
    if (isFullscreen && !isActive) {
      return;
    }

    const el = videoRef.current;

    const syncAndPlay = () => {
      el.muted = true;
      if (Number.isFinite(playerPositionSeconds)) {
        const diff = Math.abs(el.currentTime - playerPositionSeconds);
        const threshold = isFullscreen ? 1.0 : 0.5;
        if (diff > threshold) {
          try {
            el.currentTime = playerPositionSeconds;
          } catch {
            // ignore seek errors
          }
        }
      }
      if (el.paused) {
        el.play().catch(() => {});
      }
    };

    if (isPlayerPlaying) {
      if (el.readyState >= 1) {
        syncAndPlay();
      } else {
        const handleLoaded = () => {
          el.removeEventListener('loadedmetadata', handleLoaded);
          syncAndPlay();
        };
        el.addEventListener('loadedmetadata', handleLoaded);
      }
    } else {
      if (!isFullscreen) {
        el.pause();
      }
    }
  }, [isActive, isPlayerPlaying, playerPositionSeconds, isFullscreen]);

  // Sortir du fullscreen quand on arrête l'extrait (seulement si on était en preview)
  const wasPreviewingRef = useRef(isPreviewing);
  useEffect(() => {
    // Si on était en preview et qu'on ne l'est plus, et qu'on est en fullscreen et pas actif
    if (wasPreviewingRef.current && !isPreviewing && isFullscreen && !isActive) {
      const fullscreenAPI = {
        exit: () => {
          const doc = document as any;
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
      };
      fullscreenAPI.exit().catch(() => {
        // Ignorer les erreurs
      });
    }
    wasPreviewingRef.current = isPreviewing;
  }, [isPreviewing, isFullscreen, isActive]);

  return (
    <div
      ref={containerRef}
      className="aspect-square w-full overflow-hidden rounded-lg bg-white/10 relative"
      tabIndex={isActive || isFullscreen || isPreviewing ? 0 : -1}
    >
      {thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt={`${title} thumbnail`}
          className={`h-full w-full object-cover transition-opacity duration-500 ${
            isActive || isPreviewing || isFullscreen ? 'opacity-0' : 'opacity-100'
          }`}
          key={`${trackId}-${thumbnailSrc}`}
          loading="lazy"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const placeholder = target.nextElementSibling as HTMLElement;
            if (placeholder && placeholder.classList.contains('thumbnail-placeholder')) {
              placeholder.style.display = 'flex';
            }
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-white/40 thumbnail-placeholder">Thumbnail à venir</div>
      )}
      {thumbnailSrc && (
        <div className="hidden h-full items-center justify-center text-white/40 thumbnail-placeholder">
          Thumbnail à venir
        </div>
      )}

      <video
        ref={videoRef}
        src={videoSrc}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
          isActive || isPreviewing || isFullscreen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        muted={isActive ? true : isPreviewing ? true : isFullscreen ? false : undefined}
        playsInline
        preload="metadata"
        loop={isActive}
        controls={isFullscreen && !isActive}
        style={{
          pointerEvents: isFullscreen ? 'auto' : undefined,
        }}
      />

      {!isActive && (
        <button
          type="button"
          onClick={onPreview}
          className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition hover:opacity-100 active:opacity-100"
          aria-label={t('song.preview', { title })}
          title={t('song.preview', { title })}
        >
          <span className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/70 text-white">
            <svg className="h-6 w-6 sm:h-8 sm:w-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}

      {/* Bouton fullscreen */}
      {(thumbnailSrc || videoSrc) && (
        <button
          type="button"
          onClick={() => {
            // Si on sort manuellement du fullscreen, forcer l'effacement de l'état
            if (isFullscreen) {
              forceClearFullscreenOnActiveTrack();
            }
            toggleFullscreen();
          }}
          className={`absolute bottom-2 right-2 z-30 flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full bg-black/90 p-2.5 text-white shadow-xl transition hover:bg-black hover:scale-110 active:scale-95 cursor-pointer ${isFullscreen ? 'z-50' : ''}`}
          title={isFullscreen ? t('song.exitFullscreen') : t('song.fullscreen')}
          aria-label={isFullscreen ? t('song.exitFullscreen') : t('song.fullscreen')}
        >
          {isFullscreen ? (
            <svg
              className="h-5 w-5 sm:h-6 sm:w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg
              className="h-5 w-5 sm:h-6 sm:w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
          )}
        </button>
      )}
    </div>
  );
};
