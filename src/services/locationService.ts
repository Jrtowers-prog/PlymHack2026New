import * as Location from 'expo-location';

import { Coordinates, LocationError } from '@/src/types/location';

export type PermissionResponse = {
  status: Location.PermissionStatus;
  canAskAgain: boolean;
};

const toCoordinates = (coords: Location.LocationObjectCoords): Coordinates => ({
  latitude: coords.latitude,
  longitude: coords.longitude,
  accuracyMeters: typeof coords.accuracy === 'number' ? coords.accuracy : null,
});

export const getForegroundPermission = async (): Promise<PermissionResponse> => {
  const result = await Location.getForegroundPermissionsAsync();
  return {
    status: result.status,
    canAskAgain: result.canAskAgain,
  };
};

export const requestForegroundPermission = async (): Promise<PermissionResponse> => {
  const result = await Location.requestForegroundPermissionsAsync();
  return {
    status: result.status,
    canAskAgain: result.canAskAgain,
  };
};

export const getCurrentLocation = async (): Promise<Coordinates> => {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new LocationError(
      'SERVICES_DISABLED',
      'Location services are disabled. Enable them to continue.'
    );
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return toCoordinates(position.coords);
  } catch (error) {
    if (error instanceof Error) {
      throw new LocationError('POSITION_UNAVAILABLE', error.message);
    }
    throw new LocationError('UNKNOWN', 'Unable to determine your location.');
  }
};
