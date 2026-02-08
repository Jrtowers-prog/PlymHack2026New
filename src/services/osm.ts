import { buffer, lineString, simplify } from '@turf/turf';

import { AppError } from '@/src/types/errors';
import type { DirectionsRoute, LatLng } from '@/src/types/google';
import type {
    LightingSummary,
    OsmRouteResult,
    OsmRouteSummary,
    RoadTypeCount,
} from '@/src/types/osm';

type OverpassElement = {
  type: 'way' | 'node' | 'relation';
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
};

type OverpassResponse = {
  elements: OverpassElement[];
};

const OVERPASS_API_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];
const MAX_POLYGON_POINTS = 200;
const OSM_CACHE_TTL_MS = 5 * 60 * 1000;
const OSM_MAX_RETRIES = 3;
const OSM_BASE_BACKOFF_MS = 500;

const osmCache = new Map<string, { timestamp: number; summary: OsmRouteSummary }>();

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
};

type OverpassErrorInfo = {
  status: number;
  retryAfterMs: number | null;
};

const fetchOverpass = async (query: string, endpoint: string): Promise<OverpassResponse> => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: query,
  });

  if (!response.ok) {
    const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));
    const info: OverpassErrorInfo = {
      status: response.status,
      retryAfterMs,
    };

    throw new AppError(
      'osm_api_error',
      `Overpass API request failed with status ${response.status}`,
      info
    );
  }

  return (await response.json()) as OverpassResponse;
};

const fetchOverpassWithRetry = async (query: string): Promise<OverpassResponse> => {
  let lastError: AppError | null = null;

  for (let attempt = 0; attempt <= OSM_MAX_RETRIES; attempt += 1) {
    const endpoint = OVERPASS_API_URLS[attempt % OVERPASS_API_URLS.length];

    try {
      return await fetchOverpass(query, endpoint);
    } catch (error) {
      const normalized =
        error instanceof AppError
          ? error
          : new AppError('osm_network_error', 'Network error', error);
      lastError = normalized;

      if (normalized.code !== 'osm_api_error') {
        throw normalized;
      }

      const retryAfter =
        typeof normalized.cause === 'object' && normalized.cause !== null
          ? (normalized.cause as OverpassErrorInfo).retryAfterMs ?? null
          : null;
      const backoff = OSM_BASE_BACKOFF_MS * Math.pow(2, attempt);
      const waitMs = retryAfter ?? backoff + Math.floor(Math.random() * 250);

      await sleep(waitMs);
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new AppError('osm_api_error', 'Overpass API request failed');
};

const toFixedCoord = (value: number): string => value.toFixed(6);

const ringToOverpassPoly = (ring: number[][]): string => {
  if (ring.length === 0) {
    throw new AppError('osm_polygon_error', 'Buffered polygon is empty');
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  const isClosed = first[0] === last[0] && first[1] === last[1];
  const ringWithClosure = isClosed ? ring : [...ring, first];

  const step = Math.max(1, Math.ceil(ringWithClosure.length / MAX_POLYGON_POINTS));
  const sampled = ringWithClosure.filter((_, index) => index % step === 0);

  return sampled
    .map(([lng, lat]) => `${toFixedCoord(lat)} ${toFixedCoord(lng)}`)
    .join(' ');
};

export const buildOverpassPolygon = (path: LatLng[], bufferMeters = 50): string => {
  if (path.length < 2) {
    throw new AppError('osm_polygon_error', 'Route path must include at least two points');
  }

  const line = lineString(path.map((point) => [point.longitude, point.latitude]));
  const buffered = buffer(line, bufferMeters / 1000, { units: 'kilometers' });
  const simplified = simplify(buffered, { tolerance: 0.0001, highQuality: false });

  if (!simplified.geometry) {
    throw new AppError('osm_polygon_error', 'Buffered polygon is missing geometry');
  }

  if (simplified.geometry.type === 'Polygon') {
    return ringToOverpassPoly(simplified.geometry.coordinates[0]);
  }

  if (simplified.geometry.type === 'MultiPolygon') {
    return ringToOverpassPoly(simplified.geometry.coordinates[0][0]);
  }

  throw new AppError('osm_polygon_error', 'Unsupported polygon geometry');
};

const normalizeLighting = (tags?: Record<string, string>): 'yes' | 'no' | 'unknown' => {
  const lit = tags?.lit?.toLowerCase();

  if (lit === 'yes') {
    return 'yes';
  }

  if (lit === 'no') {
    return 'no';
  }

  return 'unknown';
};

const tallyLighting = (elements: OverpassElement[]): LightingSummary => {
  return elements.reduce<LightingSummary>(
    (summary, element) => {
      const lighting = normalizeLighting(element.tags);

      if (lighting === 'yes') {
        summary.litYes += 1;
      } else if (lighting === 'no') {
        summary.litNo += 1;
      } else {
        summary.litUnknown += 1;
      }

      return summary;
    },
    { litYes: 0, litNo: 0, litUnknown: 0 }
  );
};

const tallyRoadTypes = (elements: OverpassElement[]): RoadTypeCount[] => {
  const counts = new Map<string, number>();

  elements.forEach((element) => {
    const type = element.tags?.highway;

    if (!type) {
      return;
    }

    counts.set(type, (counts.get(type) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
};

const extractLightPoints = (elements: OverpassElement[]): LatLng[] => {
  const points = new Map<number, LatLng>();

  elements.forEach((element) => {
    if (element.type !== 'node') {
      return;
    }

    const highway = element.tags?.highway?.toLowerCase();

    if (highway !== 'street_lamp') {
      return;
    }

    if (typeof element.lat !== 'number' || typeof element.lon !== 'number') {
      return;
    }

    points.set(element.id, {
      latitude: element.lat,
      longitude: element.lon,
    });
  });

  return Array.from(points.values());
};

const buildOverpassQuery = (polygon: string): string => {
  return [
    '[out:json][timeout:25];',
    '(',
    `way["highway"](poly:"${polygon}");`,
    `node["highway"="street_lamp"](poly:"${polygon}");`,
    ');',
    'out body;',
  ].join('\n');
};

export const fetchOsmRouteSummary = async (
  path: LatLng[],
  bufferMeters = 50
): Promise<OsmRouteSummary> => {
  const polygon = buildOverpassPolygon(path, bufferMeters);
  const query = buildOverpassQuery(polygon);
  const cacheKey = `${polygon}:${bufferMeters}`;
  const cached = osmCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < OSM_CACHE_TTL_MS) {
    return cached.summary;
  }

  try {
    const data = await fetchOverpassWithRetry(query);
    const elements = data.elements ?? [];
    const wayElements = elements.filter((element) => element.type === 'way');
    const lightPoints = extractLightPoints(elements);

    const summary = {
      roadTypes: tallyRoadTypes(wayElements),
      lighting: tallyLighting(wayElements),
      polygon,
      sampledPoints: path,
      lightPoints,
    } satisfies OsmRouteSummary;

    osmCache.set(cacheKey, { timestamp: Date.now(), summary });

    return summary;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('osm_network_error', 'Network error', error);
  }
};

const withConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  let index = 0;

  const runners = Array.from({ length: Math.max(1, concurrency) }).map(async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  });

  await Promise.all(runners);
  return results;
};

export const fetchOsmSummariesForRoutes = async (
  routes: DirectionsRoute[],
  bufferMeters = 50,
  concurrency = 1
): Promise<OsmRouteResult[]> => {
  if (routes.length === 0) {
    return [];
  }

  const results = await withConcurrency(routes, concurrency, async (route) => {
    const summary = await fetchOsmRouteSummary(route.path, bufferMeters);
    return {
      routeId: route.id,
      summary,
    };
  });

  return results;
};
