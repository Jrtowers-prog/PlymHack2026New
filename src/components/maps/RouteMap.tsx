/**
 * RouteMap — Platform entry point for TypeScript module resolution.
 *
 * At build time, Metro resolves to the platform-specific implementation:
 *   • Android → RouteMap.android.tsx  (WebView + Leaflet / OSM tiles)
 *   • iOS     → RouteMap.ios.tsx      (WebView + Leaflet / OSM tiles)
 *   • Web     → RouteMap.web.tsx      (iframe + Leaflet / OSM tiles)
 *
 * This file is NEVER bundled by Metro because the platform suffixes
 * always take priority.  It exists purely so TypeScript (tsc) can
 * resolve `import RouteMap from '…/RouteMap'`.
 */
import { View } from 'react-native';

import type { RouteMapProps } from '@/src/components/maps/RouteMap.types';

const RouteMap = (_props: RouteMapProps) => <View />;

export default RouteMap;
