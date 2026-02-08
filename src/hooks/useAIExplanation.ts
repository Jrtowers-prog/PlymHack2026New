import { useCallback, useState } from 'react';

import type { RouteScore } from '@/src/hooks/useAllRoutesSafety';
import { fetchAIExplanation, type RouteInfo } from '@/src/services/openai';
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

export const useAIExplanation = (
  safetyResult: SafetyMapResult | null,
  routes: DirectionsRoute[],
  scores: Record<string, RouteScore>,
  bestRouteId: string | null,
): UseAIExplanationState => {
  const [status, setStatus] = useState<AIStatus>('idle');
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

    setStatus('loading');
    setError(null);
    setExplanation(null);

    const routeInfos: RouteInfo[] = routes.map((r) => ({
      routeId: r.id,
      distanceMeters: r.distanceMeters,
      durationSeconds: r.durationSeconds,
      summary: r.summary,
      score: scores[r.id],
    }));

    fetchAIExplanation({
      safetyResult,
      routes: routeInfos,
      bestRouteId,
    })
      .then((text) => {
        setExplanation(text);
        setStatus('ready');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setStatus('error');
      });
  }, [safetyResult, routes, scores, bestRouteId]);

  const reset = useCallback(() => {
    setStatus('idle');
    setExplanation(null);
    setError(null);
  }, []);

  return { status, explanation, error, ask, reset };
};
