import { apiClient } from './apiClient';
import type { PlanType } from './authService';

export type RevenueBreakdown = {
  song_owner: number;
  investor: number;
  jukebox_owner: number;
  payer: number;
  platform: number;
};

export type RevenueBalance = {
  available: number;
  pending: number;
  withdrawn: number;
  lifetimeGross: number;
  lifetimeNet: number;
  failed: number;
  currency: string;
};

export type Payout = {
  id: number;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  stripePayoutId: string | null;
  stripeTransferId: string | null;
  failureReason: string | null;
  requestedAt: string;
  processedAt: string | null;
};

export type StripeBalanceSnapshot = {
  available?: number;
  pending?: number;
  currency?: string;
  livemode?: boolean;
  error?: string;
};

export type StripeProfile = {
  accountId: string | null;
  onboardingComplete: boolean;
  payoutsEnabled: boolean;
  plan: PlanType | null;
  balance: StripeBalanceSnapshot | null;
};

export type RevenueLimits = {
  minPayoutAmount: number;
};

export type RevenueSummary = {
  totals: RevenueBreakdown;
  balance: RevenueBalance;
  payouts: Payout[];
  stripe: StripeProfile;
  limits: RevenueLimits;
};

export type StripeOnboardingLink = {
  url: string;
  expiresAt: string | null;
  accountId: string;
  onboardingComplete: boolean;
  payoutsEnabled: boolean;
};

const getSummary = async (): Promise<RevenueSummary> => {
  const { data } = await apiClient.get<RevenueSummary>('/revenue/summary');
  return data;
};

const requestPayout = async (amount?: number) => {
  const payload = typeof amount === 'number' ? { amount } : {};
  const { data } = await apiClient.post<{ payout: Payout }>('/revenue/payouts', payload);
  return data.payout;
};

const getPayoutHistory = async (): Promise<Payout[]> => {
  const { data } = await apiClient.get<{ payouts: Payout[] }>('/revenue/payouts/history');
  return data.payouts;
};

const createStripeOnboardingLink = async (): Promise<StripeOnboardingLink> => {
  const { data } = await apiClient.post<StripeOnboardingLink>('/revenue/stripe/onboarding-link');
  return data;
};

export const revenueService = {
  getSummary,
  requestPayout,
  getPayoutHistory,
  createStripeOnboardingLink,
};