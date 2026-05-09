const authService = require('../services/authService');
const { createProSubscriptionCheckoutSession } = require('../services/subscriptionService');

const register = async (req, res, next) => {
  try {
    const { username, email, password, jukeboxName, slug, plan } = req.body;
    const avatarFile = req.file;
    const avatarPath = avatarFile ? `/media/images/${avatarFile.filename}` : null;
    const result = await authService.register({ username, email, password, jukeboxName, slug, plan, avatar: avatarPath });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const currentUser = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const profile = await authService.getProfileById(req.user.user_id);
    return res.json({ user: profile });
  } catch (error) {
    next(error);
  }
};

const updatePlan = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const { plan } = req.body ?? {};
    const result = await authService.updatePlan({ userId: req.user.user_id, plan });
    return res.json(result);
  } catch (error) {
    next(error);
  }
};

const createProCheckoutSession = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    // eslint-disable-next-line no-console
    console.log('[createProCheckoutSession] User ID:', req.user.user_id);
    
    // Optionnel: Accepter l'URL du frontend depuis le client (pour gérer les URLs Vercel dynamiques)
    // Le client peut envoyer { frontendUrl: 'https://djman-mini-frontend-u314.vercel.app' }
    const frontendUrl = req.body?.frontendUrl;
    
    const session = await createProSubscriptionCheckoutSession({ 
      userId: req.user.user_id,
      frontendUrl, // Passer l'URL optionnelle du frontend
    });
    return res.status(201).json(session);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[createProCheckoutSession] Error:', error.message);
    // eslint-disable-next-line no-console
    console.error('[createProCheckoutSession] Error type:', error.type);
    // eslint-disable-next-line no-console
    console.error('[createProCheckoutSession] Error statusCode:', error.statusCode);
    // eslint-disable-next-line no-console
    console.error('[createProCheckoutSession] Error details:', error);
    
    // Si c'est une erreur Stripe, elle peut avoir un statusCode
    if (error.type === 'StripeInvalidRequestError' || error.type?.startsWith('Stripe')) {
      error.statusCode = error.statusCode || 400;
      // Ajouter les détails Stripe à l'erreur
      if (error.raw) {
        error.details = {
          type: error.type,
          code: error.code,
          param: error.param,
          message: error.message,
        };
      }
    }
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const { username, email, jukeboxName } = req.body;
    const result = await authService.updateProfile({
      userId: req.user.user_id,
      username,
      email,
      jukeboxName,
    });
    return res.json(result);
  } catch (error) {
    next(error);
  }
};

const deleteProfile = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: 'Mot de passe requis pour supprimer le compte' });
    }
    const result = await authService.deleteProfile({ userId: req.user.user_id, password });
    return res.json(result);
  } catch (error) {
    next(error);
  }
};

const authController = {
  register,
  login,
  currentUser,
  updatePlan,
  createProCheckoutSession,
  updateProfile,
  deleteProfile,
};

module.exports = { authController };


