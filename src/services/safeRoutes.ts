/**
 * safeRoutes.ts — Frontend service for the safety-first pathfinding API.
 *
 * Calls the backend /api/safe-routes endpoint which builds an OSM walking
 * graph, scores edges using multiple safety factors (lighting, road type,
 * crime, open places, foot traffic), and returns 3–5 diverse routes ranked
 * by overall safety.
 */

import { env } from '@/src/config/env';
import { AppError } from '@/src/types/errors';
import type { DirectionsRoute, LatLng, RouteSegment } from '@/src/types/google';
import { decodePolyline } from '@/src/utils/polyline';

const BACKEND_BASE = env.apiBaseUrl;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SafetyBreakdown {
  roadType: number;    // 0-100
  lighting: number;    // 0-100
  crime: number;       // 0-100 (higher = safer)
  cctv: number;        // 0-100 (CCTV/surveillance coverage)
  openPlaces: number;  // 0-100
  traffic: number;     // 0-100
}

export interface RouteSafety {
  score: number;            // 0-100
  label: string;            // "Very Safe" | "Safe" | "Moderate" | "Use Caution"
  color: string;            // hex colour
  breakdown: SafetyBreakdown;
  roadTypes: Record<string, number>;  // e.g. { primary: 40, residential: 35, footway: 25 }
  mainRoadRatio: number;    // 0-100
}

export interface SafeRoute extends DirectionsRoute {
  routeIndex: number;
  isSafest: boolean;
  safety: RouteSafety;
  safetySegments: RouteSegment[];
  enrichedSegments?: EnrichedSegment[];
  routeStats?: RouteStats;
  routePOIs?: RoutePOIs;
}

export interface RouteStats {
  deadEnds: number;
  sidewalkPct: number;
  unpavedPct: number;
  transitStopsNearby: number;
  cctvCamerasNearby: number;
  roadNameChanges: Array<{ segmentIndex: number; name: string; distance: number }>;
}

export interface RoutePOIs {
  cctv: Array<{ lat: number; lng: number }>;
  transit: Array<{ lat: number; lng: number }>;
  deadEnds: Array<{ lat: number; lng: number }>;
  lights: Array<{ lat: number; lng: number }>;
  places: Array<{ lat: number; lng: number }>;
  crimes: Array<{ lat: number; lng: number; category?: string }>;
}

export interface EnrichedSegment {
  startCoord: { latitude: number; longitude: number };
  endCoord: { latitude: number; longitude: number };
  midpointCoord: { latitude: number; longitude: number };
  safetyScore: number;
  color: string;
  highway: string;
  roadName: string;
  isDeadEnd: boolean;
  hasSidewalk: boolean;
  surfaceType: string;
  lightScore: number;
  crimeScore: number;
  cctvScore: number;
  placeScore: number;
  trafficScore: number;
  distance: number;
}

export interface SafeRoutesResponse {
  status: string;
  routes: SafeRoute[];
  meta: {
    straightLineDistanceKm: number;
    maxDistanceKm: number;
    routeCount: number;
    dataQuality: {
      roads: number;
      crimes: number;
      lightElements: number;
      cctvCameras: number;
      places: number;
      transitStops: number;
    };
    timing: {
      totalMs: number;
      dataFetchMs: number;
      graphBuildMs: number;
      pathfindMs: number;
    };
    computeTimeMs: number;
  };
  error?: string;
  message?: string;
}

// ── API response shape (before mapping) ─────────────────────────────────────

interface RawSafeRouteSegment {
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  safetyScore: number;
  color: string;
  highway: string;
  roadName?: string;
  isDeadEnd?: boolean;
  hasSidewalk?: boolean;
  surfaceType?: string;
  lightScore?: number;
  crimeScore?: number;
  cctvScore?: number;
  placeScore?: number;
  trafficScore?: number;
  distance?: number;
}

interface RawSafeRoute {
  routeIndex: number;
  isSafest: boolean;
  overview_polyline: { points: string };
  legs: Array<{
    distance: { text: string; value: number };
    duration: { text: string; value: number };
    start_location: { lat: number; lng: number };
    end_location: { lat: number; lng: number };
    steps: Array<unknown>;
  }>;
  summary: string;
  safety: {
    score: number;
    label: string;
    color: string;
    breakdown: SafetyBreakdown;
    roadTypes: Record<string, number>;
    mainRoadRatio: number;
  };
  segments: RawSafeRouteSegment[];
  routeStats?: {
    deadEnds: number;
    sidewalkPct: number;
    unpavedPct: number;
    transitStopsNearby: number;
    cctvCamerasNearby: number;
    roadNameChanges: Array<{ segmentIndex: number; name: string; distance: number }>;
  };
  routePOIs?: {
    cctv: Array<{ lat: number; lng: number }>;
    transit: Array<{ lat: number; lng: number }>;
    deadEnds: Array<{ lat: number; lng: number }>;
    lights: Array<{ lat: number; lng: number }>;
    places: Array<{ lat: number; lng: number }>;
    crimes: Array<{ lat: number; lng: number; category?: string }>;
  };
}

interface RawResponse {
  status: string;
  routes?: RawSafeRoute[];
  meta?: SafeRoutesResponse['meta'];
  error?: string;
  message?: string;
}

// ── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  data: SafeRoutesResponse;
  timestamp: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;

function cacheKey(origin: LatLng, dest: LatLng): string {
  return `${origin.latitude.toFixed(4)},${origin.longitude.toFixed(4)}->${dest.latitude.toFixed(4)},${dest.longitude.toFixed(4)}`;
}

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Fetch 3–5 safety-ranked walking routes from the backend.
 *
 * @throws AppError with code 'DESTINATION_OUT_OF_RANGE' if > 20 km
 * @throws AppError with code 'safe_routes_error' on other failures
 */
export async function fetchSafeRoutes(
  origin: LatLng,
  destination: LatLng,
): Promise<SafeRoutesResponse> {
  const key = cacheKey(origin, destination);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[safeRoutes] 📋 Cache hit');
    return cached.data;
  }

  const url =
    `${BACKEND_BASE}/api/safe-routes?` +
    `origin_lat=${origin.latitude}&origin_lng=${origin.longitude}` +
    `&dest_lat=${destination.latitude}&dest_lng=${destination.longitude}`;

  console.log(`[safeRoutes] 🔍 Fetching safe routes...`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000); // 60s timeout

  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    const raw: RawResponse = await resp.json();

    if (!resp.ok) {
      if (raw.error === 'DESTINATION_OUT_OF_RANGE') {
        throw new AppError(
          'DESTINATION_OUT_OF_RANGE',
          raw.message || 'Destination is too far away. Maximum distance is 20 km.',
