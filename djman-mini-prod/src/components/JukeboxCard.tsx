import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import type { JukeboxListItem } from '../services/jukeboxListService';

type JukeboxCardProps = {
  jukebox: JukeboxListItem;
  currentSlug?: string;
  onJukeboxClick?: () => void;
};

const resolveAssetPath = (path: string | null | undefined) => {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const assetsBaseUrl = import.meta.env.VITE_ASSETS_BASE_URL ?? 'http://localhost:4000';
  const trimmedBase = assetsBaseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
};

export const JukeboxCard = ({ jukebox, currentSlug, onJukeboxClick }: JukeboxCardProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const avatarUrl = resolveAssetPath(jukebox.avatar);

  const handleClick = () => {
    // Si c'est le jukebox actuel, juste décocher le checkbox
    if (currentSlug === jukebox.slug && onJukeboxClick) {
      onJukeboxClick();
    } else {
      // Sinon, naviguer vers le nouveau jukebox
      navigate(`/${jukebox.slug}`);
    }
  };

  return (
    <motion.div
      onClick={handleClick}
      className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6 transition hover:border-secondary hover:bg-white/10 cursor-pointer"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0 relative">
          {avatarUrl ? (
            <>
              <img
                src={avatarUrl}
                alt={`Avatar de ${jukebox.name}`}
                className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-cover border-2 border-white/20 relative z-10"
                loading="lazy"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const placeholder = target.nextElementSibling as HTMLElement;
                  if (placeholder) {
                    placeholder.style.display = 'flex';
                  }
                }}
              />
              <div className="hidden h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-gradient-to-br from-primary to-secondary items-center justify-center border-2 border-white/20 absolute inset-0">
                <span className="text-xl sm:text-2xl font-bold text-white">
                  {jukebox.name.charAt(0).toUpperCase()}
                </span>
              </div>
            </>
          ) : (
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center border-2 border-white/20">
              <span className="text-xl sm:text-2xl font-bold text-white">
                {jukebox.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Informations */}
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-white truncate mb-1">
            {jukebox.name}
          </h3>
          <p className="text-sm text-white/60 mb-2">
            <span className="font-mono">/{jukebox.slug}</span>
          </p>
          {jukebox.location && (
            <p className="text-sm text-white/70 mb-2 flex items-center gap-1">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{jukebox.location}</span>
            </p>
          )}
          
          {/* Statut de connexion */}
          <div className="flex items-center gap-2 mt-3">
            <div
              className={`h-2 w-2 rounded-full flex-shrink-0 ${
                jukebox.isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
              }`}
            />
            <span className="text-xs text-white/60">
              {jukebox.isConnected ? t('card.online') : t('card.offline')}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

