/**
 * @typedef {Object} SafetyWeights
 * @property {number} roadType
 * @property {number} lighting
 * @property {number} crimeRate
 * @property {number} cctv
 * @property {number} openPlaces
 * @property {number} gpsTraffic
 */

/**
 * @typedef {Object} SafetyBreakdown
 * @property {number} roadType   - 0-1 score
 * @property {number} lighting   - 0-1 score
 * @property {number} crime      - 0-1 score (higher = safer)
 * @property {number} cctv       - 0-1 score
 * @property {number} openPlaces - 0-1 score
 * @property {number} traffic    - 0-1 score
 * @property {number} overall    - weighted 0-1 combined score
 * @property {Object<string, number>} roadTypes - road type → percentage
 * @property {number} mainRoadRatio - 0-1
 */

/**
 * @typedef {Object} CrimeRecord
 * @property {number} lat
 * @property {number} lng
 * @property {string} category
 * @property {number} severity - 0-1
 * @property {string} month
 */

/**
 * @typedef {Object} SafetyLabel
 * @property {string} label
 * @property {string} color
 */

module.exports = {};
