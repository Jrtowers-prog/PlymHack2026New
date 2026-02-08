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

export interface SafetyMapResult {
  markers: SafetyMarker[];
  roadOverlays: RoadOverlay[];
  crimeCount: number;
  streetLights: number;
  litRoads: number;
  unlitRoads: number;
  openPlaces: number;
  safetyScore: number;        // 1–100
  safetyLabel: string;        // e.g. "Safe"
  safetyColor: string;        // hex colour for the score
  mainRoadRatio: number;      // 0-1 fraction of route on main roads
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
): { score: number; label: string; color: string } => {
  // Normalise per-km so short and long routes are comparable
  const km = Math.max(routeDistanceKm, 0.3); // avoid divide-by-zero

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

  // Label & colour
  let label: string;
  let color: string;
  if (score >= 70) {
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

  return { score, label, color };
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
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
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
};

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

    // Build a coordinate string for the Overpass "around" filter.
    // Use a simplified path (max ~40 points) so the query stays small.
    const routePts = simplify(path, 40);
    const aroundCoords = routePts.map((p) => `${p.latitude},${p.longitude}`).join(',');
    // 15 m radius – only lights essentially ON the route
    const LIGHT_RADIUS_M = 15;

    // Single Overpass query:
    //   • highways inside bbox (for road overlays)
    //   • street_lamp nodes within 15 m of the actual route path
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
      response = await fetchWithTimeout<any>(
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
      response = await fetchWithTimeout<any>(
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
    return { markers: [], roadOverlays: [], crimeCount: 0, streetLights: 0, litRoads: 0, unlitRoads: 0, openPlaces: 0, safetyScore: 50, safetyLabel: 'Unknown', safetyColor: '#94a3b8', mainRoadRatio: 0.5 };
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

  // Compute main-road ratio from the road overlays
  let mainRoadCount = 0;
  let pathCount = 0;
  for (const overlay of roadsData.overlays) {
    if (MAIN_ROAD_TYPES.has(overlay.roadType)) mainRoadCount++;
    else if (PATH_ROAD_TYPES.has(overlay.roadType)) pathCount++;
  }
  const totalTyped = mainRoadCount + pathCount;
  const mainRoadRatio = totalTyped > 0 ? mainRoadCount / totalTyped : 0.5;

  const distKm = (routeDistanceMeters ?? 1000) / 1000;
  const { score, label, color } = computeSafetyScore(
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
    crimeCount: crimes.length,
    streetLights: roadsData.lights.length,
    litRoads: roadsData.litCount,
    unlitRoads: roadsData.unlitCount,
    openPlaces: shops.length,
    safetyScore: score,
    safetyLabel: label,
    safetyColor: color,
    mainRoadRatio,
  };

  // Persist so future calls for the same route are instant & identical
  resultCache.set(fp, result);

  return result;
};
