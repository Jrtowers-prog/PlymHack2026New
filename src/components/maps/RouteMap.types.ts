import type { CrimePoint } from '@/src/types/crime';
import type { DirectionsRoute, LatLng, OpenPlace } from '@/src/types/google';

export type RouteMapProps = {
  origin: LatLng | null;
  destination: LatLng | null;
  routes: DirectionsRoute[];
  selectedRouteId: string | null;
  onSelectRoute?: (routeId: string) => void;
  routeColors?: Record<string, string>;
  crimePoints?: CrimePoint[];
  openPlaces?: OpenPlace[];
  lightPoints?: LatLng[];
};
