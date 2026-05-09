const requireRole = (roles = []) => (req, res, next) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (roles.length && !roles.includes(user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  return next();
};

const requirePlan = (plans = []) => (req, res, next) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (plans.length && !plans.includes(user.plan)) {
    return res.status(403).json({ message: 'Plan restriction' });
  }

  return next();
};

module.exports = {
  requireRole,
  requirePlan,
};

