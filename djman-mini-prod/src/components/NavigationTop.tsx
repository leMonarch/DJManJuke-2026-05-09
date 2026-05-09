import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { apiClient } from '../services/apiClient';
import { revenueService } from '../services/revenueService';
import { BALANCE_REFRESH_EVENT } from '../constants/jukebox';
import { BalanceTopUpModal } from './BalanceTopUpModal';

type NavigationTopProps = {
  slug: string;
  isAdmin?: boolean;
};

export const NavigationTop = ({ slug, isAdmin = false }: NavigationTopProps) => {
  const { user, logout } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [jukeboxLocation, setJukeboxLocation] = useState<string | null>(user?.jukebox?.location ?? null);
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const [balanceCurrency, setBalanceCurrency] = useState<string>('CAD');
  const isOwner = user?.jukebox?.slug === slug;
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [knownLocations, setKnownLocations] = useState<string[]>([]);
  const [locationInput, setLocationInput] = useState<string>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [balanceError, setBalanceError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const { data } = await apiClient.get<{ id: number; slug: string; name: string; location: string | null }>(
          `/jukebox/${slug}/meta`,
        );
        setJukeboxLocation(data.location ?? null);
      } catch {
        // ignore
      }
    };

    fetchMeta();
  }, [slug]);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!user) {
        setAvailableBalance(null);
        setBalanceError(null);
        return;
      }
      try {
        const summary = await revenueService.getSummary();
        setAvailableBalance(summary.balance.available);
        setBalanceCurrency((summary.balance.currency || 'CAD').toUpperCase());
        setBalanceError(null);
      } catch (error: any) {
        setAvailableBalance(null);
        const status = error?.response?.status ?? null;
        if (status === 401 || status === 403) {
          setBalanceError(t('nav.sessionExpired'));
        } else {
          setBalanceError(t('nav.balanceUnavailable'));
        }
      }
    };

    fetchBalance();
  }, [user]);

  useEffect(() => {
    const handler = () => {
      if (!user) {
        return;
        }
      revenueService
        .getSummary()
        .then((summary) => {
          setAvailableBalance(summary.balance.available);
          setBalanceCurrency((summary.balance.currency || 'CAD').toUpperCase());
          setBalanceError(null);
        })
        .catch(() => {
          // ignore
        });
    };

    window.addEventListener(BALANCE_REFRESH_EVENT, handler);
    return () => window.removeEventListener(BALANCE_REFRESH_EVENT, handler);
  }, [user]);

  const handleToggleAdmin = () => {
    if (isAdmin) {
      navigate(`/${slug}`);
    } else {
      navigate(`/${slug}/admin`);
    }
  };

  const handleEditLocationManually = () => {
    if (isEditingLocation) {
      setIsEditingLocation(false);
      return;
    }

    setIsEditingLocation(true);
    setLocationInput(jukeboxLocation ?? '');

    apiClient
      .get<{ locations: string[] }>(`/jukebox/${slug}/locations`)
      .then((response) => {
        setKnownLocations(response.data.locations ?? []);
      })
      .catch(() => {
        setKnownLocations([]);
      });
  };

  const handleSubmitLocation = () => {
    const value = locationInput.trim();
    if (!value) {
      toast.error(t('nav.addressEmpty'));
      return;
    }

    apiClient
      .post<{ jukebox: { location: string } }>(`/jukebox/${slug}/location`, {
        address: value,
      })
      .then((response) => {
        setJukeboxLocation(response.data.jukebox.location);
        setIsEditingLocation(false);
      })
      .catch(() => {
        toast.error(t('nav.addressSaveError'));
      });
  };

  const handleAuthAction = () => {
    if (user) {
      logout();
      navigate('/login');
    } else {
      navigate('/login');
    }
  };

  const handleCloseMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const handleEditLocation = () => {
    handleEditLocationManually();
    setIsMobileMenuOpen(false);
  };

  // Fermer le menu mobile quand on change de page
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [slug, isAdmin]);

  // Empêcher le scroll du body quand le menu mobile est ouvert
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  return (
    <>
      <header className="sticky top-0 z-[60] border-b border-white/10 bg-dark/80 backdrop-blur shadow-lg">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 sm:py-4">
          {/* Barre principale - Mobile-first */}
          <div className="flex items-center justify-between gap-3">
            {/* Logo et infos - Stack vertical sur mobile */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <h1 className="text-lg font-semibold text-primary sm:text-xl md:text-2xl truncate">
                  DJManJuke.com
                </h1>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs uppercase tracking-wide text-white/50 sm:text-sm">/{slug}</p>
                {jukeboxLocation && (
                  <p className="text-xs text-white/60 truncate sm:text-sm hidden sm:inline">
                    • {jukeboxLocation}
                  </p>
                )}
              </div>
              {jukeboxLocation && (
                <p className="text-xs text-white/60 truncate sm:hidden mt-0.5">
                  {jukeboxLocation}
                </p>
              )}
            </div>

            {/* Actions principales - Visibles sur desktop, cachées sur mobile */}
            <nav className="hidden md:flex items-center gap-2 lg:gap-3">
              {/* Sélecteur de langue */}
              <div className="flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => setLanguage('fr')}
                  className={`min-h-[32px] px-2.5 py-1 text-xs font-medium transition sm:text-sm ${
                    language === 'fr'
                      ? 'text-primary'
                      : 'text-white/50 hover:text-white/70'
                  }`}
                  aria-label="Français"
                >
                  FR
                </button>
                <span className="text-white/30">|</span>
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`min-h-[32px] px-2.5 py-1 text-xs font-medium transition sm:text-sm ${
                    language === 'en'
                      ? 'text-primary'
                      : 'text-white/50 hover:text-white/70'
                  }`}
                  aria-label="English"
                >
                  EN
                </button>
              </div>

              {/* Balance et actions utilisateur */}
              {user ? (
                <>
                  <div className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 sm:px-4 sm:py-2 sm:text-sm">
                    {t('nav.balance')}:{' '}
                    {availableBalance !== null
                      ? availableBalance.toLocaleString(language === 'fr' ? 'fr-CA' : 'en-CA', {
                          style: 'currency',
                          currency: balanceCurrency,
                        })
                      : '—'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTopUpOpen(true)}
                    disabled={Boolean(balanceError)}
                    className="min-h-[44px] rounded-full border border-secondary px-3 py-2 text-xs font-semibold text-secondary transition hover:bg-secondary hover:text-dark disabled:cursor-not-allowed disabled:border-white/20 disabled:text-white/40 disabled:hover:bg-transparent sm:px-4 sm:text-sm"
                  >
                    {t('nav.topUp')}
                  </button>
                </>
              ) : null}

              {user?.jukebox?.slug === slug ? (
                <button
                  type="button"
                  onClick={handleToggleAdmin}
                  className="min-h-[44px] rounded-full border border-primary px-3 py-2 text-xs font-medium text-primary transition hover:bg-primary hover:text-dark sm:px-4 sm:text-sm"
                >
                  {isAdmin ? t('nav.jukeboxView') : t('nav.admin')}
                </button>
              ) : null}

              {user && user.jukebox?.slug ? (
                <Link
                  to={`/${user.jukebox.slug}`}
                  className="min-h-[44px] flex items-center text-xs text-white/50 transition hover:text-white/70 sm:text-sm"
                >
                  {t('nav.connectedAs')} <span className="font-medium text-white/70 ml-1">{user.username}</span>
                </Link>
              ) : user ? (
                <span className="text-xs text-white/50 sm:text-sm">
                  {t('nav.connectedAs')} <span className="font-medium text-white/70">{user.username}</span>
                </span>
              ) : null}

              <button
                type="button"
                onClick={handleAuthAction}
                className="min-h-[44px] rounded-full border border-white/20 px-3 py-2 text-xs font-medium text-white transition hover:border-white/40 hover:text-primary sm:px-4 sm:text-sm"
              >
                {user ? t('nav.logout') : t('nav.login')}
              </button>
            </nav>

            {/* Bouton hamburger - Visible uniquement sur mobile */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="min-h-[44px] min-w-[44px] flex md:hidden items-center justify-center rounded-lg border border-white/20 bg-white/5 p-2 text-white transition hover:bg-white/10"
              aria-label="Menu"
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>

          {/* Édition de localisation - Visible si isOwner et isEditingLocation */}
          {isOwner && isEditingLocation && (
            <div className="mt-3 sm:mt-4 flex flex-col gap-3 rounded-lg border border-white/15 bg-black/40 p-3 sm:p-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-white/60 sm:text-sm">{t('nav.currentAddress')}</span>
                <input
                  type="text"
                  value={locationInput}
                  onChange={(event) => setLocationInput(event.target.value)}
                  placeholder={language === 'fr' ? 'Ex. 123 Rue Principale, Montréal' : 'Ex. 123 Main Street, Montreal'}
                  className="min-h-[44px] w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-secondary focus:outline-none sm:text-base"
                />
              </label>
              {knownLocations.length > 0 && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-white/60 sm:text-sm">{t('nav.recentAddresses')}</span>
                  <select
                    value=""
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value) {
                        setLocationInput(value);
                      }
                    }}
                    className="min-h-[44px] w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 text-sm text-white focus:border-secondary focus:outline-none sm:text-base"
                  >
                    <option value="">{t('nav.chooseAddress')}</option>
                    {knownLocations.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleSubmitLocation}
                  className="min-h-[44px] flex-1 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-dark transition hover:brightness-110"
                >
                  {t('nav.saveAddress')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingLocation(false)}
                  className="min-h-[44px] flex-1 rounded-full border border-white/30 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/50 hover:text-primary"
                >
                  {t('nav.cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Bouton éditer localisation - Visible si isOwner et pas en édition */}
          {isOwner && !isEditingLocation && (
            <div className="mt-2 sm:mt-3">
              <button
                type="button"
                onClick={handleEditLocationManually}
                className="min-h-[36px] rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/40 hover:text-primary sm:text-sm"
              >
                {t('nav.editAddress')}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Menu mobile - Drawer */}
      {isMobileMenuOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-[59] bg-black/60 backdrop-blur-sm md:hidden"
            onClick={handleCloseMobileMenu}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 right-0 z-[61] w-full max-w-sm bg-dark border-l border-white/10 shadow-2xl md:hidden overflow-y-auto">
            <div className="flex flex-col h-full">
              {/* Header du drawer */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">Menu</h2>
                <button
                  type="button"
                  onClick={handleCloseMobileMenu}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition"
                  aria-label="Fermer le menu"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Contenu du drawer */}
              <div className="flex-1 p-4 space-y-3">
                {/* Sélecteur de langue */}
                <div className="pb-3 border-b border-white/10">
                  <label className="block text-xs font-medium text-white/60 mb-2 uppercase tracking-wide">
                    {language === 'fr' ? 'Langue' : 'Language'}
                  </label>
                  <div className="flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setLanguage('fr');
                        handleCloseMobileMenu();
                      }}
                      className={`flex-1 min-h-[44px] rounded-md px-3 py-2 text-sm font-medium transition ${
                        language === 'fr'
                          ? 'bg-primary text-white'
                          : 'text-white/70 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      Français
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLanguage('en');
                        handleCloseMobileMenu();
                      }}
                      className={`flex-1 min-h-[44px] rounded-md px-3 py-2 text-sm font-medium transition ${
                        language === 'en'
                          ? 'bg-primary text-white'
                          : 'text-white/70 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      English
                    </button>
                  </div>
                </div>

                {/* Balance et actions utilisateur */}
                {user ? (
                  <div className="space-y-3 pb-3 border-b border-white/10">
                    <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3">
                      <p className="text-xs font-medium text-white/60 mb-1">{t('nav.balance')}</p>
                      <p className="text-lg font-semibold text-emerald-200">
                        {availableBalance !== null
                          ? availableBalance.toLocaleString(language === 'fr' ? 'fr-CA' : 'en-CA', {
                              style: 'currency',
                              currency: balanceCurrency,
                            })
                          : '—'}
                      </p>
                      {balanceError && (
                        <p className="mt-2 text-xs text-red-300">{balanceError}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsTopUpOpen(true);
                        handleCloseMobileMenu();
                      }}
                      disabled={Boolean(balanceError)}
                      className="w-full min-h-[44px] rounded-lg border border-secondary bg-secondary/10 px-4 py-2 text-sm font-semibold text-secondary transition hover:bg-secondary hover:text-dark disabled:cursor-not-allowed disabled:border-white/20 disabled:text-white/40 disabled:hover:bg-transparent"
                    >
                      {t('nav.topUp')}
                    </button>
                  </div>
                ) : null}

                {/* Actions du propriétaire */}
                {isOwner && (
                  <div className="space-y-2 pb-3 border-b border-white/10">
                    <button
                      type="button"
                      onClick={handleEditLocation}
                      className="w-full min-h-[44px] rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white text-left"
                    >
                      {isEditingLocation ? t('nav.close') : t('nav.editAddress')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleToggleAdmin();
                        handleCloseMobileMenu();
                      }}
                      className="w-full min-h-[44px] rounded-lg border border-primary bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary hover:text-dark text-left"
                    >
                      {isAdmin ? t('nav.jukeboxView') : t('nav.admin')}
                    </button>
                  </div>
                )}

                {/* Informations utilisateur */}
                {user && user.jukebox?.slug ? (
                  <div className="pb-3 border-b border-white/10">
                    <Link
                      to={`/${user.jukebox.slug}`}
                      onClick={handleCloseMobileMenu}
                      className="block min-h-[44px] rounded-lg px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                    >
                      <span className="text-xs text-white/50">{t('nav.connectedAs')}</span>
                      <span className="block font-medium text-white">{user.username}</span>
                    </Link>
                  </div>
                ) : user ? (
                  <div className="pb-3 border-b border-white/10">
                    <div className="px-4 py-2">
                      <span className="text-xs text-white/50">{t('nav.connectedAs')}</span>
                      <span className="block font-medium text-white">{user.username}</span>
                    </div>
                  </div>
                ) : null}

                {/* Action de connexion/déconnexion */}
                <button
                  type="button"
                  onClick={() => {
                    handleAuthAction();
                    handleCloseMobileMenu();
                  }}
                  className="w-full min-h-[44px] rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 hover:text-white"
                >
                  {user ? t('nav.logout') : t('nav.login')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <BalanceTopUpModal isOpen={isTopUpOpen} onClose={() => setIsTopUpOpen(false)} />
    </>
  );
};
