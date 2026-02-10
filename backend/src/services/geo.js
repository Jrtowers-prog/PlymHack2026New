/**
 * geo.js — Geometry / geography utility functions.
 *
 * OPTIMISATIONS:
 *   • Fast haversine using equirectangular approximation for short distances
 *   • Spatial grid with configurable cell size
 *   • findNearby returns sorted by distance for inverse-distance weighting
 */

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_000;

/**
 * Haversine distance between two lat/lng points in metres.
 */
function haversine(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fast equirectangular approximation — ~5x faster than haversine,
 * accurate to <0.1% for distances under 5 km. Use for proximity checks.
 */
function fastDistance(lat1, lng1, lat2, lng2) {
  const avgLatRad = ((lat1 + lat2) / 2) * DEG_TO_RAD;
  const dx = (lng2 - lng1) * DEG_TO_RAD * Math.cos(avgLatRad);
  const dy = (lat2 - lat1) * DEG_TO_RAD;
  return EARTH_RADIUS_M * Math.sqrt(dx * dx + dy * dy);
}

/**
 * Bounding box from a list of {lat, lng} points, expanded by `bufferMetres`.
 */
function bboxFromPoints(points, bufferMetres = 500) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const latDeg = bufferMetres / 111_320;
  const lngDeg = bufferMetres / (111_320 * Math.cos(((minLat + maxLat) / 2) * DEG_TO_RAD));
  return {
    south: minLat - latDeg,
    north: maxLat + latDeg,
    west: minLng - lngDeg,
    east: maxLng + lngDeg,
  };
}

/**
 * Decode a Google-style encoded polyline into [{lat, lng}, ...].
 */
function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/**
 * Encode [{lat, lng}, ...] into a Google-style polyline string.
 */
function encodePolyline(points) {
  let prevLat = 0, prevLng = 0, result = '';
  for (const { lat, lng } of points) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    result += _encodeValue(iLat - prevLat);
    result += _encodeValue(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }
  return result;
}

function _encodeValue(value) {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let result = '';
  while (v >= 0x20) {
    result += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  result += String.fromCharCode(v + 63);
  return result;
}

/**
 * Build a spatial grid for O(1) proximity lookups.
 * cellSize in degrees (~0.0005 ≈ 55m).
 */
function buildSpatialGrid(items, latKey = 'lat', lngKey = 'lng', cellSize = 0.0005) {
  const grid = new Map();
  for (const item of items) {
    const r = Math.floor(item[latKey] / cellSize);
    const c = Math.floor(item[lngKey] / cellSize);
    const key = `${r},${c}`;
    if (!grid.has(key)) grid.set(key, []);
