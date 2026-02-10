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

