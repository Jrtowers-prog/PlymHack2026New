import { env, requireGoogleMapsApiKey } from '@/src/config/env';
import { AppError } from '@/src/types/errors';
import type {
    DirectionsRoute,
    LatLng,
    PlaceDetails,
    PlacePrediction,
} from '@/src/types/google';
import type { AutocompleteRequest, GoogleMapsApi } from '@/src/types/googleMapsWeb';
import { encodePolyline } from '@/src/utils/polyline';

type GoogleMapsWindow = Window & {
  google?: GoogleMapsApi;
};

let mapsScriptPromise: Promise<void> | null = null;

const loadGoogleMapsScript = (): Promise<void> => {
  if ((window as GoogleMapsWindow).google?.maps) {
    return Promise.resolve();
  }

  if (mapsScriptPromise) {
    return mapsScriptPromise;
  }

  mapsScriptPromise = new Promise((resolve, reject) => {
    const apiKey = requireGoogleMapsApiKey();
    const script = document.createElement('script');

    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new AppError('google_maps_script_error', 'Unable to load Google Maps'));

    document.head.appendChild(script);
  });

  return mapsScriptPromise;
};

export const loadGoogleMapsApi = async (): Promise<GoogleMapsApi> => {
  await loadGoogleMapsScript();
  const googleMaps = (window as GoogleMapsWindow).google;

  if (!googleMaps?.maps) {
    throw new AppError('google_maps_unavailable', 'Google Maps is not available');
  }

  return googleMaps;
};

export const fetchPlacePredictions = async (
  input: string,
  options?: { locationBias?: LatLng; radiusMeters?: number }
): Promise<PlacePrediction[]> => {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return [];
  }

  const googleMaps = await loadGoogleMapsApi();
  const service = new googleMaps.maps.places.AutocompleteService();
  const request: AutocompleteRequest = {
    input: trimmedInput,
  };

  if (options?.locationBias && options.radiusMeters) {
    request.location = new googleMaps.maps.LatLng(
      options.locationBias.latitude,
      options.locationBias.longitude
    );
    request.radius = options.radiusMeters;
  }

  return new Promise((resolve, reject) => {
    service.getPlacePredictions(request, (predictions, status) => {
      if (status === googleMaps.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
        resolve([]);
        return;
      }

      if (status !== googleMaps.maps.places.PlacesServiceStatus.OK || !predictions) {
        reject(new AppError('google_places_autocomplete_error', `Autocomplete failed: ${status}`));
        return;
      }

      resolve(
        predictions.map((prediction) => ({
          placeId: prediction.place_id ?? '',
          primaryText:
            prediction.structured_formatting?.main_text ?? prediction.description ?? '',
          secondaryText: prediction.structured_formatting?.secondary_text ?? undefined,
          fullText: prediction.description ?? '',
        }))
      );
    });
  });
};

export const fetchPlaceDetails = async (placeId: string): Promise<PlaceDetails> => {
  const googleMaps = await loadGoogleMapsApi();
  const container = document.createElement('div');
  const service = new googleMaps.maps.places.PlacesService(container);

  return new Promise((resolve, reject) => {
    service.getDetails(
      {
        placeId,
        fields: ['place_id', 'name', 'geometry'],
      },
      (place, status) => {
        if (status !== googleMaps.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
          reject(new AppError('google_place_details_error', `Place details failed: ${status}`));
          return;
        }

        resolve({
          placeId: place.place_id ?? placeId,
          name: place.name ?? 'Selected destination',
          location: {
            latitude: place.geometry.location.lat(),
            longitude: place.geometry.location.lng(),
          },
        });
      }
    );
  });
};

export const fetchDirections = async (
  origin: LatLng,
  destination: LatLng
): Promise<DirectionsRoute[]> => {
  const googleMaps = await loadGoogleMapsApi();
  const service = new googleMaps.maps.DirectionsService();

  return new Promise((resolve, reject) => {
    service.route(
      {
        origin: new googleMaps.maps.LatLng(origin.latitude, origin.longitude),
        destination: new googleMaps.maps.LatLng(destination.latitude, destination.longitude),
        travelMode: googleMaps.maps.TravelMode.WALKING,
        provideRouteAlternatives: true,
      },
      (result, status) => {
        if (status !== googleMaps.maps.DirectionsStatus.OK || !result) {
          reject(new AppError('google_directions_error', `Directions failed: ${status}`));
          return;
        }

        const routes = (result.routes ?? []).slice(0, 4).map((route, index) => {
          const path = (route.overview_path ?? []).map((point) => ({
            latitude: point.lat(),
            longitude: point.lng(),
          }));
          const encodedPolyline = encodePolyline(path);
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
            path,
            summary: route.summary,
          };
        });

        resolve(routes);
      }
    );
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
