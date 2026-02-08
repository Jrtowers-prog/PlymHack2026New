export type NominatimSearchResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  osm_id?: number;
  osm_type?: 'node' | 'way' | 'relation';
};

export type NominatimLookupResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  osm_id?: number;
  osm_type?: 'node' | 'way' | 'relation';
};

export type OsrmRouteResponse = {
  code: string;
  message?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry?: string;
  }>;
};
