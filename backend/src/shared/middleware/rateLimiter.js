/**
 * rateLimiter.js — Shared rate limiting middleware.
 *
 * Configurable per-IP rate limiter using express-rate-limit.
 */

const rateLimit = require('express-rate-limit');

/**
 * Create a rate limiter middleware.
 * @param {Object} [options]
 * @param {number} [options.windowMs=900000] - Window in ms (default 15 min)
 * @param {number} [options.max=100] - Max requests per window per IP
 * @param {string} [options.message] - Error message
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Too many requests — please try again later.',
  } = options;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });
}

module.exports = { createRateLimiter };
