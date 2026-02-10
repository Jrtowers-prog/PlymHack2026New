import { env } from '@/src/config/env';
import { AppError } from '@/src/types/errors';
import type { LatLng } from '@/src/types/google';
import type {
  CrimeIncident,
  OverpassApiResponse,
  OverpassHighwayStats,
  PoliceCrimeApiItem,
  SafetySummary,
} from '@/src/types/safety';
import { fetchNearbyPlacesCached } from '@/src/utils/nearbyCache';
import { queueOverpassRequest } from '@/src/utils/overpassQueue';

/**
 * Progress callback type for safety analysis
 */
export type SafetyProgressCallback = (message: string, progress?: number) => void;

type BoundingBox = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

const POLICE_BASE_URL = env.policeApiBaseUrl;

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

const fetchJson = async <T>(url: string, options?: RequestInit): Promise<T> => {
  try {
    const label = url.includes('police') ? 'Police API' : url.split('?')[0].slice(-40);
    console.log(`[Safety] 🌐 API call → ${label}`);
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new AppError('safety_http_error', `Safety request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('safety_network_error', 'Network error', error);
  }
};

const fetchJsonWithTimeout = async <T>(
  url: string,
  options?: RequestInit,
  timeoutMs = 8000,
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const label = url.includes('police') ? 'Police API' : url.split('?')[0].slice(-40);
    console.log(`[Safety] 🌐 API call → ${label}`);
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new AppError('safety_http_error', `Safety request failed: ${response.status}`);
    return (await response.json()) as T;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new AppError('safety_timeout', 'Request timed out');
    throw new AppError('safety_network_error', 'Network error', error);
  }
};

// ---------------------------------------------------------------------------
// Geo math
// ---------------------------------------------------------------------------

const metersToLatDegrees = (meters: number): number => meters / 111_320;

const metersToLonDegrees = (meters: number, latitude: number): number => {
  const latRadians = (latitude * Math.PI) / 180;
  const metersPerDegree = 111_320 * Math.cos(latRadians);
  if (!metersPerDegree) {
    return metersToLatDegrees(meters);
  }

  return meters / metersPerDegree;
};

const haversineDistance = (point1: LatLng, point2: LatLng): number => {
  const R = 6_371_000;
  const lat1 = (point1.latitude * Math.PI) / 180;
  const lat2 = (point2.latitude * Math.PI) / 180;
  const deltaLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const deltaLng = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// ---------------------------------------------------------------------------
// Spatial grid – O(1) proximity lookups (replaces O(n×m) brute-force)
// ---------------------------------------------------------------------------

/** ~111 m lat, ~70 m lng at UK latitudes */
const GRID_CELL_SIZE_DEG = 0.001;

interface SpatialGrid<T> {
  cells: Map<string, T[]>;
  cellSize: number;
}

const gridKey = (lat: number, lng: number, cellSize: number): string => {
  const row = Math.floor(lat / cellSize);
  const col = Math.floor(lng / cellSize);
  return `${row},${col}`;
};

const buildSpatialGrid = <T>(
  items: T[],
  getCoord: (item: T) => LatLng | undefined,
  cellSize: number = GRID_CELL_SIZE_DEG,
): SpatialGrid<T> => {
  const cells = new Map<string, T[]>();
  for (const item of items) {
    const coord = getCoord(item);
    if (!coord) continue;
    const key = gridKey(coord.latitude, coord.longitude, cellSize);
    let bucket = cells.get(key);
    if (!bucket) {
      bucket = [];
      cells.set(key, bucket);
    }
    bucket.push(item);
  }
  return { cells, cellSize };
};

/** Return items in the cell containing (lat, lng) AND its 8 neighbours. */
const queryGrid = <T>(grid: SpatialGrid<T>, lat: number, lng: number): T[] => {
  const results: T[] = [];
  const row = Math.floor(lat / grid.cellSize);
  const col = Math.floor(lng / grid.cellSize);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const bucket = grid.cells.get(`${row + dr},${col + dc}`);
      if (bucket) results.push(...bucket);
    }
  }
  return results;
};

// ---------------------------------------------------------------------------
// Simple in-memory cache (keyed by route path hash)
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry<unknown>>();

/** Simple hash of a LatLng[] – first/last points + length. */
const hashPath = (path: LatLng[]): string => {
  if (path.length === 0) return 'empty';
  const first = path[0];
  const last = path[path.length - 1];
  return `${first.latitude.toFixed(5)},${first.longitude.toFixed(5)}-${last.latitude.toFixed(5)},${last.longitude.toFixed(5)}-${path.length}`;
};

const getCached = <T>(key: string): T | null => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
};

const setCache = <T>(key: string, data: T): void => {
  cache.set(key, { data, timestamp: Date.now() });
};

// ---------------------------------------------------------------------------
// Route segmentation
// ---------------------------------------------------------------------------

type RouteSegment = {
  id: number;
  start: LatLng;
  end: LatLng;
  center: LatLng;
