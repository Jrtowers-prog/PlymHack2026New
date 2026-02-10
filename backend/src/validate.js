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
