import { apiClient } from './apiClient';

export type SongLocationStat = {
  jukeboxId: number;
  slug: string | null;
  name: string | null;
  location: string | null;
  playCount: number;
  totalAmount: number;
  firstPlayedAt: string | null;
  lastPlayedAt: string | null;
};

export type SongAnalytics = {
  songId: number;
  title: string;
  artist: string;
  totalPlays: number;
  totalAmount: number;
  locations: SongLocationStat[];
};

export type JukeboxSongStat = {
  songId: number;
  title: string;
  artist: string;
  playCount: number;
  totalAmount: number;
  firstPlayedAt: string | null;
  lastPlayedAt: string | null;
};

export type JukeboxAnalytics = {
  jukeboxId: number;
  slug: string;
  name: string | null;
  location: string | null;
  totalPlays: number;
  totalAmount: number;
  songs: JukeboxSongStat[];
};

export type AnalyticsOverview = {
  songs: SongAnalytics[];
  jukeboxes: JukeboxAnalytics[];
};

const getOverview = async (): Promise<AnalyticsOverview> => {
  const { data } = await apiClient.get<AnalyticsOverview>('/analytics/overview');
  return data;
};

export const analyticsService = {
  getOverview,
};


