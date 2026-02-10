/**
 * validate.js — Input validation helpers for the backend proxy.
 *
 * All user-supplied values are validated before being forwarded to
 * upstream APIs (Nominatim, OSRM, Overpass, etc.).
 */

const MAX_INPUT_LENGTH = 300;
const MAX_PLACE_ID_LENGTH = 512;

/**
 * Validate a text search input (e.g. autocomplete query)
 */
function validateTextInput(input) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    return { valid: false, error: 'Missing or empty input' };
  }
  if (input.length > MAX_INPUT_LENGTH) {
    return { valid: false, error: `Input too long (max ${MAX_INPUT_LENGTH} chars)` };
  }
  return { valid: true, value: input.trim() };
}

/**
 * Validate an OSM Place ID (e.g. "osm-node-12345" or "osm-way-6789")
 */
function validatePlaceId(placeId) {
  if (typeof placeId !== 'string' || placeId.trim().length === 0) {
    return { valid: false, error: 'Missing or empty placeId' };
  }
  if (placeId.length > MAX_PLACE_ID_LENGTH) {
    return { valid: false, error: 'placeId too long' };
  }
  // OSM Place IDs: osm-<type>-<id> or legacy alphanumeric
  if (!/^[A-Za-z0-9_-]+$/.test(placeId.trim())) {
    return { valid: false, error: 'Invalid placeId format' };
  }
  return { valid: true, value: placeId.trim() };
}

/**
 * Validate latitude value
 */
function validateLatitude(lat) {
  const n = Number(lat);
  if (isNaN(n) || n < -90 || n > 90) {
    return { valid: false, error: `Invalid latitude: ${lat}` };
  }
  return { valid: true, value: n };
}

/**
