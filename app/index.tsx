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
import { useOnboarding } from '@/src/hooks/useOnboarding';
import { usePlaceAutocomplete } from '@/src/hooks/usePlaceAutocomplete';
import { useRouteSafety } from '@/src/hooks/useRouteSafety';
import {
  reverseGeocode
} from '@/src/services/openStreetMap';
import { AppError } from '@/src/types/errors';
import type { DirectionsRoute, LatLng, PlaceDetails, PlacePrediction } from '@/src/types/google';

export default function HomeScreen() {
  const { status: onboardingStatus, hasAccepted, error: onboardingError, accept } = useOnboarding();
  const {
    status: locationStatus,
    location,
    error: locationError,
    refresh: refreshLocation,
  } = useCurrentLocation({ enabled: hasAccepted });
  
  // Origin states
  const [originQuery, setOriginQuery] = useState('');
  const [origin, setOrigin] = useState<PlaceDetails | null>(null);
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState(true);
  const [originStatus, setOriginStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [originError, setOriginError] = useState<AppError | null>(null);
  const [activeInput, setActiveInput] = useState<'origin' | 'destination' | null>(null);
  
  // Destination states
  const [destinationQuery, setDestinationQuery] = useState('');
  const [destination, setDestination] = useState<PlaceDetails | null>(null);
  const [destinationStatus, setDestinationStatus] = useState<
    'idle' | 'loading' | 'error' | 'ready'
  >('idle');
  const [destinationError, setDestinationError] = useState<AppError | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const currentQuery = activeInput === 'origin' ? originQuery : destinationQuery;
  const effectiveOrigin = isUsingCurrentLocation ? location : origin?.location ?? null;

  const { status: autocompleteStatus, predictions, error: autocompleteError } =
    usePlaceAutocomplete(currentQuery, location);
  const {
    status: directionsStatus,
    routes,
    error: directionsError,
  } = useDirections(effectiveOrigin, destination?.location ?? null);

  useEffect(() => {
    if (onboardingStatus === 'ready' && !hasAccepted) {
      setShowOnboarding(true);
    }
  }, [onboardingStatus, hasAccepted]);

  useEffect(() => {
    if (routes.length > 0) {
      setSelectedRouteId(routes[0].id);
    }
  }, [routes]);

  const selectedRoute = useMemo<DirectionsRoute | null>(() => {
    return routes.find((route) => route.id === selectedRouteId) ?? null;
  }, [routes, selectedRouteId]);

  const { 
    status: safetyStatus, 
    markers: safetyMarkers, 
    roadOverlays, 
    result: safetyResult, 
    error: safetyError,
    progressMessage: safetyProgressMessage,
    progressPercent: safetyProgressPercent,
  } =
    useRouteSafety(selectedRoute);

  const handlePredictionPress = (prediction: PlacePrediction) => {
    if (!prediction.location) {
      if (activeInput === 'origin') {
        setOriginError(new AppError('origin_missing_location', 'Origin has no coordinates'));
        setOriginStatus('error');
      } else {
        setDestinationError(
          new AppError('destination_missing_location', 'Destination has no coordinates')
        );
        setDestinationStatus('error');
      }
      return;
    }

    const details: PlaceDetails = {
      placeId: prediction.placeId,
      name: prediction.fullText,
      location: prediction.location,
      source: prediction.source,
    };

    if (activeInput === 'origin') {
      setOrigin(details);
      setOriginQuery(prediction.primaryText);
      setOriginStatus('ready');
      setOriginError(null);
    } else {
      setDestination(details);
      setDestinationQuery(prediction.primaryText);
      setDestinationStatus('ready');
      setDestinationError(null);
    }
    
    setActiveInput(null);
  };

  const handleMapLongPress = async (coordinate: LatLng) => {
    setDestinationStatus('loading');
    setDestinationError(null);

    const fallback: PlaceDetails = {
      placeId: `pin:${coordinate.latitude},${coordinate.longitude}`,
      name: 'Dropped pin',
      location: coordinate,
    };

    setDestination(fallback);
    setDestinationQuery(fallback.name);

    const resolved = await reverseGeocode(coordinate);
    if (resolved) {
      setDestination(resolved);
      setDestinationQuery(resolved.name);
    }

    setDestinationStatus('ready');
    setSelectedRouteId(null);
  };

  const handleUseCurrentLocation = () => {
    setIsUsingCurrentLocation(true);
    setOrigin(null);
    setOriginQuery('');
    setOriginStatus('idle');
    setOriginError(null);
  };

  const distanceLabel = selectedRoute ? formatDistance(selectedRoute.distanceMeters) : '--';
  const durationLabel = selectedRoute ? formatDuration(selectedRoute.durationSeconds) : '--';
  const showSafety = Boolean(selectedRoute);
  const showPredictions = activeInput && predictions.length > 0;
  


  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        <RouteMap
          origin={effectiveOrigin}
          destination={destination?.location ?? null}
          routes={routes}
          selectedRouteId={selectedRouteId}
          safetyMarkers={safetyMarkers}
          roadOverlays={roadOverlays}
          onSelectRoute={setSelectedRouteId}
          onLongPress={handleMapLongPress}
        />
      </View>
      
      {/* Top Search Inputs - Google Maps Style */}
      <View style={styles.topSearchContainer}>
        <View style={styles.searchCard}>
          {/* Origin Input */}
          <View style={styles.inputRow}>
            <View style={styles.iconDot} />
            {isUsingCurrentLocation ? (
              <Pressable
                style={styles.locationButton}
                onPress={() => {
                  setIsUsingCurrentLocation(false);
                  setActiveInput('origin');
                }}
                accessibilityRole="button"
              >
                <Text style={styles.locationButtonText}>
                  {location ? 'Your location' : 'Getting location...'}
                </Text>
              </Pressable>
            ) : (
              <TextInput
                value={originQuery}
                onChangeText={(text) => {
                  setOriginQuery(text);
                  setOrigin(null);
                  setOriginStatus('idle');
                  setOriginError(null);
                }}
                onFocus={() => setActiveInput('origin')}
                placeholder="Choose starting point"
                accessibilityLabel="Starting point"
                autoCorrect={false}
                style={styles.searchInput}
              />
            )}
            {!isUsingCurrentLocation && (
              <Pressable
                style={styles.iconButton}
                onPress={handleUseCurrentLocation}
                accessibilityRole="button"
              >
                <Text style={styles.iconButtonText}>📍</Text>
              </Pressable>
            )}
          </View>
          
          {/* Divider */}
          <View style={styles.inputDivider} />
          
          {/* Destination Input */}
          <View style={styles.inputRow}>
            <View style={styles.iconPin} />
            <TextInput
              value={destinationQuery}
              onChangeText={(text) => {
                setDestinationQuery(text);
                setDestination(null);
                setSelectedRouteId(null);
                setDestinationStatus('idle');
                setDestinationError(null);
              }}
              onFocus={() => setActiveInput('destination')}
              placeholder="Choose destination"
              accessibilityLabel="Destination"
              autoCorrect={false}
              style={styles.searchInput}
            />
          </View>
        </View>
        
        {/* Autocomplete Predictions */}
        {showPredictions && (
          <View style={styles.predictionsCard}>
            {predictions.slice(0, 5).map((prediction) => (
              <Pressable
                key={prediction.placeId}
                onPress={() => handlePredictionPress(prediction)}
                accessibilityRole="button"
                style={styles.predictionItem}
              >
                <Text style={styles.predictionIcon}>📍</Text>
                <View style={styles.predictionTextContainer}>
                  <Text style={styles.predictionPrimary}>{prediction.primaryText}</Text>
                  {prediction.secondaryText && (
                    <Text style={styles.predictionSecondary}>{prediction.secondaryText}</Text>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      
      {/* Bottom Sheet with Results */}
      {(routes.length > 0 || directionsStatus === 'loading') && (
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Routes</Text>
              <Text style={styles.sheetMeta}>
                {distanceLabel} · {durationLabel}
              </Text>
            </View>
            
            {directionsStatus === 'loading' && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#1570ef" />
                <Text style={styles.loadingText}>Finding routes...</Text>
              </View>
            )}
            
            {directionsError && <Text style={styles.error}>{directionsError.message}</Text>}
            
            {routes.slice(0, 5).map((route, index) => {
              const isSelected = route.id === selectedRouteId;
              const label = index === 0 ? 'Best route' : `Alternative ${index}`;

              return (
                <Pressable
                  key={route.id}
                  onPress={() => setSelectedRouteId(route.id)}
                  accessibilityRole="button"
                  style={[styles.routeCard, isSelected && styles.routeCardSelected]}
                >
                  <View style={styles.routeHeader}>
                    <Text style={[styles.routeLabel, isSelected && styles.routeLabelSelected]}>
                      {label}
                    </Text>
                    {isSelected && <View style={styles.selectedBadge} />}
                  </View>
                  <Text style={styles.routeDetails}>
                    {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)}
                  </Text>
                </Pressable>
              );
            })}
            
            {showSafety && (
              <>
                <Text style={styles.safetyTitle}>Safety Information</Text>
                {safetyStatus === 'loading' && (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#1570ef" />
                    <Text style={styles.loadingText}>{safetyProgressMessage || 'Analyzing safety...'}</Text>
                    {safetyProgressPercent > 0 && (
                      <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBar, { width: `${safetyProgressPercent}%` }]} />
                      </View>
                    )}
                  </View>
                )}
                
                {safetyError && <Text style={styles.error}>{safetyError.message}</Text>}
                
                {safetyResult && (
                  <View style={styles.safetyGrid}>
                    <View style={styles.safetyItem}>
                      <Text style={styles.safetyValue}>{safetyResult.crimeCount}</Text>
                      <Text style={styles.safetyLabel}>Crime reports</Text>
                    </View>
                    <View style={styles.safetyItem}>
                      <Text style={styles.safetyValue}>{safetyResult.litRoads}</Text>
                      <Text style={styles.safetyLabel}>Well-lit roads</Text>
                    </View>
                    <View style={styles.safetyItem}>
                      <Text style={styles.safetyValue}>{safetyResult.unlitRoads}</Text>
                      <Text style={styles.safetyLabel}>Unlit roads</Text>
                    </View>
                    <View style={styles.safetyItem}>
                      <Text style={styles.safetyValue}>{safetyResult.openPlaces}</Text>
                      <Text style={styles.safetyLabel}>Open places</Text>
                    </View>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      )}
      {showOnboarding ? (
        <View style={styles.onboardingOverlay}>
          <View style={styles.onboardingCard}>
            <Text style={styles.onboardingTitle}>Safety Routing</Text>
            <Text style={styles.onboardingBody}>
              We use your location to plan walking routes. Results are guidance only and do not
              guarantee safety.
            </Text>
            {onboardingError ? (
              <Text style={styles.error}>{onboardingError.message}</Text>
            ) : null}
            <Pressable
              style={styles.onboardingButton}
              onPress={async () => {
                await accept();
                setShowOnboarding(false);
                refreshLocation();
              }}
              accessibilityRole="button"
              accessibilityLabel="Enable location"
            >
              <Text style={styles.onboardingButtonText}>Enable location</Text>
            </Pressable>
            <Pressable
              style={styles.onboardingSecondaryButton}
              onPress={() => setShowOnboarding(false)}
              accessibilityRole="button"
              accessibilityLabel="Maybe later"
            >
              <Text style={styles.onboardingSecondaryText}>Maybe later</Text>
            </Pressable>
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
  
  // Top Search Container (Google Maps style)
  topSearchContainer: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  searchCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
    elevation: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  iconDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1570ef',
  },
  iconPin: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#d92d20',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#101828',
    padding: 0,
  },
  locationButton: {
    flex: 1,
  },
  locationButtonText: {
    fontSize: 16,
    color: '#1570ef',
    fontWeight: '500',
  },
  iconButton: {
    padding: 4,
  },
  iconButtonText: {
    fontSize: 18,
  },
  inputDivider: {
    height: 1,
    backgroundColor: '#eaecf0',
    marginHorizontal: 16,
  },
  
  // Predictions Dropdown
  predictionsCard: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
    elevation: 4,
    maxHeight: 300,
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f4f7',
  },
  predictionIcon: {
    fontSize: 18,
  },
  predictionTextContainer: {
    flex: 1,
  },
  predictionPrimary: {
    fontSize: 15,
    fontWeight: '500',
    color: '#101828',
  },
  predictionSecondary: {
    fontSize: 13,
    color: '#667085',
    marginTop: 2,
  },
  
  // Bottom Sheet
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.15)',
    elevation: 8,
    maxHeight: '50%',
  },
  sheetHandle: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d0d5dd',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#101828',
  },
  sheetMeta: {
    fontSize: 14,
    color: '#667085',
    fontWeight: '500',
  },
  
  // Route Cards
  routeCard: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#eaecf0',
    backgroundColor: '#ffffff',
  },
  routeCardSelected: {
    borderColor: '#1570ef',
    backgroundColor: '#f0f9ff',
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  routeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
  },
  routeLabelSelected: {
    color: '#1570ef',
  },
  selectedBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1570ef',
  },
  routeDetails: {
    fontSize: 14,
    color: '#667085',
  },
  
  // Safety Section
  safetyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101828',
    marginTop: 20,
    marginBottom: 12,
  },
  safetyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  safetyItem: {
    flex: 1,
    minWidth: '45%',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#eaecf0',
  },
  safetyValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#101828',
  },
  safetyLabel: {
    fontSize: 12,
    color: '#667085',
    marginTop: 4,
  },
  
  // Loading & Errors
  loadingContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#667085',
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBarContainer: {
    width: '100%',
    height: 4,
    backgroundColor: '#eaecf0',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#1570ef',
    borderRadius: 2,
  },
  error: {
    fontSize: 14,
    color: '#d92d20',
    paddingVertical: 8,
  },
  onboardingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 24, 40, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  onboardingCard: {
    width: '100%',
    borderRadius: 20,
    padding: 20,
    backgroundColor: '#ffffff',
    boxShadow: '0 8px 12px rgba(16, 24, 40, 0.2)',
    elevation: 6,
  },
  onboardingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#101828',
  },
  onboardingBody: {
    marginTop: 8,
    fontSize: 14,
    color: '#475467',
    lineHeight: 20,
  },
  onboardingButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1570ef',
    alignItems: 'center',
  },
  onboardingButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  onboardingSecondaryButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
  },
  onboardingSecondaryText: {
    color: '#101828',
    fontWeight: '600',
    fontSize: 14,
  },
});
