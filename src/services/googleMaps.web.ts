import { env, requireGoogleMapsApiKey } from '@/src/config/env';
import { AppError } from '@/src/types/errors';
import type {
    DirectionsRoute,
    LatLng,
    PlaceDetails,
    PlacePrediction,
} from '@/src/types/google';
import type { GoogleMapsApi } from '@/src/types/googleMapsWeb';
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

    // Load Google Maps with callback for proper initialization
    const callbackName = '__googleMapsCallback_' + Date.now();
    (window as unknown as Record<string, () => void>)[callbackName] = () => {
      delete (window as unknown as Record<string, () => void>)[callbackName];
      resolve();
    };
    
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
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
  
  // Build request dynamically to avoid type issues with optional fields
  let request: unknown = { input: trimmedInput };
  
  if (options?.locationBias && options.radiusMeters) {
    request = {
      input: trimmedInput,
      location: new googleMaps.maps.LatLng(
        options.locationBias.latitude,
        options.locationBias.longitude
      ),
      radius: options.radiusMeters,
    };
  }

  return new Promise((resolve, reject) => {
    service.getPlacePredictions(request as Parameters<typeof service.getPlacePredictions>[0], (predictions, status) => {
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

/**
 * Nearby place with open status
 */
export type NearbyPlace = {
  placeId: string;
  name: string;
  location: LatLng;
  isOpen: boolean;
  types: string[];
};

/**
 * Fetch nearby open places along a route segment
 * Uses Google Places Nearby Search to find shops, restaurants, etc.
 */
export const fetchNearbyOpenPlaces = async (
  center: LatLng,
  radiusMeters: number = 50
): Promise<NearbyPlace[]> => {
  // Ensure we're in a browser environment
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const googleMaps = await loadGoogleMapsApi();
    
    // Create a temporary div for PlacesService (required by Google Maps API)
    let placesDiv = document.getElementById('places-service-container') as HTMLDivElement;
    if (!placesDiv) {
      placesDiv = document.createElement('div');
      placesDiv.id = 'places-service-container';
      placesDiv.style.display = 'none';
      document.body.appendChild(placesDiv);
    }
    
    const service = new googleMaps.maps.places.PlacesService(placesDiv);
    
    return new Promise((resolve) => {
      // Use nearbySearch if available, otherwise return empty
      if (!('nearbySearch' in service)) {
        resolve([]);
        return;
      }
      
      const request = {
        location: new googleMaps.maps.LatLng(center.latitude, center.longitude),
        radius: radiusMeters,
        type: 'store', // Focus on retail / shops
        openNow: true,
      };
      
      (service as unknown as {
        nearbySearch: (
          request: unknown, 
          callback: (results: Array<{
            place_id?: string;
            name?: string;
            geometry?: { location?: { lat: () => number; lng: () => number } };
            opening_hours?: { isOpen?: () => boolean };
            types?: string[];
          }> | null, status: string) => void
        ) => void;
      }).nearbySearch(request, (results, status) => {
        if (status !== googleMaps.maps.places.PlacesServiceStatus.OK || !results) {
          resolve([]);
          return;
        }
        
        // Types we actually want (shops, stores, businesses)
        const WANTED_TYPES = new Set([
          'store', 'shop', 'supermarket', 'grocery_or_supermarket',
          'convenience_store', 'shopping_mall', 'department_store',
          'clothing_store', 'shoe_store', 'jewelry_store', 'book_store',
          'electronics_store', 'furniture_store', 'hardware_store',
          'home_goods_store', 'pet_store', 'florist', 'bicycle_store',
          'bakery', 'cafe', 'restaurant', 'bar', 'meal_takeaway',
          'pharmacy', 'bank', 'post_office', 'laundry',
          'beauty_salon', 'hair_care', 'spa',
          'accounting', 'insurance_agency', 'real_estate_agency',
          'travel_agency', 'lawyer', 'dentist', 'doctor',
          'veterinary_care', 'gym', 'library',
          'liquor_store', 'meal_delivery',
        ]);
        // Types we never want
        const BLOCKED_TYPES = new Set([
          'parking', 'car_repair', 'car_wash', 'car_dealer', 'car_rental',
          'gas_station', 'transit_station', 'bus_station', 'train_station',
          'subway_station', 'light_rail_station', 'airport',
          'lodging', 'rv_park', 'campground',
          'cemetery', 'funeral_home', 'church', 'mosque', 'synagogue',
          'hindu_temple', 'place_of_worship',
          'local_government_office', 'city_hall', 'courthouse',
          'fire_station', 'police', 'storage',
          'atm', 'route',
        ]);

        const places: NearbyPlace[] = results
          .filter((place) => {
            if (!place.geometry?.location) return false;
            const types = place.types ?? [];
            // Exclude if any blocked type is present
            if (types.some((t) => BLOCKED_TYPES.has(t))) return false;
            // Include if at least one wanted type is present
            return types.some((t) => WANTED_TYPES.has(t));
          })
          .map((place) => ({
            placeId: place.place_id ?? '',
            name: place.name ?? 'Unknown',
            location: {
              latitude: place.geometry!.location!.lat(),
              longitude: place.geometry!.location!.lng(),
            },
            isOpen: place.opening_hours?.isOpen?.() ?? true,
            types: place.types ?? [],
          }));
        
        resolve(places);
      });
    });
  } catch (error) {
    console.warn('Error fetching nearby places:', error);
    return [];
  }
};

/**
 * Count open places along a route path
 * Samples points along the route and counts unique open establishments
 */
export const countOpenPlacesAlongRoute = async (
  path: LatLng[],
  sampleIntervalMeters: number = 200
): Promise<number> => {
  if (path.length < 2 || typeof window === 'undefined') {
    return 0;
  }

  // Sample points along the route
  const samplePoints: LatLng[] = [];
  let accumulatedDistance = 0;
  
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    
    // Simple distance approximation
    const latDiff = curr.latitude - prev.latitude;
    const lngDiff = curr.longitude - prev.longitude;
    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111000; // Approximate meters
    
    accumulatedDistance += distance;
    
    if (accumulatedDistance >= sampleIntervalMeters) {
      samplePoints.push(curr);
      accumulatedDistance = 0;
    }
  }
  
  // Add first and last points
  if (samplePoints.length === 0) {
    samplePoints.push(path[0]);
    if (path.length > 1) {
      samplePoints.push(path[path.length - 1]);
    }
  }
  
  // Fetch places for each sample point (limit to avoid rate limiting)
  const limitedSamples = samplePoints.slice(0, 5);
  const seenPlaceIds = new Set<string>();
  
  for (const point of limitedSamples) {
    try {
      const places = await fetchNearbyOpenPlaces(point, 100);
      places.forEach((place) => {
        if (place.placeId) {
          seenPlaceIds.add(place.placeId);
        }
      });
    } catch {
      // Continue with other points if one fails
    }
  }
  
  return seenPlaceIds.size;
};
