import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import type { PlanType } from '../services/authService';
import { billingService } from '../services/billingService';

// Les options de plan seront traduites dynamiquement dans le composant

export const RegisterPage = () => {
  const { register, user, isLoading } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    jukeboxName: '',
    slug: '',
    plan: 'free' as PlanType,
  });

  const planOptions: Array<{ value: PlanType; label: string; description: string; price: string }> = [
    {
      value: 'free',
      label: t('register.planFree'),
      description: t('register.planFreeDesc'),
      price: language === 'fr' ? '$0/mois' : '$0/month',
    },
    {
      value: 'pro',
      label: t('register.planPro'),
      description: t('register.planProDesc'),
      price: language === 'fr' ? '$9.99/mois' : '$9.99/month',
    },
  ];
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoading && user) {
    const redirect = (user.jukebox?.slug && `/${user.jukebox.slug}/admin`) || '/';
    return <Navigate to={redirect} replace />;
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const normalizedSlug = form.slug.trim().toLowerCase();
      await register({
        ...form,
        email: form.email.trim(),
        slug: normalizedSlug,
        avatar: avatarFile,
      });
      // Si l'utilisateur choisit Pro, on l'envoie immédiatement vers Stripe
      // pour démarrer l'abonnement mensuel, comme depuis l'onglet Profil.
      if (form.plan === 'pro') {
        try {
          const session = await billingService.createProCheckoutSession();
          if (session?.url) {
            window.location.href = session.url;
            return;
          }
          setError(t('register.proError'));
        } catch {
          setError(t('register.proError'));
        }
      }
      navigate(`/${normalizedSlug}/admin`, { replace: true, state: { from: location } });
    } catch (err) {
      if (isAxiosError(err)) {
        const message =
          err.response?.data?.message ||
          (err.response?.status === 409 ? t('register.emailTaken') : null);
        setError(message ?? t('register.error'));
      } else {
        setError("Inscription impossible. Vérifiez les informations fournies.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dark px-4 py-6 text-white">
      <div className="w-full max-w-2xl space-y-4 sm:space-y-6 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-8 shadow-xl shadow-black/40">
        <header className="space-y-2 text-center">
          <h1 className="text-xl font-semibold sm:text-2xl">{t('register.title')}</h1>
          <p className="text-sm text-white/60">{t('register.subtitle')}</p>
        </header>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-white/80">
              {t('register.fullName')}
              <input
                name="username"
                value={form.username}
                onChange={handleChange}
                className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                required
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/80">
              {t('register.email')}
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                required
                autoComplete="email"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-white/80">
              {t('register.password')}
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                required
                autoComplete="new-password"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/80">
              {t('register.jukeboxName')}
              <input
                name="jukeboxName"
                value={form.jukeboxName}
                onChange={handleChange}
                className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                required
              />
            </label>
          </div>
          <label className="flex flex-col gap-2 text-sm text-white/80">
            {t('register.slug')}
            <input
              name="slug"
              value={form.slug}
              onChange={handleChange}
              pattern="^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$"
              className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-white/80">
            {t('register.avatar')}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {avatarPreview && (
                <img
                  src={avatarPreview}
                  alt={`Aperçu de l'avatar - ${form.username || 'utilisateur'}`}
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-cover border-2 border-white/20 flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="min-h-[44px] block w-full text-sm text-white/60 file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:opacity-85"
                />
                <p className="mt-1 text-xs text-white/50">{t('register.avatarFormat')}</p>
              </div>
            </div>
          </label>

          <fieldset className="space-y-3 rounded-lg border border-white/10 p-3 sm:p-4">
            <legend className="px-2 text-xs sm:text-sm font-semibold uppercase tracking-wide text-white/60">{t('register.planChoice')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {planOptions.map((plan) => {
                const isSelected = form.plan === plan.value;
                return (
                  <label
                    key={plan.value}
                    className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-3 sm:p-4 transition ${
                      isSelected ? 'border-primary bg-primary/10' : 'border-white/10 bg-dark/60 hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">{plan.label}</span>
                      <span className="text-xs font-semibold text-secondary">{plan.price}</span>
                    </div>
                    <p className="text-xs text-white/60">{plan.description}</p>
                    <input
                      type="radio"
                      name="plan"
                      value={plan.value}
                      checked={isSelected}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          plan: event.target.value as PlanType,
                        }))
                      }
                      className="sr-only"
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-[44px] w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? t('register.creating') : t('register.create')}
          </button>
        </form>
        <p className="text-center text-sm text-white/60">
          {t('register.hasAccount')}{' '}
          <Link to="/login" className="text-primary hover:underline">
            {t('register.login')}
          </Link>
        </p>
      </div>
    </div>
  );
};


