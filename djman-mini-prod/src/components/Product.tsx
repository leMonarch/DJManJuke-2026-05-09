import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useLanguage } from '../context/LanguageContext';
import { TrackInvestorsList } from './TrackInvestorsList';
import { AudioCard } from './AudioCard';
import { VideoCard } from './VideoCard';
import type { Track } from '../types/music';

type ProductProps = {
  track: Track;
  isActive?: boolean;
  isPreviewing?: boolean;
  // État global du player audio pour synchroniser la vidéo de la carte active
  isPlayerPlaying?: boolean;
  playerPositionSeconds?: number;
  isQueued?: boolean;
  isPrioritized?: boolean;
  nextAmount: number;
  onPreview?: (track: Track) => void;
  onPrioritize?: (track: Track, amount: number) => void;
  onPrioritizeFromBalance?: (track: Track, amount: number) => void;
  canPrioritize?: boolean;
  onBuy?: (track: Track) => void;
  showGainLabelForGolden?: boolean;
  onCancelPriority?: (track: Track) => void;
  isPro?: boolean; // Indique si l'utilisateur a le plan Pro
  isOwnerPro?: boolean; // Indique si l'utilisateur est propriétaire du jukebox ET a le plan Pro
  onTogglePlay?: () => void; // Callback pour toggle play/pause du player audio
  onPauseMainPlayer?: () => void; // Callback pour mettre en pause le player principal
  onResumeMainPlayer?: () => void; // Callback pour reprendre le player principal
  // Extension souple pour accepter des props additionnelles sans casser le typage existant.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

const formatAmount = (amount: number, locale: string = 'fr-CA') => amount.toLocaleString(locale, { style: 'currency', currency: 'CAD' });

export const Product = ({
  track,
  isActive,
  isPreviewing,
  isPlayerPlaying = false,
  playerPositionSeconds = 0,
  isQueued,
  isPrioritized,
  nextAmount,
  onPreview,
  onPrioritize,
  onPrioritizeFromBalance,
  canPrioritize,
  onBuy,
  showGainLabelForGolden = true,
  onCancelPriority,
  isPro = false,
  isOwnerPro = false,
  onTogglePlay,
  onPauseMainPlayer,
  onResumeMainPlayer,
}: ProductProps) => {
  const { t, language } = useLanguage();
  const investments = track.investments ?? [];
  const activeInvestors = investments.filter((investment) => investment.amount_remaining > 0);
  const totalRemaining = activeInvestors.reduce((sum, investment) => sum + investment.amount_remaining, 0);

  // Définir isVideo selon video.yaml
  const isVideo =
    track.is_video ??
    (typeof track.file_path === 'string' && track.file_path.toLowerCase().endsWith('.mp4'));

  const handlePreview = () => {
    onPreview?.(track);
  };

  const handleBuy = () => {
    onBuy?.(track);
  };

  const canSellPriority = canPrioritize ?? true;
  const locale = language === 'fr' ? 'fr-CA' : 'en-CA';
  const nextAmountLabel = formatAmount(nextAmount || 0.5, locale);
  const gainAmountLabel = formatAmount(Number((nextAmount * 0.2).toFixed(2)), locale);
  const isGoldenWithEnoughRemaining = track.is_golden && totalRemaining >= 0.5;

  const prioritizeButtonClasses = (() => {
    if (isActive) {
      return 'cursor-not-allowed bg-white/10 text-white/50';
    }
    if (!canSellPriority) {
      return 'cursor-not-allowed bg-white/10 text-white/50';
    }
    if (isGoldenWithEnoughRemaining) {
      // bouton doré mis en avant pour les Golden avec au moins 0,50 $ restants
      return 'bg-secondary text-dark hover:opacity-90';
    }
    return 'bg-primary text-white hover:opacity-90';
  })();

  const handlePrioritize = () => {
    if (!canSellPriority) {
      return;
    }
    onPrioritize?.(track, nextAmount);
  };

  const handlePrioritizeFromBalance = () => {
    if (!canSellPriority) {
      // Si la priorité pro ne peut plus être priorisée car une priorité payante a pris préséance
      if (track.has_free_priority && isOwnerPro && track.priority_total && Number(track.priority_total) > 0) {
        toast.error(t('song.paidPriorityPrecedence'));
      }
      return;
    }
    onPrioritizeFromBalance?.(track, nextAmount);
  };

  const handleCancelPriority = () => {
    onCancelPriority?.(track);
  };

  let cardStyles = 'border-white/12 bg-white/[0.07] ring-3 ring-white/10';
  if (isActive) {
    cardStyles = 'border-primary/70 bg-primary/15 ring-[5px] ring-primary/60';
  } else if (track.has_free_priority) {
    // Encadré coloré pour les priorités gratuites (propriétaire pro)
    cardStyles = 'border-blue-400/70 bg-blue-500/10 ring-2 ring-blue-400/50';
  } else if (isPrioritized) {
    cardStyles = 'border-primary/60 bg-primary/10 ring-2 ring-primary/50';
  } else if (isQueued) {
    cardStyles = 'border-white/[0.16] bg-white/[0.09] ring-1 ring-secondary/40';
  }

  return (
    <motion.article
      layout
      className={`flex flex-col gap-3 rounded-xl border p-3 sm:p-4 transition ${cardStyles}`}
    >
      {/* Badges - Stack vertical sur mobile, horizontal sur desktop */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/60 sm:text-sm">
          {track.is_golden ? t('song.invested') : t('song.standard')}
        </div>
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm ${
            track.is_golden ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/10 text-white/60'
          }`}
        >
          {t('song.potentialGain')} : {gainAmountLabel}
        </span>
      </div>
      {/* SongCard selon video.yaml - affiche audioCard ou videoCard selon le média */}
      {isVideo ? (
        <VideoCard
          videoSrc={track.file_path}
          thumbnailSrc={track.image}
          title={track.title}
          isActive={isActive}
          isPreviewing={isPreviewing}
          isPlayerPlaying={isPlayerPlaying}
          playerPositionSeconds={playerPositionSeconds}
          onPreview={handlePreview}
          onPauseMainPlayer={onPauseMainPlayer}
          onResumeMainPlayer={onResumeMainPlayer}
          trackId={track.id}
        />
      ) : (
        <AudioCard
          imageSrc={track.image}
          title={track.title}
          isActive={isActive}
          isPreviewing={isPreviewing}
          isPlayerPlaying={isPlayerPlaying}
          onPreview={handlePreview}
          onTogglePlay={onTogglePlay}
          audioSrc={track.file_path}
          onPauseMainPlayer={onPauseMainPlayer}
          onResumeMainPlayer={onResumeMainPlayer}
          playerPositionSeconds={playerPositionSeconds}
          isPro={isPro}
          trackId={track.id}
        />
      )}
      {/* Métadonnées - Stack vertical sur mobile, horizontal sur desktop */}
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold truncate sm:text-lg">{track.title}</h3>
            <p className="text-sm text-white/60 truncate">{track.artist}</p>
          </div>
          <div className="flex flex-row items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
            <span className="text-xs text-white/50 sm:text-sm">
              {t('song.rank')} :{' '}
              <span className="font-medium text-white/70">
                {track.queue_rank != null && Number.isFinite(track.queue_rank)
                  ? track.queue_rank
                  : '—'}
              </span>
            </span>
            <span className="text-xs text-white/50 sm:text-sm">
              {t('song.totalBet')} :{' '}
              <span className="font-medium text-white/70">
                {track.priority_total != null && Number.isFinite(track.priority_total)
                  ? formatAmount(track.priority_total, locale)
                  : formatAmount(0, locale)}
              </span>
            </span>
          </div>
        </div>
      </div>
      {track.is_golden ? (
        <div className="rounded-lg border border-secondary/30 bg-secondary/10 p-3 text-xs sm:text-sm text-white/80">
          <p className="font-semibold text-secondary/90 mb-2">{t('song.investments')}</p>
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-2 text-white/70">
            <span>
              {t('song.activeBudget')} : <span className="font-medium text-white">{formatAmount(totalRemaining, locale)}</span>
            </span>
            <span className="hidden sm:inline">—</span>
            <span>
              {t('song.activeInvestors')} : <span className="font-medium text-white">{activeInvestors.length || t('song.none')}</span>
            </span>
          </div>
          <TrackInvestorsList investments={investments} />
        </div>
      ) : null}
      <div className="mt-auto flex flex-col gap-2 sm:gap-3">
        {/* ⭐ Mettre de l'avant : Prioriser */}
        <div className="flex flex-col gap-2">
          {/* Bouton "Utiliser mes gains" (utilise toujours le solde, jamais le modal Stripe) :
              - Standard : label "Prioriser pour 0,50 $"
              - Golden avec reste ≥ 0,50 $ : label "Gain de 0,10 $"
              - Golden avec reste < 0,50 $ : label "Prioriser pour 0,50 $" */}
          {!isActive && onPrioritizeFromBalance ? (
            <button
              type="button"
              onClick={handlePrioritizeFromBalance}
              disabled={!canSellPriority}
              className="min-h-[44px] w-full rounded-full border-2 border-emerald-400/70 bg-emerald-500/20 px-4 py-2.5 text-sm sm:text-base font-bold text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/40"
            >
              {isOwnerPro
                ? t('song.prioritize')
                : track.is_golden && isGoldenWithEnoughRemaining && showGainLabelForGolden
                  ? t('song.gainOf', { amount: gainAmountLabel })
                  : t('song.prioritizeFor', { amount: nextAmountLabel })}
            </button>
          ) : null}
          {/* Bouton Stripe "Prioriser" :
              - Jamais utilisé pour 0,50 $ (dans ce cas on passe toujours par le solde)
              - Pourra être utilisé pour des montants > 0,50 $ si la logique évolue */}
          {nextAmount > 0.5 && (
            <button
              type="button"
              onClick={handlePrioritize}
              disabled={isActive || !canSellPriority}
              className={`min-h-[44px] w-full rounded-full border-2 border-emerald-400/70 bg-emerald-500/20 px-4 py-2.5 text-sm sm:text-base font-bold text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-500/30 ${prioritizeButtonClasses}`}
            >
              {isActive
                ? t('song.nowPlaying')
                : canSellPriority
                ? t('song.prioritizeFor', { amount: nextAmountLabel })
                : t('song.priorityHeld', { amount: nextAmountLabel })}
            </button>
          )}
          {!isActive && onCancelPriority && (
            // Afficher le bouton seulement si :
            // 1. La chanson a une priorité payante (isPrioritized avec priority_total > 0)
            // 2. OU la chanson a une priorité pro ET l'utilisateur est propriétaire du jukebox visité
            (isPrioritized && track.priority_total && Number(track.priority_total) > 0) ||
            (track.has_free_priority && isOwnerPro)
          ) ? (
            <button
              type="button"
              onClick={handleCancelPriority}
              className="min-h-[44px] w-full rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-red-400 hover:text-red-300"
            >
              {t('song.cancelPriority')}
            </button>
          ) : null}
        </div>

        {/* ⭐ Rendre neutre : Écouter et discret : Acheter (stack vertical sur mobile, horizontal sur desktop) */}
        {!isActive && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handlePreview}
              className={`min-h-[44px] flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                isPreviewing ? 'bg-white/20 text-white' : 'bg-white/10 text-white/80 hover:bg-white/15'
              }`}
            >
              {isPreviewing
                ? t('song.stopPreview')
                : isPro
                  ? t('song.listenFull')
                  : t('song.listen15s')}
            </button>
            <button
              type="button"
              onClick={handleBuy}
              className="min-h-[44px] flex-1 rounded-full border border-emerald-400/70 bg-white/5 px-4 py-2 text-sm font-medium text-white/50 transition hover:border-emerald-400/70 hover:bg-white/10 hover:text-white/70"
            >
              {t('song.buy1')}
            </button>
          </div>
        )}
      </div>
    </motion.article>
  );
};

