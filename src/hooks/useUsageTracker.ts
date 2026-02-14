/**
 * useUsageTracker.ts — Fire-and-forget usage tracking helper.
 *
 * Wraps usageApi.track with a simple hook interface.
 * Silently fails — never blocks or crashes the UI.
 */

import { useCallback } from 'react';
import { usageApi } from '../services/userApi';

export function useUsageTracker() {
  const trackRouteSearch = useCallback(
    (distanceKm: number, safetyScore: string) => {
      usageApi.track('route_search', distanceKm, safetyScore);
    },
    [],
  );

  const trackNavigationStart = useCallback(
    (distanceKm: number, safetyScore: string) => {
      usageApi.track('navigation_start', distanceKm, safetyScore);
    },
    [],
  );

  const trackNavigationComplete = useCallback(
    (distanceKm: number, durationSeconds: number) => {
      usageApi.track('navigation_complete', distanceKm, String(durationSeconds));
    },
    [],
  );

  const trackNavigationAbandon = useCallback(
    (distanceCompletedKm: number, reason?: string) => {
      usageApi.track('navigation_abandon', distanceCompletedKm, reason ?? 'unknown');
    },
    [],
  );

  return {
    trackRouteSearch,
    trackNavigationStart,
    trackNavigationComplete,
    trackNavigationAbandon,
  };
}
