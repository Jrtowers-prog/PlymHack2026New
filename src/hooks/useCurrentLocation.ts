import { useCallback, useEffect, useState } from 'react';

import {
    getCurrentLocation,
    requestForegroundLocationPermission,
} from '@/src/services/location';
import { AppError } from '@/src/types/errors';
import type { LatLng } from '@/src/types/google';

export type LocationStatus = 'idle' | 'loading' | 'denied' | 'error' | 'ready';

export type UseCurrentLocationState = {
  status: LocationStatus;
  location: LatLng | null;
  error: AppError | null;
  refresh: () => Promise<void>;
};

export const useCurrentLocation = (options?: {
  enabled?: boolean;
}): UseCurrentLocationState => {
  const isEnabled = options?.enabled ?? true;
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [location, setLocation] = useState<LatLng | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const refresh = useCallback(async () => {
    if (!isEnabled) {
      setStatus('idle');
      setError(null);
      return;
    }

    setStatus('loading');
    setError(null);

    const permissionStatus = await requestForegroundLocationPermission();

    if (permissionStatus !== 'granted') {
      setStatus('denied');
      return;
    }

    try {
      const currentLocation = await getCurrentLocation();
      setLocation(currentLocation);
      setStatus('ready');
    } catch (caught) {
      const normalizedError =
        caught instanceof AppError
          ? caught
          : new AppError('location_unknown_error', 'Unknown location error', caught);

      setError(normalizedError);
      setStatus('error');
    }
  }, [isEnabled]);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    refresh().catch(() => {
      setStatus('error');
      setError(new AppError('location_refresh_error', 'Unable to refresh location'));
    });
  }, [refresh, isEnabled]);

  return {
    status,
    location,
    error,
    refresh,
  };
};
