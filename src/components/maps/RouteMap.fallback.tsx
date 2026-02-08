import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { RouteMapProps } from '@/src/components/maps/RouteMap.types';

/**
 * Lightweight fallback map shown when react-native-maps isn't available
 * (e.g. running in Expo Go without a dev build).
 */
export const RouteMap = ({
  origin,
  destination,
  routes,
  selectedRouteId,
  onLongPress,
}: RouteMapProps) => {
  const selectedRoute = routes.find((r) => r.id === selectedRouteId);

  const openInGoogleMaps = () => {
    if (!origin || !destination) return;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&travelmode=walking`;
    Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>🗺️</Text>
        <Text style={styles.title}>Map requires a Development Build</Text>
        <Text style={styles.subtitle}>
          react-native-maps is not available in Expo Go.{'\n'}
          Run <Text style={styles.code}>npx expo run:ios</Text> or{' '}
          <Text style={styles.code}>npx expo run:android</Text> for the full map.
        </Text>

        {origin && (
          <View style={styles.infoRow}>
            <View style={[styles.dot, { backgroundColor: '#4285F4' }]} />
            <Text style={styles.infoText}>
              Origin: {origin.latitude.toFixed(4)}, {origin.longitude.toFixed(4)}
            </Text>
          </View>
        )}
        {destination && (
          <View style={styles.infoRow}>
            <View style={[styles.dot, { backgroundColor: '#d92d20' }]} />
            <Text style={styles.infoText}>
              Dest: {destination.latitude.toFixed(4)}, {destination.longitude.toFixed(4)}
            </Text>
          </View>
        )}

        {routes.length > 0 && (
          <Text style={styles.routeCount}>
            {routes.length} route{routes.length > 1 ? 's' : ''} found
            {selectedRoute
              ? ` · Selected: ${(selectedRoute.distanceMeters / 1000).toFixed(1)} km`
              : ''}
          </Text>
        )}

        {origin && destination && (
          <Pressable style={styles.button} onPress={openInGoogleMaps}>
            <Text style={styles.buttonText}>Open in Google Maps</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#101828',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#667085',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  code: {
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#1570ef',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#475467',
  },
  routeCount: {
    fontSize: 13,
    color: '#475467',
    marginTop: 8,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#1570ef',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
});

export default RouteMap;
