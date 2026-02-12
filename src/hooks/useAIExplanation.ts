import { useCallback, useRef, useState } from 'react';

import type { RouteScore } from '@/src/hooks/useAllRoutesSafety';
import { fetchAIExplanation, type RouteInfo, type SegmentSummary } from '@/src/services/openai';
import type { SafeRoute } from '@/src/services/safeRoutes';
import type { SafetyMapResult } from '@/src/services/safetyMapData';
import type { DirectionsRoute } from '@/src/types/google';

export type AIStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseAIExplanationState {
  status: AIStatus;
  explanation: string | null;
  error: string | null;
  /** Call this to trigger the OpenAI request */
  ask: () => void;
  /** Reset back to idle */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Module-level cache: keyed by a fingerprint of the search (route IDs + best)
// so only ONE AI call is made per search. Persists across re-renders.
// ---------------------------------------------------------------------------
const explanationCache = new Map<string, string>();

/** Build a stable cache key from the set of route IDs + the chosen best */
const buildCacheKey = (routes: DirectionsRoute[], bestRouteId: string): string =>
  `${routes.map((r) => r.id).sort().join('|')}__best=${bestRouteId}`;

export const useAIExplanation = (
  safetyResult: SafetyMapResult | null,
  routes: DirectionsRoute[],
  scores: Record<string, RouteScore>,
  bestRouteId: string | null,
  /** Pass the full SafeRoute[] so we can extract every safety parameter */
  safeRoutes?: SafeRoute[],
): UseAIExplanationState => {
  const [status, setStatus] = useState<AIStatus>('idle');
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Track which cache key the current explanation belongs to */
  const activeCacheKeyRef = useRef<string | null>(null);

  const ask = useCallback(() => {
    if (!safetyResult) {
      setError('Safety analysis not ready yet.');
      setStatus('error');
      return;
    }
    if (!bestRouteId) {
      setError('No safest route selected yet.');
      setStatus('error');
      return;
    }

    // ── Check cache first — one generation per search ──
    const cacheKey = buildCacheKey(routes, bestRouteId);
    const cached = explanationCache.get(cacheKey);
    if (cached) {
      setExplanation(cached);
      setStatus('ready');
      setError(null);
      activeCacheKeyRef.current = cacheKey;
      return;
    }

    setStatus('loading');
    setError(null);
    setExplanation(null);

    // ── Build enriched per-route info with ALL safety parameters ──
    const routeInfos: RouteInfo[] = routes.map((r) => {
      const safeRoute = safeRoutes?.find((sr) => sr.id === r.id);
      const segments: SegmentSummary[] = (safeRoute?.enrichedSegments ?? []).map((seg) => ({
        highway: seg.highway,
        roadName: seg.roadName,
        distance: seg.distance,
        safetyScore: seg.safetyScore,
        lightScore: seg.lightScore,
        crimeScore: seg.crimeScore,
        cctvScore: seg.cctvScore,
        placeScore: seg.placeScore,
        trafficScore: seg.trafficScore,
        isDeadEnd: seg.isDeadEnd,
        hasSidewalk: seg.hasSidewalk,
        surfaceType: seg.surfaceType,
      }));

      const pois = safeRoute?.routePOIs;

      return {
        routeId: r.id,
        distanceMeters: r.distanceMeters,
        durationSeconds: r.durationSeconds,
        summary: r.summary,
        score: scores[r.id],
        safetyBreakdown: safeRoute?.safety?.breakdown,
        roadTypes: safeRoute?.safety?.roadTypes,
        mainRoadRatio: safeRoute?.safety?.mainRoadRatio,
        routeStats: safeRoute?.routeStats,
        poiCounts: pois
          ? {
              cctv: pois.cctv?.length ?? 0,
              transit: pois.transit?.length ?? 0,
              deadEnds: pois.deadEnds?.length ?? 0,
              lights: pois.lights?.length ?? 0,
              places: pois.places?.length ?? 0,
              crimes: pois.crimes?.length ?? 0,
            }
          : undefined,
        segments,
      };
    });

    fetchAIExplanation({
      safetyResult,
      routes: routeInfos,
      bestRouteId,
    })
      .then((text) => {
        // Store in cache so repeat asks return instantly
        explanationCache.set(cacheKey, text);
        activeCacheKeyRef.current = cacheKey;
        setExplanation(text);
        setStatus('ready');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setStatus('error');
      });
  }, [safetyResult, routes, scores, bestRouteId, safeRoutes]);

  const reset = useCallback(() => {
    setStatus('idle');
    setExplanation(null);
    setError(null);
    activeCacheKeyRef.current = null;
  }, []);

  return { status, explanation, error, ask, reset };
};
