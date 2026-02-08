import { useCallback, useState } from 'react';

import type { RouteScore } from '@/src/hooks/useAllRoutesSafety';
import { fetchAIExplanation } from '@/src/services/openai';
import type { SafetyMapResult } from '@/src/services/safetyMapData';

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
  allScores: RouteScore[],
  distanceMeters: number,
  durationSeconds: number,
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

    setStatus('loading');
    setError(null);
    setExplanation(null);

    fetchAIExplanation({
      safetyResult,
      allScores,
      distanceMeters,
      durationSeconds,
    })
      .then((text) => {
        setExplanation(text);
        setStatus('ready');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setStatus('error');
      });
  }, [safetyResult, allScores, distanceMeters, durationSeconds]);

  const reset = useCallback(() => {
    setStatus('idle');
    setExplanation(null);
    setError(null);
  }, []);

  return { status, explanation, error, ask, reset };
};
