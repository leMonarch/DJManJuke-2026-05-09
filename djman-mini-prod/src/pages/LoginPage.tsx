import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const LoginPage = () => {
  const { login, user, isLoading, updatePlan } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userSlug = useMemo(() => user?.jukebox?.slug ?? null, [user]);
  const subscriptionStatus = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('subscription');
  }, [location.search]);

  useEffect(() => {
    if (userSlug) {
      navigate(`/${userSlug}/admin`, { replace: true, state: { from: location } });
    }
  }, [location, navigate, userSlug]);

  // Après un retour Stripe (success URL), si l'utilisateur est déjà connecté,
  // on active son plan Pro côté application.
  useEffect(() => {
    if (!user || user.plan === 'pro') {
      return;
    }
    if (subscriptionStatus !== 'success') {
      return;
    }

    (async () => {
      try {
        await updatePlan('pro');
      } catch {
        // En cas d'erreur, on laisse simplement l'utilisateur sur la page de connexion.
      }
    })();
  }, [subscriptionStatus, updatePlan, user]);

  const isAuthenticatedWithoutJukebox = !isLoading && user && !userSlug;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await login({ email: email.trim(), password });
    } catch (err) {
      setError("Connexion impossible. Vérifiez vos identifiants.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthenticatedWithoutJukebox) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-dark px-4 py-6 text-white">
        <div className="w-full max-w-md space-y-4 sm:space-y-6 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-8 text-center shadow-xl shadow-black/40">
          <h1 className="text-xl font-semibold sm:text-2xl">Compte sans jukebox assigné</h1>
          <p className="text-sm text-white/60">
            Votre profil n'a pas encore de jukebox associé. Contactez un administrateur afin qu'il vous attribue un jukebox avant
            de continuer.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dark px-4 py-6 text-white">
      <div className="w-full max-w-md space-y-4 sm:space-y-6 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-8 shadow-xl shadow-black/40">
        <header className="space-y-2 text-center">
          <h1 className="text-xl font-semibold sm:text-2xl">Connexion</h1>
          <p className="text-sm text-white/60">Accédez à votre jukebox personnalisé.</p>
        </header>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex flex-col gap-2 text-sm text-white/80">
            Courriel
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
              required
              autoComplete="email"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-white/80">
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
              required
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-[44px] w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
        <p className="text-center text-sm text-white/60">
          Pas de compte ?{' '}
          <Link to="/register" className="text-primary hover:underline">
            Créer un jukebox
          </Link>
        </p>
      </div>
    </div>
  );
};



