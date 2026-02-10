import { env } from '@/src/config/env';
import { AppError } from '@/src/types/errors';
import type {
    DirectionsRoute,
    LatLng,
    NavigationStep,
    PlaceDetails,
    PlacePrediction,
} from '@/src/types/google';
import { decodePolyline } from '@/src/utils/polyline';
import {
    directionsRateLimiter,
    placesAutocompleteRateLimiter,
    placesDetailsRateLimiter,
} from '@/src/utils/rateLimiter';

// ---------------------------------------------------------------------------
// Directions result cache — avoids duplicate API calls for same origin/dest
// ---------------------------------------------------------------------------
interface DirectionsCache {
  data: DirectionsRoute[];
  timestamp: number;
}
const directionsCache = new Map<string, DirectionsCache>();
const DIRECTIONS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const directionsKey = (o: LatLng, d: LatLng) =>
  `${o.latitude.toFixed(5)},${o.longitude.toFixed(5)}-${d.latitude.toFixed(5)},${d.longitude.toFixed(5)}`;

type GooglePlacesAutocompleteResponse = {
  status: string;
  error_message?: string;
  predictions: Array<{
    place_id: string;
    description: string;
    structured_formatting?: {
      main_text?: string;
      secondary_text?: string;
    };
  }>;
};

type GooglePlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    place_id: string;
    name: string;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  };
};

type GoogleDirectionsResponse = {
  status: string;
  error_message?: string;
  routes: Array<{
    summary?: string;
    overview_polyline?: {
      points?: string;
    };
    legs?: Array<{
      distance?: {
        value?: number;
      };
      duration?: {
        value?: number;
      };
      steps?: Array<{
        html_instructions?: string;
        distance?: { value?: number };
        duration?: { value?: number };
        start_location?: { lat: number; lng: number };
        end_location?: { lat: number; lng: number };
        maneuver?: string;
      }>;
    }>;
  }>;
};

const BACKEND_API_BASE = env.apiBaseUrl;

const fetchJson = async <T>(url: string): Promise<T> => {
  try {
    const endpoint = url.replace(BACKEND_API_BASE, '').split('?')[0];
    console.log(`[OSM] 🌐 Backend call → ${endpoint}`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new AppError(
        'osm_http_error',
        `OSM request failed with status ${response.status}`
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('osm_network_error', 'Network error', error);
  }
};

export const fetchPlacePredictions = async (
  input: string,
  options?: { locationBias?: LatLng; radiusMeters?: number }
): Promise<PlacePrediction[]> => {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return [];
  }

  // Build backend proxy URL
  let url = `${BACKEND_API_BASE}/api/places/autocomplete?input=${encodeURIComponent(trimmedInput)}`;

  if (options?.locationBias && options.radiusMeters) {
    url += `&lat=${options.locationBias.latitude}&lng=${options.locationBias.longitude}&radius=${options.radiusMeters}`;
  }

  // Rate limit autocomplete calls
  return placesAutocompleteRateLimiter.execute(async () => {

  const data = await fetchJson<GooglePlacesAutocompleteResponse>(url);

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new AppError(
      'google_places_autocomplete_error',
      data.error_message ?? `Google Places Autocomplete failed: ${data.status}`
    );
  }

  return data.predictions.map((prediction) => ({
    placeId: prediction.place_id,
    primaryText: prediction.structured_formatting?.main_text ?? prediction.description,
    secondaryText: prediction.structured_formatting?.secondary_text,
    fullText: prediction.description,
  }));
  }); // end rate limiter
};

export const fetchPlaceDetails = async (placeId: string): Promise<PlaceDetails> => {
  const url = `${BACKEND_API_BASE}/api/places/details?place_id=${encodeURIComponent(placeId)}`;

  return placesDetailsRateLimiter.execute(async () => {

  const data = await fetchJson<GooglePlaceDetailsResponse>(url);

  if (data.status !== 'OK' || !data.result?.geometry?.location) {
    throw new AppError(
      'google_place_details_error',
      data.error_message ?? `Google Place Details failed: ${data.status}`
    );
  }

  return {
    placeId: data.result.place_id,
    name: data.result.name,
    location: {
      latitude: data.result.geometry.location.lat,
      longitude: data.result.geometry.location.lng,
    },
  };
  }); // end rate limiter
};

// ---------------------------------------------------------------------------
// Helpers – generate diverse walking routes
// ---------------------------------------------------------------------------

/** Perpendicular nudges along the STRAIGHT origin→destination line so extra
 *  API calls explore nearby parallel streets. Only uses the direct line
 *  (never actual route geometry) so waypoints cannot create route loops.
 *  `scalePct` controls nudge distance (0.03 = 3 %, 0.12 = 12 %).
 *  `fractions` controls where along the line to place offsets. */
const generateOffsetWaypoints = (
  origin: LatLng,
  dest: LatLng,
  scalePct: number,
  fractions: number[] = [0.5],
): LatLng[] => {
  const dLat = dest.latitude - origin.latitude;
  const dLng = dest.longitude - origin.longitude;
  const len = Math.sqrt(dLat * dLat + dLng * dLng);
  if (len < 0.0001) return [];
  const scale = len * scalePct;
  const pLat = (-dLng / len) * scale;
  const pLng = (dLat / len) * scale;

  const pts: LatLng[] = [];
  for (const frac of fractions) {
    const lat = origin.latitude + dLat * frac;
    const lng = origin.longitude + dLng * frac;
    pts.push({ latitude: lat + pLat, longitude: lng + pLng });
    pts.push({ latitude: lat - pLat, longitude: lng - pLng });
  }
  return pts;
};

/** Estimate how "path-heavy" a set of routes is from their summaries.
 *  Returns 0 (all main roads) to 1 (all paths). */
const pathHeaviness = (routes: DirectionsRoute[]): number => {
  if (routes.length === 0) return 0;
  let pathHits = 0;
  let mainHits = 0;
  for (const r of routes) {
    const s = r.summary ?? '';
    if (/\b(path|trail|footpath|footway|alley|steps|track)\b/i.test(s)) pathHits++;
    if (/\b[ABM]\d|\b(road|street|ave|avenue|boulevard|drive)\b/i.test(s)) mainHits++;
  }
  const total = pathHits + mainHits;
  return total > 0 ? pathHits / total : 0.5;
};

/** Drop routes whose distance AND duration are within 5 %/8 % of an already-kept route */
const deduplicateRoutes = (routes: DirectionsRoute[]): DirectionsRoute[] => {
  const unique: DirectionsRoute[] = [];
  for (const r of routes) {
    const dup = unique.some((u) => {
      const avgD = (u.distanceMeters + r.distanceMeters) / 2 || 1;
      const avgT = (u.durationSeconds + r.durationSeconds) / 2 || 1;
      return (
        Math.abs(u.distanceMeters - r.distanceMeters) / avgD < 0.05 &&
        Math.abs(u.durationSeconds - r.durationSeconds) / avgT < 0.08
      );
    });
    if (!dup) unique.push(r);
  }
  return unique;
};

/** Score a route summary – named / numbered roads rank higher (main roads) */
const mainRoadScore = (summary?: string): number => {
  if (!summary) return 0;
  let score = 0;
  // A-roads, B-roads, M-roads, numbered routes (e.g. A386, B3214)
  if (/\b[ABM]\d/i.test(summary)) score += 3;
  // Named "Road", "Street", "Avenue" etc. – indicates an actual named road vs footpath
  if (/\b(road|street|ave|avenue|boulevard|blvd|highway|hwy|drive|lane|way)\b/i.test(summary)) score += 2;
  // Penalise paths/trails/footways
  if (/\b(path|trail|footpath|footway|alley|steps|track)\b/i.test(summary)) score -= 3;
  return score;
};

/** Parse one Directions REST response into route objects */
const parseDirectionsResponse = (
  data: GoogleDirectionsResponse,
  idOffset: number,
): DirectionsRoute[] => {
  if (data.status !== 'OK') return [];
  return data.routes.map((route, i) => {
    const encodedPolyline = route.overview_polyline?.points ?? '';
    if (!encodedPolyline) return null!;
    const legs = route.legs ?? [];
    // Extract turn-by-turn steps from all legs
    const steps: NavigationStep[] = legs.flatMap((leg) =>
      (leg.steps ?? []).map((s) => ({
        instruction: s.html_instructions ?? '',
        distanceMeters: s.distance?.value ?? 0,
        durationSeconds: s.duration?.value ?? 0,
        startLocation: {
          latitude: s.start_location?.lat ?? 0,
          longitude: s.start_location?.lng ?? 0,
        },
        endLocation: {
          latitude: s.end_location?.lat ?? 0,
          longitude: s.end_location?.lng ?? 0,
        },
        maneuver: s.maneuver,
      }))
    );
    return {
      id: `route-${idOffset + i}`,
      distanceMeters: legs.reduce((t, l) => t + (l.distance?.value ?? 0), 0),
      durationSeconds: legs.reduce((t, l) => t + (l.duration?.value ?? 0), 0),
      encodedPolyline,
      path: decodePolyline(encodedPolyline),
      steps,
      summary: route.summary,
    };
  }).filter(Boolean);
};
// ─────────────────────────────────────────────────────────────────────────────
// Smart route comparison: Car ETA vs Walking ETA with safety validation
// ─────────────────────────────────────────────────────────────────────────────

const WALKING_SPEED_MS = 1.4; // ~5 km/h typical walking speed

/**
 * Calculate estimated walking time for a route based on distance.
 * Assumes average walking speed of ~1.4 m/s (5 km/h)
 */
const calculateWalkingTime = (distanceMeters: number): number => {
  return Math.round(distanceMeters / WALKING_SPEED_MS);
};

export type SmartRoute = DirectionsRoute & {
  mode: 'car' | 'walking';
  carETASeconds: number;
  walkingETASeconds: number;
  reason?: string;
};

/**
 * Fetch smart routes: compares car routes (with calculated walking time)
 * against walking routes. If walking time is within 40% of car route walking time,
 * prefers walking. Otherwise uses car if a walking path exists.
 */
export const fetchSmartDirections = async (
  origin: LatLng,
  destination: LatLng
): Promise<SmartRoute[]> => {
  try {
    console.log(`[🧠 smartDirections] Starting smart route comparison...`);
    
    // Fetch car and walking routes IN PARALLEL (both free OSRM calls)
    const carBase = `${BACKEND_API_BASE}/api/directions?origin_lat=${origin.latitude}&origin_lng=${origin.longitude}&dest_lat=${destination.latitude}&dest_lng=${destination.longitude}&mode=driving`;
    const walkBase = `${BACKEND_API_BASE}/api/directions?origin_lat=${origin.latitude}&origin_lng=${origin.longitude}&dest_lat=${destination.latitude}&dest_lng=${destination.longitude}&mode=walking`;

    console.log(`[🧠 smartDirections] Fetching car + walking routes in parallel...`);
    const [carData, walkData] = await Promise.all([
      directionsRateLimiter.execute(() => fetchJson<GoogleDirectionsResponse>(carBase)),
      directionsRateLimiter.execute(() => fetchJson<GoogleDirectionsResponse>(walkBase)),
    ]);
