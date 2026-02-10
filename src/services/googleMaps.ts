import { env } from '@/src/config/env';
import { AppError } from '@/src/types/errors';
import type {
  DirectionsRoute,
  LatLng,
  NavigationStep,
  PlaceDetails,
  PlacePrediction,
} from '@/src/types/google';
import { decodePolyline } from '@/src/utils/polyline';
import {
  directionsRateLimiter,
  placesAutocompleteRateLimiter,
  placesDetailsRateLimiter,
} from '@/src/utils/rateLimiter';

// ---------------------------------------------------------------------------
// Directions result cache — avoids duplicate API calls for same origin/dest
// ---------------------------------------------------------------------------
interface DirectionsCache {
  data: DirectionsRoute[];
  timestamp: number;
}
const directionsCache = new Map<string, DirectionsCache>();
const DIRECTIONS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const directionsKey = (o: LatLng, d: LatLng) =>
  `${o.latitude.toFixed(5)},${o.longitude.toFixed(5)}-${d.latitude.toFixed(5)},${d.longitude.toFixed(5)}`;

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
      steps?: Array<{
        html_instructions?: string;
        distance?: { value?: number };
        duration?: { value?: number };
        start_location?: { lat: number; lng: number };
        end_location?: { lat: number; lng: number };
        maneuver?: string;
      }>;
    }>;
  }>;
};

const BACKEND_API_BASE = env.apiBaseUrl;

const fetchJson = async <T>(url: string): Promise<T> => {
  try {
    const endpoint = url.replace(BACKEND_API_BASE, '').split('?')[0];
    console.log(`[OSM] 🌐 Backend call → ${endpoint}`);
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
