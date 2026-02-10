import { useEffect, useRef, useState } from 'react';

import { fetchSafetyMapData, type SafetyMapResult } from '@/src/services/safetyMapData';
import type { DirectionsRoute } from '@/src/types/google';

export interface RouteScore {
  routeId: string;
  /** 1-100 full safety score (crime + lighting + road type + activity) — shown to user */
  score: number;
  /** 1-100 pathfinding score (road type + lighting ONLY) — used to pick best route */
  pathfindingScore: number;
  label: string;
  color: string;
  mainRoadRatio: number;
  /** 0-1 — how much real data the score is based on. Below ~0.3 is unreliable. */
  dataConfidence: number;
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
const scoreCache = new Map<string, { score: number; pathfindingScore: number; label: string; color: string; mainRoadRatio: number; dataConfidence: number }>();

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
          pathfindingScore: cached.pathfindingScore,
          label: cached.label,
          color: cached.color,
          mainRoadRatio: cached.mainRoadRatio,
          dataConfidence: cached.dataConfidence,
          status: 'done',
        };
      } else {
        initial[r.id] = {
          routeId: r.id,
          score: 0,
          pathfindingScore: 0,
          label: '',
          color: '#94a3b8',
          mainRoadRatio: 0,
          dataConfidence: 0,
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

    // Analyse uncached routes IN PARALLEL — all APIs are free,
    // and the Overpass queue + caching handle dedup automatically.
    const analyseInParallel = async () => {
      await Promise.all(
        uncached.map(async (route) => {
          if (cancelRef.current !== batchId) return;

          try {
            const data: SafetyMapResult = await withTimeout(
