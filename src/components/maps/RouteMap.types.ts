import type { DirectionsRoute, LatLng } from '@/src/types/google';

export type RouteMapProps = {
  origin: LatLng | null;
  destination: LatLng | null;
  routes: DirectionsRoute[];
  selectedRouteId: string | null;
  onSelectRoute?: (routeId: string) => void;
};
