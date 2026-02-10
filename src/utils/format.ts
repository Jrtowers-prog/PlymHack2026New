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

/** Format seconds to a human-readable duration string. */
export const formatDuration = (seconds: number): string => {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
  return `${Math.max(1, Math.round(seconds / 60))} min`;
};

/** Strip HTML tags from instruction strings. */

  html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

