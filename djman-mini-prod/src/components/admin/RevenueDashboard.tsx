import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { revenueService, type RevenueSummary } from '../../services/revenueService';
import { useAuth } from '../../context/AuthContext';
import { useJukeboxLayoutContext } from '../../pages/JukeboxLayout';
import { BALANCE_REFRESH_EVENT } from '../../constants/jukebox';

const formatAmount = (amount: number, currency: string, locale: string = 'fr-CA') =>
  amount.toLocaleString(locale, { style: 'currency', currency: currency.toUpperCase() });

export const RevenueDashboard = () => {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-CA' : 'en-CA';
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [isConnectingStripe, setIsConnectingStripe] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [payoutAmountInput, setPayoutAmountInput] = useState<string>('');
  const { slug } = useJukeboxLayoutContext();
  const { user } = useAuth();

  const loadSummary = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await revenueService.getSummary();
      setSummary(data);
      // Informe les autres parties de l'app (ex. NavigationTop) que le solde a potentiellement changé.
      window.dispatchEvent(new Event(BALANCE_REFRESH_EVENT));
    } catch (err) {
      setError(t('revenue.loadError'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const currency = summary?.balance.currency ?? 'CAD';
  const isPro = user?.plan === 'pro';
  const available = summary?.balance.available ?? 0;
  const pending = summary?.balance.pending ?? 0;
  const totalGross = summary?.balance.lifetimeGross ?? 0;
  const minPayout = summary?.limits.minPayoutAmount ?? 0;
  const stripeAvailable = summary?.stripe.balance?.available ?? null;
  const stripeBalanceCurrency = summary?.stripe.balance?.currency ?? currency;
  const transferableLimit =
    stripeAvailable != null ? Math.min(available, stripeAvailable) : available;

  // On affiche "Payé au total" uniquement sur la base des retraits réels (montants positifs),
  // en ignorant les recharges de solde (top-ups) qui utilisent des montants négatifs.
  const withdrawnDisplay = useMemo(() => {
    if (!summary?.payouts?.length) {
      return 0;
    }

    // On ne compte ici que les vrais retraits Stripe vers un compte bancaire,
    // pas les achats/priorités payés avec le solde interne.
    return summary.payouts
      .filter(
        (payout) =>
          payout.amount > 0 && payout.status === 'paid' && Boolean(payout.stripePayoutId),
      )
      .reduce((sum, payout) => sum + payout.amount, 0);
  }, [summary]);

  const canWithdraw = useMemo(() => {
    if (!summary || !isPro) {
      return false;
    }
    if (!summary.stripe.accountId) {
      return false;
    }
    if (!summary.stripe.onboardingComplete || !summary.stripe.payoutsEnabled) {
      return false;
    }
    return true;
  }, [isPro, summary]);

  const parsedPayoutAmount = useMemo(() => {
    const value = Number(payoutAmountInput.replace(',', '.'));
    if (!Number.isFinite(value)) {
      return NaN;
    }
    return Number(value.toFixed(2));
  }, [payoutAmountInput]);

  const effectivePayoutAmount = useMemo(() => {
    // Si aucun montant valide saisi, on suppose "tout retirer" (comportement historique)
    if (!Number.isFinite(parsedPayoutAmount) || parsedPayoutAmount <= 0) {
      return available;
    }
    return parsedPayoutAmount;
  }, [available, parsedPayoutAmount]);

  const meetsMinimum = effectivePayoutAmount >= minPayout;
  const withinAvailable = effectivePayoutAmount <= available + 0.0001;
  const isWithdrawDisabled =
    !canWithdraw || !meetsMinimum || !withinAvailable || isWithdrawing || isLoading;
  const needsStripeActivation = Boolean(
    summary &&
      isPro &&
      (!summary.stripe.accountId || !summary.stripe.onboardingComplete || !summary.stripe.payoutsEnabled),
  );

  const handlePayout = async () => {
    if (!summary) {
      return;
    }
    setIsWithdrawing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const amountToWithdraw = effectivePayoutAmount;
      const payout =
        Number.isFinite(amountToWithdraw) && amountToWithdraw > 0
          ? await revenueService.requestPayout(amountToWithdraw)
          : await revenueService.requestPayout();
      setSuccessMessage(
        payout.status === 'paid'
          ? t('revenue.withdrawSuccess1')
          : t('revenue.withdrawSuccess2'),
      );
      await loadSummary();
      setPayoutAmountInput('');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('revenue.withdrawError');
      setError(message);
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleStripeOnboarding = async () => {
    setIsConnectingStripe(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await revenueService.createStripeOnboardingLink();
      if (response?.url) {
        window.location.href = response.url;
        return;
      }
      setError(t('revenue.stripeError'));
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('revenue.stripeContactError');
      setError(message);
    } finally {
      setIsConnectingStripe(false);
    }
  };

  const sections = [
    {
      key: 'song_owner' as const,
      label: t('revenue.songOwner'),
      description: t('revenue.songOwnerDesc'),
    },
    {
      key: 'investor' as const,
      label: t('revenue.investor'),
      description: t('revenue.investorDesc'),
    },
    {
      key: 'jukebox_owner' as const,
      label: t('revenue.jukeboxOwner'),
      description: t('revenue.jukeboxOwnerDesc'),
    },
    {
      key: 'payer' as const,
      label: t('revenue.payer'),
      description: t('revenue.payerDesc'),
    },
    {
      key: 'platform' as const,
      label: t('revenue.platform'),
      description: t('revenue.platformDesc'),
    },
  ];

  const visibleSections = sections.filter((section) => section.key !== 'platform' || slug === 'lemonarch');

  const payoutStatusMessage = useMemo(() => {
    if (!summary) {
      return null;
    }
    if (!isPro) {
      return t('revenue.proRequired');
    }
    if (!summary.stripe.accountId) {
      return t('revenue.connectStripe');
    }
    if (!summary.stripe.onboardingComplete || !summary.stripe.payoutsEnabled) {
      return t('revenue.stripeVerifying');
    }
    if (!meetsMinimum) {
      return t('revenue.minAmountRequired', { amount: formatAmount(minPayout, currency, locale) });
    }
    if (!withinAvailable) {
      return t('revenue.amountExceeds', { amount: formatAmount(available, currency, locale) });
    }
    return t('revenue.withdrawInfo');
  }, [available, currency, isPro, meetsMinimum, minPayout, summary, withinAvailable, t, locale]);

  const formatStatus = (status: string) => {
    switch (status) {
      case 'paid':
        return t('revenue.statusPaid');
      case 'processing':
        return t('revenue.statusProcessing');
      case 'pending':
        return t('revenue.statusPending');
      case 'failed':
        return t('revenue.statusFailed');
      default:
        return status;
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    return date.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="space-y-2">
        <h3 className="text-base font-semibold text-white sm:text-lg">{t('revenue.title')}</h3>
        <p className="text-sm text-white/60">
          {t('revenue.subtitle')}
        </p>
        <button
          type="button"
          onClick={loadSummary}
          disabled={isLoading}
          className="min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? t('revenue.refreshing') : t('revenue.refresh')}
        </button>
      </header>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {successMessage ? <p className="text-sm text-emerald-400">{successMessage}</p> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 shadow-lg shadow-black/20 backdrop-blur">
          <h4 className="text-sm font-semibold text-white sm:text-base">{t('revenue.availableBalance')}</h4>
          <p className="mt-3 text-2xl sm:text-3xl font-bold text-secondary">{formatAmount(available, currency, locale)}</p>
          <div className="mt-2 flex flex-col gap-1 text-xs text-white/60 sm:flex-row sm:gap-2">
            <span>
              {t('revenue.minWithdrawal')} : {formatAmount(minPayout, currency, locale)}
            </span>
            <span className="hidden sm:inline">|</span>
            <span>
              {t('revenue.pending')} : {formatAmount(pending, currency, locale)}
            </span>
          </div>
          {stripeAvailable != null ? (
            <p className="mt-1 text-xs text-white/60">
              {t('revenue.stripeTransferable')} :{' '}
              {formatAmount(transferableLimit, stripeBalanceCurrency, locale)}{' '}
              {stripeAvailable < available
                ? `(${t('revenue.stripeBalance')} : ${formatAmount(
                    stripeAvailable,
                    stripeBalanceCurrency,
                    locale,
                  )})`
                : ''}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-white/50">{payoutStatusMessage}</p>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-xs text-white/70">
              {t('revenue.amountToWithdraw')} :
              <input
                type="number"
                min={0}
                step="0.01"
                value={payoutAmountInput}
                onChange={(event) => setPayoutAmountInput(event.target.value)}
                placeholder={available > 0 ? available.toFixed(2) : '0.00'}
                className="min-h-[44px] w-full rounded-full border border-white/20 bg-black/40 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-secondary focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={available <= 0}
                onClick={() => setPayoutAmountInput(available.toFixed(2))}
                className="min-h-[36px] rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/40 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('revenue.withdrawAll')}
              </button>
              {minPayout > 0 && available >= minPayout ? (
                <button
                  type="button"
                  onClick={() => setPayoutAmountInput(minPayout.toFixed(2))}
                  className="min-h-[36px] rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/40 hover:text-secondary"
                >
                  {t('revenue.minimum')} ({formatAmount(minPayout, currency, locale)})
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {needsStripeActivation ? (
              <button
                type="button"
                onClick={handleStripeOnboarding}
                disabled={isConnectingStripe || isLoading}
                className="min-h-[44px] w-full rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50"
              >
                {isConnectingStripe ? t('revenue.connectingStripe') : t('revenue.activateStripe')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handlePayout}
              disabled={isWithdrawDisabled}
              className="min-h-[44px] w-full rounded-full bg-secondary px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50"
            >
              {isWithdrawing ? t('revenue.withdrawing') : t('revenue.withdraw')}
            </button>
          </div>
        </article>

        <article className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 shadow-lg shadow-black/20 backdrop-blur">
          <h4 className="text-sm font-semibold text-white sm:text-base">{t('revenue.totalPaid')}</h4>
          <p className="mt-3 text-xl sm:text-2xl font-bold text-secondary">{formatAmount(withdrawnDisplay, currency, locale)}</p>
          <p className="mt-2 text-xs text-white/60">{t('revenue.totalPaidDesc')}</p>
        </article>

        <article className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 shadow-lg shadow-black/20 backdrop-blur">
          <h4 className="text-sm font-semibold text-white sm:text-base">{t('revenue.lifetimeGross')}</h4>
          <p className="mt-3 text-xl sm:text-2xl font-bold text-secondary">{formatAmount(totalGross, currency, locale)}</p>
          <p className="mt-2 text-xs text-white/60">{t('revenue.lifetimeGrossDesc')}</p>
        </article>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {visibleSections.map((section) => {
          const value = summary ? summary.totals[section.key] : 0;
          return (
            <article
              key={section.key}
              className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 shadow-lg shadow-black/20 backdrop-blur"
            >
              <h4 className="text-sm font-semibold text-white sm:text-base">{section.label}</h4>
              <p className="mt-1 text-xs text-white/60 sm:text-sm">{section.description}</p>
              <p className="mt-3 text-xl sm:text-2xl font-bold text-secondary">{formatAmount(value, currency)}</p>
            </article>
          );
        })}
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 shadow-lg shadow-black/20 backdrop-blur">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-white sm:text-base">{t('revenue.balanceMovements')}</h4>
            <p className="text-xs text-white/60">
              {t('revenue.balanceMovementsDesc')}
            </p>
          </div>
        </header>
        
        {/* Tableau desktop - Masqué sur mobile */}
        <div className="mt-4 hidden lg:block overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm text-white/80">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-xs text-white/50">{t('revenue.tableDate')}</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-xs text-white/50">{t('revenue.tableAmount')}</th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-xs text-white/50">
                  {t('revenue.tableType')}
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-xs text-white/50">
                  {t('revenue.tableStatus')}
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-xs text-white/50">
                  {t('revenue.tableStripeId')}
                </th>
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-xs text-white/50">
                  {t('revenue.tableConfirmation')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {summary?.payouts?.length ? (
                summary.payouts.map((payout) => {
                  const isTopUp = payout.amount < 0;
                  // On considère comme "retrait Stripe" tout débit positif qui provient
                  // du flux de retrait, même si l'ID Stripe n’est pas encore renseigné
                  // (ex. en attente) : statut pending/processing/failed ou présence d’un ID Stripe.
                  const isStripePayout =
                    payout.amount > 0 &&
                    (Boolean(payout.stripePayoutId) ||
                      payout.status === 'pending' ||
                      payout.status === 'processing' ||
                      payout.status === 'failed');
                  const isInternalDebit = payout.amount > 0 && !isStripePayout;

                  const typeLabel = isTopUp
                    ? t('revenue.typeTopUp')
                    : isStripePayout
                      ? t('revenue.typePayout')
                      : t('revenue.typeInternal');

                  return (
                    <tr key={payout.id}>
                      <td className="px-4 py-3">{formatDate(payout.requestedAt)}</td>
                      <td className="px-4 py-3 font-semibold">
                        <span
                          className={
                            isTopUp
                              ? 'text-emerald-300'
                              : 'text-secondary'
                          }
                        >
                          {isTopUp ? '+' : '-'}
                          {formatAmount(Math.abs(payout.amount), currency, locale)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-xs text-white/80">{typeLabel}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            payout.status === 'failed'
                              ? 'text-red-400'
                              : payout.status === 'paid'
                                ? 'text-emerald-400'
                                : 'text-white/70'
                          }
                        >
                          {formatStatus(payout.status)}
                        </span>
                        <span className="block text-xs text-white/50">
                          {isStripePayout
                            ? t('revenue.payoutDesc')
                            : isInternalDebit
                              ? t('revenue.internalDebitDesc')
                              : t('revenue.topUpDesc')}
                        </span>
                        {payout.failureReason ? (
                          <span className="block text-xs text-red-300">{payout.failureReason}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs">{payout.stripePayoutId ?? '—'}</td>
                      <td className="px-4 py-3 text-xs">{formatDate(payout.processedAt)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-white/50" colSpan={6}>
                    {t('revenue.noPayouts')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Cartes mobile - Visibles uniquement sur mobile/tablette */}
        <div className="mt-4 lg:hidden space-y-3">
          {summary?.payouts?.length ? (
            summary.payouts.map((payout) => {
              const isTopUp = payout.amount < 0;
              const isStripePayout =
                payout.amount > 0 &&
                (Boolean(payout.stripePayoutId) ||
                  payout.status === 'pending' ||
                  payout.status === 'processing' ||
                  payout.status === 'failed');
              // const isInternalDebit = payout.amount > 0 && !isStripePayout; // Utilisé dans le bloc précédent

              const typeLabel = isTopUp
                ? t('revenue.typeTopUp')
                : isStripePayout
                  ? t('revenue.typePayout')
                  : t('revenue.typeInternal');

              return (
                <div key={payout.id} className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{formatDate(payout.requestedAt)}</p>
                      <p className="text-xs text-white/60 mt-1">{typeLabel}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${isTopUp ? 'text-emerald-300' : 'text-secondary'}`}>
                        {isTopUp ? '+' : '-'}
                        {formatAmount(Math.abs(payout.amount), currency, locale)}
                      </p>
                      <p className={`text-xs mt-1 ${
                        payout.status === 'failed'
                          ? 'text-red-400'
                          : payout.status === 'paid'
                            ? 'text-emerald-400'
                            : 'text-white/70'
                      }`}>
                        {formatStatus(payout.status)}
                      </p>
                    </div>
                  </div>
                  {payout.stripePayoutId && (
                    <p className="text-xs text-white/50">
                      Stripe ID: {payout.stripePayoutId}
                    </p>
                  )}
                  {payout.processedAt && (
                    <p className="text-xs text-white/50">
                      {t('revenue.tableConfirmation')}: {formatDate(payout.processedAt)}
                    </p>
                  )}
                  {payout.failureReason && (
                    <p className="text-xs text-red-300">{payout.failureReason}</p>
                  )}
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-white/10 p-6 text-center text-sm text-white/50">
              {t('revenue.noPayouts')}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};