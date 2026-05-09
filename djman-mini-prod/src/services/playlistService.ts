import { apiClient } from './apiClient';

type PriorityPreviewResponse = {
  currentRank: number | null;
  newRank: number | null;
  willMoveUp: boolean;
};

const completeSong = async (slug: string, songId: number, currentSongId: number | null) => {
  await apiClient.post(`/jukebox/${slug}/playlist/complete`, {
    songId,
    currentSongId,
  });
};

const cancelPriority = async (slug: string, songId: number, currentSongId: number | null) => {
  await apiClient.post(`/jukebox/${slug}/playlist/priority/cancel`, {
    songId,
    currentSongId,
  });
};

const skipToNext = async (slug: string) => {
  await apiClient.post(`/jukebox/${slug}/playlist/next`);
};

const skipToPrevious = async (slug: string) => {
  await apiClient.post(`/jukebox/${slug}/playlist/previous`);
};

const previewPriority = async (
  slug: string,
  songId: number,
  amount: number,
  currentSongId: number | null,
): Promise<PriorityPreviewResponse> => {
  const { data } = await apiClient.post<PriorityPreviewResponse>(`/jukebox/${slug}/playlist/priority-preview`, {
    songId,
    amount,
    currentSongId,
  });
  return data;
};

export const playlistService = {
  completeSong,
  previewPriority,
  cancelPriority,
  skipToNext,
  skipToPrevious,
};
