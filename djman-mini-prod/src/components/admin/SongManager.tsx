import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useLanguage } from '../../context/LanguageContext';
import type { Track } from '../../types/music';
import { PLAYLIST_REFRESH_EVENT } from '../../constants/jukebox';
import { songAdminService, type SongPayload } from '../../services/songAdminService';
import { jukeboxLibraryService, type CatalogSong } from '../../services/jukeboxLibraryService';
type SongManagerProps = {
  slug: string;
};

type FormState = {
  title: string;
  artist: string;
  songOrder: string;
  audioFile: File | null;
  imageFile: File | null;
  genrePrimary: string;
  genreSecondary: string;
  genreTertiary: string;
  recordedAt: string; // Format: YYYY-MM-DD
};

const EMPTY_FORM: FormState = {
  title: '',
  artist: '',
  songOrder: '',
  audioFile: null,
  imageFile: null,
  genrePrimary: '',
  genreSecondary: '',
  genreTertiary: '',
  recordedAt: '',
};

export const SongManager = ({ slug }: SongManagerProps) => {
  const { t } = useLanguage();
  const [songs, setSongs] = useState<Track[]>([]);
  const [catalog, setCatalog] = useState<CatalogSong[]>([]);
  const [isLoadingSongs, setIsLoadingSongs] = useState<boolean>(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [songSearchInput, setSongSearchInput] = useState<string>('');
  const [songSearchTerm, setSongSearchTerm] = useState<string>('');
  const [catalogSearchInput, setCatalogSearchInput] = useState<string>('');
  const [catalogSearchTerm, setCatalogSearchTerm] = useState<string>('');
  const resetStatus = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const loadSongs = useCallback(async () => {
    setIsLoadingSongs(true);
    try {
      const data = await songAdminService.listSongs();
      setSongs(data);
    } catch (err) {
      setError(t('songs.loadError'));
    } finally {
      setIsLoadingSongs(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setIsCatalogLoading(true);
    try {
      const data = await jukeboxLibraryService.listCatalog(slug);
      setCatalog(data);
    } catch (err) {
      setError(t('songs.catalogLoadError'));
    } finally {
      setIsCatalogLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadSongs();
    loadCatalog();
  }, [loadSongs, loadCatalog]);

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setSongSearchTerm(songSearchInput.trim().toLowerCase());
    }, 250);
    return () => window.clearTimeout(handler);
  }, [songSearchInput]);

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setCatalogSearchTerm(catalogSearchInput.trim().toLowerCase());
    }, 250);
    return () => window.clearTimeout(handler);
  }, [catalogSearchInput]);

  const filteredSongs = useMemo(() => {
    if (!songSearchTerm) {
      return songs;
    }
    return songs.filter((song) => {
      const haystack = `${song.title} ${song.artist}`.toLowerCase();
      return haystack.includes(songSearchTerm);
    });
  }, [songs, songSearchTerm]);

  const filteredCatalog = useMemo(() => {
    if (!catalogSearchTerm) {
      return catalog;
    }
    return catalog.filter((song) => {
      const owner = song.owner_username ?? '';
      const haystack = `${song.title} ${song.artist} ${owner}`.toLowerCase();
      return haystack.includes(catalogSearchTerm);
    });
  }, [catalog, catalogSearchTerm]);

  const formTitle = useMemo(
    () => (editingId ? t('songs.editSong') : t('songs.addSong')),
    [editingId, t],
  );

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const target = event.target;
    if ('files' in target && target.files) {
      setFormState((prev) => ({
        ...prev,
        [target.name === 'audio' ? 'audioFile' : 'imageFile']: target.files?.[0] ?? null,
      }));
      return;
    }
    setFormState((prev) => ({
      ...prev,
      [target.name === 'songOrder' ? 'songOrder' : target.name]: target.value,
    }));
  };

  const handleEdit = (song: Track) => {
    resetStatus();
    setEditingId(song.id);
    setFormState({
      title: song.title,
      artist: song.artist,
      songOrder: song.song_order_id != null ? String(song.song_order_id) : '',
      audioFile: null,
      imageFile: null,
      genrePrimary: song.genre_primary ?? '',
      genreSecondary: song.genre_secondary ?? '',
      genreTertiary: song.genre_tertiary ?? '',
      recordedAt: song.recorded_at ?? '',
    });
  };

  const handleCancelEdit = () => {
    resetStatus();
    setEditingId(null);
    setFormState(EMPTY_FORM);
  };

  const handleDelete = async (song: Track) => {
    resetStatus();
    try {
      await songAdminService.deleteSong(song.id);
      await loadSongs();
      await loadCatalog();
      window.dispatchEvent(new Event(PLAYLIST_REFRESH_EVENT));
      setSuccess(t('songs.deleteSuccess', { title: song.title }));
      toast.success(t('songs.deleteSuccess', { title: song.title }));
    } catch (err) {
      setError(t('songs.deleteError'));
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetStatus();
    setIsSaving(true);
    const payload: SongPayload = {
      title: formState.title.trim(),
      artist: formState.artist.trim(),
      song_order_id: formState.songOrder ? Number(formState.songOrder) : null,
      audioFile: formState.audioFile ?? undefined,
      imageFile: formState.imageFile ?? undefined,
      genre_primary: formState.genrePrimary.trim() || null,
      genre_secondary: formState.genreSecondary.trim() || null,
      genre_tertiary: formState.genreTertiary.trim() || null,
      recorded_at: formState.recordedAt.trim() || null,
    };

    const isEditing = Boolean(editingId);
    try {
      if (isEditing && editingId) {
        await songAdminService.updateSong(editingId, payload);
      } else {
        await songAdminService.createSong(payload);
      }
      setFormState(EMPTY_FORM);
      setEditingId(null);
      await loadSongs();
      await loadCatalog();
      window.dispatchEvent(new Event(PLAYLIST_REFRESH_EVENT));
      setSuccess(isEditing ? t('songs.updateSuccess') : t('songs.createSuccess'));
    } catch (err) {
      setError(
        isEditing ? t('songs.updateError') : t('songs.createError'),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleAttach = async (songId: number) => {
    resetStatus();
    setIsCatalogLoading(true);
    try {
      const updated = await jukeboxLibraryService.addSong(slug, songId);
      setCatalog(updated);
      window.dispatchEvent(new Event(PLAYLIST_REFRESH_EVENT));
      setSuccess(t('songs.attachSuccess'));
    } catch (err) {
      setError(t('songs.attachError'));
    } finally {
      setIsCatalogLoading(false);
    }
  };

  const handleDetach = async (songId: number) => {
    resetStatus();
    setIsCatalogLoading(true);
    try {
      const updated = await jukeboxLibraryService.removeSong(slug, songId);
      setCatalog(updated);
      window.dispatchEvent(new Event(PLAYLIST_REFRESH_EVENT));
      setSuccess(t('songs.detachSuccess'));
    } catch (err) {
      setError(t('songs.detachError'));
    } finally {
      setIsCatalogLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="space-y-1">
        <h3 className="text-base font-semibold text-white sm:text-lg">{formTitle}</h3>
        <p className="text-sm text-white/60">
          {t('songs.formDesc')}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="grid gap-4 rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-white/80">
            {t('songs.title')}
            <input
              required
              name="title"
              value={formState.title}
              onChange={handleInputChange}
              className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-white/80">
            {t('songs.artist')}
            <input
              required
              name="artist"
              value={formState.artist}
              onChange={handleInputChange}
              className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
            />
          </label>
        </div>

        <label className="flex flex-col gap-2 text-sm text-white/80 sm:w-48">
          {t('songs.order')}
          <input
            name="songOrder"
            value={formState.songOrder}
            onChange={handleInputChange}
            type="number"
            className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-white/80">
            {editingId ? t('songs.audioFileEdit') : t('songs.audioFileRequired')}
            <input
              name="audio"
              type="file"
              accept="audio/*,video/*,.mp3,.mp4"
              onChange={handleInputChange}
              className="min-h-[44px] rounded-lg border border-dashed border-white/20 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:opacity-85"
            />
            <span className="text-xs text-white/50">{t('songs.acceptedFormats')}</span>
          </label>
          <label className="flex flex-col gap-2 text-sm text-white/80">
            {t('songs.imageFile')}
            <input
              name="image"
              type="file"
              accept="image/*"
              onChange={handleInputChange}
              className="min-h-[44px] rounded-lg border border-dashed border-white/20 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:opacity-85"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-2 text-sm text-white/80">
            {t('songs.genrePrimary')}
            <select
              name="genrePrimary"
              value={formState.genrePrimary}
              onChange={handleInputChange}
              className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
            >
              <option value="">{t('songs.selectGenre')}</option>
              <option value="Pop">Pop</option>
              <option value="Rock">Rock</option>
              <option value="Hip-Hop">Hip-Hop</option>
              <option value="Rap">Rap</option>
              <option value="R&B">R&B</option>
              <option value="Electronic">Electronic</option>
              <option value="Dance">Dance</option>
              <option value="Country">Country</option>
              <option value="Jazz">Jazz</option>
              <option value="Blues">Blues</option>
              <option value="Classical">Classical</option>
              <option value="Reggae">Reggae</option>
              <option value="Metal">Metal</option>
              <option value="Punk">Punk</option>
              <option value="Alternative">Alternative</option>
              <option value="Indie">Indie</option>
              <option value="Folk">Folk</option>
              <option value="Soul">Soul</option>
              <option value="Funk">Funk</option>
              <option value="Disco">Disco</option>
              <option value="House">House</option>
              <option value="Techno">Techno</option>
              <option value="Trance">Trance</option>
              <option value="Dubstep">Dubstep</option>
              <option value="Trap">Trap</option>
              <option value="Latin">Latin</option>
              <option value="World">World</option>
              <option value="Gospel">Gospel</option>
              <option value="Ambient">Ambient</option>
              <option value="Experimental">Experimental</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-white/80">
            {t('songs.genreSecondary')}
            <select
              name="genreSecondary"
              value={formState.genreSecondary}
              onChange={handleInputChange}
              className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
            >
              <option value="">{t('songs.selectGenre')}</option>
              <option value="Pop">Pop</option>
              <option value="Rock">Rock</option>
              <option value="Hip-Hop">Hip-Hop</option>
              <option value="Rap">Rap</option>
              <option value="R&B">R&B</option>
              <option value="Electronic">Electronic</option>
              <option value="Dance">Dance</option>
              <option value="Country">Country</option>
              <option value="Jazz">Jazz</option>
              <option value="Blues">Blues</option>
              <option value="Classical">Classical</option>
              <option value="Reggae">Reggae</option>
              <option value="Metal">Metal</option>
              <option value="Punk">Punk</option>
              <option value="Alternative">Alternative</option>
              <option value="Indie">Indie</option>
              <option value="Folk">Folk</option>
              <option value="Soul">Soul</option>
              <option value="Funk">Funk</option>
              <option value="Disco">Disco</option>
              <option value="House">House</option>
              <option value="Techno">Techno</option>
              <option value="Trance">Trance</option>
              <option value="Dubstep">Dubstep</option>
              <option value="Trap">Trap</option>
              <option value="Latin">Latin</option>
              <option value="World">World</option>
              <option value="Gospel">Gospel</option>
              <option value="Ambient">Ambient</option>
              <option value="Experimental">Experimental</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-white/80">
            {t('songs.genreTertiary')}
            <select
              name="genreTertiary"
              value={formState.genreTertiary}
              onChange={handleInputChange}
              className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
            >
              <option value="">{t('songs.selectGenre')}</option>
              <option value="Pop">Pop</option>
              <option value="Rock">Rock</option>
              <option value="Hip-Hop">Hip-Hop</option>
              <option value="Rap">Rap</option>
              <option value="R&B">R&B</option>
              <option value="Electronic">Electronic</option>
              <option value="Dance">Dance</option>
              <option value="Country">Country</option>
              <option value="Jazz">Jazz</option>
              <option value="Blues">Blues</option>
              <option value="Classical">Classical</option>
              <option value="Reggae">Reggae</option>
              <option value="Metal">Metal</option>
              <option value="Punk">Punk</option>
              <option value="Alternative">Alternative</option>
              <option value="Indie">Indie</option>
              <option value="Folk">Folk</option>
              <option value="Soul">Soul</option>
              <option value="Funk">Funk</option>
              <option value="Disco">Disco</option>
              <option value="House">House</option>
              <option value="Techno">Techno</option>
              <option value="Trance">Trance</option>
              <option value="Dubstep">Dubstep</option>
              <option value="Trap">Trap</option>
              <option value="Latin">Latin</option>
              <option value="World">World</option>
              <option value="Gospel">Gospel</option>
              <option value="Ambient">Ambient</option>
              <option value="Experimental">Experimental</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-2 text-sm text-white/80 sm:w-48">
          {t('songs.recordedAt')}
          <input
            name="recordedAt"
            type="date"
            value={formState.recordedAt}
            onChange={handleInputChange}
            className="min-h-[44px] rounded-lg border border-white/10 bg-dark px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="submit"
            disabled={isSaving}
            className="min-h-[44px] w-full sm:w-auto rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? t('songs.saving') : editingId ? t('songs.update') : t('songs.create')}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="min-h-[44px] w-full sm:w-auto rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:text-white"
            >
              {t('songs.cancel')}
            </button>
          ) : null}
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-400">{success}</p> : null}
      </form>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-sm font-semibold text-white sm:text-base">{t('songs.mySongs')}</h4>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              value={songSearchInput}
              onChange={(event) => setSongSearchInput(event.target.value)}
              placeholder={t('songs.search')}
              className="min-h-[44px] w-full rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/50 focus:border-secondary focus:outline-none sm:w-48"
            />
            <button
              type="button"
              onClick={() => {
                resetStatus();
                loadSongs();
              }}
              disabled={isLoadingSongs}
              className="min-h-[44px] w-full sm:w-auto rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingSongs ? t('common.loading') : t('songs.refresh')}
            </button>
          </div>
        </div>
        {/* Tableau desktop - Masqué sur mobile */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm text-white/80">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">{t('songs.tableTitle')}</th>
                <th className="px-3 py-2 font-semibold">{t('songs.tableArtist')}</th>
                <th className="px-3 py-2 font-semibold">{t('songs.tableGenres')}</th>
                <th className="px-3 py-2 font-semibold">{t('songs.tableDate')}</th>
                <th className="px-3 py-2 font-semibold">{t('songs.tableOrder')}</th>
                <th className="px-3 py-2 font-semibold">{t('songs.tableFile')}</th>
                <th className="px-3 py-2 font-semibold">{t('songs.tableActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredSongs.length ? (
                filteredSongs.map((song) => {
                  const genres = [
                    song.genre_primary,
                    song.genre_secondary,
                    song.genre_tertiary,
                  ]
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <tr key={song.id}>
                      <td className="px-3 py-2">{song.title}</td>
                      <td className="px-3 py-2">{song.artist}</td>
                      <td className="px-3 py-2">
                        {genres ? (
                          <span className="text-xs text-white/70">{genres}</span>
                        ) : (
                          <span className="text-xs text-white/40">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {song.recorded_at ? (
                          <span className="text-xs text-white/70">
                            {new Date(song.recorded_at).toLocaleDateString('fr-FR')}
                          </span>
                        ) : (
                          <span className="text-xs text-white/40">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{song.song_order_id ?? '-'}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-white/10 px-2 py-1 text-xs truncate max-w-[150px] inline-block">{song.file_path}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(song)}
                            className="min-h-[36px] rounded-full border border-primary/60 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary hover:text-dark"
                          >
                            {t('songs.modify')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(song)}
                            className="min-h-[36px] rounded-full border border-red-400/60 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-400 hover:text-dark"
                          >
                            {t('songs.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-white/50">
                    {songSearchTerm
                      ? t('songs.noResults', { term: songSearchInput.trim() })
                      : t('songs.noSongs')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Cartes mobile - Visibles uniquement sur mobile/tablette */}
        <div className="lg:hidden space-y-3">
          {filteredSongs.length ? (
            filteredSongs.map((song) => {
              const genres = [
                song.genre_primary,
                song.genre_secondary,
                song.genre_tertiary,
              ]
                .filter(Boolean)
                .join(', ');
              return (
                <div key={song.id} className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
                  <div>
                    <h5 className="text-sm font-semibold text-white">{song.title}</h5>
                    <p className="text-xs text-white/60">{song.artist}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-white/70">
                    {genres && (
                      <div>
                        <span className="text-white/50">{t('songs.tableGenres')}: </span>
                        <span>{genres}</span>
                      </div>
                    )}
                    {song.recorded_at && (
                      <div>
                        <span className="text-white/50">{t('songs.tableDate')}: </span>
                        <span>{new Date(song.recorded_at).toLocaleDateString('fr-FR')}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-white/50">{t('songs.tableOrder')}: </span>
                      <span>{song.song_order_id ?? '-'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-white/50">{t('songs.tableFile')}: </span>
                      <span className="rounded-full bg-white/10 px-2 py-1 text-xs truncate inline-block max-w-full">{song.file_path}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(song)}
                      className="min-h-[44px] w-full rounded-full border border-primary/60 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary hover:text-dark"
                    >
                      {t('songs.modify')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(song)}
                      className="min-h-[44px] w-full rounded-full border border-red-400/60 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-400 hover:text-dark"
                    >
                      {t('songs.delete')}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-white/10 p-6 text-center text-white/50">
              {songSearchTerm
                ? t('songs.noResults', { term: songSearchInput.trim() })
                : t('songs.noSongs')}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-sm font-semibold text-white sm:text-base">{t('songs.platformSongs')}</h4>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              value={catalogSearchInput}
              onChange={(event) => setCatalogSearchInput(event.target.value)}
              placeholder={t('songs.searchCatalog')}
              className="min-h-[44px] w-full rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/50 focus:border-secondary focus:outline-none sm:w-56"
            />
            <button
              type="button"
              onClick={() => {
                resetStatus();
                loadCatalog();
              }}
              disabled={isCatalogLoading}
              className="min-h-[44px] w-full sm:w-auto rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCatalogLoading ? t('common.loading') : t('songs.refresh')}
            </button>
          </div>
        </div>
        <p className="text-xs text-white/60">
          {t('songs.catalogDesc')}
        </p>
        
        {/* Tableau desktop - Masqué sur mobile */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm text-white/80">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">{t('songs.tableTitle')}</th>
                <th className="px-3 py-2 font-semibold">{t('songs.tableArtist')}</th>
                <th className="px-3 py-2 font-semibold">{t('songs.tableStatus')}</th>
                <th className="px-3 py-2 font-semibold">{t('songs.tableActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredCatalog.length ? (
                filteredCatalog.map((song) => {
                  const isInJukebox = Boolean(song.isInJukebox ?? song.is_in_jukebox);
                  return (
                    <tr key={`catalog-${song.id}`}>
                      <td className="px-3 py-2">{song.title}</td>
                      <td className="px-3 py-2">{song.artist}</td>
                      <td className="px-3 py-2">
                        {isInJukebox ? (
                          <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-xs text-emerald-300">{t('songs.inJukebox')}</span>
                        ) : (
                          <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/60">{t('songs.available')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isInJukebox ? (
                          <button
                            type="button"
                            onClick={() => handleDetach(song.id)}
                            disabled={isCatalogLoading}
                            className="min-h-[36px] rounded-full border border-red-400/60 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-400 hover:text-dark disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {t('songs.remove')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAttach(song.id)}
                            disabled={isCatalogLoading}
                            className="min-h-[36px] rounded-full border border-primary/60 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary hover:text-dark disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {t('songs.add')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-white/50">
                    {catalogSearchTerm
                      ? t('songs.noCatalogResults', { term: catalogSearchInput.trim() })
                      : t('songs.noCatalog')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Cartes mobile - Visibles uniquement sur mobile/tablette */}
        <div className="lg:hidden space-y-3">
          {filteredCatalog.length ? (
            filteredCatalog.map((song) => {
              const isInJukebox = Boolean(song.isInJukebox ?? song.is_in_jukebox);
              return (
                <div key={`catalog-${song.id}`} className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
                  <div>
                    <h5 className="text-sm font-semibold text-white">{song.title}</h5>
                    <p className="text-xs text-white/60">{song.artist}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    {isInJukebox ? (
                      <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">{t('songs.inJukebox')}</span>
                    ) : (
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/60">{t('songs.available')}</span>
                    )}
                    {isInJukebox ? (
                      <button
                        type="button"
                        onClick={() => handleDetach(song.id)}
                        disabled={isCatalogLoading}
                        className="min-h-[44px] rounded-full border border-red-400/60 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-400 hover:text-dark disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t('songs.remove')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAttach(song.id)}
                        disabled={isCatalogLoading}
                        className="min-h-[44px] rounded-full border border-primary/60 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary hover:text-dark disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t('songs.add')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-white/10 p-6 text-center text-white/50">
              {catalogSearchTerm
                ? t('songs.noCatalogResults', { term: catalogSearchInput.trim() })
                : t('songs.noCatalog')}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};


