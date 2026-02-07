import { useCallback, useEffect, useState } from 'react';

import { fetchOsmRouteSummary, fetchOsmSummariesForRoutes } from '@/src/services/osm';
import { AppError } from '@/src/types/errors';
import type { DirectionsRoute, LatLng } from '@/src/types/google';
import type { OsmRouteResult, OsmRouteSummary } from '@/src/types/osm';

export type OsmStatus = 'idle' | 'loading' | 'error' | 'ready';

export type UseOsmRouteDataState = {
  status: OsmStatus;
  data: OsmRouteSummary | null;
  error: AppError | null;
  refresh: () => Promise<void>;
};

export type UseOsmRoutesDataState = {
  status: OsmStatus;
  data: OsmRouteResult[];
  error: AppError | null;
  refresh: () => Promise<void>;
};

export const useOsmRouteData = (
  path: LatLng[] | null,
  bufferMeters = 50
): UseOsmRouteDataState => {
  const [status, setStatus] = useState<OsmStatus>('idle');
  const [data, setData] = useState<OsmRouteSummary | null>(null);
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
      const summary = await fetchOsmRouteSummary(path, bufferMeters);
      setData(summary);
      setStatus('ready');
    } catch (caught) {
      const normalizedError =
        caught instanceof AppError
          ? caught
          : new AppError('osm_unknown_error', 'Unable to fetch OSM data', caught);

      setError(normalizedError);
      setStatus('error');
    }
  }, [path, bufferMeters]);

  useEffect(() => {
    refresh().catch(() => {
      setStatus('error');
      setError(new AppError('osm_refresh_error', 'Unable to refresh OSM data'));
    });
  }, [refresh]);

  return {
    status,
    data,
    error,
    refresh,
  };
};

export const useOsmRoutesData = (
  routes: DirectionsRoute[],
  bufferMeters = 50,
  concurrency = 2
): UseOsmRoutesDataState => {
  const [status, setStatus] = useState<OsmStatus>('idle');
  const [data, setData] = useState<OsmRouteResult[]>([]);
  const [error, setError] = useState<AppError | null>(null);

  const refresh = useCallback(async () => {
    if (routes.length === 0) {
      setStatus('idle');
      setData([]);
      setError(null);
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const summaries = await fetchOsmSummariesForRoutes(
        routes,
        bufferMeters,
        concurrency
      );
      setData(summaries);
      setStatus('ready');
    } catch (caught) {
      const normalizedError =
        caught instanceof AppError
          ? caught
          : new AppError('osm_unknown_error', 'Unable to fetch OSM data', caught);

      setError(normalizedError);
      setStatus('error');
    }
  }, [routes, bufferMeters, concurrency]);

  useEffect(() => {
    refresh().catch(() => {
      setStatus('error');
      setError(new AppError('osm_refresh_error', 'Unable to refresh OSM data'));
    });
  }, [refresh]);

  return {
    status,
    data,
    error,
    refresh,
  };
};
