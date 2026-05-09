import { apiClient } from './apiClient';

type PriorityPaymentIntentResponse = {
  clientSecret: string;
  paymentIntentId: string;
};

type PriorityPaymentFromBalanceResponse = {
  playlist: unknown;
};

type TrackPurchaseIntentResponse = {
  clientSecret: string;
  paymentIntentId: string;
};

type TrackPurchaseFromBalanceResponse = {
  paymentId: number;
};

type BalanceTopUpIntentResponse = {
  clientSecret: string;
  paymentIntentId: string;
};

type BalanceTopUpConfirmResponse = {
  topupAmount: number;
};

const createPriorityPayment = async (
  songId: number,
  amount: number,
  slug: string,
  currentSongId: number | null = null,
) => {
  const payload: Record<string, unknown> = {
    songId,
    amount,
    slug,
  };
  if (currentSongId !== null) {
    payload.currentSongId = currentSongId;
  }
  const { data } = await apiClient.post<PriorityPaymentIntentResponse>('/payment/priority', payload);
  return data;
};

const createPriorityPaymentGuest = async (
  songId: number,
  amount: number,
  slug: string,
  currentSongId: number | null = null,
) => {
  const payload: Record<string, unknown> = {
    songId,
    amount,
    slug,
  };
  if (currentSongId !== null) {
    payload.currentSongId = currentSongId;
  }
  const { data } = await apiClient.post<PriorityPaymentIntentResponse>('/payment/priority/guest', payload);
  return data;
};

const confirmPriorityPayment = async (paymentIntentId: string) => {
  const { data } = await apiClient.post<{ playlist: unknown }>('/payment/priority/confirm', {
    paymentIntentId,
  });
  return data;
};

const confirmPriorityPaymentGuest = async (paymentIntentId: string) => {
  const { data } = await apiClient.post<{ playlist: unknown }>('/payment/priority/guest/confirm', {
    paymentIntentId,
  });
  return data;
};

const createPriorityPaymentFromBalance = async (
  songId: number,
  amount: number,
  slug: string,
  currentSongId: number | null = null,
) => {
  const payload: Record<string, unknown> = {
    songId,
    amount,
    slug,
  };
  if (currentSongId !== null) {
    payload.currentSongId = currentSongId;
  }
  const { data } = await apiClient.post<PriorityPaymentFromBalanceResponse>('/payment/priority-from-balance', payload);
  return data;
};

const createTrackPurchaseIntent = async (songId: number, slug: string) => {
  const { data } = await apiClient.post<TrackPurchaseIntentResponse>('/payment/track-purchase/intent', {
    songId,
    slug,
  });
  return data;
};

const createTrackPurchaseIntentGuest = async (songId: number, slug: string) => {
  const { data } = await apiClient.post<TrackPurchaseIntentResponse>('/payment/track-purchase/guest/intent', {
    songId,
    slug,
  });
  return data;
};

const confirmTrackPurchase = async (paymentIntentId: string) => {
  await apiClient.post('/payment/track-purchase/confirm', {
    paymentIntentId,
  });
};

const confirmTrackPurchaseGuest = async (paymentIntentId: string) => {
  await apiClient.post('/payment/track-purchase/guest/confirm', {
    paymentIntentId,
  });
};

const createTrackPurchaseFromBalance = async (songId: number, slug: string) => {
  const { data } = await apiClient.post<TrackPurchaseFromBalanceResponse>('/payment/track-purchase-from-balance', {
    songId,
    slug,
  });
  return data;
};

const createBalanceTopUp = async (amount: number) => {
  const { data } = await apiClient.post<BalanceTopUpIntentResponse>('/payment/balance-topup', {
    amount,
  });
  return data;
};

const confirmBalanceTopUp = async (paymentIntentId: string) => {
  const { data } = await apiClient.post<BalanceTopUpConfirmResponse>('/payment/balance-topup/confirm', {
    paymentIntentId,
  });
  return data;
};

export const paymentService = {
  createPriorityPayment,
  createPriorityPaymentGuest,
  confirmPriorityPayment,
  confirmPriorityPaymentGuest,
  createPriorityPaymentFromBalance,
  createTrackPurchaseIntent,
  createTrackPurchaseIntentGuest,
  confirmTrackPurchase,
  confirmTrackPurchaseGuest,
  createTrackPurchaseFromBalance,
  createBalanceTopUp,
  confirmBalanceTopUp,
};

