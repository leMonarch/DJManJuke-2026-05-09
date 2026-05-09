import type { Track } from '../types/music';
import { apiClient } from './apiClient';

export type SongPayload = {
  title: string;
  artist: string;
  song_order_id?: number | null;
  audioFile?: File | null;
  imageFile?: File | null;
  genre_primary?: string | null;
  genre_secondary?: string | null;
  genre_tertiary?: string | null;
  recorded_at?: string | null; // Format: YYYY-MM-DD
};

const buildFormData = (payload: SongPayload) => {
  const formData = new FormData();
  formData.append('title', payload.title);
  formData.append('artist', payload.artist);
  if (payload.song_order_id !== undefined && payload.song_order_id !== null) {
    formData.append('song_order_id', String(payload.song_order_id));
  }
  if (payload.audioFile) {
    formData.append('audio', payload.audioFile);
  }
  if (payload.imageFile) {
    formData.append('image', payload.imageFile);
  }
  if (payload.genre_primary !== undefined && payload.genre_primary !== null && payload.genre_primary.trim() !== '') {
    formData.append('genre_primary', payload.genre_primary.trim());
  }
  if (payload.genre_secondary !== undefined && payload.genre_secondary !== null && payload.genre_secondary.trim() !== '') {
    formData.append('genre_secondary', payload.genre_secondary.trim());
  }
  if (payload.genre_tertiary !== undefined && payload.genre_tertiary !== null && payload.genre_tertiary.trim() !== '') {
    formData.append('genre_tertiary', payload.genre_tertiary.trim());
  }
  if (payload.recorded_at !== undefined && payload.recorded_at !== null && payload.recorded_at.trim() !== '') {
    formData.append('recorded_at', payload.recorded_at.trim());
  }
  return formData;
};

const listSongs = async (): Promise<Track[]> => {
  const { data } = await apiClient.get('/songs');
  return Array.isArray(data.songs) ? data.songs : [];
};

const createSong = async (payload: SongPayload): Promise<Track> => {
  const formData = buildFormData(payload);
  const { data } = await apiClient.post('/songs', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.song as Track;
};

const updateSong = async (id: number, payload: SongPayload): Promise<Track> => {
  const formData = buildFormData(payload);
  const { data } = await apiClient.put(`/songs/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.song as Track;
};

const deleteSong = async (id: number): Promise<void> => {
  await apiClient.delete(`/songs/${id}`);
};

export const songAdminService = {
  listSongs,
  createSong,
  updateSong,
  deleteSong,
};


