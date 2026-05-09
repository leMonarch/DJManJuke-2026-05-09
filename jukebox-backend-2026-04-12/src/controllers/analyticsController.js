const { analyticsService } = require('../services/analyticsService');

const getOverview = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const overview = await analyticsService.getAnalyticsOverviewForUser(user.user_id);
    res.json(overview);
  } catch (error) {
    next(error);
  }
};

const analyticsController = {
  getOverview,
};

module.exports = { analyticsController };


