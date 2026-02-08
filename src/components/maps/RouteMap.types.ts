import type { RoadLabel, RouteSegment, SafetyMarker } from '@/src/services/safetyMapData';
import type { DirectionsRoute, LatLng } from '@/src/types/google';

export type RouteMapProps = {
  origin: LatLng | null;
  destination: LatLng | null;
  routes: DirectionsRoute[];
  selectedRouteId: string | null;
  safetyMarkers?: SafetyMarker[];
  routeSegments?: RouteSegment[];
  roadLabels?: RoadLabel[];
  /** When set, the map smoothly pans to this location. Bump the key to re-trigger. */
  panTo?: { location: LatLng; key: number } | null;
  onSelectRoute?: (routeId: string) => void;
  onLongPress?: (location: LatLng) => void;
  onMapPress?: (location: LatLng) => void;
};
