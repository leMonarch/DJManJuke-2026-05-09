import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { authService, type LoginPayload, type PlanType, type RegisterPayload } from '../services/authService';
import { setAuthToken } from '../services/apiClient';

export type AuthUser = {
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

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updatePlan: (plan: PlanType) => Promise<boolean | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'placejukebox:token';

const persistToken = (token: string | null) => {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
  setAuthToken(token);
};

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const applyAuthResponse = useCallback((authToken: string, authUser: AuthUser) => {
    persistToken(authToken);
    setToken(authToken);
    setUser(authUser);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const current = await authService.currentUser();
      setUser(current);
    } catch (_error) {
      persistToken(null);
      setToken(null);
      setUser(null);
    }
  }, [token]);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken) {
      persistToken(storedToken);
      setToken(storedToken);
      authService
        .currentUser()
        .then((current) => {
          setUser(current);
        })
        .catch(() => {
          persistToken(null);
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      persistToken(null);
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const { token: authToken, user: authUser } = await authService.login(payload);
    applyAuthResponse(authToken, authUser);
  }, [applyAuthResponse]);

  const register = useCallback(async (payload: RegisterPayload) => {
    const { token: authToken, user: authUser } = await authService.register(payload);
    applyAuthResponse(authToken, authUser);
  }, [applyAuthResponse]);

  const logout = useCallback(() => {
    persistToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const updatePlan = useCallback(
    async (plan: PlanType) => {
      const { token: authToken, user: authUser, stripeCanceled } = await authService.updatePlan(plan);
      applyAuthResponse(authToken, authUser as AuthUser);
      return stripeCanceled ?? null;
    },
    [applyAuthResponse],
  );

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      login,
      register,
      logout,
      refreshUser,
      updatePlan,
    }),
    [isLoading, login, logout, refreshUser, token, updatePlan, register, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};



