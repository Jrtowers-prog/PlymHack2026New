import { env, requireGoogleMapsApiKey } from '@/src/config/env';
import { AppError } from '@/src/types/errors';
import type {
    DirectionsRoute,
    LatLng,
    PlaceDetails,
    PlacePrediction,
} from '@/src/types/google';
import { decodePolyline } from '@/src/utils/polyline';

type GooglePlacesAutocompleteResponse = {
  status: string;
  error_message?: string;
  predictions: Array<{
    place_id: string;
    description: string;
    structured_formatting?: {
      main_text?: string;
      secondary_text?: string;
    };
  }>;
};

type GooglePlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    place_id: string;
    name: string;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  };
};

type GoogleDirectionsResponse = {
  status: string;
  error_message?: string;
  routes: Array<{
    summary?: string;
    overview_polyline?: {
      points?: string;
    };
    legs?: Array<{
      distance?: {
        value?: number;
      };
      duration?: {
        value?: number;
      };
    }>;
  }>;
};

const GOOGLE_PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';
const GOOGLE_DIRECTIONS_BASE_URL = 'https://maps.googleapis.com/maps/api/directions';

const buildLocationBias = (location?: LatLng, radiusMeters?: number): string => {
  if (!location || !radiusMeters) {
    return '';
  }

  return `&location=${location.latitude},${location.longitude}&radius=${radiusMeters}`;
};

const fetchJson = async <T>(url: string): Promise<T> => {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new AppError(
        'google_maps_http_error',
        `Google Maps request failed with status ${response.status}`
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('google_maps_network_error', 'Network error', error);
  }
};

export const fetchPlacePredictions = async (
  input: string,
  options?: { locationBias?: LatLng; radiusMeters?: number }
): Promise<PlacePrediction[]> => {
  const apiKey = requireGoogleMapsApiKey();
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return [];
  }

  const locationBias = buildLocationBias(options?.locationBias, options?.radiusMeters);
  const url = `${GOOGLE_PLACES_BASE_URL}/autocomplete/json?key=${apiKey}&input=${encodeURIComponent(
    trimmedInput
  )}${locationBias}`;

  const data = await fetchJson<GooglePlacesAutocompleteResponse>(url);

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new AppError(
      'google_places_autocomplete_error',
      data.error_message ?? `Google Places Autocomplete failed: ${data.status}`
    );
  }

  return data.predictions.map((prediction) => ({
    placeId: prediction.place_id,
    primaryText: prediction.structured_formatting?.main_text ?? prediction.description,
    secondaryText: prediction.structured_formatting?.secondary_text,
    fullText: prediction.description,
  }));
};

export const fetchPlaceDetails = async (placeId: string): Promise<PlaceDetails> => {
  const apiKey = requireGoogleMapsApiKey();
  const url = `${GOOGLE_PLACES_BASE_URL}/details/json?key=${apiKey}&place_id=${encodeURIComponent(
    placeId
  )}&fields=place_id,name,geometry`;

  const data = await fetchJson<GooglePlaceDetailsResponse>(url);

  if (data.status !== 'OK' || !data.result?.geometry?.location) {
    throw new AppError(
      'google_place_details_error',
      data.error_message ?? `Google Place Details failed: ${data.status}`
    );
  }

  return {
    placeId: data.result.place_id,
    name: data.result.name,
    location: {
      latitude: data.result.geometry.location.lat,
      longitude: data.result.geometry.location.lng,
    },
  };
};

export const fetchDirections = async (
  origin: LatLng,
  destination: LatLng
): Promise<DirectionsRoute[]> => {
  const apiKey = requireGoogleMapsApiKey();
  const url = `${GOOGLE_DIRECTIONS_BASE_URL}/json?key=${apiKey}&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=walking&alternatives=true`;

  const data = await fetchJson<GoogleDirectionsResponse>(url);

  if (data.status !== 'OK') {
    throw new AppError(
      'google_directions_error',
      data.error_message ?? `Google Directions failed: ${data.status}`
    );
  }

  return data.routes.slice(0, 4).map((route, index) => {
    const encodedPolyline = route.overview_polyline?.points ?? '';

    if (!encodedPolyline) {
      throw new AppError('google_directions_error', 'Missing route polyline');
    }

    const legs = route.legs ?? [];
    const distanceMeters = legs.reduce(
      (total, leg) => total + (leg.distance?.value ?? 0),
      0
    );
    const durationSeconds = legs.reduce(
      (total, leg) => total + (leg.duration?.value ?? 0),
      0
    );

    return {
      id: `route-${index}`,
      distanceMeters,
      durationSeconds,
      encodedPolyline,
      path: decodePolyline(encodedPolyline),
      summary: route.summary,
    };
  });
};

export const buildStaticMapUrl = (params: {
  origin?: LatLng | null;
  destination?: LatLng | null;
  encodedPolyline?: string | null;
  width: number;
  height: number;
  scale?: number;
}): string | null => {
  const apiKey = env.googleMapsApiKey;

  if (!apiKey) {
    return null;
  }
  const { origin, destination, encodedPolyline, width, height, scale = 2 } = params;

  const queryParts: string[] = [
    `key=${encodeURIComponent(apiKey)}`,
    `size=${Math.max(1, Math.round(width))}x${Math.max(1, Math.round(height))}`,
    `scale=${scale}`,
  ];

  if (origin) {
    const marker = `color:0x1570EF|${origin.latitude},${origin.longitude}`;
    queryParts.push(`markers=${encodeURIComponent(marker)}`);
  }

  if (destination) {
    const marker = `color:0xD92D20|${destination.latitude},${destination.longitude}`;
    queryParts.push(`markers=${encodeURIComponent(marker)}`);
  }

  if (encodedPolyline) {
    const path = `weight:4|color:0x1570EF|enc:${encodedPolyline}`;
    queryParts.push(`path=${encodeURIComponent(path)}`);
  }

  return `https://maps.googleapis.com/maps/api/staticmap?${queryParts.join('&')}`;
};
