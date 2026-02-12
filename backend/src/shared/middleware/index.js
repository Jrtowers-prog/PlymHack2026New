/**
 * shared/middleware/index.js — Re-export all shared middleware.
 *
 * Usage:
 *   const { createCorsMiddleware, createRateLimiter, errorHandler, healthCheck }
 *     = require('../../shared/middleware');
 */

module.exports = {
  ...require('./cors'),
  ...require('./rateLimiter'),
  ...require('./errorHandler'),
  ...require('./healthCheck'),
};
