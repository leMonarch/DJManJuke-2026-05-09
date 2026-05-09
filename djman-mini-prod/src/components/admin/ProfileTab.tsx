import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { billingService } from '../../services/billingService';
import { authService } from '../../services/authService';

type ProfileTabProps = {
  onSelectRevenueTab?: () => void;
};

export const ProfileTab = ({ onSelectRevenueTab }: ProfileTabProps) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user, updatePlan, logout, refreshUser } = useAuth();
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    jukeboxName: '',
  });
  const [deletePassword, setDeletePassword] = useState<string>('');

  const planLabel = useMemo(() => {
    if (!user) return '—';
    return user.plan === 'pro' ? 'Pro' : 'Free';
  }, [user]);

  const planStatusLabel = useMemo(() => {
    if (!user) return '—';
    switch (user.plan_status) {
      case 'active':
        return t('profile.active');
      case 'trial':
        return t('profile.trial');
      case 'inactive':
      default:
        return t('profile.inactive');
    }
  }, [user, t]);

  const handleUpgradeClick = async () => {
    if (!user || user.plan === 'pro') {
      if (onSelectRevenueTab) {
        onSelectRevenueTab();
      }
      return;
    }

    setIsUpdating(true);
    setError(null);
    try {
      // Crée une session d’abonnement Stripe pour le plan Pro et redirige l’utilisateur.
      const session = await billingService.createProCheckoutSession();
      if (session?.url) {
        window.location.href = session.url;
        return;
      }
      setError(t('profile.upgradeError'));
    } catch (_error) {
      setError(t('profile.updateError'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDowngradeClick = async () => {
    if (!user || user.plan === 'free') {
      return;
    }

    setIsUpdating(true);
    setError(null);
    try {
      const stripeCanceled = await updatePlan('free');
      if (stripeCanceled === true) {
        toast.success(t('profile.downgradeSuccess1'));
      } else if (stripeCanceled === false) {
        toast.success(t('profile.downgradeSuccess2'));
      } else {
        toast.success(t('profile.downgradeSuccess3'));
      }
    } catch (_error) {
      setError(t('profile.updateError'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEditClick = () => {
    if (!user) return;
    setEditForm({
      username: user.username,
      email: user.email,
      jukeboxName: user.jukebox?.name || '',
    });
    setIsEditing(true);
    setError(null);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm({ username: '', email: '', jukeboxName: '' });
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!user) return;
    setIsUpdating(true);
    setError(null);
    try {
      const result = await authService.updateProfile({
        username: editForm.username !== user.username ? editForm.username : undefined,
        email: editForm.email !== user.email ? editForm.email : undefined,
        jukeboxName: editForm.jukeboxName !== user.jukebox?.name ? editForm.jukeboxName : undefined,
      });
      // Mettre à jour le token et l'utilisateur dans le contexte
      localStorage.setItem('placejukebox:token', result.token);
      await refreshUser();
      toast.success(t('profile.updateSuccess'));
      setIsEditing(false);
    } catch (err: any) {
      const message = err?.response?.data?.message || t('profile.updateError');
      if (message.includes('courriel') || message.includes('email')) {
        setError(t('profile.updateConflict', { field: t('profile.email') }));
      } else if (message.includes('nom d\'utilisateur') || message.includes('username')) {
        setError(t('profile.updateConflict', { field: t('profile.username') }));
      } else {
        setError(message);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteClick = () => {
    setIsDeleting(true);
    setDeletePassword('');
    setError(null);
  };

  const handleCancelDelete = () => {
    setIsDeleting(false);
    setDeletePassword('');
    setError(null);
  };

  const handleConfirmDelete = async () => {
    if (!user) return;
    if (!deletePassword) {
      setError(t('profile.passwordRequired'));
      return;
    }

    setIsUpdating(true);
    setError(null);
    try {
      await authService.deleteProfile(deletePassword);
      toast.success(t('profile.deleteSuccess'));
      logout();
      navigate('/login');
    } catch (err: any) {
      const message = err?.response?.data?.message || t('profile.deleteError');
      if (message.includes('lemonarch')) {
        setError(t('profile.lemonarchProtected'));
      } else if (message.includes('Mot de passe') || message.includes('password')) {
        setError(t('profile.incorrectPassword'));
      } else {
        setError(message);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  if (!user) {
    return null;
  }

  const isFree = user.plan === 'free';
  const isPro = user.plan === 'pro';

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="space-y-2">
        <h3 className="text-base font-semibold text-white sm:text-lg">{t('profile.title')}</h3>
        <p className="text-sm text-white/60">
          {t('profile.subtitle')}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 shadow-lg shadow-black/20 backdrop-blur">
          <div className="flex items-center justify-between mb-3 gap-3">
            <h4 className="text-sm font-semibold text-white sm:text-base">{t('profile.basicInfo')}</h4>
            {!isEditing && (
              <button
                type="button"
                onClick={handleEditClick}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg px-3 py-2 text-xs sm:text-sm text-primary hover:text-secondary hover:bg-white/10 transition"
              >
                {t('profile.edit')}
              </button>
            )}
          </div>
          {isEditing ? (
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs text-white/60 mb-1.5">{t('profile.email')}</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="min-h-[44px] w-full rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1.5">{t('profile.username')}</label>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="min-h-[44px] w-full rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </div>
              {user.jukebox && (
                <div>
                  <label className="block text-xs text-white/60 mb-1.5">{t('profile.jukeboxName')}</label>
                  <input
                    type="text"
                    value={editForm.jukeboxName}
                    onChange={(e) => setEditForm({ ...editForm, jukeboxName: e.target.value })}
                    className="min-h-[44px] w-full rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
              )}
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isUpdating}
                  className="min-h-[44px] flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUpdating ? t('profile.saving') : t('profile.save')}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isUpdating}
                  className="min-h-[44px] flex-1 rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('profile.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <dl className="mt-3 space-y-2 text-sm text-white/80">
              <div className="flex items-center justify-between">
                <dt className="text-white/60">{t('profile.email')}</dt>
                <dd className="font-medium">{user.email}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-white/60">{t('profile.username')}</dt>
                <dd className="font-medium">{user.username}</dd>
              </div>
              {user.jukebox ? (
                <>
                  <div className="flex items-center justify-between">
                    <dt className="text-white/60">{t('profile.jukeboxName')}</dt>
                    <dd className="font-medium">{user.jukebox.name}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-white/60">{t('profile.slug')}</dt>
                    <dd className="font-mono text-xs">{user.jukebox.slug}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          )}
        </article>

        <article className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 shadow-lg shadow-black/20 backdrop-blur">
          <h4 className="text-sm font-semibold text-white sm:text-base">{t('profile.subscription')}</h4>
          <div className="mt-3 space-y-2">
            <p className="text-sm text-white/70">{t('profile.currentPlan')}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <p className="text-xl sm:text-2xl font-bold text-secondary">
                {planLabel}
              </p>
              <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70 w-fit">
                {t('profile.status')} : {planStatusLabel}
              </span>
            </div>
            {isFree ? (
              <p className="text-xs text-white/60">
                {t('profile.proDescription')}
              </p>
            ) : (
              <p className="text-xs text-white/60">
                {t('profile.proActive')}
              </p>
            )}
          </div>
          {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {isFree ? (
              <button
                type="button"
                onClick={handleUpgradeClick}
                disabled={isUpdating}
                className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-secondary px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUpdating ? t('profile.upgrading') : t('profile.upgrade')}
              </button>
            ) : null}
            {isPro ? (
              <button
                type="button"
                onClick={handleDowngradeClick}
                disabled={isUpdating}
                className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold text-white/80 transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUpdating ? t('profile.updating') : t('profile.downgrade')}
              </button>
            ) : null}
          </div>
        </article>
      </section>

      {/* Section de suppression de compte */}
      {user.jukebox?.slug !== 'lemonarch' && (
        <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-red-400 mb-2 sm:text-base">{t('profile.deleteAccount')}</h4>
          <p className="text-sm text-white/60 mb-4">{t('profile.deleteConfirm')}</p>
          {!isDeleting ? (
            <button
              type="button"
              onClick={handleDeleteClick}
              className="min-h-[44px] w-full sm:w-auto rounded-full border border-red-400/70 bg-red-500/20 px-5 py-2.5 text-sm font-semibold text-red-300 transition hover:border-red-300 hover:bg-red-500/30"
            >
              {t('profile.deleteAccount')}
            </button>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-white/60 mb-1.5">
                  {t('profile.passwordRequired')}
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder={t('profile.passwordRequired')}
                  className="min-h-[44px] w-full rounded-lg border border-red-400/50 bg-dark px-3 py-2 text-sm text-white focus:border-red-400 focus:outline-none"
                  autoFocus
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isUpdating || !deletePassword}
                  className="min-h-[44px] flex-1 rounded-full border border-red-400/70 bg-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:border-red-300 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUpdating ? t('profile.deleting') : t('profile.deleteConfirmButton')}
                </button>
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  disabled={isUpdating}
                  className="min-h-[44px] flex-1 rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('profile.cancel')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};


