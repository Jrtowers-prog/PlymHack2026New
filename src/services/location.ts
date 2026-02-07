import * as Location from 'expo-location';

import { AppError } from '@/src/types/errors';
import type { LatLng } from '@/src/types/google';

export type LocationPermissionStatus = Location.PermissionStatus;

export const requestForegroundLocationPermission = async (): Promise<LocationPermissionStatus> => {
  const { status } = await Location.requestForegroundPermissionsAsync();

  return status;
};

export const getCurrentLocation = async (): Promise<LatLng> => {
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch (error) {
    throw new AppError('location_unavailable', 'Unable to fetch current location', error);
  }
};
