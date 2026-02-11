import { Platform } from 'react-native';

// Backend proxy base URL — all Places / Directions / Static Map calls go here
// In production, set EXPO_PUBLIC_API_BASE_URL to your deployed backend (e.g. https://safenighthome-api.onrender.com)
// In local dev on Android, localhost refers to the device itself, so we swap to 10.0.2.2 (emulator) or your LAN IP.
const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const isLocalhost = rawApiBaseUrl.includes('localhost') || rawApiBaseUrl.includes('127.0.0.1');
const apiBaseUrl =
  Platform.OS === 'android' && isLocalhost
    ? rawApiBaseUrl.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2')
    : rawApiBaseUrl;
// TODO: Set EXPO_PUBLIC_OS_MAPS_API_KEY in .env / EAS env vars.
const osMapsApiKey = process.env.EXPO_PUBLIC_OS_MAPS_API_KEY ?? '';
const osMapsLayer = process.env.EXPO_PUBLIC_OS_MAPS_LAYER ?? 'Road_3857';
const osMapsBaseUrl =
  process.env.EXPO_PUBLIC_OS_MAPS_BASE_URL ?? 'https://api.os.uk/maps/raster/v1/zxy';
const osmBaseUrl = process.env.EXPO_PUBLIC_OSM_BASE_URL ?? 'https://nominatim.openstreetmap.org';
const osmTileUrl =
  process.env.EXPO_PUBLIC_OSM_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// TODO: Set EXPO_PUBLIC_OSM_USER_AGENT in .env / EAS env vars.
const osmUserAgent = process.env.EXPO_PUBLIC_OSM_USER_AGENT ?? '';
const osmEmail = process.env.EXPO_PUBLIC_OSM_EMAIL ?? '';
const osrmBaseUrl = process.env.EXPO_PUBLIC_OSRM_BASE_URL ?? 'https://router.project-osrm.org';
const overpassBaseUrl =
  process.env.EXPO_PUBLIC_OVERPASS_API_URL ?? 'https://overpass-api.de/api/interpreter';
const policeApiBaseUrl =
  process.env.EXPO_PUBLIC_POLICE_API_URL ?? 'https://data.police.uk/api';
const openaiApiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';

export const env = {
  apiBaseUrl,
  osMapsApiKey,
  osMapsLayer,
  osMapsBaseUrl,
  osmBaseUrl,
  osmTileUrl,
  osmUserAgent,
  osmEmail,
  osrmBaseUrl,
  overpassBaseUrl,
  policeApiBaseUrl,
  openaiApiKey,
};

export const requireOsMapsApiKey = (): string => {
  if (!env.osMapsApiKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_OS_MAPS_API_KEY. TODO: Set it in .env or EAS env vars.'
    );
  }

  return env.osMapsApiKey;
};

export const requireOsmUserAgent = (): string => {
  if (!env.osmUserAgent) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Missing EXPO_PUBLIC_OSM_USER_AGENT. TODO: Set it in .env or EAS env vars.'
      );
    }

    return 'Safe Night Home (dev)';
  }

  return env.osmUserAgent;
};
