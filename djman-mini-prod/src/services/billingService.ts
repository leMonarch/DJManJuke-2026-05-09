import { apiClient } from './apiClient';

export type ProCheckoutSession = {
  url: string;
};

const createProCheckoutSession = async (): Promise<ProCheckoutSession> => {
  const { data } = await apiClient.post<ProCheckoutSession>('/auth/pro/checkout-session');
  return data;
};

export const billingService = {
  createProCheckoutSession,
};



