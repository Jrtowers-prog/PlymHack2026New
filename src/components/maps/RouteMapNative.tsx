import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, {
  Circle,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  UrlTile
} from 'react-native-maps';

import type { RouteMapProps } from '@/src/components/maps/RouteMap.types';
import { buildOsmTileUrl } from '@/src/services/osMaps';

const ROUTE_COLOR = '#4285F4';
const ROUTE_COLOR_ALT = '#a3adc7';

const MARKER_COLORS: Record<string, string> = {
  crime: '#ef4444',
  shop:  '#22c55e',
  light: '#facc15',
};

export const RouteMap = ({
  origin,
  destination,
  routes,
  selectedRouteId,
  safetyMarkers = [],
  routeSegments = [],
  roadLabels = [],
  onSelectRoute,
  onLongPress,
  onMapPress,
}: RouteMapProps) => {
  const mapRef = useRef<MapView | null>(null);
  const region = useMemo(() => {
    const fallback = { latitude: 51.5072, longitude: -0.1276 };
    const center = origin ?? fallback;
    return {
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
  }, [origin]);

  const osmTileUrl = buildOsmTileUrl();
  const tileUrl = osmTileUrl;
  const showOsTiles = false;
  const useCustomTiles = Boolean(tileUrl);

  useEffect(() => {
    if (!mapRef.current) return;

    const selectedRoute = routes.find((r) => r.id === selectedRouteId);
    const coordinates = selectedRoute?.path ?? [];

    if (coordinates.length > 0) {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 64, bottom: 64, left: 64, right: 64 },
        animated: true,
      });
      return;
    }

    // Only re-center (city-level) when origin changes — don't zoom in tight
    if (origin && destination) {
      // Both set but no routes yet — fit to both markers at city level
      mapRef.current.fitToCoordinates(
        [origin, destination],
        { edgePadding: { top: 80, bottom: 80, left: 80, right: 80 }, animated: true },
      );
    }
    // origin-only: let initialRegion handle it (city-level zoom)
  }, [origin, destination, routes, selectedRouteId]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={useCustomTiles ? undefined : PROVIDER_GOOGLE}
        mapType={useCustomTiles ? 'none' : 'standard'}
        initialRegion={region}
        onLongPress={(event) => onLongPress?.(event.nativeEvent.coordinate)}
        onPress={(event) => onMapPress?.(event.nativeEvent.coordinate)}
      >
        {tileUrl ? <UrlTile urlTemplate={tileUrl} maximumZ={20} flipY={false} /> : null}

        {/* Origin marker – blue dot */}
        {origin ? (
          <Marker coordinate={origin} title="Your location" anchor={{ x: 0.5, y: 0.5 }} zIndex={50}>
            <View style={styles.blueDotOuter}>
              <View style={styles.blueDotInner}>
                <View style={styles.blueDotCore} />
              </View>
            </View>
          </Marker>
        ) : null}
        {/* Destination marker */}
        {destination ? <Marker coordinate={destination} title="Destination" pinColor="#d92d20" /> : null}

        {/* Route polylines – unselected routes grey */}
        {routes
          .filter((r) => r.id !== selectedRouteId)
          .map((route) => (
            <Polyline
              key={route.id}
              coordinates={route.path}
              strokeColor={ROUTE_COLOR_ALT}
              strokeWidth={3}
              tappable
              onPress={() => onSelectRoute?.(route.id)}
              zIndex={1}
            />
          ))}

        {/* Selected route – safety-coloured segments */}
        {routeSegments.length > 0
          ? routeSegments.map((seg) => (
              <Polyline
                key={seg.id}
                coordinates={seg.path}
                strokeColor={seg.color}
                strokeWidth={6}
                zIndex={10}
              />
            ))
          : routes
              .filter((r) => r.id === selectedRouteId)
              .map((route) => (
                <Polyline
                  key={route.id}
                  coordinates={route.path}
                  strokeColor={ROUTE_COLOR}
                  strokeWidth={5}
                  zIndex={10}
                />
              ))}

        {/* Safety markers – small circles */}
        {safetyMarkers.map((m) => (
          <Circle
            key={m.id}
            center={m.coordinate}
            radius={8}
            fillColor={MARKER_COLORS[m.kind] ?? '#94a3b8'}
            strokeColor="#ffffff"
            strokeWidth={1}
            zIndex={20}
          />
        ))}

        {/* Road-type labels at street transitions */}
        {roadLabels.map((label) => (
          <Marker
            key={label.id}
            coordinate={label.coordinate}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={30}
          >
            <View style={[
              styles.roadLabel,
              { backgroundColor: label.color },
            ]}>
              <Text style={styles.roadLabelText} numberOfLines={1}>
                {label.displayName}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>
      {showOsTiles ? (
        <View style={styles.attribution}>
          <Text style={styles.attributionText}>OS Maps tiles © Ordnance Survey</Text>
        </View>
      ) : (
        <View style={styles.attribution}>
          <Text style={styles.attributionText}>Map tiles © OpenStreetMap contributors</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f4f7' },
  attribution: {
    position: 'absolute', right: 8, bottom: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.9)',
  },
  attributionText: { fontSize: 10, color: '#475467' },
  roadLabel: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: 130,
  },
  roadLabelText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  blueDotOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(66,133,244,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blueDotInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blueDotCore: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ffffff',
  },
});

export default RouteMap;
