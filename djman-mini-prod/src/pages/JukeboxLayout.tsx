import { Navigate, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavigationTop } from '../components/NavigationTop';
import { PlaceJukebox } from '../components/PlaceJukebox';
import { PaymentModal } from '../components/PaymentModal';
import { TrackPurchaseModal } from '../components/TrackPurchaseModal';

export type LayoutContext = {
  slug: string;
};

export const useJukeboxLayoutContext = () => useOutletContext<LayoutContext>();

export const JukeboxLayout = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const isAdminRoute = location.pathname.endsWith('/admin');

  useEffect(() => {
    if (!isAdminRoute) {
      return;
    }
    if (isLoading) {
      return;
    }

    if (!user) {
      navigate('/login', { replace: true, state: { from: location } });
      return;
    }

    if (user.role !== 'admin' && user.jukebox?.slug && user.jukebox.slug !== slug) {
      navigate(`/${user.jukebox.slug}/admin`, { replace: true });
    }
  }, [isAdminRoute, isLoading, user, slug, navigate, location]);

  if (!slug) {
    return <Navigate to="/login" replace />;
  }

  if (isAdminRoute && isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark text-white">
        <p className="text-sm text-white/60">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark text-white">
      <NavigationTop slug={slug} isAdmin={isAdminRoute} />
      <main className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6 px-4 py-6 sm:px-6 sm:py-10">
        <PlaceJukebox slug={slug} hideInterface={isAdminRoute} />
        <Outlet context={{ slug }} />
      </main>
      <PaymentModal slug={slug} />
      <TrackPurchaseModal slug={slug} />
    </div>
  );
};


