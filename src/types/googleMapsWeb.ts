export type GoogleMapsEventListener = {
  remove: () => void;
};

export type GoogleLatLng = {
  lat: () => number;
  lng: () => number;
};

export type GoogleLatLngBounds = {
  extend: (latLng: GoogleLatLng) => void;
};

export type GoogleMapOptions = {
  center: GoogleLatLng;
  zoom: number;
  disableDefaultUI?: boolean;
  clickableIcons?: boolean;
  mapId?: string;
};

export type GoogleMapInstance = {
  setCenter: (latLng: GoogleLatLng) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: GoogleLatLngBounds) => void;
};

export type GoogleMarkerOptions = {
  position: GoogleLatLng;
  map: GoogleMapInstance;
  title?: string;
  icon?: string;
};

export type GoogleMarkerInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
};

export type GooglePolylineOptions = {
  path: GoogleLatLng[];
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  map: GoogleMapInstance;
  clickable?: boolean;
};

export type GooglePolylineInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
};

export type AutocompleteRequest = {
  input: string;
  location?: GoogleLatLng;
  radius?: number;
};

export type AutocompletePrediction = {
  place_id?: string;
  description?: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
};

export type GoogleAutocompleteService = {
  getPlacePredictions: (
    request: AutocompleteRequest,
    callback: (predictions: AutocompletePrediction[] | null, status: string) => void
  ) => void;
};

export type PlaceDetailsRequest = {
  placeId: string;
  fields: string[];
};

export type PlaceResult = {
  place_id?: string;
  name?: string;
  geometry?: {
    location?: GoogleLatLng;
  };
};

export type GooglePlacesService = {
  getDetails: (
    request: PlaceDetailsRequest,
    callback: (place: PlaceResult | null, status: string) => void
  ) => void;
};

export type DirectionsRequest = {
  origin: GoogleLatLng;
  destination: GoogleLatLng;
  travelMode: string;
  provideRouteAlternatives?: boolean;
};

export type DirectionsLeg = {
  distance?: {
    value?: number;
  };
  duration?: {
    value?: number;
  };
};

export type DirectionsRoute = {
  overview_path?: GoogleLatLng[];
  legs?: DirectionsLeg[];
  summary?: string;
};

export type DirectionsResult = {
  routes?: DirectionsRoute[];
};

export type GoogleDirectionsService = {
  route: (
    request: DirectionsRequest,
    callback: (result: DirectionsResult | null, status: string) => void
  ) => void;
};

export type GoogleMapsApi = {
  maps: {
    Map: new (element: HTMLElement, options: GoogleMapOptions) => GoogleMapInstance;
    Marker: new (options: GoogleMarkerOptions) => GoogleMarkerInstance;
    Polyline: new (options: GooglePolylineOptions) => GooglePolylineInstance;
    LatLng: new (lat: number, lng: number) => GoogleLatLng;
    LatLngBounds: new () => GoogleLatLngBounds;
    TravelMode: {
      WALKING: string;
    };
    DirectionsStatus: {
      OK: string;
    };
    places: {
      AutocompleteService: new () => GoogleAutocompleteService;
      PlacesService: new (element: HTMLElement) => GooglePlacesService;
      PlacesServiceStatus: {
        OK: string;
        ZERO_RESULTS: string;
      };
    };
    DirectionsService: new () => GoogleDirectionsService;
    event: {
      addListener: (
        instance: object,
        eventName: string,
        handler: () => void
      ) => GoogleMapsEventListener;
    };
  };
};
