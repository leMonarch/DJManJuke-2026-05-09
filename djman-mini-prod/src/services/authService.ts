import { apiClient } from './apiClient';

export type PlanType = 'free' | 'pro';

type AuthResponse = {
  token: string;
  user: {
    user_id: number;
    email: string;
    username: string;
    role: string;
    plan: PlanType;
    plan_status: 'active' | 'inactive' | 'trial';
    stripe_account_id: string | null;
    stripe_onboarding_complete: boolean;
    stripe_payouts_enabled: boolean;
    jukebox: {
      id: number;
      slug: string;
      name: string;
      location?: string | null;
      avatar?: string | null;
    } | null;
  };
};

export type RegisterPayload = {
  username: string;
  email: string;
  password: string;
  jukeboxName: string;
  slug: string;
  plan: PlanType;
  avatar?: File | null;
};

export type LoginPayload = {
  email: string;
  password: string;
};

type UpdatePlanResponse = {
  token: string;
  user: AuthResponse['user'];
  stripeCanceled: boolean | null;
};

const register = async (payload: RegisterPayload) => {
  const formData = new FormData();
  formData.append('username', payload.username);
  formData.append('email', payload.email);
  formData.append('password', payload.password);
  formData.append('jukeboxName', payload.jukeboxName);
  formData.append('slug', payload.slug);
  formData.append('plan', payload.plan);
  if (payload.avatar) {
    formData.append('avatar', payload.avatar);
  }
  
  const { data } = await apiClient.post<AuthResponse>('/auth/register', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
};

const login = async (payload: LoginPayload) => {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', payload);
  return data;
};

const currentUser = async () => {
  const { data } = await apiClient.get<{ user: AuthResponse['user'] }>('/auth/me');
  return data.user;
};

const updatePlan = async (plan: PlanType) => {
  const { data } = await apiClient.post<UpdatePlanResponse>('/auth/plan', { plan });
  return data;
};

export type UpdateProfilePayload = {
  username?: string;
  email?: string;
  jukeboxName?: string;
};

const updateProfile = async (payload: UpdateProfilePayload) => {
  const { data } = await apiClient.put<AuthResponse>('/auth/profile', payload);
  return data;
};

const deleteProfile = async (password: string) => {
  const { data } = await apiClient.delete<{ success: boolean }>('/auth/profile', {
    data: { password },
  });
  return data;
};

export const authService = {
  register,
  login,
  currentUser,
  updatePlan,
  updateProfile,
  deleteProfile,
};



