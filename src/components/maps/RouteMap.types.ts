import type { RoadLabel, RouteSegment, SafetyMarker } from '@/src/services/safetyMapData';
import type { DirectionsRoute, LatLng } from '@/src/types/google';

export type MapType = 'roadmap' | 'satellite' | 'hybrid' | 'terrain';

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
  /** Navigation mode — when true, the map follows the user and tilts */
  isNavigating?: boolean;
  /** Live user location during navigation */
  navigationLocation?: LatLng | null;
  /** User heading in degrees (0 = north) */
  navigationHeading?: number | null;
  /** Map display type (roadmap, satellite, hybrid, terrain) */
  mapType?: MapType;
  /** When set, only markers of this kind are shown and they're rendered larger */
  highlightCategory?: string | null;
  onSelectRoute?: (routeId: string) => void;
  onLongPress?: (location: LatLng) => void;
  onMapPress?: (location: LatLng) => void;
};
