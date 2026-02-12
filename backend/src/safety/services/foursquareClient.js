/**
 * foursquareClient.js — Foursquare Places API v3 client for opening hours.
 *
 * Uses the free-tier Foursquare Places API to:
 *   1. Discover additional places not in OSM
 *   2. Get real-time opening status (hours.open_now) for places
 *
 * Cache: 15-minute TTL on a ~200m grid — opening status rarely changes mid-walk.
 * Batch: samples ~6 evenly-spaced points along the route to cover it with minimal API calls.
 */

const FOURSQUARE_API_BASE = 'https://api.foursquare.com/v3';
const SEARCH_RADIUS = 100;  // metres — covers 30m route buffer well
const SEARCH_LIMIT  = 50;   // max results per call (Foursquare max)

// ── Cache (15 min TTL, keyed on ~200m grid cell) ────────────────────────────
const placeCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

function cacheKey(lat, lng) {
  // ~200m grid cells
  const r = (v) => Math.round(v * 500) / 500;
  return `fsq:${r(lat)},${r(lng)}`;
}

/**
 * Fetch open places near a single point from Foursquare.
 * Returns array of { lat, lng, name, amenity, open, nextChange }.
 */
async function fetchNearPoint(lat, lng, apiKey) {
  const key = cacheKey(lat, lng);
  const cached = placeCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  try {
    const url = `${FOURSQUARE_API_BASE}/places/search?ll=${lat},${lng}&radius=${SEARCH_RADIUS}&limit=${SEARCH_LIMIT}&fields=name,categories,hours,geocodes,location`;
    const res = await fetch(url, {
      headers: { Authorization: apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(3000), // 3s hard timeout per call
    });
    if (!res.ok) {
      console.warn(`[foursquare] ⚠️  API ${res.status} for (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      placeCache.set(key, { ts: Date.now(), data: [] });
      return [];
    }
    const body = await res.json();
    const places = (body.results || []).map((p) => {
      const loc = p.geocodes?.main || {};
      const cat = p.categories?.[0]?.name || '';
      const isOpen = p.hours?.open_now ?? null;

      // Build a human-readable "closes at HH:MM" / "opens at HH:MM" from regular hours
      let nextChange = null;
      if (p.hours?.regular && isOpen !== null) {
        nextChange = deriveNextChange(p.hours.regular, isOpen);
      }

      return {
        lat: loc.latitude ?? lat,
        lng: loc.longitude ?? lng,
        name: p.name || '',
        amenity: cat,
        open: isOpen,
        nextChange,
        source: 'foursquare',
      };
    }).filter((p) => p.open === true); // only confirmed-open places

    placeCache.set(key, { ts: Date.now(), data: places });
    return places;
  } catch (err) {
    console.warn(`[foursquare] ⚠️  Fetch error: ${err.message}`);
    placeCache.set(key, { ts: Date.now(), data: [] });
    return [];
  }
}

/**
 * Derive "closes at HH:MM" or "opens at HH:MM" from Foursquare regular hours.
 */
function deriveNextChange(regular, isOpen) {
  try {
    const now = new Date();
    const dayMap = { 0: 7, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 }; // JS Sun=0 → FSQ Mon=1..Sun=7
    const today = dayMap[now.getDay()];
    const nowMins = now.getHours() * 60 + now.getMinutes();

    // Find today's entry
    const todayEntry = regular.find((r) => r.day === today);
    if (!todayEntry) return null;

    if (isOpen && todayEntry.close) {
      const [h, m] = todayEntry.close.split(':').map(Number);
      return `closes at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    if (!isOpen && todayEntry.open) {
      const [h, m] = todayEntry.open.split(':').map(Number);
      return `opens at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  } catch { /* ignore parse issues */ }
  return null;
}

/**
 * Fetch open places along an entire route from Foursquare.
 * Samples ~6 evenly-spaced points to minimise API calls while covering the route.
 *
 * @param {Array<{lat: number, lng: number}>} routeCoords - decoded route coordinates
 * @param {string} apiKey - Foursquare API key
 * @returns {Promise<Array>} - array of open places with {lat, lng, name, amenity, open, nextChange, source}
 */
async function fetchPlacesAlongRoute(routeCoords, apiKey) {
  if (!apiKey || !routeCoords || routeCoords.length === 0) return [];

  // Pick ~6 evenly-spaced sample points
  const MAX_SAMPLES = 6;
  const step = Math.max(1, Math.floor(routeCoords.length / MAX_SAMPLES));
  const samplePoints = [];
  for (let i = 0; i < routeCoords.length; i += step) {
    samplePoints.push(routeCoords[i]);
  }
  // Always include last point
  const last = routeCoords[routeCoords.length - 1];
  if (samplePoints[samplePoints.length - 1] !== last) samplePoints.push(last);

  // Fetch all sample points in parallel (max ~7 concurrent calls)
  const results = await Promise.all(
    samplePoints.map((pt) => fetchNearPoint(pt.lat, pt.lng, apiKey))
  );

  // Flatten + deduplicate by ~20m proximity
  const all = results.flat();
  const deduped = [];
  const seen = new Set();
  for (const p of all) {
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(p);
    }
  }

  return deduped;
}

module.exports = { fetchPlacesAlongRoute };
