const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    message: 'Resource not found',
    path: req.originalUrl,
  });
};

const errorHandler = (err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error('[ErrorHandler] ========================================');
  // eslint-disable-next-line no-console
  console.error('[ErrorHandler] Error message:', err.message);
  // eslint-disable-next-line no-console
  console.error('[ErrorHandler] StatusCode:', err.statusCode);
  // eslint-disable-next-line no-console
  console.error('[ErrorHandler] Type:', err.type);
  // eslint-disable-next-line no-console
  console.error('[ErrorHandler] Code:', err.code);
  // eslint-disable-next-line no-console
  console.error('[ErrorHandler] Param:', err.param);
  // eslint-disable-next-line no-console
  console.error('[ErrorHandler] Details:', err.details);
  // eslint-disable-next-line no-console
  console.error('[ErrorHandler] Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
  // eslint-disable-next-line no-console
  console.error('[ErrorHandler] ========================================');

  const statusCode = err.statusCode || 500;
  const response = {
    message: err.message || 'Internal server error',
  };

  // Ajouter les détails si disponibles (en développement ou pour les erreurs Stripe)
  if (err.details || err.code || err.param) {
    response.details = {
      ...err.details,
      code: err.code,
      param: err.param,
      type: err.type,
    };
  }

  // En développement, ajouter plus de détails
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = {
  notFoundHandler,
  errorHandler,
};


