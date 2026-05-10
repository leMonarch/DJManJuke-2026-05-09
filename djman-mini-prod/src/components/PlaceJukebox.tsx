import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { io, type Socket } from 'socket.io-client';
import { Product } from './Product';
import { JukeboxCard } from './JukeboxCard';
import { jukeboxListService } from '../services/jukeboxListService';
import { usePlaylist } from '../hooks/usePlaylist';
import type { Track } from '../types/music';
import { useJukebox } from '../context/JukeboxContext';
import { playlistService } from '../services/playlistService';
import { paymentService } from '../services/paymentService';
import { apiClient } from '../services/apiClient';
import { PLAYLIST_REFRESH_EVENT, BALANCE_REFRESH_EVENT } from '../constants/jukebox';
import { buildFiveWaySplitMessage } from '../utils/revenueMessages';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { setFullscreenContainer, updateFullscreenContent, getFullscreenActive, setFullscreenActive, setPseudoFullscreen, getPseudoFullscreen } from '../utils/fullscreenContainer';
import { getFullscreenOnActiveTrack, setFullscreenOnActiveTrack } from '../utils/fullscreenState';

type PlaceJukeboxProps = {
  slug: string;
  hideInterface?: boolean;
};

// Wrapper lâche pour permettre de passer des props additionnelles (ex. synchro vidéo)
// sans bloquer sur le typage strict de Product dans ce fichier.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ProductAny: any = Product;

export const PlaceJukebox = ({ slug, hideInterface = false }: PlaceJukeboxProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewTimeoutRef = useRef<number | null>(null);
  const resumeTimeRef = useRef<number>(0);
  const wasPlayingRef = useRef<boolean>(false);
  const currentTrackIdRef = useRef<number | null>(null);
  // Refs pour gérer la pause du player principal en fullscreen
  const wasPlayingForFullscreenRef = useRef<boolean>(false);
  const resumeTimeForFullscreenRef = useRef<number>(0);
  const lastCompletedTrackIdRef = useRef<number | null>(null);
  const hasAutoStartedRef = useRef<boolean>(false);
  const autoplayRetryTimeoutRef = useRef<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // Refs pour éviter les problèmes de closure dans les handlers WebSocket
  const playbackModeRef = useRef<'public' | 'private'>('private');
  const isMasterDeviceRef = useRef<boolean>(false);
  // Refs pour suivre l'état précédent et éviter les actions redondantes
  const previousPlaybackModeRef = useRef<'public' | 'private'>('private');
  const previousIsMasterDeviceRef = useRef<boolean>(false);
  const previousActiveTrackIdRef = useRef<number | null>(null);
  // Refs pour la synchronisation audio continue
  const playbackStartedAtRef = useRef<number | null>(null);
  const syncIntervalRef = useRef<number | null>(null);
  const playbackRateAdjustmentRef = useRef<number | null>(null);
  const playbackRateTimeoutRef = useRef<number | null>(null);
  const serverOffsetRef = useRef<number>(0); // Offset serveur pour compensation de latence
  const isAggressiveModeRef = useRef<boolean>(false);
  const stableSinceRef = useRef<number>(Date.now());
  /** Seek serveur à appliquer quand `src` / métadonnées sont prêts (évite un `load()` qui remet la tête à 0). */
  const pendingPlaybackSyncRef = useRef<{ trackId: number; startedAt: number } | null>(null);
  /** Horodatage mural : fenêtre sans hard-seek agressif au démarrage (évite l’effet « redémarrage » ~0,5 s). */
  const playbackSyncGraceWallRef = useRef<number>(0);

  const markPlaybackSyncGrace = useCallback(() => {
    playbackSyncGraceWallRef.current = Date.now();
  }, []);

  // Écouter les changements de fullscreen pour mettre à jour l'état
  useEffect(() => {
    const handleFullscreenChange = () => {
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
      const isOurContainer = fullscreenContainerRef.current && fullscreenAPI.element === fullscreenContainerRef.current;
      
      console.log('[PlaceJukebox] 🔄 Changement de fullscreen détecté', {
        isInFullscreen,
        isOurContainer,
        fullscreenElement: fullscreenAPI.element,
        ourContainer: fullscreenContainerRef.current
      });
      
      if (isInFullscreen && isOurContainer) {
        setFullscreenActive(true);
        console.log('[PlaceJukebox] ✅ Fullscreen activé sur le conteneur global');
      } else if (!isInFullscreen) {
        // Ne pas désactiver immédiatement si on doit préserver (transition entre chansons)
        if (!getFullscreenOnActiveTrack()) {
          setFullscreenActive(false);
          setPseudoFullscreen(false); // Désactiver aussi le pseudo-fullscreen
          console.log('[PlaceJukebox] ❌ Fullscreen fermé (pas de transition)');
        } else {
          // Le fullscreen natif s'est fermé mais on veut maintenir l'expérience
          // Basculer en mode pseudo-fullscreen pour une transition fluide
          console.log('[PlaceJukebox] ⚠️ Fullscreen natif fermé, basculement en pseudo-fullscreen pour transition fluide');
          setFullscreenActive(false);
          setPseudoFullscreen(true);
        }
      }
    };
    
    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
    events.forEach((event) => {
      document.addEventListener(event, handleFullscreenChange);
    });
    
    // Gérer la touche ESC pour sortir du pseudo-fullscreen
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && getPseudoFullscreen()) {
        setPseudoFullscreen(false);
        setFullscreenOnActiveTrack(false);
        console.log('[PlaceJukebox] 🚪 Sortie du pseudo-fullscreen via ESC');
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleFullscreenChange);
      });
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
  
  const [previewTrack, setPreviewTrack] = useState<Track | null>(null);
  const [showGoldenOnly, setShowGoldenOnly] = useState<boolean>(false);
  const [showJukeboxes, setShowJukeboxes] = useState<boolean>(false);
  const [jukeboxes, setJukeboxes] = useState<any[]>([]);
  const [isLoadingJukeboxes, setIsLoadingJukeboxes] = useState<boolean>(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const fullscreenContainerSetRef = useRef<boolean>(false);
  
  // Définir le conteneur fullscreen une seule fois quand il est monté
  useEffect(() => {
    const container = fullscreenContainerRef.current;
    if (container && !fullscreenContainerSetRef.current) {
      setFullscreenContainer(container);
      fullscreenContainerSetRef.current = true;
    }
    
    return () => {
      // Nettoyer seulement lors du vrai démontage (pas lors du double render de StrictMode)
      // On vérifie que le ref est toujours le même pour éviter les nettoyages prématurés
      if (fullscreenContainerSetRef.current && fullscreenContainerRef.current === container) {
        setFullscreenContainer(null);
        fullscreenContainerSetRef.current = false;
      }
    };
  }, []);
  const [fullscreenContent, setFullscreenContent] = useState<{
    type: 'audio' | 'video';
    imageSrc?: string | null;
    thumbnailSrc?: string | null;
    title: string;
    trackId: number | null;
  } | null>(null);

  const {
    tracks,
    activeTrack,
    playNext,
    refreshPlaylist,
    fetchPlaylist,
    searchInput,
    setSearchInput,
    searchTerm,
    queueLength,
    playbackState,
  } = usePlaylist(slug);
  const { openPaymentModal, openTrackPurchaseModal } = useJukebox();
  const { t } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const activeTrackId = activeTrack?.id ?? null;
  
  // Écouter les mises à jour du contenu fullscreen
  useEffect(() => {
    const handleFullscreenContentUpdate = (event: CustomEvent) => {
      const content = event.detail;
      setFullscreenContent(content);
      console.log('[PlaceJukebox] 📺 Contenu fullscreen mis à jour', content);
    };
    
    window.addEventListener('fullscreenContentUpdate', handleFullscreenContentUpdate as EventListener);
    return () => {
      window.removeEventListener('fullscreenContentUpdate', handleFullscreenContentUpdate as EventListener);
    };
  }, []);
  
  // Mettre à jour le contenu fullscreen quand la chanson active change et qu'on est en fullscreen
  useEffect(() => {
    if (activeTrack) {
      // Vérifier si on est en fullscreen (soit via l'état, soit via l'API du navigateur)
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
      const isOurContainer = fullscreenContainerRef.current && fullscreenAPI.element === fullscreenContainerRef.current;
      
      // Vérifier si on doit maintenir le fullscreen (via l'état global)
      const shouldMaintain = getFullscreenOnActiveTrack();
      const shouldUpdate = shouldMaintain || isInFullscreen || getPseudoFullscreen();
      
      console.log('[PlaceJukebox] 🔍 Vérification du fullscreen', {
        shouldMaintain,
          isInFullscreen,
          isOurContainer,
          shouldUpdate,
          isPseudoFullscreen: getPseudoFullscreen(),
          trackId: activeTrack.id
        });
        
        if (shouldUpdate) {
        const isVideo = activeTrack.is_video ?? (typeof activeTrack.file_path === 'string' && activeTrack.file_path.toLowerCase().endsWith('.mp4'));
        
        console.log('[PlaceJukebox] 📺 Mise à jour du contenu fullscreen pour la nouvelle chanson active', {
          trackId: activeTrack.id,
          isVideo,
          isFullscreenActive: getFullscreenActive(),
          isInFullscreen,
          isOurContainer
        });
        
        if (isVideo) {
          updateFullscreenContent({
            type: 'video',
            thumbnailSrc: activeTrack.image || null,
            title: activeTrack.title || '',
            trackId: activeTrack.id,
            isActive: true,
          });
        } else {
          updateFullscreenContent({
            type: 'audio',
            imageSrc: activeTrack.image || null,
            title: activeTrack.title || '',
            trackId: activeTrack.id,
            isActive: true,
          });
        }
        
        // Si on doit maintenir le fullscreen mais qu'on n'est pas en fullscreen natif
        // Utiliser le pseudo-fullscreen CSS pour une transition fluide
        if (shouldMaintain && !isInFullscreen && !isOurContainer) {
          console.log('[PlaceJukebox] 🎬 Activation du pseudo-fullscreen CSS pour transition fluide');
          setPseudoFullscreen(true);
        }
        
        // Si on doit maintenir le fullscreen mais qu'on n'est pas en fullscreen sur notre conteneur
        // Vérifier si on doit activer le fullscreen sur le conteneur global (tentative native)
        if (shouldUpdate && !isOurContainer && isInFullscreen && fullscreenContainerRef.current) {
          console.log('[PlaceJukebox] 🔄 Activation du fullscreen sur le conteneur global pour la nouvelle chanson');
          
          // Si on est en fullscreen sur un autre élément, sortir d'abord
          if (isInFullscreen) {
            const exitFullscreen = () => {
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
              return Promise.resolve();
            };
            
            exitFullscreen().then(() => {
              // Attendre un peu avant d'activer le fullscreen sur le conteneur global
              setTimeout(() => {
                if (fullscreenContainerRef.current) {
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
                  
                  requestFullscreen(fullscreenContainerRef.current).then(() => {
                    setFullscreenActive(true);
                    setPseudoFullscreen(false); // Désactiver le pseudo-fullscreen si le vrai fonctionne
                    console.log('[PlaceJukebox] ✅ Fullscreen activé sur le conteneur global');
                  }).catch((error: unknown) => {
                    console.warn('[PlaceJukebox] ⚠️ Erreur lors de l\'activation du fullscreen (peut être bloqué par le navigateur):', error);
                    // Si le fullscreen natif échoue, basculer en pseudo-fullscreen
                    if (shouldMaintain) {
                      console.log('[PlaceJukebox] 🎬 Basculement en pseudo-fullscreen CSS');
                      setPseudoFullscreen(true);
                    }
                  });
                }
              }, 200);
            });
          } else {
            // Si on n'est pas en fullscreen, essayer d'activer directement
            setTimeout(() => {
              if (fullscreenContainerRef.current) {
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
                
                requestFullscreen(fullscreenContainerRef.current).then(() => {
                  setFullscreenActive(true);
                  setPseudoFullscreen(false); // Désactiver le pseudo-fullscreen si le vrai fonctionne
                  console.log('[PlaceJukebox] ✅ Fullscreen activé sur le conteneur global');
                }).catch((error: unknown) => {
                  console.warn('[PlaceJukebox] ⚠️ Erreur lors de l\'activation du fullscreen (peut être bloqué par le navigateur):', error);
                  // Si le fullscreen natif échoue, basculer en pseudo-fullscreen
                  if (shouldMaintain) {
                    console.log('[PlaceJukebox] 🎬 Basculement en pseudo-fullscreen CSS');
                    setPseudoFullscreen(true);
                  }
                });
              }
            }, 100);
          }
        }
      }
    }
  }, [activeTrack]);
  
  // Préserver l'état fullscreen quand la chanson active change (transition entre chansons)
  const prevActiveTrackIdRef = useRef<number | null>(activeTrackId);
  useEffect(() => {
    const prevId = prevActiveTrackIdRef.current;
    
    prevActiveTrackIdRef.current = activeTrackId;
    
    // Si la chanson active change et qu'on était en fullscreen, préserver l'état
    if (activeTrackId !== null && activeTrackId !== prevId && prevId !== null) {
      // Vérifier l'état fullscreen
      const wasInFullscreen = getFullscreenOnActiveTrack();
      
      if (wasInFullscreen) {
        // Préserver l'état pour la nouvelle chanson
        setFullscreenOnActiveTrack(true, prevId);
        
        // Déclencher un événement personnalisé pour que les composants Product puissent réagir
        window.dispatchEvent(new CustomEvent('activeTrackChanged', { 
          detail: { 
            prevId, 
            newId: activeTrackId,
            shouldMaintainFullscreen: true
          } 
        }));
      }
    }
  }, [activeTrackId]);

  // Décocher automatiquement le mode jukebox quand le slug change
  useEffect(() => {
    setShowJukeboxes(false);
  }, [slug]);

  // Charger les jukebox quand on active la vue jukebox
  useEffect(() => {
    if (showJukeboxes) {
      setIsLoadingJukeboxes(true);
      jukeboxListService
        .getAllJukeboxes()
        .then((data) => {
          setJukeboxes(data);
        })
        .catch((error) => {
          console.error('Erreur lors du chargement des jukebox:', error);
          toast.error(t('toast.jukeboxListError'));
        })
        .finally(() => {
          setIsLoadingJukeboxes(false);
        });
    }
  }, [showJukeboxes]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerPosition, setPlayerPosition] = useState(0);
  const [playbackMode, setPlaybackMode] = useState<'public' | 'private'>('private');
  const [isMasterDevice, setIsMasterDevice] = useState(false);

  // Synchroniser les refs avec les états
  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);

  useEffect(() => {
    isMasterDeviceRef.current = isMasterDevice;
  }, [isMasterDevice]);

  const PREVIEW_DURATION_MS = 15_000; // 15 secondes pour le plan Free
  const PREVIEW_DURATION_PRO_MS = Infinity; // Chanson complète pour le plan Pro

  const canForceSkip = Boolean(user && (user.role === 'admin' || user.jukebox?.slug === slug));

  // À chaque arrivée sur un slug de jukebox, on oublie toute piste "complétée"
  // précédente pour ne pas bloquer l'autoplay de la première chanson.
  useEffect(() => {
    lastCompletedTrackIdRef.current = null;
    pendingPlaybackSyncRef.current = null;
  }, [slug]);

  const clearPreviewTimer = () => {
    if (previewTimeoutRef.current) {
      window.clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
  };

  // Fonction pour réinitialiser le playbackRate à 1.0
  const resetPlaybackRate = useCallback(() => {
    const player = audioRef.current;
    if (player && playbackRateAdjustmentRef.current !== null) {
      player.playbackRate = 1.0;
      playbackRateAdjustmentRef.current = null;
      if (playbackRateTimeoutRef.current) {
        window.clearTimeout(playbackRateTimeoutRef.current);
        playbackRateTimeoutRef.current = null;
      }
    }
  }, []);

  // Fonction pour corriger avec playbackRate (correction douce, sans saccade)
  const correctWithPlaybackRate = useCallback((driftMs: number) => {
    const player = audioRef.current;
    if (!player || player.paused) {
      return;
    }

    // Réinitialiser toute correction précédente
    resetPlaybackRate();

    // Déterminer le taux de correction (selon la spec: rateUp 1.02, rateDown 0.98)
    const rateUp = 1.02;
    const rateDown = 0.98;
    const correctionRate = driftMs > 0 ? rateUp : rateDown;

    // Appliquer la correction
    try {
      player.playbackRate = correctionRate;
      playbackRateAdjustmentRef.current = correctionRate;

      // Réinitialiser après 3 secondes (selon spec: maxDuration 3000ms)
      playbackRateTimeoutRef.current = window.setTimeout(() => {
        resetPlaybackRate();
      }, 3000);
    } catch (error) {
      // Ignorer les erreurs silencieusement
    }
  }, [resetPlaybackRate]);

  // Fonction pour synchroniser immédiatement (appelée après chargement du fichier)
  const syncImmediately = useCallback(() => {
    const player = audioRef.current;
    const startedAt = playbackStartedAtRef.current;

    if (!player || !startedAt || player.paused) {
      return;
    }

    // Calculer la position attendue avec compensation de latence
    const now = Date.now() + serverOffsetRef.current;
    const expectedPosition = Math.max(0, (now - startedAt) / 1000);
    const currentPosition = player.currentTime || 0;
    const driftMs = (expectedPosition - currentPosition) * 1000; // en millisecondes
    const driftAbs = Math.abs(driftMs);

    // Seuils selon la spec: normal 200ms, aggressive 600ms, hard 800ms
    if (driftAbs > 800) {
      const inGrace = Date.now() - playbackSyncGraceWallRef.current < 3500;
      // Au tout début, un faux « gros » drift est fréquent (buffer + horloge) : éviter le seek brutal.
      if (inGrace && driftAbs < 2500) {
        if (driftAbs > 200) {
          correctWithPlaybackRate(driftMs);
        }
      } else if (Number.isFinite(expectedPosition)) {
        try {
          player.currentTime = expectedPosition;
          resetPlaybackRate();
        } catch (error) {
          // Ignorer les erreurs silencieusement
        }
      }
    } else if (driftAbs > 600) {
      // Aggressive: correction avec playbackRate
      correctWithPlaybackRate(driftMs);
    } else if (driftAbs > 200) {
      // Normal: correction douce avec playbackRate
      correctWithPlaybackRate(driftMs);
    }
    // Si driftAbs <= 200ms: pas de correction (selon spec)
  }, [correctWithPlaybackRate, resetPlaybackRate]);

  // Fonction pour démarrer la synchronisation audio continue
  const startAudioSync = useCallback(() => {
    // Arrêter toute synchronisation existante
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      clearTimeout(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    resetPlaybackRate();

    // En mode public, tous les devices se synchronisent avec le serveur
    // (pas besoin de vérifier isMasterDevice ici)

    // Synchronisation selon la spec SyncEngine
    // Seuils: normal 200ms, aggressive 600ms, hard 800ms
    // Fréquences: normal 5000ms, aggressive 1000ms
    const syncStartTime = Date.now();
    const stableDuration = 15000; // 15 secondes stables avant de revenir en normal
    
    const syncFunction = () => {
      const player = audioRef.current;
      const startedAt = playbackStartedAtRef.current;

      if (!player || !startedAt || player.paused) {
        return;
      }

      // Calculer la position attendue avec compensation de latence
      const now = Date.now() + serverOffsetRef.current;
      const expectedPosition = Math.max(0, (now - startedAt) / 1000);
      const currentPosition = player.currentTime || 0;
      const driftMs = (expectedPosition - currentPosition) * 1000; // en millisecondes
      const driftAbs = Math.abs(driftMs);

      // Mode adaptatif: passer en agressif si drift > seuil normal
      if (!isAggressiveModeRef.current && driftAbs > 200) {
        isAggressiveModeRef.current = true;
        stableSinceRef.current = Date.now();
      } else if (isAggressiveModeRef.current && driftAbs <= 200) {
        // Revenir en normal après 15s stables
        if (Date.now() - stableSinceRef.current >= stableDuration) {
          isAggressiveModeRef.current = false;
        }
      } else if (isAggressiveModeRef.current && driftAbs > 200) {
        // Réinitialiser le compteur si on dépasse encore le seuil
        stableSinceRef.current = Date.now();
      }

      // Appliquer les corrections selon les seuils de la spec
      if (driftAbs > 800) {
        const inGrace = Date.now() - playbackSyncGraceWallRef.current < 3500;
        if (inGrace && driftAbs < 2500) {
          if (driftAbs > 200) {
            correctWithPlaybackRate(driftMs);
          }
        } else if (Number.isFinite(expectedPosition)) {
          try {
            player.currentTime = expectedPosition;
            resetPlaybackRate();
          } catch (error) {
            // Ignorer les erreurs silencieusement
          }
        }
      } else if (driftAbs > 600) {
        // Aggressive: correction avec playbackRate
        correctWithPlaybackRate(driftMs);
      } else if (driftAbs > 200) {
        // Normal: correction douce avec playbackRate
        correctWithPlaybackRate(driftMs);
      } else {
        // Pas de correction si drift <= 200ms
        resetPlaybackRate();
      }
    };

    // Mode adaptatif: fréquence selon le mode (normal 5000ms, aggressive 1000ms)
    // Commencer en mode agressif pour les 10 premières secondes
    const initialAggressiveDuration = 10000;
    let currentInterval = 1000; // Commencer en mode agressif (1000ms)

    const runAdaptiveSync = () => {
      syncFunction();
      
      // Ajuster la fréquence selon le mode et le temps écoulé
      const elapsed = Date.now() - syncStartTime;
      if (elapsed < initialAggressiveDuration) {
        // Période initiale agressive: 1000ms
        currentInterval = 1000;
      } else {
        // Mode adaptatif: 1000ms si agressif, 5000ms si normal
        currentInterval = isAggressiveModeRef.current ? 1000 : 5000;
      }
    };

    // Fonction récursive pour intervalle adaptatif
    const scheduleNext = () => {
      runAdaptiveSync();
      syncIntervalRef.current = window.setTimeout(scheduleNext, currentInterval) as unknown as number;
    };

    // Démarrer la synchronisation adaptative
    scheduleNext();
  }, [correctWithPlaybackRate, resetPlaybackRate]);

  // Fonction pour arrêter la synchronisation
  const stopAudioSync = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      clearTimeout(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    resetPlaybackRate();
    playbackStartedAtRef.current = null;
  }, [resetPlaybackRate]);

  const playWithAutoplaySafeguards = useCallback(() => {
    const player = audioRef.current;
    if (!player) {
      return;
    }

    if (autoplayRetryTimeoutRef.current) {
      window.clearTimeout(autoplayRetryTimeoutRef.current);
      autoplayRetryTimeoutRef.current = null;
    }

    const ensureUnmuted = () => {
      if (!hasAutoStartedRef.current) {
        window.setTimeout(() => {
          const currentPlayer = audioRef.current;
          if (!currentPlayer) {
            return;
          }

          currentPlayer.muted = false;
          hasAutoStartedRef.current = true;
        }, 150);
      }
    };

    const attemptPlayback = () => {
      const playPromise = player.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            ensureUnmuted();
          })
          .catch(() => {
            if (hasAutoStartedRef.current) {
              return;
            }

            if (!player.muted) {
              player.muted = true;
            }

            if (autoplayRetryTimeoutRef.current) {
              window.clearTimeout(autoplayRetryTimeoutRef.current);
            }

            autoplayRetryTimeoutRef.current = window.setTimeout(() => {
              autoplayRetryTimeoutRef.current = null;
              attemptPlayback();
            }, 300);
          });
      } else {
        ensureUnmuted();
      }
    };

    if (!hasAutoStartedRef.current) {
      player.muted = true;
    }

    attemptPlayback();
  }, []);

  // Ref pour stocker previewTrack et éviter les dépendances circulaires
  const previewTrackRef = useRef<Track | null>(null);
  
  // Synchroniser la ref avec l'état
  useEffect(() => {
    previewTrackRef.current = previewTrack;
  }, [previewTrack]);

  const stopPreview = useCallback(
    (resumePlayback: boolean) => {
      // Utiliser les refs pour avoir les valeurs les plus récentes
      const currentPlaybackMode = playbackModeRef.current;
      const currentIsMasterDevice = isMasterDeviceRef.current;

      // Vérifier si on était vraiment en train de preview pour éviter les logs inutiles
      const wasPreviewing = previewTrackRef.current !== null || previewAudioRef.current?.src;

      if (wasPreviewing) {
        // eslint-disable-next-line no-console
        console.log('[PREVIEW] ⏹️ Arrêt preview', {
          resumePlayback,
          playbackMode: currentPlaybackMode,
          isMasterDevice: currentIsMasterDevice,
        });
      }

      clearPreviewTimer();
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
        previewAudioRef.current.removeAttribute('src');
        previewAudioRef.current.load();
      }

      // Détecter si on est propriétaire du jukebox
      const isOwner = user?.jukebox?.slug === slug;

      // En mode public, tous les devices peuvent reprendre la lecture principale
      // En mode privé, seul le propriétaire peut reprendre
      const shouldResume =
        resumePlayback &&
        audioRef.current &&
        activeTrack &&
        (currentPlaybackMode === 'private' ? isOwner : true);
      
      // Ne mettre à jour l'état que si on était vraiment en train de preview
      if (wasPreviewing) {
        setPreviewTrack(null);
      }

      if (shouldResume && audioRef.current && wasPreviewing) {
        audioRef.current.currentTime = resumeTimeRef.current;
        if (wasPlayingRef.current) {
          // eslint-disable-next-line no-console
          console.log('[PREVIEW] ▶️ Reprise audio principal après preview', {
            resumeTime: resumeTimeRef.current,
          });
          audioRef.current.play().catch(() => {});
        }
      } else if (wasPreviewing) {
        // eslint-disable-next-line no-console
        console.log('[PREVIEW] 🔊 Audio principal non repris (client ou visiteur)', {
          shouldResume,
          isOwner,
          resumePlayback,
          playbackMode: currentPlaybackMode,
          isMasterDevice: currentIsMasterDevice,
        });
      }

      wasPlayingRef.current = false;
    },
    [activeTrack, user, slug],
  );

  const startPreview = useCallback(
    (track: Track) => {
      if (!previewAudioRef.current) {
        return;
      }

      // Arrêter la synchronisation audio avant de démarrer le preview
      stopAudioSync();

      stopPreview(false);

      // Détecter si on est propriétaire du jukebox
      const isOwner = user?.jukebox?.slug === slug;

      // Utiliser les refs pour avoir les valeurs les plus récentes
      const currentPlaybackMode = playbackModeRef.current;
      const currentIsMasterDevice = isMasterDeviceRef.current;

      // Le preview doit toujours fonctionner, peu importe le mode
      // On met en pause l'audio principal seulement si :
      // 1. On est propriétaire OU utilisateur Pro
      // 2. L'audio principal est actif (en lecture)
      const isPro = user?.plan === 'pro';
      const isAudioMainActive = audioRef.current && !audioRef.current.paused;
      const shouldPauseMainPlayback = (isOwner || isPro) && isAudioMainActive;

      // eslint-disable-next-line no-console
      console.log('[PREVIEW] ▶️ Démarrage preview', {
        trackId: track.id,
        trackTitle: track.title,
        playbackMode: currentPlaybackMode,
        isMasterDevice: currentIsMasterDevice,
        isOwner,
        isPro,
        isAudioMainActive,
        shouldPauseMainPlayback,
      });

      if (shouldPauseMainPlayback && audioRef.current) {
        const wasPlaying = !audioRef.current.paused;
        wasPlayingRef.current = wasPlaying;
        resumeTimeRef.current = audioRef.current.currentTime;
        audioRef.current.pause();
        // eslint-disable-next-line no-console
        console.log('[PREVIEW] ⏸️ Audio principal mis en pause pour preview', {
          wasPlaying,
          resumeTime: resumeTimeRef.current,
        });
      } else {
        // Pas d'audio principal actif ou pas besoin de le mettre en pause
        wasPlayingRef.current = false;
        resumeTimeRef.current = 0;
        if (audioRef.current) {
          // eslint-disable-next-line no-console
          console.log('[PREVIEW] 🔊 Audio principal non interrompu', {
            playbackMode: currentPlaybackMode,
            isMasterDevice: currentIsMasterDevice,
            hasAudioRef: !!audioRef.current,
            audioPaused: audioRef.current.paused,
          });
        }
      }

      setPreviewTrack(track);
      const previewEl = previewAudioRef.current;
      if (!previewEl) {
        // eslint-disable-next-line no-console
        console.error('[PREVIEW] ❌ previewAudioRef.current est null');
        return;
      }

      previewEl.src = track.file_path;

      const beginPlayback = () => {
        const isPro = user?.plan === 'pro';
        const previewDuration = isPro ? PREVIEW_DURATION_PRO_MS : PREVIEW_DURATION_MS;
        
        let segmentDurationMs = previewDuration;
        
        if (isPro) {
          // Plan Pro: jouer la chanson complète depuis le début
          previewEl.currentTime = 0;
          segmentDurationMs = Infinity; // Pas de limite de temps
          // eslint-disable-next-line no-console
          console.log('[PREVIEW] 🎵 Plan Pro - lecture complète depuis le début', {
            trackId: track.id,
            trackTitle: track.title,
          });
        } else {
          // Plan Free: extrait de 15 secondes au milieu de la chanson
          if (Number.isFinite(previewEl.duration) && previewEl.duration > 0) {
            const segmentSeconds = PREVIEW_DURATION_MS / 1000;
            const midpoint = previewEl.duration / 2;
            const startSeconds = Math.max(midpoint - segmentSeconds / 2, 0);
            const endSeconds = Math.min(startSeconds + segmentSeconds, previewEl.duration);
            segmentDurationMs = Math.max((endSeconds - startSeconds) * 1000, 0);
            previewEl.currentTime = startSeconds;
          } else {
            previewEl.currentTime = 0;
          }
        }

        // eslint-disable-next-line no-console
        console.log('[PREVIEW] ▶️ Tentative de lecture', {
          trackId: track.id,
          trackTitle: track.title,
          isPro,
          src: previewEl.src,
          readyState: previewEl.readyState,
          duration: previewEl.duration,
          currentTime: previewEl.currentTime,
        });

        const playPromise = previewEl.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise
            .then(() => {
              // eslint-disable-next-line no-console
              console.log('[PREVIEW] ✅ Lecture démarrée avec succès', {
                trackId: track.id,
                isPro,
                duration: previewEl.duration,
              });
              // Pour le plan Pro, ne pas mettre de timeout (chanson complète)
              if (!isPro && segmentDurationMs !== Infinity) {
                previewTimeoutRef.current = window.setTimeout(() => {
                  stopPreview(true);
                }, segmentDurationMs || PREVIEW_DURATION_MS);
              }
              // Pour le plan Pro, le preview continue jusqu'à ce que l'utilisateur arrête manuellement
            })
            .catch((error) => {
              // eslint-disable-next-line no-console
              console.error('[PREVIEW] ❌ Erreur lors de la lecture', {
                trackId: track.id,
                error,
                src: previewEl.src,
                readyState: previewEl.readyState,
              });
              stopPreview(true);
            });
        } else {
          // eslint-disable-next-line no-console
          console.log('[PREVIEW] ✅ Lecture démarrée (promise non disponible)', {
            trackId: track.id,
            isPro,
          });
        }
      };

      if (previewEl.readyState >= 1) {
        beginPlayback();
      } else {
        // eslint-disable-next-line no-console
        console.log('[PREVIEW] ⏳ Attente du chargement des métadonnées', {
          trackId: track.id,
          readyState: previewEl.readyState,
        });
        const handleLoaded = () => {
          previewEl.removeEventListener('loadedmetadata', handleLoaded);
          // eslint-disable-next-line no-console
          console.log('[PREVIEW] ✅ Métadonnées chargées', {
            trackId: track.id,
            duration: previewEl.duration,
          });
          beginPlayback();
        };
        previewEl.addEventListener('loadedmetadata', handleLoaded, { once: true });
        previewEl.addEventListener('error', (e) => {
          // eslint-disable-next-line no-console
          console.error('[PREVIEW] ❌ Erreur de chargement du fichier audio', {
            trackId: track.id,
            src: previewEl.src,
            error: e,
          });
          stopPreview(true);
        }, { once: true });
        previewEl.load();
      }
    },
    [stopPreview, user, slug, stopAudioSync],
  );

  const handlePreviewRequest = useCallback(
    (track: Track) => {
      // Utiliser la ref pour éviter les dépendances circulaires
      if (previewTrackRef.current?.id === track.id) {
        stopPreview(true);
        return;
      }
      startPreview(track);
    },
    [startPreview, stopPreview],
  );

  const handlePrioritizeRequest = useCallback(
    async (track: Track, amount: number) => {
      try {
        // On vérifie toujours côté serveur l'effet de la priorité,
        // mais on ne bloque plus l'action si la position ne change pas.
        await playlistService.previewPriority(slug, track.id, amount, activeTrackId);

        if (showGoldenOnly && track.is_golden) {
          setShowGoldenOnly(false);
        }
        openPaymentModal(track, activeTrackId, amount);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to preview priority', error);
        toast.error(t('toast.previewFailed'));
      }
    },
    [activeTrackId, openPaymentModal, showGoldenOnly, slug],
  );

  const handlePrioritizeFromBalanceRequest = useCallback(
    async (track: Track, amount: number) => {
      try {
        if (!user) {
          // Utilisateur invité : on ouvre le paiement Stripe invité (proxy DJManJuke).
          openPaymentModal(track, activeTrackId, amount);
          return;
        }

        // Vérifier si l'utilisateur est propriétaire du jukebox ET a un plan "pro"
        const isOwner = user?.jukebox?.slug === slug;
        const isPro = user?.plan === 'pro';
        const isOwnerPro = isOwner && isPro;

        await paymentService.createPriorityPaymentFromBalance(track.id, amount, slug, activeTrackId);
        window.dispatchEvent(new Event(PLAYLIST_REFRESH_EVENT));
        window.dispatchEvent(new Event(BALANCE_REFRESH_EVENT));
        
        // Message différent pour le propriétaire pro (gratuit)
        if (isOwnerPro) {
          toast.success(t('toast.priorityFreeApplied'));
        } else {
          const revenueMessage = buildFiveWaySplitMessage(amount);
          toast.success(revenueMessage);
        }
      } catch (error: any) {
        // eslint-disable-next-line no-console
        console.error('Failed to prioritize from balance', error);
        
        // Vérifier si c'est le cas où une priorité payante a pris préséance sur la priorité pro
        const errorMessage = error?.response?.data?.message || error?.message || '';
        if (
          errorMessage.includes('priorité') ||
          errorMessage.includes('priority') ||
          errorMessage.includes('préséance') ||
          errorMessage.includes('precedence')
        ) {
          toast.error(t('song.paidPriorityPrecedence'));
        } else {
          toast.error(t('toast.priorityFromBalanceError'));
        }
      }
    },
    [activeTrackId, openPaymentModal, slug, user],
  );

  const handleBuyRequest = useCallback(
    async (track: Track) => {
      try {
        if (!user) {
          // Utilisateur invité : paiement Stripe invité (proxy), pas de connexion requise.
          const intent = await paymentService.createTrackPurchaseIntentGuest(track.id, slug);
          openTrackPurchaseModal(track, intent.clientSecret, intent.paymentIntentId);
          return;
        }

        await paymentService.createTrackPurchaseFromBalance(track.id, slug);
        window.dispatchEvent(new Event(BALANCE_REFRESH_EVENT));

        try {
          const response = await apiClient.get(`/songs/${track.id}/download`, {
            responseType: 'blob',
          });

          const contentType = (response.headers?.['content-type'] as string | undefined) ?? 'audio/mpeg';
          const blob: Blob =
            response.data instanceof Blob ? response.data : new Blob([response.data], { type: contentType });

          const originalPath = track.file_path ?? '';
          const pathExt = originalPath.split('.').pop() || '';
          const inferredExt =
            pathExt ||
            (contentType.includes('wav')
              ? 'wav'
              : contentType.includes('mpeg') || contentType.includes('mp3')
              ? 'mp3'
              : 'bin');

          const safeTitle =
            (track.title || 'track')
              .toString()
              .trim()
              .replace(/[^\w\-]+/g, '_') || 'track';

          const filename = `${safeTitle}.${inferredExt}`;

          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
        } catch (downloadError: any) {
          // eslint-disable-next-line no-console
          console.error('Download failed', downloadError);
        const detail = downloadError?.response?.data?.message
          ? `Détail : ${downloadError.response.data.message}`
          : 'Réessaie plus tard ou contacte le support.';
        toast.error(`${t('toast.downloadFailed')} ${detail}`);
        }

        toast.success(t('toast.purchaseConfirmed'));
      } catch (error: any) {
        // eslint-disable-next-line no-console
        console.error('Failed to start track purchase', error);
        const message =
          error?.response?.data?.message ??
          "Impossible de démarrer l'achat de ce titre pour le moment. Vérifie ton solde et réessaie.";
        toast.error(message);
      }
    },
    [location, slug, user, openTrackPurchaseModal],
  );

  const handleCancelPriorityRequest = useCallback(
    async (track: Track) => {
      if (!user) {
        toast.error(t('toast.loginRequired'));
        return;
      }
      try {
        const isOwner = user?.jukebox?.slug === slug;
        const isPro = user?.plan === 'pro';
        const isOwnerPro = isOwner && isPro;
        const isFreePriority = track.has_free_priority && isOwnerPro;
        
        await playlistService.cancelPriority(slug, track.id, activeTrackId);
        window.dispatchEvent(new Event(PLAYLIST_REFRESH_EVENT));
        window.dispatchEvent(new Event(BALANCE_REFRESH_EVENT));
        
        if (isFreePriority) {
          toast.success(t('toast.priorityCanceled'));
        } else {
          toast.success(t('toast.priorityCanceledBalance'));
        }
      } catch (error: any) {
        // eslint-disable-next-line no-console
        console.error('Failed to cancel priority', error);
        const message =
          error?.response?.data?.message ??
          "Impossible d'annuler cette priorité pour le moment. Réessaie dans un instant.";
        toast.error(message);
      }
    },
    [slug, user],
  );

  useEffect(() => {
    const wsBase = import.meta.env.VITE_API_WS_URL ?? 'http://localhost:4000';
    // Configuration Socket.io pour cPanel avec PassengerBaseURI "/api"
    // Le path doit être /api/socket.io car Passenger retire /api avant d'envoyer à Node.js
    // L'URL complète côté client : https://djmanjuke.com/api/socket.io
    // Node.js reçoit : /socket.io (sans /api)
    // Le namespace /ws/jukebox est géré automatiquement par Socket.io via l'URL de base
    // On utilise polling d'abord car Passenger peut avoir des problèmes avec WebSocket
    // Socket.io essaiera d'upgrade vers WebSocket si disponible
    // Le namespace /ws/jukebox est dans l'URL de connexion
    // Socket.io construit l'URL comme : wsBase + path + namespace
    // Résultat : https://djmanjuke.com/api/socket.io/ws/jukebox
    // Passenger retire /api et envoie /socket.io/ws/jukebox à Node.js
    const jukeboxNamespace = io(`${wsBase}/ws/jukebox`, {
      path: '/api/socket.io',
      transports: ['polling', 'websocket'], // Commencer par polling, puis upgrade si possible
      upgrade: true, // Permettre l'upgrade vers WebSocket
      rememberUpgrade: false, // Ne pas se souvenir de l'upgrade (Passenger peut être instable)
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });
    
    socketRef.current = jukeboxNamespace;

    const handlePlaybackStart = async ({
      track,
      startedAt,
      song_id,
    }: {
      track: Track | null;
      startedAt: number;
      song_id?: number | null;
    }) => {
      // Utiliser les refs pour avoir les valeurs les plus récentes
      const currentPlaybackMode = playbackModeRef.current;
      const currentIsMasterDevice = isMasterDeviceRef.current;

      const serverSongId =
        song_id != null && Number.isFinite(Number(song_id))
          ? Number(song_id)
          : track?.id != null
            ? Number(track.id)
            : null;

      // Debug: log chaque évènement de démarrage serveur
      // eslint-disable-next-line no-console
      console.log('[playback:start] reçu', {
        slug,
        song_id: serverSongId,
        trackId: track?.id ?? null,
        lastCompletedTrackId: lastCompletedTrackIdRef.current,
        startedAt,
      });
      // Si le serveur demande de rejouer exactement la dernière piste complétée,
      // on ignore cette demande pour éviter les boucles.
      if (
        serverSongId != null &&
        lastCompletedTrackIdRef.current != null &&
        serverSongId === lastCompletedTrackIdRef.current
      ) {
        return;
      }

      // En mode public, tous les devices (maître et clients) jouent l'audio de manière synchronisée
      // eslint-disable-next-line no-console
      console.log('[PLAYBACK_START] ✅ Lecture démarrée', {
        songId: serverSongId,
        trackId: track?.id,
        playbackMode: currentPlaybackMode,
        isMasterDevice: currentIsMasterDevice,
        startedAt,
      });

      // Horodatage serveur prioritaire dès réception (avant le refetch playlist).
      playbackStartedAtRef.current = startedAt;

      await fetchPlaylist();

      if (!track || serverSongId == null) {
        pendingPlaybackSyncRef.current = null;
        return;
      }

      const player = audioRef.current;
      if (!player) {
        pendingPlaybackSyncRef.current = { trackId: serverSongId, startedAt };
        return;
      }

      const onCorrectMedia =
        player.getAttribute('data-track-id') === String(serverSongId) &&
        Boolean(player.src) &&
        player.readyState >= HTMLMediaElement.HAVE_METADATA;

      if (onCorrectMedia) {
        pendingPlaybackSyncRef.current = null;
        markPlaybackSyncGrace();
        const offsetSeconds = Math.max(0, (Date.now() - startedAt) / 1000);
        if (Number.isFinite(offsetSeconds)) {
          try {
            player.currentTime = offsetSeconds;
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn('Failed to adjust audio position', error);
          }
        }
        startAudioSync();
        requestAnimationFrame(() => {
          syncImmediately();
        });
        playWithAutoplaySafeguards();
      } else {
        pendingPlaybackSyncRef.current = { trackId: serverSongId, startedAt };
        // Le seek serveur est appliqué dans l’effet `activeTrack` (beginPlayback) une fois le `src` prêt,
        // sinon `load()` écrase la position et donne l’impression d’un redémarrage.
      }
    };

    const handleQueueUpdate = async () => {
      await fetchPlaylist();
    };

    const handleStateFull = async (data?: { playbackMode?: 'public' | 'private'; isMasterDevice?: boolean }) => {
      if (data) {
        const previousPlaybackMode = playbackModeRef.current;
        const previousIsMasterDevice = isMasterDeviceRef.current;
        const newPlaybackMode = data.playbackMode ?? 'private';
        const newIsMasterDevice = data.isMasterDevice ?? false;

        // Éviter les mises à jour d'état inutiles si les valeurs n'ont pas changé
        // Mais on rafraîchit toujours la playlist car le serveur peut avoir envoyé d'autres infos
        const hasChanged = previousPlaybackMode !== newPlaybackMode || previousIsMasterDevice !== newIsMasterDevice;

        if (hasChanged) {
          // eslint-disable-next-line no-console
          console.log('[STATE_FULL] 📡 État complet reçu du serveur', {
            playbackMode: newPlaybackMode,
            isMasterDevice: newIsMasterDevice,
            previousPlaybackMode,
            previousIsMasterDevice,
            isOwner: user?.jukebox?.slug === slug,
            note: newIsMasterDevice
              ? '✅ Ce device est le MAÎTRE (joue la playlist principale)'
              : newPlaybackMode === 'public'
                ? '🚫 Ce device est un CLIENT (ne joue pas la playlist principale)'
                : '🎧 Mode privé (tous les devices jouent)',
          });
          setPlaybackMode(newPlaybackMode);
          setIsMasterDevice(newIsMasterDevice);
        }
      }
      // Toujours rafraîchir la playlist car le serveur peut avoir envoyé d'autres informations
      await fetchPlaylist();
    };

    jukeboxNamespace.on('connect', () => {
      // En mode public, on peut demander explicitement d'être le device maître
      // (par exemple, si c'est le device connecté aux haut-parleurs)
      jukeboxNamespace.emit('join', { slug, requestMaster: false });
    });
    jukeboxNamespace.on('playback:start', handlePlaybackStart);
    jukeboxNamespace.on('queue:update', handleQueueUpdate);
    jukeboxNamespace.on('state:full', handleStateFull);

    return () => {
      jukeboxNamespace.off('playback:start', handlePlaybackStart);
      jukeboxNamespace.off('queue:update', handleQueueUpdate);
      jukeboxNamespace.off('state:full', handleStateFull);
      jukeboxNamespace.disconnect();
      socketRef.current = null;
    };
    // Ne pas inclure playbackMode et isMasterDevice dans les dépendances
    // car ils sont gérés via les événements WebSocket et les refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, fetchPlaylist, playWithAutoplaySafeguards, startAudioSync, syncImmediately, markPlaybackSyncGrace]);

  // Synchroniser avec l'état de lecture au chargement initial (même sans playback:start)
  useEffect(() => {
    if (!playbackState || !playbackState.started_at || !playbackState.current_song_id) {
      return;
    }

    const player = audioRef.current;
    if (!player) {
      return;
    }

    // Ne pas bloquer sur activeTrackId : l'état serveur (playbackState) peut précéder
    // le re-render de la queue ; pendingPlaybackSyncRef / beginPlayback rattrapent le média.

    // Vérifier si on a déjà reçu started_at via WebSocket (éviter les doublons)
    if (playbackStartedAtRef.current === playbackState.started_at) {
      return;
    }

    // En mode public, tous les devices se synchronisent avec le serveur
    // (pas besoin de vérifier isMasterDevice ici)

    // Initialiser la synchronisation avec l'état du serveur
    playbackStartedAtRef.current = playbackState.started_at;

    const dataTrack = player.getAttribute('data-track-id');
    const canSeek =
      dataTrack === String(playbackState.current_song_id) &&
      player.readyState >= HTMLMediaElement.HAVE_METADATA &&
      Boolean(player.src);

    if (canSeek) {
      markPlaybackSyncGrace();
      const offsetSeconds = Math.max(0, (Date.now() - playbackState.started_at) / 1000);
      if (Number.isFinite(offsetSeconds) && offsetSeconds >= 0) {
        try {
          player.currentTime = offsetSeconds;
        } catch (error) {
          // Ignorer les erreurs silencieusement
        }
      }
    } else {
      pendingPlaybackSyncRef.current = {
        trackId: playbackState.current_song_id,
        startedAt: playbackState.started_at,
      };
    }

    // Démarrer la synchro continue seulement si le média correspond (évite de corriger le mauvais élément audio).
    if (playbackState.status === 'playing' && canSeek) {
      startAudioSync();
    }
  }, [playbackState, activeTrackId, startAudioSync, markPlaybackSyncGrace]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) {
      return;
    }

    const currentActiveTrackId = activeTrack?.id ?? null;
    const activeTrackChanged = previousActiveTrackIdRef.current !== currentActiveTrackId;
    const modeChanged = previousPlaybackModeRef.current !== playbackMode || previousIsMasterDeviceRef.current !== isMasterDevice;

    // En mode public, tous les devices (maître et clients) jouent l'audio de manière synchronisée
    // Plus besoin de désactiver audioRef pour les devices clients

    // Ne logger et agir que si l'état a vraiment changé
    if (modeChanged || activeTrackChanged) {
      // eslint-disable-next-line no-console
      console.log('[AUDIO_REF] ✅ Device maître ou mode privé - audioRef actif', {
        playbackMode,
        isMasterDevice,
        activeTrackId: currentActiveTrackId,
        isOwner: user?.jukebox?.slug === slug,
        note: playbackMode === 'private' ? 'Mode privé: tous les devices jouent' : 'Mode public: tous les devices jouent (synchronisés)',
      });
    }

    // Si la piste préécoutée devient la tête de file, couper le preview tout de suite.
    // Sinon le morceau continue sur previewAudio puis redémarre sur le lecteur principal → double lecture.
    if (previewTrack && activeTrack && previewTrack.id === activeTrack.id) {
      clearPreviewTimer();
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
        previewAudioRef.current.removeAttribute('src');
        previewAudioRef.current.load();
      }
      setPreviewTrack(null);
      previewTrackRef.current = null;
      wasPlayingRef.current = false;
    }

    if (previewTrackRef.current) {
      stopAudioSync();
      previousPlaybackModeRef.current = playbackMode;
      previousIsMasterDeviceRef.current = isMasterDevice;
      previousActiveTrackIdRef.current = currentActiveTrackId;
      return;
    }

    if (!activeTrack) {
      stopAudioSync();
      pendingPlaybackSyncRef.current = null;
      player.pause();
      player.currentTime = 0;
      player.removeAttribute('src');
      player.load();
      currentTrackIdRef.current = null;
      if (autoplayRetryTimeoutRef.current) {
        window.clearTimeout(autoplayRetryTimeoutRef.current);
        autoplayRetryTimeoutRef.current = null;
      }
      // Mettre à jour les refs même si on sort tôt
      previousPlaybackModeRef.current = playbackMode;
      previousIsMasterDeviceRef.current = isMasterDevice;
      previousActiveTrackIdRef.current = currentActiveTrackId;
      return;
    }

    // Si la piste active côté serveur est exactement celle qui vient d'être complétée,
    // on n'auto-démarre pas la lecture pour éviter les boucles.
    if (lastCompletedTrackIdRef.current != null && activeTrack.id === lastCompletedTrackIdRef.current) {
      stopAudioSync();
      player.setAttribute('data-track-id', String(activeTrack.id));
      // Mettre à jour les refs même si on sort tôt
      previousPlaybackModeRef.current = playbackMode;
      previousIsMasterDeviceRef.current = isMasterDevice;
      previousActiveTrackIdRef.current = currentActiveTrackId;
      return;
    }

    const lastTrackId = player.getAttribute('data-track-id');
    const isSameTrack = lastTrackId === String(activeTrack.id);

    if (!isSameTrack && player) {
      player.volume = 1;
    }

    if (isSameTrack) {
      const pending = pendingPlaybackSyncRef.current;
      if (pending && pending.trackId === activeTrack.id) {
        pendingPlaybackSyncRef.current = null;
        playbackStartedAtRef.current = pending.startedAt;
        markPlaybackSyncGrace();
        const offsetSeconds = Math.max(0, (Date.now() - pending.startedAt) / 1000);
        if (Number.isFinite(offsetSeconds)) {
          try {
            player.currentTime = offsetSeconds;
          } catch {
            // Ignorer
          }
        }
        startAudioSync();
        requestAnimationFrame(() => {
          syncImmediately();
        });
      }
      // Si le lecteur est arrivé à la fin (évènement "ended"), on ne relance PAS
      // automatiquement la lecture. On attend qu'un nouvel évènement "playback:start"
      // du serveur change effectivement la piste active.
      if (player.paused && !player.ended) {
        // Cas où la piste a été simplement mise en pause : on peut reprendre.
        playWithAutoplaySafeguards();
      }
      // Mettre à jour les refs même si on sort tôt (track identique)
      previousPlaybackModeRef.current = playbackMode;
      previousIsMasterDeviceRef.current = isMasterDevice;
      previousActiveTrackIdRef.current = currentActiveTrackId;
      return;
    }

    if (autoplayRetryTimeoutRef.current) {
      window.clearTimeout(autoplayRetryTimeoutRef.current);
      autoplayRetryTimeoutRef.current = null;
    }

    player.setAttribute('data-track-id', String(activeTrack.id));
    player.src = activeTrack.file_path;
    player.autoplay = true;
    player.setAttribute('playsinline', 'true');

    const shouldForceAutoplay = !hasAutoStartedRef.current;
    if (shouldForceAutoplay && !player.muted) {
      player.muted = true;
    }

    let cancelled = false;
    let canPlayHandler: (() => void) | null = null;

    const beginPlayback = () => {
      if (cancelled) {
        return;
      }
      const pending = pendingPlaybackSyncRef.current;
      if (pending && pending.trackId === activeTrack.id) {
        pendingPlaybackSyncRef.current = null;
        playbackStartedAtRef.current = pending.startedAt;
        markPlaybackSyncGrace();
        const offsetSeconds = Math.max(0, (Date.now() - pending.startedAt) / 1000);
        if (Number.isFinite(offsetSeconds)) {
          try {
            player.currentTime = offsetSeconds;
          } catch {
            // Ignorer
          }
        }
      } else {
        markPlaybackSyncGrace();
      }

      playWithAutoplaySafeguards();
    };

    if (player.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      beginPlayback();
      // Synchroniser immédiatement si le fichier est déjà chargé
      syncImmediately();
    } else {
      canPlayHandler = () => {
        player.removeEventListener('canplay', canPlayHandler!);
        beginPlayback();
        // Synchroniser immédiatement après le chargement
        syncImmediately();
      };
      player.addEventListener('canplay', canPlayHandler);
      player.load();
    }

    currentTrackIdRef.current = activeTrack.id;
    // Dès qu'une nouvelle piste démarre réellement, on oublie la dernière piste complétée.
    if (lastCompletedTrackIdRef.current != null && activeTrack.id !== lastCompletedTrackIdRef.current) {
      lastCompletedTrackIdRef.current = null;
    }

    // Mettre à jour les refs de suivi à la fin
    previousPlaybackModeRef.current = playbackMode;
    previousIsMasterDeviceRef.current = isMasterDevice;
    previousActiveTrackIdRef.current = currentActiveTrackId;

    return () => {
      cancelled = true;
      if (canPlayHandler) {
        player.removeEventListener('canplay', canPlayHandler);
      }
    };
  }, [activeTrack, previewTrack, playbackMode, isMasterDevice, playWithAutoplaySafeguards, user, slug, stopAudioSync, startAudioSync, syncImmediately, markPlaybackSyncGrace]);

  // Le useEffect principal (ligne 613) gère déjà tous les changements de mode
  // Plus besoin d'un useEffect séparé pour les logs de changement de mode

  useEffect(
    () => () => {
      stopAudioSync();
      // Nettoyer le preview seulement si on était vraiment en train de preview
      if (previewTrack || previewAudioRef.current?.src) {
        stopPreview(false);
      }
      if (autoplayRetryTimeoutRef.current) {
        window.clearTimeout(autoplayRetryTimeoutRef.current);
        autoplayRetryTimeoutRef.current = null;
      }
    },
    // Ne pas inclure stopPreview dans les dépendances pour éviter les appels prématurés
    // Le cleanup ne doit se déclencher que lors du démontage du composant
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopAudioSync],
  );

  const handleEnded = useCallback(async () => {
    // Arrêter la synchronisation quand la chanson se termine
    stopAudioSync();
    
    const current = activeTrack;
    if (!current) {
      return;
    }
    
    // Si on était en fullscreen sur le rang 1, préserver l'état pour la transition
    const wasInFullscreen = getFullscreenOnActiveTrack();
    const isGlobalContainerFullscreen = fullscreenContainerRef.current && 
      (document.fullscreenElement === fullscreenContainerRef.current ||
       (document as any).webkitFullscreenElement === fullscreenContainerRef.current ||
       (document as any).mozFullScreenElement === fullscreenContainerRef.current ||
       (document as any).msFullscreenElement === fullscreenContainerRef.current);
    
    if (wasInFullscreen || isGlobalContainerFullscreen) {
      console.log('[PlaceJukebox] 🎵 Rang 1 terminé en fullscreen, préservation de l\'état', {
        trackId: current.id,
        wasInFullscreen,
        isGlobalContainerFullscreen
      });
      // Préserver l'état pour que la nouvelle chanson hérite du fullscreen
      setFullscreenOnActiveTrack(true, current.id);
      setFullscreenActive(true);
      
      // S'assurer que le conteneur global reste en fullscreen
      if (!isGlobalContainerFullscreen && fullscreenContainerRef.current) {
        console.log('[PlaceJukebox] ⚠️ Conteneur global pas en fullscreen, tentative d\'activation...');
        // Le navigateur peut bloquer, mais on essaie quand même
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
          if (fullscreenContainerRef.current) {
            requestFullscreen(fullscreenContainerRef.current).catch((error: unknown) => {
              console.warn('[PlaceJukebox] ⚠️ Impossible d\'activer le fullscreen automatiquement (bloqué par le navigateur):', error);
              console.warn('[PlaceJukebox] 💡 Le fullscreen se fermera, mais le contenu sera mis à jour pour la prochaine chanson');
            });
          }
        }, 100);
      }
    }

    let completedSuccessfully = true;

    try {
      // Debug : début complétion (toujours déléguée au backend)
      // eslint-disable-next-line no-console
      console.log('[handleEnded] completeSong → backend', {
        slug,
        songId: current.id,
      });
      await playlistService.completeSong(slug, current.id, null);
      setPlaybackError(null);
      // Rafraîchir le solde après qu'une chanson soit complétée
      // (pour mettre à jour les gains du jukebox et les réenchérissements)
      window.dispatchEvent(new Event(BALANCE_REFRESH_EVENT));
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Failed to complete track', error);
      completedSuccessfully = false;
      const status = error?.response?.status ?? null;
      if (status === 401 || status === 403) {
        // Si c'est réellement le propriétaire/admin (token expiré), on le prévient.
        if (user && (user.role === 'admin' || user.jukebox?.slug === slug)) {
          setPlaybackError(
            "Votre session jukebox a expiré. Veuillez vous reconnecter pour que les lectures génèrent des revenus et fassent avancer la playlist.",
          );
        }
        // Pour un invité ou un utilisateur non autorisé, on ignore simplement.
      } else {
        setPlaybackError(
          "Erreur lors de la fin de lecture. La chanson n'a pas pu être complétée côté serveur. Réessayez dans un instant.",
        );
      }
    }

    if (!completedSuccessfully) {
      return;
    }

    // On mémorise l'identifiant de la dernière piste complétée pour éviter qu'elle
    // ne redémarre automatiquement tant que le serveur n'a pas choisi une nouvelle piste.
    lastCompletedTrackIdRef.current = current.id;
    // eslint-disable-next-line no-console
    console.log('[handleEnded] complétée, mémorisée comme dernière piste', {
      lastCompletedTrackId: lastCompletedTrackIdRef.current,
    });

    // Si on était en fullscreen sur le rang 1, préserver l'état pour la transition
    if (getFullscreenOnActiveTrack()) {
      console.log('[PlaceJukebox] 🎵 Rang 1 terminé en fullscreen, préservation de l\'état pour transition fluide', {
        trackId: current.id
      });
      // Préserver l'état pour que la nouvelle chanson hérite du fullscreen
      setFullscreenOnActiveTrack(true, current.id);
      // Activer le pseudo-fullscreen pour la transition (le fullscreen natif se fermera probablement)
      setPseudoFullscreen(true);
    }

    // On laisse le serveur décider s'il faut lancer une nouvelle chanson.
    // Si aucune nouvelle lecture n'est déclenchée (ex. une seule chanson dans la file),
    // le lecteur reste simplement en pause en fin de piste.
    if (audioRef.current) {
      audioRef.current.currentTime = audioRef.current.duration || 0;
    }
  }, [activeTrack, slug, user]);

  const handlePreviewEnded = () => {
    stopPreview(true);
  };

  const handleAudioPlay = () => {
    setIsPlaying(true);
  };

  const handleAudioPause = () => {
    setIsPlaying(false);
  };

  const handleTogglePlay = useCallback(() => {
    if (!audioRef.current) {
      return;
    }
    const audio = audioRef.current;
    
    if (audio.paused) {
      audio.play().catch((error) => {
        // eslint-disable-next-line no-console
        console.warn('Erreur lors de la lecture audio:', error);
      });
    } else {
      audio.pause();
    }
  }, []);

  // Callback pour mettre en pause le player principal quand on entre en fullscreen
  const handlePauseMainPlayerForFullscreen = useCallback(() => {
    if (!audioRef.current) {
      return;
    }
    const audio = audioRef.current;
    
    // Sauvegarder l'état actuel
    wasPlayingForFullscreenRef.current = !audio.paused;
    resumeTimeForFullscreenRef.current = audio.currentTime;
    
    // Mettre en pause si le player joue
    if (!audio.paused) {
      audio.pause();
      // eslint-disable-next-line no-console
      console.log('[FULLSCREEN] ⏸️ Player principal mis en pause pour fullscreen', {
        wasPlaying: wasPlayingForFullscreenRef.current,
        resumeTime: resumeTimeForFullscreenRef.current,
      });
    }
  }, []);

  // Callback pour reprendre le player principal quand on sort du fullscreen
  const handleResumeMainPlayerForFullscreen = useCallback(() => {
    if (!audioRef.current) {
      return;
    }
    const audio = audioRef.current;
    
    // Reprendre seulement si on était en train de jouer avant
    if (wasPlayingForFullscreenRef.current && audio.paused) {
      audio.currentTime = resumeTimeForFullscreenRef.current;
      audio.play().catch((error) => {
        // eslint-disable-next-line no-console
        console.warn('Erreur lors de la reprise audio après fullscreen:', error);
      });
      // eslint-disable-next-line no-console
      console.log('[FULLSCREEN] ▶️ Player principal repris après fullscreen', {
        resumeTime: resumeTimeForFullscreenRef.current,
      });
    }
    
    // Réinitialiser les refs
    wasPlayingForFullscreenRef.current = false;
    resumeTimeForFullscreenRef.current = 0;
  }, []);

  const handleAudioTimeUpdate = () => {
    const player = audioRef.current;
    if (!player || !activeTrack) {
      return;
    }
    const current = player.currentTime ?? 0;

    setPlayerPosition((prev) => {
      if (Math.abs(prev - current) > 0.25) {
        return current;
      }
      return prev;
    });
  };

  const displayedTracks = showGoldenOnly ? tracks.filter((track) => track.is_golden) : tracks;
  const hasResults = displayedTracks.length > 0;
  const isSearching = Boolean(searchTerm);

  // Filtrer les jukebox selon la recherche
  const displayedJukeboxes = searchTerm
    ? jukeboxes.filter(
        (jukebox) =>
          jukebox.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          jukebox.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (jukebox.location && jukebox.location.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : jukeboxes;

  const shouldRenderUI = !hideInterface;

  return (
    <>
      {shouldRenderUI ? (
        <section className="space-y-4 sm:space-y-6">
          {playbackError ? (
            <div className="flex flex-col gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 sm:p-4 text-sm text-red-200">
              <span>{playbackError}</span>
              {canForceSkip ? (
                <button
                  type="button"
                  onClick={() => {
                    // Bouton d'urgence réservé au titulaire/admin :
                    // on efface le message et on force le passage à la prochaine chanson côté UI.
                    setPlaybackError(null);
                    const advanced = playNext();
                    if (advanced) {
                      window.dispatchEvent(new Event(PLAYLIST_REFRESH_EVENT));
                    }
                  }}
                  className="min-h-[44px] w-full sm:w-auto sm:inline-flex items-center justify-center rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-400"
                >
                  {t('jukebox.skipNextAdmin')}
                </button>
              ) : null}
            </div>
          ) : null}
          
          {/* Section "Now Playing" - Mobile-first */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <h2 className="text-lg font-semibold uppercase tracking-wide sm:text-xl">
                {t('jukebox.nowPlaying')}
              </h2>
              {user?.jukebox?.slug === slug ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await playlistService.skipToPrevious(slug);
                        window.dispatchEvent(new Event(PLAYLIST_REFRESH_EVENT));
                      } catch (error: any) {
                        const message =
                          error?.response?.data?.message ??
                          "Impossible de revenir à la chanson précédente pour le moment.";
                        toast.error(message);
                      }
                    }}
                    className="min-h-[44px] rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-white hover:text-white"
                    aria-label={t('jukebox.previous') || 'Chanson précédente'}
                  >
                    {t('jukebox.previous') || '← Précédent'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await playlistService.skipToNext(slug);
                        window.dispatchEvent(new Event(PLAYLIST_REFRESH_EVENT));
                      } catch (error: any) {
                        const status = error?.response?.status ?? null;
                        const message =
                          error?.response?.data?.message ??
                          (status === 429
                            ? "Limite de sauts atteinte pour le plan Free."
                            : "Impossible de passer à la chanson suivante pour le moment.");
                        toast.error(message);
                      }
                    }}
                    className="min-h-[44px] rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-white hover:text-white"
                    aria-label={t('jukebox.next') || 'Chanson suivante'}
                  >
                    {t('jukebox.next') || 'Suivant →'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const newMode = playbackMode === 'public' ? 'private' : 'public';
                        await apiClient.put(`/jukebox/${slug}/playback-mode`, { playbackMode: newMode });
                        setPlaybackMode(newMode);
                        toast.success(newMode === 'public' ? t('playback.publicActivated') : t('playback.privateActivated'));
                        // Rejoindre la room avec la nouvelle demande de maître si nécessaire
                        if (socketRef.current && newMode === 'public') {
                          socketRef.current.emit('join', { slug, requestMaster: true });
                        }
                      } catch (error: any) {
                        toast.error(error?.response?.data?.message ?? t('playback.modeError'));
                      }
                    }}
                    className={`min-h-[44px] rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      playbackMode === 'public'
                        ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-200 hover:border-emerald-300'
                        : 'border-white/30 bg-white/5 text-white/80 hover:border-white hover:text-white'
                    }`}
                    title={playbackMode === 'public' ? t('playback.publicTitle') : t('playback.privateTitle')}
                    aria-label={playbackMode === 'public' ? t('playback.publicTitle') : t('playback.privateTitle')}
                    aria-pressed={playbackMode === 'public'}
                  >
                    {playbackMode === 'public' ? `🔊 ${t('playback.public')}` : `🎧 ${t('playback.private')}`}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {/* Barre de recherche et filtres - Mobile-first */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={showJukeboxes ? t('jukebox.searchJukebox') : t('jukebox.search')}
              className="min-h-[44px] w-full rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/50 focus:border-secondary focus:outline-none sm:flex-1 lg:max-w-sm"
              aria-label={showJukeboxes ? t('jukebox.searchJukebox') || 'Rechercher un jukebox' : t('jukebox.search') || 'Rechercher une chanson'}
            />
            <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
              <label className="flex items-center gap-2 text-sm text-white/70 min-h-[44px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showGoldenOnly}
                  onChange={(event) => {
                    setShowGoldenOnly(event.target.checked);
                    if (event.target.checked) {
                      setShowJukeboxes(false);
                    }
                  }}
                  className="h-5 w-5 rounded border-white/20 bg-dark text-secondary focus:ring-2 focus:ring-secondary cursor-pointer"
                  aria-label={t('jukebox.invested') || 'Afficher uniquement les chansons investies'}
                />
                <span>{t('jukebox.invested')}</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-white/70 min-h-[44px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showJukeboxes}
                  onChange={(event) => {
                    setShowJukeboxes(event.target.checked);
                    if (event.target.checked) {
                      setShowGoldenOnly(false);
                    }
                  }}
                  className="h-5 w-5 rounded border-white/20 bg-dark text-secondary focus:ring-2 focus:ring-secondary cursor-pointer"
                  aria-label={t('jukebox.jukebox') || 'Afficher les jukeboxes'}
                />
                <span>{t('jukebox.jukebox')}</span>
              </label>
              {!showJukeboxes && (
                <button
                  type="button"
                  onClick={() => {
                    // Rafraîchir la playlist
                    refreshPlaylist();
                    // Activer le son (débloquer l'autoplay)
                    const player = audioRef.current;
                    if (player) {
                      // Marquer qu'il y a eu interaction utilisateur
                      hasAutoStartedRef.current = true;
                      // Débloquer le son si muted
                      if (player.muted) {
                        player.muted = false;
                      }
                      // Essayer de jouer l'audio si disponible
                      if (player.src && player.paused) {
                        player.play().catch(() => {
                          // Ignorer les erreurs silencieusement
                        });
                      }
                    }
                  }}
                  className="min-h-[44px] w-full sm:w-auto rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-dark transition hover:opacity-80"
                  aria-label="Activer le son et rafraîchir la playlist"
                >
                  🔊 Activer le son
                </button>
              )}
            </div>
          </div>

          {showJukeboxes ? (
            isLoadingJukeboxes ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-white/60">{t('jukebox.loadingJukeboxes')}</p>
              </div>
            ) : displayedJukeboxes.length > 0 ? (
              <motion.div
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {displayedJukeboxes.map((jukebox) => (
                  <JukeboxCard 
                    key={jukebox.id} 
                    jukebox={jukebox} 
                    currentSlug={slug}
                    onJukeboxClick={() => setShowJukeboxes(false)}
                  />
                ))}
              </motion.div>
            ) : (
              <div className="flex items-center justify-center py-12">
                <p className="text-white/60">
                  {isSearching
                    ? t('jukebox.noResults', { term: searchTerm })
                    : t('jukebox.noJukeboxes')}
                </p>
              </div>
            )
          ) : hasResults ? (
            <motion.div
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {displayedTracks.map((track) => {
                const isActive = track.id === activeTrack?.id;
                const isQueued = !isActive;
                // Une chanson est considérée comme "priorisée" tant qu'il reste
                // au moins un montant de priorité en attente (priority_total > 0),
                // même si le poids de base (priority_weight) a déjà été ajusté.
                // Une chanson est priorisée si elle a des priorités payantes (priority_total > 0)
                // OU des priorités gratuites (has_free_priority)
                const isPrioritized =
                  isQueued && (Boolean(track.priority_total && Number(track.priority_total) > 0) || Boolean(track.has_free_priority));
                const canPrioritize = !isActive;
                const nextAmount = 0.5;
                const isOwner = user?.jukebox?.slug === slug;
                const isPro = user?.plan === 'pro';
                const isOwnerPro = isOwner && isPro;
                return (
                  <ProductAny
                    key={track.id}
                    track={track}
                    isActive={isActive}
                    isPreviewing={previewTrack?.id === track.id}
                    isPlayerPlaying={isPlaying}
                    playerPositionSeconds={playerPosition}
                    isQueued={isQueued}
                    isPrioritized={isPrioritized}
                    nextAmount={nextAmount}
                    canPrioritize={canPrioritize}
                    showGainLabelForGolden={Boolean(user)}
                    isPro={isPro}
                    isOwnerPro={isOwnerPro}
                    onPreview={handlePreviewRequest}
                    onPrioritize={handlePrioritizeRequest}
                    onPrioritizeFromBalance={handlePrioritizeFromBalanceRequest}
                    onBuy={handleBuyRequest}
                    onCancelPriority={user ? handleCancelPriorityRequest : undefined}
                    onTogglePlay={handleTogglePlay}
                    onPauseMainPlayer={handlePauseMainPlayerForFullscreen}
                    onResumeMainPlayer={handleResumeMainPlayerForFullscreen}
                  />
                );
              })}
            </motion.div>
          ) : (
            <div className="rounded-lg border border-white/10 p-6 text-center text-white/60">
              {isSearching && queueLength > 0
                ? t('jukebox.noResults', { term: searchTerm })
                : showGoldenOnly
                ? t('jukebox.noGolden')
                : t('jukebox.emptyQueue')}
            </div>
          )}
        </section>
      ) : null}
      <audio
        ref={audioRef}
        onPlay={handleAudioPlay}
        onPause={handleAudioPause}
        onTimeUpdate={handleAudioTimeUpdate}
        onEnded={handleEnded}
        className="hidden"
      />
      <audio ref={previewAudioRef} onEnded={handlePreviewEnded} className="hidden" />
      
      {/* Conteneur fullscreen global qui reste toujours le même */}
      <div
        ref={fullscreenContainerRef}
        className={`fixed inset-0 z-[100] bg-black fullscreen-container ${getPseudoFullscreen() ? 'pseudo-fullscreen-active' : ''}`}
        style={{ 
          display: (fullscreenContent || getFullscreenActive() || getPseudoFullscreen()) ? 'flex' : 'none', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}
      >
        {fullscreenContent && (
          <>
            {fullscreenContent.type === 'audio' && fullscreenContent.imageSrc && (
              <img
                src={fullscreenContent.imageSrc}
                alt={`${fullscreenContent.title} - Artwork`}
                className="h-full w-full object-contain transition-opacity duration-500"
                key={`fullscreen-${fullscreenContent.trackId}-${fullscreenContent.imageSrc}`}
                loading="eager"
              />
            )}
            {fullscreenContent.type === 'video' && fullscreenContent.thumbnailSrc && (
              <img
                src={fullscreenContent.thumbnailSrc}
                alt={`${fullscreenContent.title} - Thumbnail`}
                className="h-full w-full object-contain transition-opacity duration-500"
                key={`fullscreen-${fullscreenContent.trackId}-${fullscreenContent.thumbnailSrc}`}
                loading="eager"
              />
            )}
            {/* Bouton pour sortir du pseudo-fullscreen */}
            {getPseudoFullscreen() && (
              <button
                onClick={() => {
                  setPseudoFullscreen(false);
                  setFullscreenOnActiveTrack(false);
                  console.log('[PlaceJukebox] 🚪 Sortie du pseudo-fullscreen');
                }}
                className="min-h-[44px] min-w-[44px] absolute top-4 right-4 z-[101] bg-black/50 hover:bg-black/70 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                aria-label="Quitter le mode plein écran"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="hidden sm:inline">Quitter</span>
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
};


