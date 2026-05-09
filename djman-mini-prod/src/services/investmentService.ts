import type { Track, TrackInvestment } from '../types/music';
import { apiClient } from './apiClient';

export type CreateInvestmentPayload = {
  songId: number;
  amount: number;
};

type ListMineResponse = {
  investments: Array<
    TrackInvestment & {
      title: string;
      artist: string;
    }
  >;
};

type ListSongResponse = {
  investments: TrackInvestment[];
};

type CreateInvestmentResponse = {
  investment: TrackInvestment;
};

type CatalogResponse = {
  songs: Track[];
};

const listMine = async () => {
  const { data } = await apiClient.get<ListMineResponse>('/investments/mine');
  return data.investments;
};

const listForSong = async (songId: number) => {
  const { data } = await apiClient.get<ListSongResponse>(`/investments/song/${songId}`);
  return data.investments;
};

const create = async (payload: CreateInvestmentPayload) => {
  const { data } = await apiClient.post<CreateInvestmentResponse>('/investments', payload);
  return data.investment;
};

const listCatalog = async (slug: string) => {
  const { data } = await apiClient.get<CatalogResponse>(`/investments/catalog/${slug}`);
  return Array.isArray(data.songs) ? data.songs : [];
};

export const investmentService = {
  listMine,
  listForSong,
  create,
  listCatalog,
};


