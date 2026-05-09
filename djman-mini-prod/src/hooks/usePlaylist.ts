import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../services/apiClient';
import type { Track } from '../types/music';
import { PLAYLIST_REFRESH_EVENT } from '../constants/jukebox';

const assetsBaseUrl = import.meta.env.VITE_ASSETS_BASE_URL ?? 'http://localhost:4000';

const resolveAssetPath = (path: string) => {
  if (!path) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const trimmedBase = assetsBaseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
};

type PlaybackState = {
  current_song_id: number | null;
  started_at: number | null;
  status: 'playing' | 'paused';
};

type PlaylistResponse = {
  playlist: Track[];
  playbackState?: PlaybackState;
};

export const usePlaylist = (slug: string) => {
  const [queue, setQueue] = useState<Track[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
  const activeTrackIdRef = useRef<number | null>(null);
  const pendingActiveIdRef = useRef<number | null>(null);

  useEffect(() => {
    const currentId = queue[activeIndex]?.id ?? null;
    activeTrackIdRef.current = currentId;
  }, [queue, activeIndex]);

  const fetchPlaylist = useCallback(async () => {
    try {
      const { data } = await apiClient.get<PlaylistResponse>(`/jukebox/${slug}/playlist`);
      
      // Mettre à jour l'état de lecture si disponible
      if (data.playbackState) {
        setPlaybackState({
          current_song_id: data.playbackState.current_song_id,
          started_at: data.playbackState.started_at,
          status: data.playbackState.status,
        });
      }
      
      if (Array.isArray(data.playlist) && data.playlist.length) {
        const enhanced = data.playlist.map((track) => ({
          ...track,
          file_path: resolveAssetPath(track.file_path),
          image: track.image ? resolveAssetPath(track.image) : track.image,
          is_video:
            typeof track.file_path === 'string' &&
            track.file_path.toLowerCase().endsWith('.mp4'),
          priority_weight: Number(track.priority_weight ?? 0),
          priority_total: Number(track.priority_total ?? track.priority_weight ?? 0),
          has_free_priority: Boolean(track.has_free_priority),
          is_golden: Boolean(track.is_golden),
          investments: Array.isArray(track.investments) ? track.investments : [],
        }));

        // On fait désormais confiance à l'ordre renvoyé par le backend :
        // la piste active est toujours en première position.
        setActiveIndex(0);

        setQueue(
          enhanced.map((track, index) => ({
            ...track,
            queue_rank: index + 1,
          })),
        );
        pendingActiveIdRef.current = null;
      } else {
        setQueue([]);
        setActiveIndex(0);
      }
    } catch (error) {
      setQueue([]);
      setActiveIndex(0);
    }
  }, [slug]);

  useEffect(() => {
    fetchPlaylist();
  }, [fetchPlaylist]);

  useEffect(() => {
    const handleRefresh = () => {
      fetchPlaylist();
    };
    window.addEventListener(PLAYLIST_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(PLAYLIST_REFRESH_EVENT, handleRefresh);
  }, [fetchPlaylist]);

  const playNext = useCallback(() => {
    // L’avancement de la file est désormais entièrement géré par le backend via completeSong.
    // Cette fonction est conservée pour compatibilité mais ne modifie plus la file côté client.
    return false;
  }, []);

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(handler);
  }, [searchInput]);

  const filteredTracks = useMemo(() => {
    if (!searchTerm) {
      return queue;
    }
    const lower = searchTerm.toLowerCase();
    return queue.filter(
      (track) =>
        track.title.toLowerCase().includes(lower) || track.artist.toLowerCase().includes(lower),
    );
  }, [queue, searchTerm]);

  const refreshPlaylist = useCallback(() => {
    // Par défaut, on préserve la piste active quand on rafraîchit manuellement.
    fetchPlaylist();
  }, [fetchPlaylist]);

  const activeTrack = useMemo(() => queue[activeIndex] ?? null, [queue, activeIndex]);
  const highestPriorityWeight = useMemo(() => {
    if (!queue.length) {
      return 0;
    }
    return queue.reduce((max, track, index) => {
      if (index === activeIndex) {
        return max;
      }
      const weight = Number(track.priority_weight ?? 0);
      return weight > max ? weight : max;
    }, 0);
  }, [queue, activeIndex]);

  return {
    tracks: filteredTracks,
    activeTrack,
    playNext,
    refreshPlaylist,
    fetchPlaylist,
    searchInput,
    setSearchInput,
    searchTerm,
    queueLength: queue.length,
    highestPriorityWeight,
    playbackState,
  };
};

