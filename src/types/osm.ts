import type { LatLng } from '@/src/types/google';

export type RoadTypeCount = {
  type: string;
  count: number;
};

export type LightingSummary = {
  litYes: number;
  litNo: number;
  litUnknown: number;
};

export type OsmRouteSummary = {
  roadTypes: RoadTypeCount[];
  lighting: LightingSummary;
  polygon: string;
  sampledPoints: LatLng[];
};

export type OsmRouteResult = {
  routeId: string;
  summary: OsmRouteSummary;
};
