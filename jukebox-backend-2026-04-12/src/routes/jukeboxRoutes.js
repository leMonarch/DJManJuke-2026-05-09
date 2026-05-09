const { Router } = require('express');
const { jukeboxController } = require('../controllers/jukeboxController');
const { jukeboxLibraryController } = require('../controllers/jukeboxLibraryController');
const { requireRole } = require('../middleware/auth');
const { authenticate, optionalAuthenticate } = require('../middleware/authenticate');

const router = Router();

router.get('/', optionalAuthenticate, jukeboxController.getAllJukeboxes);
router.get('/:slug/playlist', optionalAuthenticate, jukeboxController.getPlaylist);
router.get('/:slug/meta', optionalAuthenticate, jukeboxController.getMeta);
router.get('/:slug/state', optionalAuthenticate, jukeboxController.getPlaybackState);
router.post(
  '/:slug/playlist/reload',
  authenticate,
  requireRole(['jukebox_owner', 'promoter', 'admin']),
  jukeboxController.reloadPlaylist,
);
router.post(
  '/:slug/playlist/next',
  authenticate,
  requireRole(['jukebox_owner', 'admin']),
  jukeboxController.skipToNext,
);
router.post(
  '/:slug/playlist/previous',
  authenticate,
  requireRole(['jukebox_owner', 'admin']),
  jukeboxController.skipToPrevious,
);
router.post(
  '/:slug/playlist/priority-preview',
  authenticate,
  requireRole(['jukebox_owner', 'admin']),
  jukeboxController.previewPriority,
);
router.post(
  '/:slug/playlist/prioritize',
  authenticate,
  requireRole(['jukebox_owner', 'admin']),
  jukeboxController.prioritizeSong,
);
// Annulation d'une priorité payée avec le solde interne par l'utilisateur courant.
router.post(
  '/:slug/playlist/priority/cancel',
  authenticate,
  jukeboxController.cancelPriorityForCurrentUser,
);
// La complétion d'une piste (fin de lecture) peut être déclenchée par un client
// non authentifié (invité). On utilise une authentification optionnelle afin
// de ne pas bloquer l'autoplay côté public tout en permettant d'identifier
// l'utilisateur lorsqu'il est connecté.
router.post(
  '/:slug/playlist/complete',
  optionalAuthenticate,
  jukeboxController.completeSong,
);

router.post(
  '/:slug/location',
  authenticate,
  requireRole(['jukebox_owner', 'admin']),
  jukeboxController.updateLocationFromCoords,
);

router.get(
  '/:slug/locations',
  authenticate,
  requireRole(['jukebox_owner', 'admin']),
  jukeboxController.listLocations,
);

router.put(
  '/:slug/playback-mode',
  authenticate,
  requireRole(['jukebox_owner', 'admin']),
  jukeboxController.updatePlaybackMode,
);

router.get('/:slug/library', authenticate, requireRole(['jukebox_owner', 'admin']), jukeboxLibraryController.listCatalog);
router.post('/:slug/library', authenticate, requireRole(['jukebox_owner', 'admin']), jukeboxLibraryController.addSong);
router.delete(
  '/:slug/library/:songId',
  authenticate,
  requireRole(['jukebox_owner', 'admin']),
  jukeboxLibraryController.removeSong,
);

module.exports = router;


