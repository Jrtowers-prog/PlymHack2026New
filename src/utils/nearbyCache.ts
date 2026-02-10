/**
 * nearbyCache.ts
 *
 * Shared module-level cache for OPEN PLACES near route segments.
 * Uses Overpass API (OpenStreetMap) instead of Google Places Nearby —
 * completely FREE with no API key required.
 *
 * Both safetyMapData.ts and safety.ts import this so they never make
 * duplicate API calls for the same area.
 *
 * Key: rounded lat/lng (3 decimal places ≈ ~110m) + radius
 * TTL: 5 minutes
 */

import { queueOverpassQuery } from '@/src/utils/overpassQueue';

export interface NearbyPlace {
  place_id: string;
  name: string;
  location: { lat: number; lng: number } | null;
  types: string[];
  open_now: boolean;        // Overpass can't tell real-time status — assumed true for amenities
  business_status: string;
}

interface CacheEntry {
  results: NearbyPlace[];
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<NearbyPlace[]>>();

// ─── API call tracking ──────────────────────────────────────────────────────
let totalApiCalls = 0;
let cacheHits = 0;
let inflightHits = 0;

/** Round to 3 decimals (~110m) so nearby coordinates share results */
const cacheKey = (lat: number, lng: number, radius: number): string =>
  `${lat.toFixed(3)},${lng.toFixed(3)},${radius}`;

// ─── Overpass query builder ─────────────────────────────────────────────────

/**
 * Build an Overpass QL query that finds amenities, shops, and leisure places
 * within `radius` metres of (lat, lng).
 *
 * Targets places with human activity — the key safety signal:
 *   • amenity: restaurant, cafe, bar, pub, fast_food, nightclub, cinema,
 *              theatre, pharmacy, hospital, clinic, bank, marketplace, etc.
 *   • shop: any shop (supermarket, convenience, etc.)
 *   • leisure: fitness_centre, sports_centre, swimming_pool
 */
