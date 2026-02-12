/**
 * healthCheck.js — Shared health check route.
 *
 * Returns { status: 'ok', service, timestamp }.
 * Each microservice passes its own service name.
 */

/**
 * @param {string} serviceName - Name of the service (e.g. 'gateway', 'safety')
 */
function healthCheck(serviceName) {
  return (_req, res) => {
    res.json({
      status: 'ok',
      service: serviceName,
      timestamp: new Date().toISOString(),
    });
  };
}

module.exports = { healthCheck };
