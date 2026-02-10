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
      clearTimeout(timer);
      if (!res.ok) throw new AppError('safety_http', `HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof AppError) throw err;
      if (err instanceof Error && err.name === 'AbortError')
        throw new AppError('safety_timeout', 'Request timed out');
      throw new AppError('safety_network', 'Network error', err);
    }
  }
  throw new AppError('safety_http', 'Max retries exceeded');
};

// ---------------------------------------------------------------------------
// Shared roads+lights cache (keyed by rounded bbox, shared across routes)
// ---------------------------------------------------------------------------
type RoadsResult = { overlays: RoadOverlay[]; lights: SafetyMarker[]; busStops: SafetyMarker[]; litCount: number; unlitCount: number };
const roadsCache = new Map<string, RoadsResult>();
const pendingRoads = new Map<string, Promise<RoadsResult>>();

const bboxKey = (b: BBox): string =>
  `${b.minLat.toFixed(4)},${b.minLng.toFixed(4)},${b.maxLat.toFixed(4)},${b.maxLng.toFixed(4)}`;

// ---------------------------------------------------------------------------
// Geo helpers
// ---------------------------------------------------------------------------

const metersToLatDeg = (m: number) => m / 111_320;
const metersToLonDeg = (m: number, lat: number) => {
  const d = 111_320 * Math.cos((lat * Math.PI) / 180);
  return d ? m / d : metersToLatDeg(m);
};
const metersBetweenLongitudes = (minLng: number, maxLng: number, lat: number) =>
  Math.abs(maxLng - minLng) * 111_320 * Math.cos((lat * Math.PI) / 180);
const metersBetweenLatitudes = (minLat: number, maxLat: number) =>
  Math.abs(maxLat - minLat) * 111_320;

/** Haversine distance in metres between two points. */
const haversine = (a: LatLng, b: LatLng): number => {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

/** Minimum distance (metres) from a point to the nearest segment of a polyline. */
const distanceToPath = (point: LatLng, path: LatLng[]): number => {
  let minDist = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    minDist = Math.min(minDist, distanceToSegment(point, path[i], path[i + 1]));
    if (minDist < 1) return minDist; // close enough, skip the rest
  }
  return minDist;
};

/** Distance from point P to line segment AB (metres, approximate). */
const distanceToSegment = (p: LatLng, a: LatLng, b: LatLng): number => {
  const dAB = haversine(a, b);
  if (dAB < 0.5) return haversine(p, a); // degenerate segment
  // project p onto AB using flat-earth approximation (fine for <100m)
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  const px = p.longitude - a.longitude;
  const py = p.latitude - a.latitude;
  let t = (px * dx + py * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  const proj: LatLng = {
    latitude: a.latitude + t * dy,
    longitude: a.longitude + t * dx,
  };
  return haversine(p, proj);
};

interface BBox { minLat: number; maxLat: number; minLng: number; maxLng: number }

const bbox = (path: LatLng[], buffer: number): BBox | null => {
  if (path.length === 0) return null;
  let minLat = path[0].latitude, maxLat = minLat;
  let minLng = path[0].longitude, maxLng = minLng;
  for (const p of path) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
  }
  const mid = (minLat + maxLat) / 2;
  const dLat = metersToLatDeg(buffer);
  const dLng = metersToLonDeg(buffer, mid);
  const bounds = {
    minLat: minLat - dLat,
    maxLat: maxLat + dLat,
    minLng: minLng - dLng,
    maxLng: maxLng + dLng,
  };

  const widthMeters = metersBetweenLongitudes(bounds.minLng, bounds.maxLng, mid);
  const heightMeters = metersBetweenLatitudes(bounds.minLat, bounds.maxLat);

  if (Math.max(widthMeters, heightMeters) > MAX_BBOX_METERS) {
    return null;
  }

  return bounds;
};

/** Downsample a path to at most `max` points. */
const simplify = (path: LatLng[], max = 50): LatLng[] => {
  if (path.length <= max) return path;
  const step = (path.length - 1) / (max - 1);
  const out: LatLng[] = [];
  for (let i = 0; i < max - 1; i++) out.push(path[Math.round(i * step)]);
  out.push(path[path.length - 1]);
  return out;
};

const polyStr = (b: BBox) =>
  `${b.minLat},${b.minLng}:${b.minLat},${b.maxLng}:${b.maxLat},${b.maxLng}:${b.maxLat},${b.minLng}`;

/** Return month strings from 2-months-ago backwards (police data lags ~2 months). */
const recentMonths = (): string[] => {
  const months: string[] = [];
  for (let i = 2; i <= 4; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
};

// ---------------------------------------------------------------------------
// Road-type → colour (green = safe, red = dangerous)
// ---------------------------------------------------------------------------

const ROAD_TYPE_COLORS: Record<string, string> = {
  // Safest (green shades)
  primary:        '#22c55e',
  secondary:      '#4ade80',
  tertiary:       '#86efac',
  living_street:  '#a7f3d0',
  residential:    '#d1fae5',
  // Middle (yellow-ish)
  pedestrian:     '#fbbf24',
  // Risky (orange → red)
  footway:        '#fb923c',
  path:           '#f97316',
  steps:          '#ef4444',
};

const roadColor = (highway: string, lit: string): string => {
  const base = ROAD_TYPE_COLORS[highway] ?? '#94a3b8';
  // Darken unlit roads towards red
  if (lit === 'no') return '#ef4444';
  return base;
};

// ---------------------------------------------------------------------------
// 1. Fetch crimes  → SafetyMarker[]
// ---------------------------------------------------------------------------

const fetchCrimeMarkers = async (path: LatLng[]): Promise<SafetyMarker[]> => {
  try {
    const b = bbox(simplify(path), 75);
    if (!b) return [];
    const poly = polyStr(b);

    // Try several months – police data is usually ~2 months behind
    let data: unknown = null;
    for (const month of recentMonths()) {
      try {
        const url = `${POLICE_BASE_URL}/crimes-street/all-crime?poly=${encodeURIComponent(poly)}&date=${month}`;
        data = await fetchWithTimeout(url, undefined, 8_000);
        if (Array.isArray(data) && data.length > 0) break;
      } catch { /* try next month */ }
    }
    if (!Array.isArray(data)) return [];

    const seen = new Set<string>();
    const markers: SafetyMarker[] = [];
    for (const c of data as Array<{ category?: string; location?: { latitude?: string; longitude?: string } }>) {
      const lat = Number(c.location?.latitude);
      const lng = Number(c.location?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const coord: LatLng = { latitude: lat, longitude: lng };
      // Only keep crimes within 50 m of the actual route
      if (distanceToPath(coord, path) > 50) continue;
      // de-dup by rounded coords (police API snaps to street centres)
      const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push({
        id: `crime-${markers.length}`,
        kind: 'crime',
        coordinate: coord,
        label: c.category ?? 'crime',
      });
      if (markers.length >= MAX_CRIME_MARKERS) break;
    }
    return markers;
  } catch (e) {
    console.warn('[SafetyMap] crimes fetch failed', e);
    return [];
  }
};

// ---------------------------------------------------------------------------
// 2. Fetch roads + street-lights  → { roadOverlays, lightMarkers }
// ---------------------------------------------------------------------------

const fetchRoadsAndLights = async (
  path: LatLng[],
): Promise<RoadsResult> => {
  try {
    const b = bbox(simplify(path), 30);
    if (!b) return { overlays: [], lights: [], busStops: [], litCount: 0, unlitCount: 0 };

    // Check bbox-level cache — routes in the same area share the raw Overpass data
    const bk = bboxKey(b);
    const cachedRoads = roadsCache.get(bk);
    if (cachedRoads) return cachedRoads;

    // If another route is already fetching this bbox, wait for it
    const pending = pendingRoads.get(bk);
    if (pending) return pending;

    const doFetch = async (): Promise<RoadsResult> => {
      // Build a coordinate string for the Overpass "around" filter.
      const routePts = simplify(path, 40);
      const aroundCoords = routePts.map((p) => `${p.latitude},${p.longitude}`).join(',');
      const LIGHT_RADIUS_M = 15;

      const BUS_STOP_RADIUS_M = 80;

      const query = `
[out:json][timeout:12];
(
  way["highway"~"^(footway|path|pedestrian|steps|residential|living_street|secondary|tertiary|primary)$"](${b.minLat},${b.minLng},${b.maxLat},${b.maxLng});
  node["highway"="street_lamp"](around:${LIGHT_RADIUS_M},${aroundCoords});
  node["highway"="bus_stop"](around:${BUS_STOP_RADIUS_M},${aroundCoords});
  node["amenity"="bus_station"](around:${BUS_STOP_RADIUS_M},${aroundCoords});
  node["public_transport"~"^(stop_position|platform)$"](around:${BUS_STOP_RADIUS_M},${aroundCoords});
);
out body geom qt;
`;
      const params = new URLSearchParams({ data: query });

      let response: any;
      try {
        response = await queueOverpassRequest<any>(params.toString(), 10_000, 'roads+lights');
      } catch {
        // Fallback: smaller query, skip lights entirely
        const fallback = `
[out:json][timeout:8];
way["highway"~"^(residential|primary|secondary|tertiary)$"](${b.minLat},${b.minLng},${b.maxLat},${b.maxLng});
out body geom qt;
`;
        response = await queueOverpassRequest<any>(
          new URLSearchParams({ data: fallback }).toString(),
          10_000,
          'roads-fallback',
        );
      }

      const overlays: RoadOverlay[] = [];
      const lights: SafetyMarker[] = [];
      const busStops: SafetyMarker[] = [];
      const MAX_BUS_MARKERS = 100;
      let litCount = 0;
      let unlitCount = 0;

      for (const el of (response?.elements ?? []) as any[]) {
        // Street-lamp nodes – double-check proximity to the path
        if (el.type === 'node' && el.tags?.highway === 'street_lamp') {
          const coord: LatLng = { latitude: el.lat, longitude: el.lon };
          // Only keep lights within 20 m of the actual route polyline
          if (distanceToPath(coord, path) <= 20) {
            if (lights.length < MAX_LIGHT_MARKERS) {
              // Build a descriptive label from available lamp tags
              const method = el.tags?.['light:method'] ?? el.tags?.['light:type'] ?? '';
              const lampType = el.tags?.lamp_type ?? el.tags?.lamp ?? '';
              const count = el.tags?.['light:count'];
              const parts: string[] = ['Street light'];
              if (method) parts.push(method);
              else if (lampType) parts.push(lampType);
              if (count && parseInt(count, 10) > 1) parts.push(`×${count}`);

              lights.push({
                id: `light-${el.id}`,
                kind: 'light',
                coordinate: coord,
                label: parts.join(' · '),
              });
            }
          }
          continue;
        }
