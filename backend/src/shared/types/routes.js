/**
 * @typedef {Object} RouteSegment
 * @property {{lat: number, lng: number}} start
 * @property {{lat: number, lng: number}} end
 * @property {number} safetyScore
 * @property {string} color
 * @property {string} highway
 * @property {string} roadName
 * @property {boolean} isDeadEnd
 * @property {boolean} hasSidewalk
 * @property {string} surfaceType
 * @property {number} lightScore
 * @property {number} crimeScore
 * @property {number} cctvScore
 * @property {number} placeScore
 * @property {number} trafficScore
 * @property {number} distance
 */

/**
 * @typedef {Object} RoutePOIs
 * @property {{lat: number, lng: number}[]} cctv
 * @property {{lat: number, lng: number}[]} transit
 * @property {{lat: number, lng: number}[]} deadEnds
 * @property {{lat: number, lng: number}[]} lights
 * @property {{lat: number, lng: number}[]} places
 * @property {{lat: number, lng: number, category?: string}[]} crimes
 */

/**
 * @typedef {Object} RouteStats
 * @property {number} deadEnds
 * @property {number} sidewalkPct
 * @property {number} unpavedPct
 * @property {number} transitStopsNearby
 * @property {number} cctvCamerasNearby
 * @property {{segmentIndex: number, name: string, distance: number}[]} roadNameChanges
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string} [error]
 * @property {*} [value]
 */

module.exports = {};
