import { Platform } from 'react-native';

/**
 * On web, use the Google Maps JS API renderer.
 * On native, use the fallback (react-native-maps needs a dev build, not Expo Go).
 * To use the full native map, swap RouteMapFallback → RouteMapNative below
 * and run `npx expo run:ios` / `npx expo run:android`.
 */
let RouteMap: React.ComponentType<any>;

if (Platform.OS === 'web') {
  RouteMap = require('@/src/components/maps/RouteMap.web').default;
} else {
  // Use the lightweight fallback that works in Expo Go
  RouteMap = require('@/src/components/maps/RouteMap.fallback').default;
}

export default RouteMap;
