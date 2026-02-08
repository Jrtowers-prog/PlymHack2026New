import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, {
  Circle,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type Region,
  UrlTile,
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
  roadOverlays = [],
  onSelectRoute,
  onLongPress,
}: RouteMapProps) => {
  const mapRef = useRef<MapView | null>(null);
  const region = useMemo(() => {
    const fallback = { latitude: 51.5072, longitude: -0.1276 };
    const center = origin ?? fallback;
    return {
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
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

    if (origin) {
      const nextRegion: Region = {
        ...region,
        latitude: origin.latitude,
        longitude: origin.longitude,
      };
      mapRef.current.animateToRegion(nextRegion, 500);
    }
  }, [origin, region, routes, selectedRouteId]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={useCustomTiles ? undefined : PROVIDER_GOOGLE}
        mapType={useCustomTiles ? 'none' : 'standard'}
        initialRegion={region}
        onLongPress={(event) => onLongPress?.(event.nativeEvent.coordinate)}
      >
        {tileUrl ? <UrlTile urlTemplate={tileUrl} maximumZ={20} flipY={false} /> : null}

        {/* Origin / Destination markers */}
        {origin ? <Marker coordinate={origin} title="Your location" pinColor={ROUTE_COLOR} /> : null}
        {destination ? <Marker coordinate={destination} title="Destination" pinColor="#d92d20" /> : null}

        {/* Road overlays – coloured by road type / lighting */}
        {roadOverlays.map((overlay) =>
          overlay.coordinates.length >= 2 ? (
            <Polyline
              key={overlay.id}
              coordinates={overlay.coordinates}
              strokeColor={overlay.color}
              strokeWidth={4}
              lineDashPhase={0}
            />
          ) : null,
        )}

        {/* Route polylines – blue */}
        {routes.map((route) => {
          const isSelected = route.id === selectedRouteId;
          return (
            <Polyline
              key={route.id}
              coordinates={route.path}
              strokeColor={isSelected ? ROUTE_COLOR : ROUTE_COLOR_ALT}
              strokeWidth={isSelected ? 5 : 3}
              tappable
              onPress={() => onSelectRoute?.(route.id)}
              zIndex={isSelected ? 10 : 1}
            />
          );
        })}

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
});

export default RouteMap;
