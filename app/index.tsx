import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import RouteMap from '@/src/components/maps/RouteMap';
import { useCurrentLocation } from '@/src/hooks/useCurrentLocation';
import { useDirections } from '@/src/hooks/useDirections';
import { usePlaceAutocomplete } from '@/src/hooks/usePlaceAutocomplete';
import { fetchPlaceDetails } from '@/src/services/googleMaps';
import { AppError } from '@/src/types/errors';
import type { DirectionsRoute, PlaceDetails, PlacePrediction } from '@/src/types/google';

export default function HomeScreen() {
  const { status, location, error, refresh } = useCurrentLocation();
  const [query, setQuery] = useState('');
  const [destination, setDestination] = useState<PlaceDetails | null>(null);
  const [destinationStatus, setDestinationStatus] = useState<
    'idle' | 'loading' | 'error' | 'ready'
  >('idle');
  const [destinationError, setDestinationError] = useState<AppError | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const { status: autocompleteStatus, predictions, error: autocompleteError } =
    usePlaceAutocomplete(query, location);
  const {
    status: directionsStatus,
    routes,
    error: directionsError,
  } = useDirections(location, destination?.location ?? null);

  useEffect(() => {
    if (routes.length > 0) {
      setSelectedRouteId(routes[0].id);
    }
  }, [routes]);

  const selectedRoute = useMemo<DirectionsRoute | null>(() => {
    return routes.find((route) => route.id === selectedRouteId) ?? null;
  }, [routes, selectedRouteId]);

  const handlePredictionPress = async (prediction: PlacePrediction) => {
    setDestinationStatus('loading');
    setDestinationError(null);
    try {
      const details = await fetchPlaceDetails(prediction.placeId);
      setDestination(details);
      setQuery(details.name);
      setDestinationStatus('ready');
      setIsSearchOpen(false);
    } catch (caught) {
      const normalizedError =
        caught instanceof AppError
          ? caught
          : new AppError('place_details_error', 'Unable to fetch place details', caught);

      setDestinationError(normalizedError);
      setDestinationStatus('error');
    }
  };

  const distanceLabel = selectedRoute ? formatDistance(selectedRoute.distanceMeters) : '--';
  const durationLabel = selectedRoute ? formatDuration(selectedRoute.durationSeconds) : '--';
  const showRoutes =
    directionsStatus === 'loading' || directionsError !== null || routes.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        <RouteMap
          origin={location}
          destination={destination?.location ?? null}
          routes={routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={setSelectedRouteId}
        />
      </View>
      <View style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Pressable
            style={styles.destinationButton}
            onPress={() => setIsSearchOpen((prev) => !prev)}
            accessibilityRole="button"
          >
            <Text style={styles.destinationButtonText}>Destination</Text>
          </Pressable>
          <Pressable style={styles.refreshButton} onPress={refresh} accessibilityRole="button">
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </Pressable>
        </View>
        {isSearchOpen ? (
          <View style={styles.searchCard}>
            <Text style={styles.statusText}>Location: {status}</Text>
            {error ? <Text style={styles.error}>{error.message}</Text> : null}
            <TextInput
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                setDestination(null);
                setSelectedRouteId(null);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Enter destination"
              accessibilityLabel="Destination"
              autoCorrect={false}
              style={styles.input}
            />
            {autocompleteStatus === 'loading' ? (
              <View style={styles.inlineRow}>
                <ActivityIndicator size="small" color="#1570ef" />
                <Text style={styles.helperText}>Searching places...</Text>
              </View>
            ) : null}
            {autocompleteError ? (
              <Text style={styles.error}>{autocompleteError.message}</Text>
            ) : null}
            {predictions.length > 0 ? (
              <ScrollView
                style={styles.predictions}
                keyboardShouldPersistTaps="handled"
              >
                {predictions.slice(0, 5).map((prediction) => (
                  <Pressable
                    key={prediction.placeId}
                    onPress={() => handlePredictionPress(prediction)}
                    accessibilityRole="button"
                    style={styles.predictionRow}
                  >
                    <Text style={styles.predictionText}>{prediction.primaryText}</Text>
                    {prediction.secondaryText ? (
                      <Text style={styles.predictionSubtext}>
                        {prediction.secondaryText}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {destinationStatus === 'loading' ? (
              <View style={styles.inlineRow}>
                <ActivityIndicator size="small" color="#1570ef" />
                <Text style={styles.helperText}>Loading destination...</Text>
              </View>
            ) : null}
            {destinationError ? <Text style={styles.error}>{destinationError.message}</Text> : null}
            {destination ? (
              <Text style={styles.helperText}>Selected: {destination.name}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {showRoutes ? (
        <View style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.routesCard}>
            <View style={styles.routesHeader}>
              <Text style={styles.sectionTitle}>Routes</Text>
              <Text style={styles.routeMeta}>
                {distanceLabel} · {durationLabel}
              </Text>
            </View>
            {directionsStatus === 'loading' ? (
              <View style={styles.inlineRow}>
                <ActivityIndicator size="small" color="#1570ef" />
                <Text style={styles.helperText}>Fetching routes...</Text>
              </View>
            ) : null}
            {directionsError ? (
              <Text style={styles.error}>{directionsError.message}</Text>
            ) : null}
            {routes.length === 0 && directionsStatus === 'ready' ? (
              <Text style={styles.helperText}>No routes available.</Text>
            ) : null}
            {routes.map((route, index) => {
              const isSelected = route.id === selectedRouteId;
              const label = index === 0 ? 'Primary' : `Alt ${index}`;

              return (
                <Pressable
                  key={route.id}
                  onPress={() => setSelectedRouteId(route.id)}
                  accessibilityRole="button"
                  style={[styles.routeRow, isSelected ? styles.routeRowSelected : null]}
                >
                  <Text style={styles.routeTitle}>{label}</Text>
                  <Text style={styles.routeMeta}>
                    {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const formatDistance = (meters: number): string => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }

  return `${meters.toFixed(0)} m`;
};

const formatDuration = (seconds: number): string => {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  return `${Math.max(1, Math.round(seconds / 60))} min`;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  mapContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  topOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  destinationButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#1570ef',
    shadowColor: '#101828',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  destinationButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f2f4f7',
  },
  refreshButtonText: {
    color: '#101828',
    fontWeight: '600',
    fontSize: 14,
  },
  searchCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    shadowColor: '#101828',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  statusText: {
    fontSize: 13,
    color: '#475467',
    marginBottom: 8,
  },
  error: {
    fontSize: 14,
    color: '#b42318',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },
  predictions: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#eaecf0',
    borderRadius: 10,
    maxHeight: 180,
  },
  predictionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f4f7',
    backgroundColor: '#f9fafb',
  },
  predictionText: {
    fontSize: 15,
    color: '#101828',
    fontWeight: '600',
  },
  predictionSubtext: {
    marginTop: 2,
    fontSize: 13,
    color: '#667085',
  },
  inlineRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  helperText: {
    fontSize: 14,
    color: '#475467',
  },
  bottomOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
  },
  routesCard: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    shadowColor: '#101828',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  routesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeRow: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eaecf0',
    backgroundColor: '#ffffff',
  },
  routeRowSelected: {
    borderColor: '#1570ef',
    backgroundColor: '#eff8ff',
  },
  routeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#101828',
  },
  routeMeta: {
    fontSize: 13,
    color: '#667085',
  },
});
