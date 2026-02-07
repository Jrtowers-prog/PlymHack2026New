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
};

type OverpassResponse = {
  elements: OverpassElement[];
};

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
const MAX_POLYGON_POINTS = 200;

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

const buildOverpassQuery = (polygon: string): string => {
  return [
    '[out:json][timeout:25];',
    '(',
    `way["highway"](poly:"${polygon}");`,
    ');',
    'out tags;',
  ].join('\n');
};

export const fetchOsmRouteSummary = async (
  path: LatLng[],
  bufferMeters = 50
): Promise<OsmRouteSummary> => {
  const polygon = buildOverpassPolygon(path, bufferMeters);
  const query = buildOverpassQuery(polygon);

  try {
    const response = await fetch(OVERPASS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: query,
    });

    if (!response.ok) {
      throw new AppError(
        'osm_api_error',
        `Overpass API request failed with status ${response.status}`
      );
    }

    const data = (await response.json()) as OverpassResponse;
    const elements = data.elements ?? [];

    return {
      roadTypes: tallyRoadTypes(elements),
      lighting: tallyLighting(elements),
      polygon,
      sampledPoints: path,
    };
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
  concurrency = 2
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
