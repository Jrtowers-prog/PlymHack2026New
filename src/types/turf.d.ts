type TurfPosition = [number, number];

type TurfLineString = {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: TurfPosition[];
  };
};

type TurfPolygon = {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: TurfPosition[][];
  };
};

type TurfMultiPolygon = {
  type: 'Feature';
  geometry: {
    type: 'MultiPolygon';
    coordinates: TurfPosition[][][];
  };
};

declare module '@turf/turf' {
  export function lineString(coordinates: TurfPosition[]): TurfLineString;

  export function buffer(
    input: TurfLineString | TurfPolygon | TurfMultiPolygon,
    radius: number,
    options: { units: 'kilometers' }
  ): TurfPolygon | TurfMultiPolygon;

  export function simplify<T extends TurfPolygon | TurfMultiPolygon>(
    input: T,
    options: { tolerance: number; highQuality?: boolean }
  ): T;
}
