import type { CrimePoint, CrimeSummary } from '@/src/types/crime';
import { AppError } from '@/src/types/errors';
import type { LatLng } from '@/src/types/google';
import { buffer, lineString, simplify } from '@turf/turf';

type PoliceUkCrimeResponseItem = {
  category: string;
  persistent_id?: string;
  month?: string;
  outcome_status?: {
    category?: string | null;
  } | null;
  location?: {
    latitude?: string;
    longitude?: string;
  };
};

const POLICE_UK_BASE_URL = 'https://data.police.uk/api/crimes-street/all-crime';
const MAX_POLYGON_POINTS = 200;

const toFixedCoord = (value: number): string => value.toFixed(6);

const ringToPolygonString = (ring: number[][]): string => {
  const normalizedRing = ring.length > 0 ? ring : [];

  if (normalizedRing.length === 0) {
    throw new AppError('crime_polygon_error', 'Buffered polygon is empty');
  }

  const first = normalizedRing[0];
  const last = normalizedRing[normalizedRing.length - 1];
  const isClosed = first[0] === last[0] && first[1] === last[1];
  const ringWithClosure = isClosed ? normalizedRing : [...normalizedRing, first];

  const step = Math.max(1, Math.ceil(ringWithClosure.length / MAX_POLYGON_POINTS));
  const sampled = ringWithClosure.filter((_, index) => index % step === 0);

  return sampled
    .map(([lng, lat]) => `${toFixedCoord(lat)},${toFixedCoord(lng)}`)
    .join(':');
};

export const buildPoliceUkPolygon = (
  path: LatLng[],
  bufferMeters = 50
): string => {
  if (path.length < 2) {
    throw new AppError('crime_polygon_error', 'Route path must include at least two points');
  }

  const line = lineString(path.map((point) => [point.longitude, point.latitude]));
  const buffered = buffer(line, bufferMeters / 1000, { units: 'kilometers' });
  const simplified = simplify(buffered, { tolerance: 0.0001, highQuality: false });

  if (!simplified.geometry) {
    throw new AppError('crime_polygon_error', 'Buffered polygon is missing geometry');
  }

  if (simplified.geometry.type === 'Polygon') {
    return ringToPolygonString(simplified.geometry.coordinates[0]);
  }

  if (simplified.geometry.type === 'MultiPolygon') {
    return ringToPolygonString(simplified.geometry.coordinates[0][0]);
  }

  throw new AppError('crime_polygon_error', 'Unsupported polygon geometry');
};

export const fetchCrimesInPolygon = async (polygon: string): Promise<CrimeSummary> => {
  const url = `${POLICE_UK_BASE_URL}?poly=${encodeURIComponent(polygon)}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new AppError(
        'crime_api_error',
        `Police API request failed with status ${response.status}`
      );
    }

    const data = (await response.json()) as PoliceUkCrimeResponseItem[];
    const points = data.reduce<CrimePoint[]>((accumulator, item) => {
      if (!item.location?.latitude || !item.location?.longitude) {
        return accumulator;
      }

      accumulator.push({
        id: item.persistent_id,
        category: item.category,
        location: {
          latitude: Number(item.location.latitude),
          longitude: Number(item.location.longitude),
        },
        month: item.month,
        outcomeStatus: item.outcome_status?.category ?? null,
      });

      return accumulator;
    }, []);

    return {
      count: points.length,
      points,
      polygon,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('crime_network_error', 'Network error', error);
  }
};

export const fetchCrimeForRoute = async (
  path: LatLng[],
  bufferMeters = 50
): Promise<CrimeSummary> => {
  const polygon = buildPoliceUkPolygon(path, bufferMeters);
  return fetchCrimesInPolygon(polygon);
};
