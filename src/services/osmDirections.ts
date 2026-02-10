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
