/**
 * safetyMapData.ts
 *
 * A simple, non-crashing safety data service.
 * Fetches crimes, open places, street-lights and road types from APIs
 * and returns lightweight marker / overlay arrays ready for the map.
 *
 * NO segmentation, NO complex scoring, NO heavy Overpass queries.
 */

import { env } from '@/src/config/env';
import { AppError } from '@/src/types/errors';
import type { LatLng } from '@/src/types/google';
import { fetchNearbyPlacesCached } from '@/src/utils/nearbyCache';
import { queueOverpassRequest } from '@/src/utils/overpassQueue';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MarkerKind = 'crime' | 'shop' | 'light' | 'bus_stop';

export interface SafetyMarker {
  id: string;
  kind: MarkerKind;
  coordinate: LatLng;
  label?: string;
}

export interface RoadOverlay {
  id: string;
  coordinates: LatLng[];
  color: string;           // hex – green→red based on road type / lighting
  roadType: string;
  name?: string;
  lit: 'yes' | 'no' | 'unknown';
}

export interface RoadLabel {
  id: string;
  coordinate: LatLng;
  roadType: string;
  displayName: string;
  color: string;
}

/** A segment of the route polyline coloured by local danger level. */
export interface RouteSegment {
  id: string;
  path: LatLng[];
  color: string; // hex – green (safe) → red (dangerous)
  score: number; // 0 (dangerous) → 1 (safe)
}

/** Human-readable names for OSM highway types */
export const ROAD_TYPE_NAMES: Record<string, string> = {
  primary:       'Main',
  secondary:     'Secondary',
  tertiary:      'Minor',
  residential:   'Residential',
  living_street: 'Living St',
  pedestrian:    'Pedestrian',
  footway:       'Path',
  path:          'Path',
  steps:         'Steps',
  track:         'Track',
  cycleway:      'Cycleway',
  trunk:         'Highway',
  motorway:      'Motorway',
  service:       'Service',
  unclassified:  'Minor',
};

export interface SafetyMapResult {
  markers: SafetyMarker[];
  roadOverlays: RoadOverlay[];
  roadLabels: RoadLabel[];
  routeSegments: RouteSegment[];
  crimeCount: number;
  streetLights: number;
  litRoads: number;
  unlitRoads: number;
  openPlaces: number;
  busStops: number;
  safetyScore: number;        // 1–100
  safetyLabel: string;        // e.g. "Safe"
  safetyColor: string;        // hex colour for the score
  mainRoadRatio: number;      // 0-1 fraction of route on main roads
  /** 1-100 pathfinding score based on road type + lighting ONLY (no crime).
   *  Used to pick the best route — higher = more main roads + better lit. */
  pathfindingScore: number;
  /** 0-1 how much real data we had to base the score on.
   *  Below ~0.3 the score is unreliable → prefer fastest route. */
  dataConfidence: number;
}

// Road types considered "main roads" (safer for walking)
const MAIN_ROAD_TYPES = new Set([
  'primary', 'secondary', 'tertiary', 'residential', 'living_street',
]);
// Road types considered paths/footways (less safe)
const PATH_ROAD_TYPES = new Set([
  'footway', 'path', 'steps', 'track',
]);

// ---------------------------------------------------------------------------
// Safety scoring algorithm
// ---------------------------------------------------------------------------

/**
 * Compute a 1–100 safety score from route data.
 *
 * Factors (weights):
 *   • Crime density      35 %   – fewer crimes = higher score
 *   • Street lighting    25 %   – more lights = higher score
 *   • Open places        12 %   – more activity = higher score
 *   • Bus stops          8 %    – nearby transit = higher score
 *   • Road quality       12 %   – more lit/main roads = higher score
 *   • Main road ratio    8 %    – more main roads = higher score
 *
 * Each factor is normalised 0-1 with sensible caps so the score
 * stays meaningful regardless of route length.
 */
const computeSafetyScore = (
  crimeCount: number,
  streetLights: number,
  litRoads: number,
  unlitRoads: number,
  openPlaces: number,
  busStopCount: number,
  routeDistanceKm: number,
  mainRoadRatio: number,
): { score: number; label: string; color: string; pathfindingScore: number; dataConfidence: number } => {
  // Normalise per-km so short and long routes are comparable
  const km = Math.max(routeDistanceKm, 0.3); // avoid divide-by-zero

  // ── Data-confidence: how many data sources actually returned data? ──
  // Each source contributes up to 0.20 confidence.
  const hasCrimeData   = crimeCount > 0;                    // API returned results
  const hasLightData   = streetLights > 0;                  // Overpass lights
  const hasRoadData    = (litRoads + unlitRoads) > 0;       // Overpass roads
  const hasPlaceData   = openPlaces > 0;                    // Overpass shops/places
  const hasBusData     = busStopCount > 0;                  // Overpass bus stops
  const dataConfidence =
    (hasCrimeData  ? 0.20 : 0) +
    (hasLightData  ? 0.20 : 0) +
    (hasRoadData   ? 0.20 : 0) +
    (hasPlaceData  ? 0.20 : 0) +
    (hasBusData    ? 0.20 : 0);

  // --- Crime factor (0 = lots of crime, 1 = no crime) ---
  const crimesPerKm = crimeCount / km;
  // 0 crimes/km → 1.0,  ≥20 crimes/km → 0.0
  const crimeFactor = Math.max(0, 1 - crimesPerKm / 20);

  // --- Lighting factor (0 = no lights, 1 = well lit) ---
  const lightsPerKm = streetLights / km;
  // 0 lights/km → 0.0,  ≥15 lights/km → 1.0
  const lightFactor = Math.min(1, lightsPerKm / 15);

  // --- Activity factor (0 = deserted, 1 = bustling) ---
  const placesPerKm = openPlaces / km;
  // 0 places/km → 0.0,  ≥8 places/km → 1.0
  const activityFactor = Math.min(1, placesPerKm / 8);

  // --- Bus stop factor (0 = no transit, 1 = well-served) ---
  const busStopsPerKm = busStopCount / km;
  // 0 stops/km → 0.0,  ≥4 stops/km → 1.0
  const busStopFactor = Math.min(1, busStopsPerKm / 4);

  // --- Road quality factor (fraction of roads that are lit) ---
  const totalRoads = litRoads + unlitRoads;
  const roadLitFactor = totalRoads > 0 ? litRoads / totalRoads : 0.5;

  // --- Main road factor (0 = all paths, 1 = all main roads) ---
  const mainRoadFactor = mainRoadRatio; // already 0-1

  // Weighted sum — main road usage is a significant safety signal
  const raw =
    crimeFactor    * 0.30 +
    lightFactor    * 0.22 +
    mainRoadFactor * 0.15 +
    activityFactor * 0.13 +
    busStopFactor  * 0.10 +
    roadLitFactor  * 0.10;

  // Map to 1–100
  const score = Math.round(Math.max(1, Math.min(100, raw * 100)));

  // ── Pathfinding score: road type + lighting ONLY (no crime) ──
  // Used to pick the BEST route. Crime informs the user but should
  // not steer pathfinding — road quality and lighting determine safety
  // for the route selection algorithm.
  const pathfindingRaw =
    mainRoadFactor * 0.45 +  // heavily favour main roads
    lightFactor    * 0.30 +  // well-lit is important
    roadLitFactor  * 0.25;   // lit roads ratio
  const pathfindingScore = Math.round(Math.max(1, Math.min(100, pathfindingRaw * 100)));

  // Label & colour — if we lack data, be honest about it
  let label: string;
  let color: string;
  if (dataConfidence < 0.3) {
    // Not enough data to make a reliable safety judgement
    label = 'Insufficient Data';
    color = '#94a3b8'; // slate-400 (neutral grey)
  } else if (score >= 70) {
    label = 'Very Safe';
    color = '#22c55e'; // green-500
  } else if (score >= 60) {
    label = 'Safe';
    color = '#84cc16'; // lime-500
  } else if (score >= 40) {
    label = 'Moderate';
    color = '#f59e0b'; // amber-500
  } else {
    label = 'Use Caution';
    color = '#ef4444'; // red-500
  }

  return { score, label, color, pathfindingScore, dataConfidence };
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const POLICE_BASE_URL = env.policeApiBaseUrl;
const MAX_BBOX_METERS = 50_000;
const MAX_CRIME_MARKERS = 400;
const MAX_LIGHT_MARKERS = 300;
const MAX_ROAD_OVERLAYS = 300;

// ---------------------------------------------------------------------------
// Network helper (non-Overpass calls, e.g. Police API)
// ---------------------------------------------------------------------------

const fetchWithTimeout = async <T>(
  url: string,
  options?: RequestInit,
  timeoutMs = 12_000,
  retries = 2,
): Promise<T> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const label = url.includes('police') ? 'Police API' : url.split('?')[0].slice(-40);
      console.log(`[SafetyMap] 🌐 API call → ${label}`);
      const res = await fetch(url, { ...options, signal: controller.signal });
