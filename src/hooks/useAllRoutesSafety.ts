import { useEffect, useRef, useState } from 'react';

import { fetchSafetyMapData, type SafetyMapResult } from '@/src/services/safetyMapData';
import type { DirectionsRoute } from '@/src/types/google';

export interface RouteScore {
  routeId: string;
  score: number;
  label: string;
  color: string;
  mainRoadRatio: number;
  status: 'pending' | 'done' | 'error';
}

export interface UseAllRoutesSafetyState {
  /** Score info keyed by route id */
  scores: Record<string, RouteScore>;
  /** The route id with the highest safety score (null while still computing) */
  bestRouteId: string | null;
  /** True while any route is still being analysed */
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Module-level cache so scores survive re-renders & re-mounts.
// Key = first 6 coords of the path (fingerprint), value = score result.
// ---------------------------------------------------------------------------
const scoreCache = new Map<string, { score: number; label: string; color: string; mainRoadRatio: number }>();

/** Cheap fingerprint: first + last coord + distance – unique enough per route */
const routeFingerprint = (route: DirectionsRoute): string => {
  const p = route.path;
  if (p.length === 0) return route.id;
  const first = p[0];
  const last = p[p.length - 1];
  return `${first.latitude.toFixed(5)},${first.longitude.toFixed(5)}|${last.latitude.toFixed(5)},${last.longitude.toFixed(5)}|${route.distanceMeters}`;
};

/**
 * Run safety analysis on every route in the background.
 * Results are cached so the score stays stable across re-renders.
 */
export const useAllRoutesSafety = (routes: DirectionsRoute[]): UseAllRoutesSafetyState => {
  const [scores, setScores] = useState<Record<string, RouteScore>>({});
  const [bestRouteId, setBestRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cancelRef = useRef(0);

  useEffect(() => {
    // Reset when route list changes
    setScores({});
    setBestRouteId(null);

    if (routes.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const batchId = ++cancelRef.current;

    // Initialise — use cached results where available
    const initial: Record<string, RouteScore> = {};
    const uncached: DirectionsRoute[] = [];

    for (const r of routes) {
      const fp = routeFingerprint(r);
      const cached = scoreCache.get(fp);
      if (cached) {
        initial[r.id] = {
          routeId: r.id,
          score: cached.score,
          label: cached.label,
          color: cached.color,
          mainRoadRatio: cached.mainRoadRatio,
          status: 'done',
        };
      } else {
        initial[r.id] = {
          routeId: r.id,
          score: 0,
          label: '',
          color: '#94a3b8',
          mainRoadRatio: 0,
          status: 'pending',
        };
        uncached.push(r);
      }
    }
    setScores({ ...initial });

    if (uncached.length === 0) {
      // Everything was cached — done immediately
      setLoading(false);
      return;
    }

    // Fire analyses only for uncached routes
    const promises = uncached.map(async (route) => {
      try {
        const data: SafetyMapResult = await withTimeout(
          fetchSafetyMapData(route.path, undefined, route.distanceMeters),
          25_000,
        );
        if (cancelRef.current !== batchId) return; // stale

        const result = {
          score: data.safetyScore,
          label: data.safetyLabel,
          color: data.safetyColor,
          mainRoadRatio: data.mainRoadRatio,
        };

        // Persist in cache
        scoreCache.set(routeFingerprint(route), result);

        setScores((prev: Record<string, RouteScore>) => ({
          ...prev,
          [route.id]: {
            routeId: route.id,
            ...result,
            status: 'done',
          },
        }));
      } catch {
        if (cancelRef.current !== batchId) return;
        setScores((prev: Record<string, RouteScore>) => ({
          ...prev,
          [route.id]: { ...prev[route.id], status: 'error' },
        }));
      }
    });

    Promise.allSettled(promises).then(() => {
      if (cancelRef.current !== batchId) return;
      setLoading(false);
    });

    return () => {
      cancelRef.current++; // cancel on unmount / route change
    };
  }, [routes.map((r) => r.id).join(',')]); // re-run when the set of routes changes

  // Derive best route whenever scores update
  useEffect(() => {
    const all = Object.values(scores) as RouteScore[];
    const done = all.filter((s) => s.status === 'done');
    if (done.length === 0) {
      setBestRouteId(null);
      return;
    }
    const best = done.reduce((a, b) => (b.score > a.score ? b : a));
    setBestRouteId(best.routeId);
  }, [scores]);

  return { scores, bestRouteId, loading };
};

// -- helpers ---------------------------------------------------------------

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let id: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    id = setTimeout(() => reject(new Error('timeout')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (id) clearTimeout(id);
  }
};
