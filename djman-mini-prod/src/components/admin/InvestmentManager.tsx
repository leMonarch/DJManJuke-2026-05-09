import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { Track, TrackInvestment } from '../../types/music';
import { useAuth } from '../../context/AuthContext';
import { investmentService } from '../../services/investmentService';

type InvestmentFormState = Record<number, string>;

const formatCurrency = (amount: number, locale: string = 'fr-CA') =>
  amount.toLocaleString(locale, { style: 'currency', currency: 'CAD' });

type InvestmentManagerProps = {
  slug: string;
};

export const InvestmentManager = ({ slug }: InvestmentManagerProps) => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const locale = language === 'fr' ? 'fr-CA' : 'en-CA';
  const [catalog, setCatalog] = useState<Track[]>([]);
  const [myInvestments, setMyInvestments] = useState<
    Array<TrackInvestment & { title: string; artist: string }>
  >([]);
  const [formState, setFormState] = useState<InvestmentFormState>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetStatus = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const loadData = useCallback(async () => {
    if (!slug) {
      return;
    }
    setIsLoading(true);
    resetStatus();
    try {
      const [songsResponse, investmentsResponse] = await Promise.all([
        investmentService.listCatalog(slug),
        investmentService.listMine(),
      ]);
      setCatalog(songsResponse);
      setMyInvestments(investmentsResponse);
    } catch (err) {
      setError(t('investment.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [resetStatus, slug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAmountChange = (songId: number, value: string) => {
    setFormState((prev) => ({
      ...prev,
      [songId]: value,
    }));
  };

  const handleInvest = async (song: Track) => {
    const amountValue = formState[song.id];
    if (!amountValue) {
      setError(t('investment.amountRequired'));
      return;
    }
    const parsedAmount = Number(amountValue);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError(t('investment.invalidAmount'));
      return;
    }
    resetStatus();
    setIsSubmitting(true);
    try {
      await investmentService.create({ songId: song.id, amount: parsedAmount });
      setSuccess(t('investment.saveSuccess'));
      setFormState((prev) => ({ ...prev, [song.id]: '' }));
      await loadData();
    } catch (err) {
      setError(t('investment.saveError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalPassiveInvestments = useMemo(
    () => myInvestments.filter((inv) => inv.passive_share === 1).length,
    [myInvestments],
  );

  const currentUserId = user?.user_id ?? null;

  const ownSongs = useMemo(
    () => catalog.filter((song) => (song.user_id ?? null) === currentUserId),
    [catalog, currentUserId],
  );

  const otherSongs = useMemo(
    () => catalog.filter((song) => (song.user_id ?? null) !== currentUserId),
    [catalog, currentUserId],
  );

  const renderSongCard = useCallback(
    (song: Track, options: { showOwner?: boolean } = {}) => {
      const investments = song.investments ?? [];
      const activeInvestments = investments.filter((inv) => inv.amount_remaining > 0);
      const passiveInvestors = investments.filter((inv) => inv.passive_share === 1);
      const totalRemaining = activeInvestments.reduce((sum, inv) => sum + inv.amount_remaining, 0);
      const ownerLabel =
        song.owner_username ?? (song.user_id ? `${t('investment.owner')} #${song.user_id}` : t('revenue.platform'));

      return (
        <div key={song.id} className="rounded-lg border border-white/10 bg-dark/60 p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 min-w-0">
              <h5 className="text-sm font-semibold text-white sm:text-base">{song.title}</h5>
              <p className="text-xs text-white/60 sm:text-sm">{song.artist}</p>
              <p className="text-xs text-white/40">{t('investment.order')}&nbsp;: {song.song_order_id ?? '—'}</p>
              {options.showOwner ? (
                <>
                  <p className="text-xs text-white/50">{t('investment.owner')}&nbsp;: {ownerLabel}</p>
                  <p className="text-xs text-white/50">
                    {song.is_in_jukebox
                      ? t('investment.inJukebox')
                      : t('investment.notInJukebox')}
                  </p>
                </>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 w-full sm:w-72">
              <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/60">
                {t('investment.amountToInvest')}
                <input
                  type="number"
                  step="0.25"
                  min="0.5"
                  value={formState[song.id] ?? ''}
                  onChange={(event) => handleAmountChange(song.id, event.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => handleInvest(song)}
                disabled={isSubmitting}
                className="min-h-[44px] w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? t('investment.processing') : t('investment.invest')}
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            <div className="flex flex-col gap-1 text-sm text-white/70 sm:flex-row">
              <span>
                {t('investment.activeInvestments')}&nbsp;: {activeInvestments.length || t('song.none')}
              </span>
              <span className="hidden sm:inline">|</span>
              <span>
                {t('investment.budgetRemaining')}&nbsp;: {formatCurrency(totalRemaining, locale)}
              </span>
            </div>
            {passiveInvestors.length ? (
              <p className="text-sm text-white/50">
                {t('investment.passiveInvestors')} :{' '}
                {passiveInvestors.map((inv) => `${inv.username} (${formatCurrency(inv.passive_earned, locale)})`).join(', ')}
              </p>
            ) : null}
            {investments.length ? (
              <ul className="space-y-1 text-xs text-white/60">
                {investments.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap gap-2">
                    <span className="font-semibold text-white/80">{inv.username}</span>
                    <span>{t('song.total')}&nbsp;: {formatCurrency(inv.amount_total, locale)}</span>
                    <span>{t('song.remaining')}&nbsp;: {formatCurrency(inv.amount_remaining, locale)}</span>
                    {inv.passive_share === 1 ? (
                      <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
                        {t('song.passiveShare')}&nbsp;: {formatCurrency(inv.passive_earned, locale)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-white/40">{t('investment.noInvestments')}</p>
            )}
          </div>
        </div>
      );
    },
    [formState, handleAmountChange, handleInvest, isSubmitting],
  );

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      <header className="space-y-2">
        <h3 className="text-base font-semibold text-white sm:text-lg">{t('investment.title')}</h3>
        <p className="text-sm text-white/60">
          {t('investment.subtitle')}
        </p>
      </header>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-400">{success}</p> : null}

      <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-sm font-semibold text-white sm:text-base">{t('investment.mySongs')}</h4>
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="min-h-[44px] w-full sm:w-auto rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? t('common.loading') : t('songs.refresh')}
          </button>
        </div>
        <div className="grid gap-4">
          {ownSongs.length ? (
            ownSongs.map((song) => renderSongCard(song))
          ) : (
            <p className="text-sm text-white/50">{t('investment.noSongs')}</p>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-sm font-semibold text-white sm:text-base">{t('investment.platformCatalog')}</h4>
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="min-h-[44px] w-full sm:w-auto rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? t('common.loading') : t('songs.refresh')}
          </button>
        </div>
        <div className="grid gap-4">
          {otherSongs.length ? (
            otherSongs.map((song) => renderSongCard(song, { showOwner: true }))
          ) : (
            <p className="text-sm text-white/50">
              {t('investment.noOtherSongs')}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <h4 className="text-sm font-semibold text-white sm:text-base">{t('investment.passiveSummary')}</h4>
        {myInvestments.length ? (
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            {myInvestments.map((inv) => (
              <li key={inv.id} className="rounded-lg border border-white/10 bg-dark/60 p-3 sm:p-4">
                <div className="flex flex-col gap-2">
                  <span className="font-semibold text-white">
                    {inv.title} — {inv.artist}
                  </span>
                  <div className="flex flex-col gap-1 sm:flex-row sm:gap-2">
                    <span>
                      {t('investment.totalInvested')} : {formatCurrency(inv.amount_total, locale)}
                    </span>
                    <span className="hidden sm:inline">|</span>
                    <span>
                      {t('song.remaining')} : {formatCurrency(inv.amount_remaining, locale)}
                    </span>
                  </div>
                  <span>
                    {t('investment.passiveShare')} :{' '}
                    {inv.passive_share === 1
                      ? `${t('investment.passiveYes')} (${formatCurrency(inv.passive_earned, locale)})`
                      : t('investment.passiveNo')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-white/50">{t('investment.noPassiveInvestments')}</p>
        )}
        {totalPassiveInvestments ? (
          <p className="mt-3 text-xs text-white/40">
            {t('investment.passiveShareCount', { count: totalPassiveInvestments.toString() })}
          </p>
        ) : null}
      </section>
    </div>
  );
};


