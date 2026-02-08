import type { RoadOverlay, SafetyMarker } from '@/src/services/safetyMapData';
import type { DirectionsRoute, LatLng } from '@/src/types/google';

export type RouteMapProps = {
  origin: LatLng | null;
  destination: LatLng | null;
  routes: DirectionsRoute[];
  selectedRouteId: string | null;
  safetyMarkers?: SafetyMarker[];
  roadOverlays?: RoadOverlay[];
  onSelectRoute?: (routeId: string) => void;
  onLongPress?: (location: LatLng) => void;
};
