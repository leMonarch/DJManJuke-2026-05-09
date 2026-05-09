import { useEffect, useRef, useCallback } from 'react';
import { useFullscreen } from '../hooks/useFullscreen';
import { useLanguage } from '../context/LanguageContext';
import { setFullscreenOnActiveTrack, clearFullscreenOnActiveTrack, shouldMaintainFullscreen, forceClearFullscreenOnActiveTrack, setAutoClosing, isAutoClosingFullscreen, confirmFullscreenActivated } from '../utils/fullscreenState';
import { getFullscreenContainer, updateFullscreenContent as updateGlobalFullscreenContent, setFullscreenActive, setPseudoFullscreen } from '../utils/fullscreenContainer';

type AudioCardProps = {
  imageSrc?: string | null;
  title: string;
  isActive?: boolean;
  isPreviewing?: boolean;
  isPlayerPlaying?: boolean;
  onPreview?: () => void;
  onTogglePlay?: () => void;
  audioSrc?: string;
  onPauseMainPlayer?: () => void;
  onResumeMainPlayer?: () => void;
  playerPositionSeconds?: number;
  isPro?: boolean;
  trackId?: number | null;
};

/**
 * AudioCard simplifié
 * - Affiche une image de couverture
 * - Bouton fullscreen en bas à droite
 * - En fullscreen : joue l'audio et met en pause le player principal
 * - Extrait 15s (Free) ou entier (Pro) via onPreview
 */
export const AudioCard = ({
  imageSrc,
  title,
  isActive = false,
  isPreviewing = false,
  isPlayerPlaying = false,
  onPreview,
  onTogglePlay,
  audioSrc,
  onPauseMainPlayer,
  onResumeMainPlayer,
  playerPositionSeconds = 0,
  isPro = false,
  trackId = null,
}: AudioCardProps) => {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenAudioRef = useRef<HTMLAudioElement | null>(null);

  // Gérer l'entrée en fullscreen
  const handleEnterFullscreen = () => {
    console.log('[AudioCard] 🎬 handleEnterFullscreen appelé', { isActive, trackId });
    
    // Si c'est le rang 1, utiliser le conteneur fullscreen global
    if (isActive) {
      const globalContainer = getFullscreenContainer();
      if (globalContainer) {
        // Mettre à jour le contenu du conteneur global
        updateGlobalFullscreenContent({
          type: 'audio',
          imageSrc: imageSrc || null,
          title: title,
          trackId: trackId,
          isActive: true,
        });
        
        // Activer le fullscreen sur le conteneur global
        const fullscreenAPI = {
          request: (element: HTMLElement) => {
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
          },
        };
        
        fullscreenAPI.request(globalContainer).then(() => {
          setFullscreenOnActiveTrack(true, trackId);
          setFullscreenActive(true);
          setPseudoFullscreen(false); // Désactiver le pseudo-fullscreen si le vrai fonctionne
          confirmFullscreenActivated();
          console.log('[AudioCard] ✅ Rang 1 : fullscreen activé sur le conteneur global', { trackId });
        }).catch((error: unknown) => {
          console.warn('[AudioCard] Erreur lors de l\'activation du fullscreen global:', error);
        });
      } else {
        console.warn('[AudioCard] Conteneur fullscreen global non disponible');
      }
      return;
    }
    
    // Pour les autres rangs (extrait 15s ou entier), comportement normal
    console.log('[AudioCard] ⚠️ Pas le rang 1, comportement extrait/entier');
    
    // Mettre en pause le player principal
    onPauseMainPlayer?.();

    // Si on a une source audio, créer et jouer l'élément audio
    if (audioSrc && containerRef.current) {
      // Créer l'élément audio s'il n'existe pas
      if (!fullscreenAudioRef.current) {
        const audio = document.createElement('audio');
        audio.src = audioSrc;
        audio.controls = false;
        audio.loop = false;
        audio.preload = 'auto';
        audio.style.position = 'absolute';
        audio.style.opacity = '0';
        audio.style.pointerEvents = 'none';
        audio.style.width = '1px';
        audio.style.height = '1px';
        
        // Écouter la fin de la chanson - ne pas fermer le fullscreen, juste arrêter l'audio
        // La transition vers la nouvelle chanson se fera automatiquement
        audio.addEventListener('ended', () => {
          console.log('[AudioCard] 🎵 Audio terminé en fullscreen, transition vers la nouvelle chanson', {
            trackId,
            isActive,
            audioSrc
          });
          // Ne pas fermer le fullscreen - on va juste changer le contenu
          // L'état sera préservé et la nouvelle chanson prendra le relais
          // L'événement sera déclenché par PlaceJukebox quand la nouvelle chanson devient active
        });
        
        fullscreenAudioRef.current = audio;
        containerRef.current.appendChild(audio);
      }

      const audio = fullscreenAudioRef.current;

      // Synchroniser la position si c'est le rang 1
      if (isActive && Number.isFinite(playerPositionSeconds) && playerPositionSeconds > 0) {
        try {
          audio.currentTime = playerPositionSeconds;
        } catch {
          // Ignorer les erreurs
        }
      }

      // Jouer l'audio
      if (audio.readyState >= 2) {
        audio.play().catch((error) => {
          console.warn('Erreur lors de la lecture audio en fullscreen:', error);
        });
      } else {
        const handleCanPlay = () => {
          audio.removeEventListener('canplay', handleCanPlay);
          if (isActive && Number.isFinite(playerPositionSeconds) && playerPositionSeconds > 0) {
            try {
              audio.currentTime = playerPositionSeconds;
            } catch {
              // Ignorer les erreurs
            }
          }
          audio.play().catch((error) => {
            console.warn('Erreur lors de la lecture audio en fullscreen:', error);
          });
        };
        audio.addEventListener('canplay', handleCanPlay, { once: true });
        audio.load();
      }
    }
  };

  // Gérer la sortie du fullscreen
  const handleExitFullscreen = () => {
    const wasAutoClosing = isAutoClosingFullscreen();
    console.log('[AudioCard] handleExitFullscreen', { isActive, trackId, wasAutoClosing });
    
    // Si c'est le rang 1, utiliser le conteneur global
    if (isActive) {
      setFullscreenActive(false);
      console.log('[AudioCard] Rang 1 : sortie du fullscreen, lecteur principal continue normalement');
      // Ne pas effacer l'état si c'est une transition vers une nouvelle chanson
      // L'état sera utilisé par la nouvelle chanson quand elle deviendra active
      return;
    }
    
    // Pour les autres rangs, nettoyer l'audio en fullscreen
    if (fullscreenAudioRef.current) {
      fullscreenAudioRef.current.pause();
      fullscreenAudioRef.current.currentTime = 0;
    }

    // Si c'était une fermeture automatique (fin de chanson), ne pas reprendre le player principal
    // La nouvelle chanson va démarrer automatiquement
    if (wasAutoClosing) {
      console.log('[AudioCard] Fermeture automatique, ne pas reprendre le player principal');
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
    onEnterFullscreen: handleEnterFullscreen,
    onExitFullscreen: handleExitFullscreen,
  });

  // Quand cette carte devient active (rang 1) et qu'on était en fullscreen sur la chanson précédente, activer le fullscreen
  const prevIsActiveRef = useRef(isActive);
  const prevTrackIdRef = useRef<number | null>(trackId);
  
  // Refs pour stabiliser les valeurs dans les callbacks
  const isActiveRef = useRef(isActive);
  const trackIdRef = useRef(trackId);
  const audioSrcRef = useRef(audioSrc);
  const imageSrcRef = useRef(imageSrc);
  const titleRef = useRef(title);
  const playerPositionSecondsRef = useRef(playerPositionSeconds);
  
  useEffect(() => {
    isActiveRef.current = isActive;
    trackIdRef.current = trackId;
    audioSrcRef.current = audioSrc;
    imageSrcRef.current = imageSrc;
    titleRef.current = title;
    playerPositionSecondsRef.current = playerPositionSeconds;
  }, [isActive, trackId, audioSrc, imageSrc, title, playerPositionSeconds]);

  // Fonction pour mettre à jour le contenu en fullscreen (transition fluide)
  const updateFullscreenContent = useCallback(() => {
    const currentIsActive = isActiveRef.current;
    const currentTrackId = trackIdRef.current;
    const currentAudioSrc = audioSrcRef.current;
    
    if (!currentIsActive || currentTrackId === null || !containerRef.current) {
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
      // Pour le rang 1, on ne crée pas d'audio séparé - le lecteur principal continue à jouer
      // On met juste à jour l'image affichée (qui se met à jour automatiquement via les props)
      if (currentIsActive) {
        // Pour le rang 1, utiliser le conteneur global
        const globalContainer = getFullscreenContainer();
        if (globalContainer) {
          updateGlobalFullscreenContent({
            type: 'audio',
            imageSrc: imageSrcRef.current || null,
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
      
      // Pour les autres rangs, créer ou mettre à jour l'audio si nécessaire
      if (!fullscreenAudioRef.current && currentAudioSrc && containerRef.current) {
        const audio = document.createElement('audio');
        audio.src = audioSrc || '';
        audio.controls = false;
        audio.loop = false;
        audio.preload = 'auto';
        audio.style.position = 'absolute';
        audio.style.opacity = '0';
        audio.style.pointerEvents = 'none';
        audio.style.width = '1px';
        audio.style.height = '1px';
        
        fullscreenAudioRef.current = audio;
        containerRef.current.appendChild(audio);
      }
      
      // Mettre à jour l'audio si nécessaire
      if (fullscreenAudioRef.current && currentAudioSrc) {
        const audio = fullscreenAudioRef.current;
        const currentSrc = audio.src || '';
        const newSrc = currentAudioSrc;
        
        // Toujours mettre à jour la source et recharger pour la nouvelle chanson
        if (currentSrc !== newSrc || !currentSrc) {
          audio.pause();
          audio.src = currentAudioSrc;
          audio.load();
          
          // Synchroniser la position si nécessaire
          const position = playerPositionSecondsRef.current;
          if (Number.isFinite(position) && position >= 0) {
            const handleCanPlay = () => {
              audio.removeEventListener('canplay', handleCanPlay);
              try {
                audio.currentTime = position;
              } catch {
                // Ignorer les erreurs
              }
              audio.play().catch(() => {
                // Ignorer les erreurs
              });
            };
            audio.addEventListener('canplay', handleCanPlay, { once: true });
          } else {
            const handleCanPlay = () => {
              audio.removeEventListener('canplay', handleCanPlay);
              audio.play().catch(() => {
                // Ignorer les erreurs
              });
            };
            audio.addEventListener('canplay', handleCanPlay, { once: true });
          }
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
            type: 'audio',
            imageSrc: imageSrcRef.current || null,
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

  // Nettoyer l'élément audio quand on sort du fullscreen
  useEffect(() => {
    if (!isFullscreen && fullscreenAudioRef.current) {
      const audio = fullscreenAudioRef.current;
      if (audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
      fullscreenAudioRef.current = null;
    }
  }, [isFullscreen]);

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
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={`${title} cover`}
          className="h-full w-full object-cover transition-opacity duration-500"
          key={`${trackId}-${imageSrc}`}
          loading="lazy"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const placeholder = target.nextElementSibling as HTMLElement;
            if (placeholder && placeholder.classList.contains('image-placeholder')) {
              placeholder.style.display = 'flex';
            }
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-white/40 image-placeholder">Artwork à venir</div>
      )}
      {imageSrc && (
        <div className="hidden h-full items-center justify-center text-white/40 image-placeholder">
          Artwork à venir
        </div>
      )}

      {!isActive && (
        <button
          type="button"
          onClick={onPreview}
          className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition hover:opacity-100 active:opacity-100"
          aria-label={isPro ? `${t('song.preview')} - ${t('song.listenFull')}` : `${t('song.preview')} - ${t('song.listen15s')}`}
          title={isPro ? `${t('song.preview')} - ${t('song.listenFull')}` : `${t('song.preview')} - ${t('song.listen15s')}`}
        >
          <span className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/70 text-white">
            <svg className="h-6 w-6 sm:h-8 sm:w-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}

      {/* Bouton fullscreen */}
      {imageSrc && (
        <button
          type="button"
          onClick={() => {
            // Si on sort manuellement du fullscreen, forcer l'effacement de l'état
            if (isFullscreen) {
              forceClearFullscreenOnActiveTrack();
            }
            toggleFullscreen();
          }}
          className={`absolute bottom-2 right-2 z-30 flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full bg-black/90 p-2.5 text-white shadow-xl transition hover:bg-black hover:scale-110 active:scale-95 cursor-pointer ${isFullscreen ? 'z-[55]' : ''}`}
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

      {/* Bouton play/pause en fullscreen */}
      {isFullscreen && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-none">
          <button
            type="button"
            onClick={() => {
              if (isActive && onTogglePlay) {
                onTogglePlay();
              } else if (fullscreenAudioRef.current) {
                const audio = fullscreenAudioRef.current;
                if (audio.paused) {
                  audio.play().catch((error) => {
                    console.warn('Erreur lors de la lecture audio:', error);
                  });
                } else {
                  audio.pause();
                }
              }
            }}
            className="inline-flex min-h-[56px] min-w-[56px] sm:h-16 sm:w-16 items-center justify-center rounded-full bg-black/80 text-white shadow-xl transition hover:bg-black hover:scale-110 active:scale-95 cursor-pointer pointer-events-auto"
            title={
              isActive && isPlayerPlaying
                ? t('song.pause')
                : isActive && !isPlayerPlaying
                  ? t('song.play')
                  : fullscreenAudioRef.current && !fullscreenAudioRef.current.paused
                    ? t('song.pause')
                    : t('song.play')
            }
            aria-label={
              isActive && isPlayerPlaying
                ? t('song.pause')
                : isActive && !isPlayerPlaying
                  ? t('song.play')
                  : fullscreenAudioRef.current && !fullscreenAudioRef.current.paused
                    ? t('song.pause')
                    : t('song.play')
            }
          >
            {(isActive && isPlayerPlaying) ||
            (fullscreenAudioRef.current && !fullscreenAudioRef.current.paused) ? (
              <svg
                className="h-7 w-7 sm:h-8 sm:w-8"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg
                className="h-7 w-7 sm:h-8 sm:w-8 ml-1"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
