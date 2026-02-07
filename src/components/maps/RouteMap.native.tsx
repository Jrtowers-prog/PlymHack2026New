import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import type { RouteMapProps } from '@/src/components/maps/RouteMap.types';

const PRIMARY_COLOR = '#1570ef';
const SECONDARY_COLOR = '#98a2b3';

const getRouteColor = (isSelected: boolean): string =>
  isSelected ? PRIMARY_COLOR : SECONDARY_COLOR;

export const RouteMap = ({
  origin,
  destination,
  routes,
  selectedRouteId,
  onSelectRoute,
}: RouteMapProps) => {
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

  return (
    <View style={styles.container}>
      <MapView style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE} initialRegion={region}>
        {origin ? (
          <Marker coordinate={origin} title="Your location" pinColor={PRIMARY_COLOR} />
        ) : null}
        {destination ? (
          <Marker coordinate={destination} title="Destination" pinColor="#d92d20" />
        ) : null}
        {routes.map((route) => {
          const isSelected = route.id === selectedRouteId;

          return (
            <Polyline
              key={route.id}
              coordinates={route.path}
              strokeColor={getRouteColor(isSelected)}
              strokeWidth={isSelected ? 6 : 4}
              tappable
              onPress={() => onSelectRoute?.(route.id)}
            />
          );
        })}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f4f7',
  },
});

export default RouteMap;
