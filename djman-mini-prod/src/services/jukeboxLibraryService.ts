import { apiClient } from './apiClient';
import type { Track } from '../types/music';

export type CatalogSong = Track & {
  is_in_jukebox?: boolean;
  isInJukebox?: boolean;
};

const transformCatalogSong = (song: CatalogSong): CatalogSong => ({
  ...song,
  is_in_jukebox: Boolean(song.is_in_jukebox ?? song.isInJukebox ?? false),
  isInJukebox: Boolean(song.is_in_jukebox ?? song.isInJukebox ?? false),
});

const listCatalog = async (slug: string) => {
  const { data } = await apiClient.get<{ songs: CatalogSong[] }>(`/jukebox/${slug}/library`);
  return Array.isArray(data.songs) ? data.songs.map(transformCatalogSong) : [];
};

const addSong = async (slug: string, songId: number) => {
  const { data } = await apiClient.post<{ songs: CatalogSong[] }>(`/jukebox/${slug}/library`, { songId });
  return Array.isArray(data.songs) ? data.songs.map(transformCatalogSong) : [];
};

const removeSong = async (slug: string, songId: number) => {
  const { data } = await apiClient.delete<{ songs: CatalogSong[] }>(`/jukebox/${slug}/library/${songId}`);
  return Array.isArray(data.songs) ? data.songs.map(transformCatalogSong) : [];
};

export const jukeboxLibraryService = {
  listCatalog,
  addSong,
  removeSong,
};



