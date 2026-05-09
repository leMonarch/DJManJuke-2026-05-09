import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  analyticsService,
  type AnalyticsOverview,
  type JukeboxAnalytics,
  type SongAnalytics,
} from '../../services/analyticsService';

const formatAmount = (amount: number, locale: string = 'fr-CA') =>
  amount.toLocaleString(locale, { style: 'currency', currency: 'CAD' });

const sortSongsByPlaysDesc = (songs: SongAnalytics[]) =>
  [...songs].sort((a, b) => b.totalPlays - a.totalPlays);

const sortJukeboxesByPlaysDesc = (jukeboxes: JukeboxAnalytics[]) =>
  [...jukeboxes].sort((a, b) => b.totalPlays - a.totalPlays);

export const StatsDashboard = () => {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-CA' : 'en-CA';
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await analyticsService.getOverview();
      setOverview(data);
    } catch {
      setError(t('stats.loadError'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const songs = overview?.songs ?? [];
  const jukeboxes = overview?.jukeboxes ?? [];

  const topSongs = sortSongsByPlaysDesc(songs).slice(0, 5);
  const topJukeboxes = sortJukeboxesByPlaysDesc(jukeboxes).slice(0, 5);

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="space-y-2">
        <h3 className="text-base font-semibold text-white sm:text-lg">{t('stats.title')}</h3>
        <p className="text-sm text-white/60">
          {t('stats.subtitle')}
        </p>
        <button
          type="button"
          onClick={loadOverview}
          disabled={isLoading}
          className="min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? t('stats.refreshing') : t('stats.refresh')}
        </button>
      </header>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 shadow-lg shadow-black/20 backdrop-blur">
          <h4 className="text-sm font-semibold text-white sm:text-base">{t('stats.topSongs')}</h4>
          <p className="mt-1 text-xs text-white/60">
            {t('stats.topSongsDesc')}
          </p>
          <div className="mt-4 space-y-3">
            {topSongs.length ? (
              topSongs.map((song) => {
                const topLocations = [...song.locations].sort(
                  (a, b) => b.playCount - a.playCount,
                ).slice(0, 3);
                return (
                  <div
                    key={song.songId}
                    className="rounded-lg border border-white/10 bg-black/20 p-3 sm:p-4 text-sm text-white/80"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white truncate">{song.title}</p>
                        <p className="text-xs text-white/60 truncate">{song.artist}</p>
                      </div>
                      <div className="text-left sm:text-right text-xs text-white/60">
                        <p className="font-semibold text-secondary">{song.totalPlays} {t('stats.plays')}</p>
                        <p>{formatAmount(song.totalAmount, locale)} {t('stats.bet')}</p>
                      </div>
                    </div>
                    {topLocations.length ? (
                      <ul className="mt-3 space-y-2 text-xs text-white/70">
                        {topLocations.map((loc) => (
                          <li key={loc.jukeboxId} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold">
                                {loc.slug ?? t('stats.unknownJukebox')}
                              </span>
                              {loc.location && (
                                <span className="ml-1 text-white/60 truncate">— {loc.location}</span>
                              )}
                            </div>
                            <div className="text-left sm:text-right">
                              <span className="font-semibold">{loc.playCount} {t('stats.plays')}</span>
                              <span className="block text-white/60">
                                {formatAmount(loc.totalAmount, locale)}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-white/50">
                        {t('stats.noLocationInfo')}
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-white/50">
                {t('stats.noSongPlays')}
              </p>
            )}
          </div>
        </article>

        <article className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 shadow-lg shadow-black/20 backdrop-blur">
          <h4 className="text-sm font-semibold text-white sm:text-base">{t('stats.topJukeboxes')}</h4>
          <p className="mt-1 text-xs text-white/60">
            {t('stats.topJukeboxesDesc')}
          </p>
          <div className="mt-4 space-y-3">
            {topJukeboxes.length ? (
              topJukeboxes.map((jb) => {
                const topSongsForJukebox = [...jb.songs].sort(
                  (a, b) => b.playCount - a.playCount,
                ).slice(0, 5);
                return (
                  <div
                    key={jb.jukeboxId}
                    className="rounded-lg border border-white/10 bg-black/20 p-3 sm:p-4 text-sm text-white/80"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white truncate">
                          {jb.name || jb.slug || t('stats.noJukeboxName')}
                        </p>
                        <p className="text-xs text-white/60 truncate">
                          /{jb.slug}
                          {jb.location ? ` — ${jb.location}` : ''}
                        </p>
                      </div>
                      <div className="text-left sm:text-right text-xs text-white/60">
                        <p className="font-semibold text-secondary">{jb.totalPlays} {t('stats.plays')}</p>
                        <p>{formatAmount(jb.totalAmount, locale)} {t('stats.bet')}</p>
                      </div>
                    </div>
                    {topSongsForJukebox.length ? (
                      <ul className="mt-3 space-y-2 text-xs text-white/70">
                        {topSongsForJukebox.map((song) => (
                          <li key={song.songId} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold">{song.title}</span>
                              <span className="ml-1 text-white/60 truncate">— {song.artist}</span>
                            </div>
                            <div className="text-left sm:text-right">
                              <span className="font-semibold">{song.playCount} {t('stats.plays')}</span>
                              <span className="block text-white/60">
                                {formatAmount(song.totalAmount, locale)}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-white/50">
                        {t('stats.noJukeboxSongs')}
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-white/50">
                {t('stats.noActiveJukeboxes')}
              </p>
            )}
          </div>
        </article>
      </section>

      {overview && (overview.songs.length > 0 || overview.jukeboxes.length > 0) ? (
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 text-xs text-white/60 shadow-lg shadow-black/20 backdrop-blur">
          <p>
            {t('stats.footer')}
          </p>
        </section>
      ) : null}
    </div>
  );
};


