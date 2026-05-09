const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const { songController } = require('../controllers/songController');
const { requireRole } = require('../middleware/auth');
const { authenticate } = require('../middleware/authenticate');

const router = Router();

// Téléchargement invité basé sur un paiement Stripe confirmé (aucune authentification requise)
router.post('/download-by-payment', songController.downloadByPayment);

// Storage pour fichiers audio/vidéo (.mp3, .mp4, etc.)
// Les fichiers sont stockés dans media/ (api/media/) au même niveau que src/
// __dirname = src/routes/, donc on remonte de 2 niveaux pour accéder à api/, puis media/
const audioVideoStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'media', 'audio'),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// Storage pour images
const imageStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'media', 'images'),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// Upload pour audio/vidéo : accepte .mp3, .mp4, .wav, .m4a, etc.
const uploadAudioVideo = multer({
  storage: audioVideoStorage,
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.mp3', '.mp4', '.wav', '.m4a', '.ogg', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Type de fichier non autorisé. Extensions acceptées: ${allowedExtensions.join(', ')}`));
    }
  },
});

// Upload pour images
const uploadImage = multer({
  storage: imageStorage,
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Type de fichier image non autorisé. Extensions acceptées: ${allowedExtensions.join(', ')}`));
    }
  },
});

// Upload combiné pour audio/vidéo et images
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // Déterminer le dossier selon le champ
      // Les fichiers sont stockés dans media/ (api/media/) au même niveau que src/
      // __dirname = src/routes/, donc on remonte de 2 niveaux pour accéder à api/, puis media/
      if (file.fieldname === 'audio') {
        cb(null, path.join(__dirname, '..', '..', 'media', 'audio'));
      } else if (file.fieldname === 'image') {
        cb(null, path.join(__dirname, '..', '..', 'media', 'images'));
      } else {
        cb(new Error('Champ de fichier non reconnu'));
      }
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'audio') {
      // Accepter audio et vidéo
      const allowedExtensions = ['.mp3', '.mp4', '.wav', '.m4a', '.ogg', '.webm'];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedExtensions.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`Type de fichier audio/vidéo non autorisé. Extensions acceptées: ${allowedExtensions.join(', ')}`));
      }
    } else if (file.fieldname === 'image') {
      // Accepter images
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedExtensions.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`Type de fichier image non autorisé. Extensions acceptées: ${allowedExtensions.join(', ')}`));
      }
    } else {
      cb(null, true);
    }
  },
});

// Toutes les autres routes nécessitent une authentification
router.use(authenticate);

// Téléchargement accessible à tout utilisateur authentifié ayant acheté le titre
router.get('/:id/download', songController.download);

// Les opérations de gestion (CRUD) restent réservées aux propriétaires de jukebox et aux admins
router.use(requireRole(['jukebox_owner', 'admin']));

router.get('/', songController.list);
router.get('/:id', songController.getById);
router.post('/', upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'image', maxCount: 1 }]), songController.create);
router.put('/:id', upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'image', maxCount: 1 }]), songController.update);
router.delete('/:id', songController.remove);

module.exports = router;


