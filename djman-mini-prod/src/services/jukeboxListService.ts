import { apiClient } from './apiClient';

export type JukeboxListItem = {
  id: number;
  slug: string;
  name: string;
  location?: string | null;
  avatar?: string | null;
  isConnected: boolean;
};

export const jukeboxListService = {
  getAllJukeboxes: async (): Promise<JukeboxListItem[]> => {
    const { data } = await apiClient.get<{ jukeboxes: JukeboxListItem[] }>('/jukebox');
    return data.jukeboxes;
  },
};

