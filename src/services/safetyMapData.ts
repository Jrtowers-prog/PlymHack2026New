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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MarkerKind = 'crime' | 'shop' | 'light';

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
 *   • Crime density      40 %   – fewer crimes = higher score
 *   • Street lighting    30 %   – more lights = higher score
 *   • Open places        15 %   – more activity = higher score
 *   • Road quality       15 %   – more lit/main roads = higher score
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
  routeDistanceKm: number,
  mainRoadRatio: number,
): { score: number; label: string; color: string; pathfindingScore: number; dataConfidence: number } => {
  // Normalise per-km so short and long routes are comparable
  const km = Math.max(routeDistanceKm, 0.3); // avoid divide-by-zero

  // ── Data-confidence: how many data sources actually returned data? ──
  // Each source contributes up to 0.25 confidence.
  const hasCrimeData   = crimeCount > 0;                    // API returned results
  const hasLightData   = streetLights > 0;                  // Overpass lights
  const hasRoadData    = (litRoads + unlitRoads) > 0;       // Overpass roads
  const hasPlaceData   = openPlaces > 0;                    // Overpass shops/places
  const dataConfidence =
    (hasCrimeData  ? 0.25 : 0) +
    (hasLightData  ? 0.25 : 0) +
    (hasRoadData   ? 0.25 : 0) +
    (hasPlaceData  ? 0.25 : 0);

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

  // --- Road quality factor (fraction of roads that are lit) ---
  const totalRoads = litRoads + unlitRoads;
  const roadLitFactor = totalRoads > 0 ? litRoads / totalRoads : 0.5;

  // --- Main road factor (0 = all paths, 1 = all main roads) ---
  const mainRoadFactor = mainRoadRatio; // already 0-1

  // Weighted sum — main road usage is a significant safety signal
  const raw =
    crimeFactor    * 0.30 +
    lightFactor    * 0.25 +
    mainRoadFactor * 0.20 +
    activityFactor * 0.15 +
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
const OVERPASS_BASE_URL = env.overpassBaseUrl;
const MAX_BBOX_METERS = 50_000;
const MAX_CRIME_MARKERS = 400;
const MAX_LIGHT_MARKERS = 300;
const MAX_ROAD_OVERLAYS = 300;

// ---------------------------------------------------------------------------
// Network helper
// ---------------------------------------------------------------------------

const fetchWithTimeout = async <T>(
  url: string,
  options?: RequestInit,
  timeoutMs = 12_000,
  retries = 3,
): Promise<T> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 429) {
        // Rate-limited — wait and retry
        if (attempt < retries) {
          const delay = 2000 * (attempt + 1); // 2s, 4s, 6s
          console.warn(`[SafetyMap] 429 rate-limited, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new AppError('safety_http', 'HTTP 429 — rate limited');
      }
      if (!res.ok) throw new AppError('safety_http', `HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof AppError) {
        if (err.message.includes('429') && attempt < retries) continue;
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError')
        throw new AppError('safety_timeout', 'Request timed out');
      throw new AppError('safety_network', 'Network error', err);
    }
  }
  throw new AppError('safety_http', 'Max retries exceeded');
};

// ---------------------------------------------------------------------------
// Overpass request serializer — only 1 in-flight request at a time
// ---------------------------------------------------------------------------
let overpassQueue: Promise<any> = Promise.resolve();

const serialOverpassFetch = async <T>(
  url: string,
  options?: RequestInit,
  timeoutMs = 15_000,
): Promise<T> => {
  // Chain onto the queue so requests run one-at-a-time
  const ticket = overpassQueue.then(() => fetchWithTimeout<T>(url, options, timeoutMs));
  // Update the queue head (swallow errors so the queue keeps moving)
  overpassQueue = ticket.catch(() => {});
  return ticket;
};

// ---------------------------------------------------------------------------
// Shared roads+lights cache (keyed by rounded bbox, shared across routes)
// ---------------------------------------------------------------------------
type RoadsResult = { overlays: RoadOverlay[]; lights: SafetyMarker[]; litCount: number; unlitCount: number };
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
        data = await fetchWithTimeout(url, undefined, 12_000);
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
): Promise<{ overlays: RoadOverlay[]; lights: SafetyMarker[]; litCount: number; unlitCount: number }> => {
  try {
    const b = bbox(simplify(path), 30);
    if (!b) return { overlays: [], lights: [], litCount: 0, unlitCount: 0 };

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

      const query = `
[out:json][timeout:12];
(
  way["highway"~"^(footway|path|pedestrian|steps|residential|living_street|secondary|tertiary|primary)$"](${b.minLat},${b.minLng},${b.maxLat},${b.maxLng});
  node["highway"="street_lamp"](around:${LIGHT_RADIUS_M},${aroundCoords});
);
out body geom qt;
`;
      const params = new URLSearchParams({ data: query });

      let response: any;
      try {
        response = await serialOverpassFetch<any>(
          OVERPASS_BASE_URL,
          { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() },
          15_000,
        );
      } catch {
        // Fallback: smaller query, skip lights entirely
        const fallback = `
[out:json][timeout:8];
way["highway"~"^(residential|primary|secondary|tertiary)$"](${b.minLat},${b.minLng},${b.maxLat},${b.maxLng});
out body geom qt;
`;
        response = await serialOverpassFetch<any>(
          OVERPASS_BASE_URL,
          { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: fallback }).toString() },
          10_000,
        );
      }

      const overlays: RoadOverlay[] = [];
      const lights: SafetyMarker[] = [];
      let litCount = 0;
      let unlitCount = 0;

      for (const el of (response?.elements ?? []) as any[]) {
        // Street-lamp nodes – double-check proximity to the path
        if (el.type === 'node' && el.tags?.highway === 'street_lamp') {
          const coord: LatLng = { latitude: el.lat, longitude: el.lon };
          // Only keep lights within 20 m of the actual route polyline
          if (distanceToPath(coord, path) <= 20) {
            if (lights.length < MAX_LIGHT_MARKERS) {
              lights.push({
                id: `light-${el.id}`,
                kind: 'light',
                coordinate: coord,
                label: 'Street light',
              });
            }
          }
          continue;
        }

        // Highway ways – only include roads that touch/overlap the selected route
        if (el.type === 'way' && el.tags?.highway && el.geometry?.length >= 2) {
          const highway: string = el.tags.highway;
          const litVal: string = el.tags.lit ?? '';
          const lit: 'yes' | 'no' | 'unknown' =
            litVal === 'yes' || litVal === 'night' ? 'yes' :
            litVal === 'no' || litVal === 'disused' ? 'no' : 'unknown';

          const coords: LatLng[] = (el.geometry as Array<{ lat: number; lon: number }>).map(
            (n) => ({ latitude: n.lat, longitude: n.lon }),
          );

          // Check if any point on this road is within 40 m of the route
          const nearRoute = coords.some((c) => distanceToPath(c, path) <= 40);
          if (!nearRoute) continue;

          if (lit === 'yes') litCount++;
          else if (lit === 'no') unlitCount++;

          if (overlays.length < MAX_ROAD_OVERLAYS) {
            overlays.push({
              id: `road-${el.id}`,
              coordinates: coords,
              color: roadColor(highway, lit),
              roadType: highway,
              name: el.tags.name,
              lit,
            });
          }
        }
      }

      return { overlays, lights, litCount, unlitCount };
    }; // end doFetch

    // Execute with dedup — only one in-flight fetch per bbox
    const promise = doFetch();
    pendingRoads.set(bk, promise);

    try {
      const result = await promise;
      roadsCache.set(bk, result);
      return result;
    } finally {
      pendingRoads.delete(bk);
    }
  } catch (e) {
    console.warn('[SafetyMap] roads fetch failed', e);
    return { overlays: [], lights: [], litCount: 0, unlitCount: 0 };
  }
};

// ---------------------------------------------------------------------------
// 3. Fetch open places  → SafetyMarker[]
// ---------------------------------------------------------------------------

const MAX_SHOP_MARKERS = 200;

const fetchOpenPlaceMarkers = async (path: LatLng[]): Promise<SafetyMarker[]> => {
  try {
    if (typeof window === 'undefined') return [];

    const { fetchNearbyOpenPlaces } = await import('./googleMaps.web');

    // Sample more points along the route so we don't miss shops.
    // ~8 evenly-spaced samples give good coverage without hitting API limits.
    const sampleCount = Math.min(8, path.length);
    const step = Math.max(1, Math.floor((path.length - 1) / (sampleCount - 1)));
    const samples: LatLng[] = [];
    for (let i = 0; i < path.length; i += step) samples.push(path[i]);
    if (samples[samples.length - 1] !== path[path.length - 1]) {
      samples.push(path[path.length - 1]);
    }

    const seen = new Set<string>();
    const markers: SafetyMarker[] = [];

    for (const pt of samples) {
      try {
        // 100 m radius around each sample point
        const places = await fetchNearbyOpenPlaces(pt, 100);
        for (const p of places) {
          if (seen.has(p.placeId)) continue;
          seen.add(p.placeId);
          // Only keep places within 60 m of the actual route polyline
          if (distanceToPath(p.location, path) > 60) continue;
          markers.push({
            id: `shop-${p.placeId}`,
            kind: 'shop',
            coordinate: p.location,
            label: p.name,
          });
          if (markers.length >= MAX_SHOP_MARKERS) break;
        }
      } catch { /* skip point */ }
      if (markers.length >= MAX_SHOP_MARKERS) break;
    }
    return markers;
  } catch (e) {
    console.warn('[SafetyMap] open places fetch failed', e);
    return [];
  }
};

// ---------------------------------------------------------------------------
// Main entry – fetch everything in parallel (with result cache)
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Generate safety-coloured route segments
// ---------------------------------------------------------------------------

/**
 * Split the route path into segments, each coloured by local danger.
 * For each chunk (~50 m) we check:
 *   • nearby crimes (within 50 m)
 *   • nearby street lights (within 25 m)
 *   • road type the user is on (main road vs footpath)
 * These produce a local 0-1 score mapped to green→amber→red.
 */
const generateRouteSegments = (
  path: LatLng[],
  crimes: SafetyMarker[],
  lights: SafetyMarker[],
  overlays: RoadOverlay[],
): RouteSegment[] => {
  if (path.length < 2) return [];

  // Build simple lookup arrays once
  const crimeCoords = crimes.map((c) => c.coordinate);
  const lightCoords = lights.filter((l) => l.kind === 'light').map((l) => l.coordinate);

  // Determine segment boundaries (~50 m chunks along path)
  const CHUNK_M = 50;
  const chunks: { start: number; end: number }[] = [];
  let acc = 0;
  let chunkStart = 0;
  for (let i = 1; i < path.length; i++) {
    acc += haversine(path[i - 1], path[i]);
    if (acc >= CHUNK_M || i === path.length - 1) {
      chunks.push({ start: chunkStart, end: i });
      chunkStart = i;
      acc = 0;
    }
  }
  if (chunks.length === 0) {
    chunks.push({ start: 0, end: path.length - 1 });
  }

  const segments: RouteSegment[] = [];

  for (let ci = 0; ci < chunks.length; ci++) {
    const { start, end } = chunks[ci];
    const segPath = path.slice(start, end + 1);
    if (segPath.length < 2) continue;

    // Mid-point of the chunk for proximity checks
    const midIdx = Math.floor((start + end) / 2);
    const mid = path[midIdx];

    // Count crimes within 50 m of this chunk's midpoint
    let nearCrimes = 0;
    for (const c of crimeCoords) {
      if (haversine(mid, c) <= 50) nearCrimes++;
    }

    // Count lights within 25 m of this chunk's midpoint
    let nearLights = 0;
    for (const l of lightCoords) {
      if (haversine(mid, l) <= 25) nearLights++;
    }

    // Determine road type at midpoint
    let bestOverlay: RoadOverlay | null = null;
    let bestDist = 30;
    for (const o of overlays) {
      for (const c of o.coordinates) {
        const d = haversine(mid, c);
        if (d < bestDist) { bestDist = d; bestOverlay = o; if (d < 10) break; }
      }
      if (bestDist < 10) break;
    }

    const isMainRoad = bestOverlay ? MAIN_ROAD_TYPES.has(bestOverlay.roadType) : false;
    const isPath = bestOverlay ? PATH_ROAD_TYPES.has(bestOverlay.roadType) : false;
    const isLit = bestOverlay?.lit === 'yes';

    // Compute local safety factor 0 (dangerous) → 1 (safe)
    // Crime factor: 0 crimes → 1.0, 3+ crimes → 0.0
    const crimeFactor = Math.max(0, 1 - nearCrimes / 3);
    // Light factor: 0 lights → 0.2, 2+ lights → 1.0
    const lightFactor = Math.min(1, 0.2 + nearLights * 0.4);
    // Road factor: main road → 1.0, residential → 0.7, path → 0.2
    const roadFactor = isMainRoad ? 1.0 : isPath ? 0.2 : 0.6;
    // Lit bonus
    const litBonus = isLit ? 0.15 : 0;

    const local = Math.min(1, crimeFactor * 0.40 + lightFactor * 0.30 + roadFactor * 0.20 + litBonus + 0.10);

    // Map local score to colour: 0 → red, 0.5 → amber, 1 → green
    const color = localScoreToColor(local);

    segments.push({ id: `seg-${ci}`, path: segPath, color });
  }

  return segments;
};

/** Map a 0-1 safety value to a smooth green→amber→red gradient. */
const localScoreToColor = (t: number): string => {
  // t = 0 → red, t = 0.5 → amber/yellow, t = 1 → green
  const clamped = Math.max(0, Math.min(1, t));
  let r: number, g: number, b: number;
  if (clamped < 0.5) {
    // red → amber
    const p = clamped / 0.5;
    r = 239;
    g = Math.round(68 + p * (158 - 68)); // 68 → 158
    b = Math.round(68 - p * 57);          // 68 → 11
  } else {
    // amber → green
    const p = (clamped - 0.5) / 0.5;
    r = Math.round(245 - p * 211);        // 245 → 34
    g = Math.round(158 + p * (197 - 158)); // 158 → 197
    b = Math.round(11 + p * (83 - 11));    // 11 → 94
  }
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Generate road-type labels at transition points ALONG THE ROUTE ONLY
// ---------------------------------------------------------------------------

/**
 * Walk along the user's route path step-by-step and determine which road
 * overlay the path is actually *on* at each sample point.  Emit a label
 * every time the road type (or street name) changes – i.e. when the user
 * would turn onto a different kind of road.
 *
 * Side roads that happen to be nearby but are NOT part of the route are
 * ignored entirely.
 */
const generateRoadLabels = (overlays: RoadOverlay[], path: LatLng[]): RoadLabel[] => {
  if (overlays.length === 0 || path.length < 2) return [];

  // Pre-compute the midpoint of every overlay for fast lookup
  const overlayMids = overlays.map((o) => ({
    overlay: o,
    mid: o.coordinates[Math.floor(o.coordinates.length / 2)],
  }));

  /**
   * For a given point on the route, find the overlay whose geometry is
   * closest.  We check every coordinate of every overlay – but we bail
   * early once we find something within 15 m (definitely on the road).
   * If nothing is within 30 m the point is "unmatched" (e.g. crossing a
   * car park).
   */
  const matchOverlay = (pt: LatLng): RoadOverlay | null => {
    let best: RoadOverlay | null = null;
    let bestDist = 30; // max snap distance in metres
    for (const { overlay } of overlayMids) {
      for (const c of overlay.coordinates) {
        const d = haversine(pt, c);
        if (d < bestDist) {
          bestDist = d;
          best = overlay;
          if (d < 15) return best; // close enough, skip the rest
        }
      }
    }
    return best;
  };

  // Sample the route at roughly every 80 m — enough to catch turns
  const samplePoints: LatLng[] = [];
  let accumulated = 0;
  samplePoints.push(path[0]);
  for (let i = 1; i < path.length; i++) {
    accumulated += haversine(path[i - 1], path[i]);
    if (accumulated >= 80) {
      samplePoints.push(path[i]);
      accumulated = 0;
    }
  }
  if (samplePoints[samplePoints.length - 1] !== path[path.length - 1]) {
    samplePoints.push(path[path.length - 1]);
  }

  const labels: RoadLabel[] = [];
  let lastType = ''; // only track road TYPE, not name
  let lastCoord: LatLng | null = null;

  for (const pt of samplePoints) {
    const matched = matchOverlay(pt);
    if (!matched) continue;

    // Only emit a label when the road TYPE changes (e.g. residential → footway)
    if (matched.roadType === lastType) continue;

    // Ensure minimum 150 m spacing between labels so they don't pile up
    if (lastCoord && haversine(pt, lastCoord) < 150) continue;

    const displayName = ROAD_TYPE_NAMES[matched.roadType] ?? matched.roadType;
    labels.push({
      id: `rlabel-${labels.length}`,
      coordinate: pt,
      roadType: matched.roadType,
      displayName,
      color: matched.color,
    });
    lastType = matched.roadType;
    lastCoord = pt;
  }

  return labels;
};

export type SafetyProgressCb = (msg: string, pct: number) => void;

/** Cache keyed by path fingerprint so repeated calls return identical data */
const resultCache = new Map<string, SafetyMapResult>();

const pathFingerprint = (path: LatLng[], dist?: number): string => {
  const first = path[0];
  const last = path[path.length - 1];
  return `${first.latitude.toFixed(5)},${first.longitude.toFixed(5)}|${last.latitude.toFixed(5)},${last.longitude.toFixed(5)}|${dist ?? 0}`;
};

export const fetchSafetyMapData = async (
  path: LatLng[],
  onProgress?: SafetyProgressCb,
  routeDistanceMeters?: number,
): Promise<SafetyMapResult> => {
  if (path.length < 2) {
    return { markers: [], roadOverlays: [], roadLabels: [], routeSegments: [], crimeCount: 0, streetLights: 0, litRoads: 0, unlitRoads: 0, openPlaces: 0, safetyScore: 50, safetyLabel: 'Insufficient Data', safetyColor: '#94a3b8', mainRoadRatio: 0.5, pathfindingScore: 50, dataConfidence: 0 };
  }

  // Return cached result if we already analysed this exact route
  const fp = pathFingerprint(path, routeDistanceMeters);
  const cached = resultCache.get(fp);
  if (cached) {
    onProgress?.('✅ Done!', 100);
    return cached;
  }

  onProgress?.('🔍 Fetching safety data…', 10);

  const [crimes, roadsData, shops] = await Promise.all([
    fetchCrimeMarkers(path),
    fetchRoadsAndLights(path),
    fetchOpenPlaceMarkers(path),
  ]);

  onProgress?.('✅ Done!', 100);

  const markers = [...crimes, ...roadsData.lights, ...shops];

  // --- Generate safety-coloured route segments ---
  const routeSegments = generateRouteSegments(path, crimes, roadsData.lights, roadsData.overlays);

  // --- Generate road-type labels where the street type changes ---
  const roadLabels = generateRoadLabels(roadsData.overlays, path);

  // Compute main-road ratio by WALKING THE ACTUAL ROUTE and checking
  // what road type each sample point is on. This ensures a route on
  // main roads gets a high ratio even when the bbox contains footpaths nearby.
  let mainSamples = 0;
  let pathSamples = 0;
  let totalSamples = 0;
  {
    const SAMPLE_M = 50;
    let acc = 0;
    const samplePts: LatLng[] = [path[0]];
    for (let i = 1; i < path.length; i++) {
      acc += haversine(path[i - 1], path[i]);
      if (acc >= SAMPLE_M) { samplePts.push(path[i]); acc = 0; }
    }
    for (const pt of samplePts) {
      let bestOverlay: RoadOverlay | null = null;
      let bestDist = 30;
      for (const o of roadsData.overlays) {
        for (const c of o.coordinates) {
          const d = haversine(pt, c);
          if (d < bestDist) { bestDist = d; bestOverlay = o; if (d < 10) break; }
        }
        if (bestDist < 10) break;
      }
      if (!bestOverlay) continue;
      totalSamples++;
      if (MAIN_ROAD_TYPES.has(bestOverlay.roadType)) mainSamples++;
      else if (PATH_ROAD_TYPES.has(bestOverlay.roadType)) pathSamples++;
    }
  }
  const mainRoadRatio = totalSamples > 0 ? mainSamples / totalSamples : 0.5;

  const distKm = (routeDistanceMeters ?? 1000) / 1000;
  const { score, label, color, pathfindingScore, dataConfidence } = computeSafetyScore(
    crimes.length,
    roadsData.lights.length,
    roadsData.litCount,
    roadsData.unlitCount,
    shops.length,
    distKm,
    mainRoadRatio,
  );

  const result: SafetyMapResult = {
    markers,
    roadOverlays: roadsData.overlays,
    roadLabels,
    routeSegments,
    crimeCount: crimes.length,
    streetLights: roadsData.lights.length,
    litRoads: roadsData.litCount,
    unlitRoads: roadsData.unlitCount,
    openPlaces: shops.length,
    safetyScore: score,
    safetyLabel: label,
    safetyColor: color,
    mainRoadRatio,
    pathfindingScore,
    dataConfidence,
  };

  // Persist so future calls for the same route are instant & identical
  resultCache.set(fp, result);

  return result;
};
