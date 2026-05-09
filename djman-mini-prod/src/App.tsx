import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useLanguage } from './context/LanguageContext';

// Lazy loading des pages pour améliorer les performances
const LoginPage = lazy(() => import('./pages/LoginPage').then(module => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then(module => ({ default: module.RegisterPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(module => ({ default: module.AdminPage })));
const JukeboxLayout = lazy(() => import('./pages/JukeboxLayout').then(module => ({ default: module.JukeboxLayout })));

const LoadingScreen = () => {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dark text-white px-4">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary"></div>
        </div>
        <p className="text-sm text-white/60 animate-pulse">{t('common.loading')}</p>
      </div>
    </div>
  );
};

const JukeboxPlaceholder = () => null;

export const App = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  const defaultSlug = user?.jukebox?.slug;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={user && defaultSlug ? <Navigate to={`/${defaultSlug}`} replace /> : <Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/:slug" element={<JukeboxLayout />}>
          <Route index element={<JukeboxPlaceholder />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to={user && defaultSlug ? `/${defaultSlug}` : '/login'} replace />} />
      </Routes>
    </Suspense>
  );
};

