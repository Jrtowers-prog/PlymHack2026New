/**
 * useSafeRoutes.ts — Hook for safety-first pathfinding.
 *
 * Replaces the old useDirections + useAllRoutesSafety combo with a single
 * hook that calls the backend /api/safe-routes endpoint.
 *
 * The backend builds an OSM walking graph, scores every edge with lighting,
 * road hierarchy, crime, open places, and foot-traffic factors, then runs
 * modified Dijkstra to return 3–5 safety-ranked routes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
    fetchSafeRoutes,
    type SafeRoute,
    type SafeRoutesResponse,
} from '@/src/services/safeRoutes';
import { AppError } from '@/src/types/errors';
import type { LatLng } from '@/src/types/google';

// ── Public types ────────────────────────────────────────────────────────────

export type SafeRoutesStatus = 'idle' | 'loading' | 'error' | 'ready';

export interface UseSafeRoutesState {
  status: SafeRoutesStatus;
  /** All returned routes, sorted safest-first */
  routes: SafeRoute[];
  /** The single safest route (first in array) */
  safestRoute: SafeRoute | null;
  /** Index of the currently selected route */
  selectedIndex: number;
  /** Select a route by index */
  selectRoute: (index: number) => void;
  /** Error, if any */
  error: AppError | null;
  /** True if destination is out of 20 km range */
  outOfRange: boolean;
  /** Human-readable message for out-of-range errors */
  outOfRangeMessage: string;
  /** Metadata about the computation (timing, data quality, etc.) */
  meta: SafeRoutesResponse['meta'] | null;
  /** Re-fetch routes */
  refresh: () => Promise<void>;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useSafeRoutes(
  origin: LatLng | null,
  destination: LatLng | null,
): UseSafeRoutesState {
  const [status, setStatus] = useState<SafeRoutesStatus>('idle');
  const [routes, setRoutes] = useState<SafeRoute[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<AppError | null>(null);
  const [outOfRange, setOutOfRange] = useState(false);
  const [outOfRangeMessage, setOutOfRangeMessage] = useState('');
  const [meta, setMeta] = useState<SafeRoutesResponse['meta'] | null>(null);
  const cancelRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!origin || !destination) {
      setRoutes([]);
      setStatus('idle');
      setError(null);
      setOutOfRange(false);
      setOutOfRangeMessage('');
      setMeta(null);
      return;
    }

    const batchId = ++cancelRef.current;
    setStatus('loading');
