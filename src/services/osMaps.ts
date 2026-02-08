import { env } from '@/src/config/env';

// This file handles OpenStreetMap tile URLs for map display
// Road type and lighting data comes from OpenStreetMap Overpass API (see safety.ts)

export const buildOsmTileUrl = (options?: { baseUrl?: string }): string => {
  const baseUrl = options?.baseUrl ?? env.osmTileUrl;

  // TODO: Use a self-hosted tile server for production scale.
  return baseUrl;
};

export const getOsmAttribution = (): string =>
  '© OpenStreetMap contributors';
