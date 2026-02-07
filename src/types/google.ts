export type LatLng = {
  latitude: number;
  longitude: number;
};

export type PlacePrediction = {
  placeId: string;
  primaryText: string;
  secondaryText?: string;
  fullText: string;
};

export type PlaceDetails = {
  placeId: string;
  name: string;
  location: LatLng;
};

export type DirectionsRoute = {
  id: string;
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  path: LatLng[];
  summary?: string;
};
