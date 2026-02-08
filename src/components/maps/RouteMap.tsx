import { Platform } from 'react-native';

/**
 * On web, use the Google Maps JS API renderer directly in the DOM.
 * On native (iOS / Android), use a WebView-based Google Maps renderer
 * that works in Expo Go — no dev build required.
 */
let RouteMap: React.ComponentType<any>;

if (Platform.OS === 'web') {
  RouteMap = require('@/src/components/maps/RouteMap.web').default;
} else {
  RouteMap = require('@/src/components/maps/RouteMap.native').default;
}

export default RouteMap;
