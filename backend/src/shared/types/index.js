/**
 * shared/types/index.js — Re-export all shared type definitions.
 *
 * Usage:
 *   const { LatLng, SafetyBreakdown, RouteSegment } = require('../../shared/types');
 */

module.exports = {
  ...require('./coordinates'),
  ...require('./safety'),
  ...require('./routes'),
};
