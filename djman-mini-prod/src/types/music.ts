export type UserRole = 'artist' | 'promoter' | 'jukebox_owner' | 'listener' | 'admin';

export type TrackInvestment = {
  id: number;
  user_id: number;
  username: string;
  amount_total: number;
  amount_remaining: number;
  passive_share: 0 | 1;
  passive_earned: number;
};

export type Track = {
  id: number;
  title: string;
  artist: string;
  file_path: string;
  image?: string | null;
  is_video?: boolean;
  order_id?: number;
  song_order_id?: number;
  priority_weight?: number;
  priority_total?: number;
  has_free_priority?: boolean;
  queue_rank?: number;
  is_golden?: boolean;
  investments?: TrackInvestment[];
  user_id?: number | null;
  owner_username?: string | null;
  is_in_jukebox?: boolean;
  genre_primary?: string | null;
  genre_secondary?: string | null;
  genre_tertiary?: string | null;
  recorded_at?: string | null; // Format: YYYY-MM-DD
};


