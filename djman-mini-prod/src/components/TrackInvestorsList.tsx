import { useLanguage } from '../context/LanguageContext';
import type { TrackInvestment } from '../types/music';

type TrackInvestorsListProps = {
  investments: TrackInvestment[];
  maxVisible?: number;
};

export const TrackInvestorsList = ({ investments, maxVisible = 3 }: TrackInvestorsListProps) => {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-CA' : 'en-CA';
  
  if (!investments.length) {
    return <p className="mt-1 text-xs text-white/60">{t('song.noInvestors')}</p>;
  }

  const visible = investments.slice(0, maxVisible);
  const remaining = investments.length - visible.length;

  return (
    <ul className="mt-2 space-y-2 text-xs sm:text-sm text-white/70">
      {visible.map((investment) => (
        <li key={investment.id} className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          <span className="font-semibold text-white">{investment.username}</span>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-white/80">
              {t('song.total')} <span className="font-medium text-white">{investment.amount_total.toLocaleString(locale, { style: 'currency', currency: 'CAD' })}</span>
            </span>
            <span className="hidden sm:inline text-white/40">•</span>
            <span className="text-white/80">
              {t('song.remaining')} <span className="font-medium text-white">{investment.amount_remaining.toLocaleString(locale, { style: 'currency', currency: 'CAD' })}</span>
            </span>
          </div>
          {investment.passive_share === 1 ? (
            <span className="inline-block rounded-full bg-white/10 px-2.5 py-1 text-xs text-emerald-300 w-fit">
              {t('song.passiveShare')} {investment.passive_earned.toLocaleString(locale, { style: 'currency', currency: 'CAD' })}
            </span>
          ) : null}
        </li>
      ))}
      {remaining > 0 ? (
        <li className="text-white/60 text-xs sm:text-sm pt-1">
          {language === 'fr' 
            ? `+${remaining} investisseur${remaining > 1 ? 's' : ''} supplémentaire${remaining > 1 ? 's' : ''}`
            : `+${remaining} additional investor${remaining > 1 ? 's' : ''}`
          }
        </li>
      ) : null}
    </ul>
  );
};


