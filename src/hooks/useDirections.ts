import { useCallback, useEffect, useState } from 'react';

import { fetchDirections } from '@/src/services/googleMaps';
import { AppError } from '@/src/types/errors';
import type { DirectionsRoute, LatLng } from '@/src/types/google';

export type DirectionsStatus = 'idle' | 'loading' | 'error' | 'ready';

export type UseDirectionsState = {
  status: DirectionsStatus;
  routes: DirectionsRoute[];
  error: AppError | null;
  refresh: () => Promise<void>;
};

export const useDirections = (
  origin: LatLng | null,
  destination: LatLng | null
): UseDirectionsState => {
  const [status, setStatus] = useState<DirectionsStatus>('idle');
  const [routes, setRoutes] = useState<DirectionsRoute[]>([]);
  const [error, setError] = useState<AppError | null>(null);

  const refresh = useCallback(async () => {
    if (!origin || !destination) {
      setRoutes([]);
      setStatus('idle');
      setError(null);
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const data = await fetchDirections(origin, destination);
      setRoutes(data);
      setStatus('ready');
    } catch (caught) {
      const normalizedError =
        caught instanceof AppError
          ? caught
          : new AppError('directions_error', 'Unable to fetch routes', caught);

      setError(normalizedError);
      setStatus('error');
    }
  }, [origin, destination]);

  useEffect(() => {
    refresh().catch(() => {
      setStatus('error');
      setError(new AppError('directions_refresh_error', 'Unable to refresh routes'));
    });
  }, [refresh]);

  return {
    status,
    routes,
    error,
    refresh,
  };
};
