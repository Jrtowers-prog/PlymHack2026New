import { env, requireGoogleMapsApiKey } from '@/src/config/env';
import { AppError } from '@/src/types/errors';
import type {
    DirectionsRoute,
    LatLng,
    PlaceDetails,
    PlacePrediction,
} from '@/src/types/google';
import { decodePolyline } from '@/src/utils/polyline';

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
    }>;
  }>;
};

const GOOGLE_PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';
const GOOGLE_DIRECTIONS_BASE_URL = 'https://maps.googleapis.com/maps/api/directions';

const buildLocationBias = (location?: LatLng, radiusMeters?: number): string => {
  if (!location || !radiusMeters) {
    return '';
  }

  return `&location=${location.latitude},${location.longitude}&radius=${radiusMeters}`;
};

const fetchJson = async <T>(url: string): Promise<T> => {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new AppError(
        'google_maps_http_error',
        `Google Maps request failed with status ${response.status}`
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('google_maps_network_error', 'Network error', error);
  }
};

export const fetchPlacePredictions = async (
  input: string,
  options?: { locationBias?: LatLng; radiusMeters?: number }
): Promise<PlacePrediction[]> => {
  const apiKey = requireGoogleMapsApiKey();
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return [];
  }

  const locationBias = buildLocationBias(options?.locationBias, options?.radiusMeters);
  const url = `${GOOGLE_PLACES_BASE_URL}/autocomplete/json?key=${apiKey}&input=${encodeURIComponent(
    trimmedInput
  )}${locationBias}`;

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
};

export const fetchPlaceDetails = async (placeId: string): Promise<PlaceDetails> => {
  const apiKey = requireGoogleMapsApiKey();
  const url = `${GOOGLE_PLACES_BASE_URL}/details/json?key=${apiKey}&place_id=${encodeURIComponent(
    placeId
  )}&fields=place_id,name,geometry`;

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
    return {
      id: `route-${idOffset + i}`,
      distanceMeters: legs.reduce((t, l) => t + (l.distance?.value ?? 0), 0),
      durationSeconds: legs.reduce((t, l) => t + (l.duration?.value ?? 0), 0),
      encodedPolyline,
      path: decodePolyline(encodedPolyline),
      summary: route.summary,
    };
  }).filter(Boolean);
};

export const fetchDirections = async (
  origin: LatLng,
  destination: LatLng
): Promise<DirectionsRoute[]> => {
  const apiKey = requireGoogleMapsApiKey();
  const base = `${GOOGLE_DIRECTIONS_BASE_URL}/json?key=${apiKey}&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=walking&alternatives=true&avoid=indoor`;

  // 1. Primary request – gets up to ~3 alternatives
  const baseData = await fetchJson<GoogleDirectionsResponse>(base);
  if (baseData.status !== 'OK') {
    throw new AppError(
      'google_directions_error',
      baseData.error_message ?? `Google Directions failed: ${baseData.status}`
    );
  }
  const baseRoutes = parseDirectionsResponse(baseData, 0);

  // 2. Offset waypoints at midpoint — road-type driven, gentle nudge
  const heaviness = pathHeaviness(baseRoutes);
  const offsetPct = 0.03 + heaviness * 0.07; // 3 %–10 %, gentle to avoid loops
  const offsets = generateOffsetWaypoints(origin, destination, offsetPct);
  const extras = await Promise.all(
    offsets.map((wp, i) =>
      fetchJson<GoogleDirectionsResponse>(
        `${base}&waypoints=via:${wp.latitude},${wp.longitude}`
      )
        .then((d) => parseDirectionsResponse(d, (i + 1) * 10))
        .catch(() => [] as DirectionsRoute[])
    )
  ).then((arr) => arr.flat());

  // 3. Merge, deduplicate
  let merged = deduplicateRoutes([...baseRoutes, ...extras]);

  // ── 3b. "Drive-then-walk" main-road discovery ──────────────────────
  // Walking directions prefer footpaths/shortcuts. To discover proper-
  // road alternatives (like Eggbuckland Rd vs a footpath), we request
  // a DRIVING route (which must use real roads) and feed sample points
  // from it as via-waypoints into a walking request. This guides the
  // walker onto the road network without needing large offsets.
  try {
    const drivingUrl = `${GOOGLE_DIRECTIONS_BASE_URL}/json?key=${apiKey}&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=driving`;
    const drivingData = await fetchJson<GoogleDirectionsResponse>(drivingUrl);
    if (drivingData.status === 'OK') {
      const drivePath = parseDirectionsResponse(drivingData, 0)[0]?.path ?? [];
      if (drivePath.length >= 6) {
        // Sample points at 25 %, 50 %, 75 % of the driving path
        const viaPoints = [0.25, 0.5, 0.75].map((frac) => {
          const idx = Math.min(Math.floor(frac * drivePath.length), drivePath.length - 1);
          return drivePath[idx];
        });
        // Single walking request through all road via-points
        const viaStr = viaPoints.map((p) => `via:${p.latitude},${p.longitude}`).join('|');
        const roadWalking = await fetchJson<GoogleDirectionsResponse>(
          `${base}&waypoints=${encodeURIComponent(viaStr)}`
        ).then((d) => parseDirectionsResponse(d, 200)).catch(() => [] as DirectionsRoute[]);
        merged = deduplicateRoutes([...merged, ...roadWalking]);
      }
    }
  } catch {
    // Non-critical — just skip the road-discovery step
  }

  // 4. If fewer than 4 unique routes and route isn't very short, retry with
  //    offsets at ⅓ and ⅔ along the straight line (never along route
  //    geometry — that caused loops).
  const shortestSoFar = Math.min(...merged.map((r) => r.distanceMeters));
  const MIN_RETRY_DISTANCE = 500; // metres – very short routes can't diverge much
  if (merged.length < 4 && shortestSoFar > MIN_RETRY_DISTANCE) {
    const retryPct = Math.min(offsetPct * 1.5, 0.12);
    const retryWps = generateOffsetWaypoints(origin, destination, retryPct, [1 / 3, 2 / 3]);
    const retryExtras = await Promise.all(
      retryWps.map((wp, i) =>
        fetchJson<GoogleDirectionsResponse>(
          `${base}&waypoints=via:${wp.latitude},${wp.longitude}`
        )
          .then((d) => parseDirectionsResponse(d, 100 + i * 10))
          .catch(() => [] as DirectionsRoute[])
      )
    ).then((arr) => arr.flat());
    merged = deduplicateRoutes([...merged, ...retryExtras]);
  }

  // 5. Drop routes that detour too far, sort sensibly
  const shortest = Math.min(...merged.map((r) => r.distanceMeters));
  const reasonable = merged.filter((r) => r.distanceMeters <= shortest * 1.6);
  reasonable.sort((a, b) => {
    const distDiff = a.distanceMeters - b.distanceMeters;
    if (Math.abs(distDiff) > shortest * 0.05) return distDiff;
    return mainRoadScore(b.summary) - mainRoadScore(a.summary);
  });
  return reasonable.slice(0, 5).map((r, i) => ({ ...r, id: `route-${i}` }));
};

export const buildStaticMapUrl = (params: {
  origin?: LatLng | null;
  destination?: LatLng | null;
  encodedPolyline?: string | null;
  width: number;
  height: number;
  scale?: number;
}): string | null => {
  const apiKey = env.googleMapsApiKey;

  if (!apiKey) {
    return null;
  }
  const { origin, destination, encodedPolyline, width, height, scale = 2 } = params;

  const queryParts: string[] = [
    `key=${encodeURIComponent(apiKey)}`,
    `size=${Math.max(1, Math.round(width))}x${Math.max(1, Math.round(height))}`,
    `scale=${scale}`,
  ];

  if (origin) {
    const marker = `color:0x1570EF|${origin.latitude},${origin.longitude}`;
    queryParts.push(`markers=${encodeURIComponent(marker)}`);
  }

  if (destination) {
    const marker = `color:0xD92D20|${destination.latitude},${destination.longitude}`;
    queryParts.push(`markers=${encodeURIComponent(marker)}`);
  }

  if (encodedPolyline) {
    const path = `weight:4|color:0x1570EF|enc:${encodedPolyline}`;
    queryParts.push(`path=${encodeURIComponent(path)}`);
  }

  return `https://maps.googleapis.com/maps/api/staticmap?${queryParts.join('&')}`;
};
