import { useCallback, useEffect, useState } from 'react';

import { fetchOpenPlacesForRoute } from '@/src/services/googleMaps';
import { AppError } from '@/src/types/errors';
import type { LatLng, OpenPlacesSummary } from '@/src/types/google';

export type OpenPlacesStatus = 'idle' | 'loading' | 'error' | 'ready';

export type UseOpenPlacesState = {
  status: OpenPlacesStatus;
  data: OpenPlacesSummary | null;
  error: AppError | null;
  refresh: () => Promise<void>;
};

export const useOpenPlacesForRoute = (
  path: LatLng[] | null,
  options?: { intervalMeters?: number; radiusMeters?: number; maxSamples?: number }
): UseOpenPlacesState => {
  const [status, setStatus] = useState<OpenPlacesStatus>('idle');
  const [data, setData] = useState<OpenPlacesSummary | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const refresh = useCallback(async () => {
    if (!path || path.length < 2) {
      setStatus('idle');
      setData(null);
      setError(null);
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const summary = await fetchOpenPlacesForRoute(path, options);
      setData(summary);
      setStatus('ready');
    } catch (caught) {
      const normalizedError =
        caught instanceof AppError
          ? caught
          : new AppError('open_places_error', 'Unable to fetch open places', caught);

      setError(normalizedError);
      setStatus('error');
    }
  }, [path, options]);

  useEffect(() => {
    refresh().catch(() => {
      setStatus('error');
      setError(new AppError('open_places_refresh_error', 'Unable to refresh open places'));
    });
  }, [refresh]);

  return {
    status,
    data,
    error,
    refresh,
  };
};
