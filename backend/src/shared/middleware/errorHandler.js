/**
 * errorHandler.js — Global Express error handler.
 *
 * Catches unhandled errors and returns a clean JSON response.
 * Logs the error message server-side for debugging.
 */

function errorHandler(err, _req, res, _next) {
  console.error('[server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { errorHandler };
