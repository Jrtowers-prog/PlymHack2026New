import type { LatLng } from '@/src/types/google';

type SampleOptions = {
  intervalMeters: number;
  maxSamples?: number;
};

const EARTH_RADIUS_METERS = 6371000;

const toRadians = (value: number): number => (value * Math.PI) / 180;

const haversineDistanceMeters = (a: LatLng, b: LatLng): number => {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_METERS * c;
};

export const sampleRoutePoints = (
  path: LatLng[],
  { intervalMeters, maxSamples }: SampleOptions
): LatLng[] => {
  if (path.length === 0) {
    return [];
  }

  const samples: LatLng[] = [path[0]];
  let distanceSinceLast = 0;

  for (let index = 1; index < path.length; index += 1) {
    const segmentStart = path[index - 1];
    const segmentEnd = path[index];
    const segmentDistance = haversineDistanceMeters(segmentStart, segmentEnd);

    if (segmentDistance === 0) {
      continue;
    }

    let distanceIntoSegment = 0;

    while (distanceSinceLast + (segmentDistance - distanceIntoSegment) >= intervalMeters) {
      const distanceToNext = intervalMeters - distanceSinceLast;
      const nextDistanceIntoSegment = distanceIntoSegment + distanceToNext;
      const t = nextDistanceIntoSegment / segmentDistance;

      samples.push({
        latitude: segmentStart.latitude + (segmentEnd.latitude - segmentStart.latitude) * t,
        longitude: segmentStart.longitude + (segmentEnd.longitude - segmentStart.longitude) * t,
      });

      distanceSinceLast = 0;
      distanceIntoSegment = nextDistanceIntoSegment;
    }

    distanceSinceLast += segmentDistance - distanceIntoSegment;
  }

  const last = path[path.length - 1];
  const lastSample = samples[samples.length - 1];
  if (lastSample.latitude !== last.latitude || lastSample.longitude !== last.longitude) {
    samples.push(last);
  }

  if (!maxSamples || samples.length <= maxSamples) {
    return samples;
  }

  const step = Math.ceil(samples.length / maxSamples);
  return samples.filter((_, index) => index % step === 0);
};
