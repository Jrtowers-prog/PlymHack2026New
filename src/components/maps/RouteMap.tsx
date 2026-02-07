import { Platform } from 'react-native';

import RouteMapNative from '@/src/components/maps/RouteMap.native';
import RouteMapWeb from '@/src/components/maps/RouteMap.web';

const RouteMap = Platform.OS === 'web' ? RouteMapWeb : RouteMapNative;

export default RouteMap;
