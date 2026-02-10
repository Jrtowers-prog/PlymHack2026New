/**
 * format.ts — Shared formatting helpers used across the app.
 */

/** Format metres to a human-readable distance string. */
export const formatDistance = (meters: number): string => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${meters.toFixed(0)} m`;
};
