const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const { authController } = require('../controllers/authController');
const { authenticate, optionalAuthenticate } = require('../middleware/authenticate');

const router = Router();

// Storage pour avatars
// Les fichiers sont stockés dans media/ (api/media/) au même niveau que src/
// __dirname = src/routes/, donc on remonte de 2 niveaux pour accéder à api/, puis media/
const avatarStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'media', 'images'),
  filename: (req, file, cb) => {
    cb(null, `avatar-${Date.now()}-${file.originalname}`);
  },
});

const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Type de fichier non autorisé. Extensions acceptées: ${allowedExtensions.join(', ')}`));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

router.post('/register', uploadAvatar.single('avatar'), authController.register);
router.post('/login', authController.login);
router.get('/me', optionalAuthenticate, authController.currentUser);
router.post('/plan', authenticate, authController.updatePlan);
router.post('/pro/checkout-session', authenticate, authController.createProCheckoutSession);
router.put('/profile', authenticate, authController.updateProfile);
router.delete('/profile', authenticate, authController.deleteProfile);

module.exports = router;



