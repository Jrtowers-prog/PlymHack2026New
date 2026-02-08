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
import { useAllRoutesSafety } from '@/src/hooks/useAllRoutesSafety';
import { useAutoPlaceSearch } from '@/src/hooks/useAutoPlaceSearch';
import { useCurrentLocation } from '@/src/hooks/useCurrentLocation';
import { useDirections } from '@/src/hooks/useDirections';
import { useOnboarding } from '@/src/hooks/useOnboarding';
import { useRouteSafety } from '@/src/hooks/useRouteSafety';
import { reverseGeocode } from '@/src/services/openStreetMap';
import type { DirectionsRoute, LatLng, PlaceDetails } from '@/src/types/google';

export default function HomeScreen() {
  const { status: onboardingStatus, hasAccepted, error: onboardingError, accept } = useOnboarding();
  const {
    status: locationStatus,
    location,
    error: locationError,
    refresh: refreshLocation,
  } = useCurrentLocation({ enabled: hasAccepted });
  
  // Origin (auto-detect)
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState(true);
  const originSearch = useAutoPlaceSearch(location);

  // Destination (auto-detect)
  const destSearch = useAutoPlaceSearch(location);
  const [manualDest, setManualDest] = useState<PlaceDetails | null>(null);

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const effectiveOrigin = isUsingCurrentLocation ? location : originSearch.place?.location ?? null;
  const effectiveDestination = manualDest?.location ?? destSearch.place?.location ?? null;

  const {
    status: directionsStatus,
    routes,
    error: directionsError,
  } = useDirections(effectiveOrigin, effectiveDestination);

  // Background safety scoring for ALL routes
  const { scores: routeScores, bestRouteId, loading: scoringRoutes } =
    useAllRoutesSafety(routes);

  // When user types a new destination, clear the manual pin
  useEffect(() => {
    if (destSearch.query.length > 0) setManualDest(null);
  }, [destSearch.query]);

  useEffect(() => {
    if (onboardingStatus === 'ready' && !hasAccepted) {
      setShowOnboarding(true);
    }
  }, [onboardingStatus, hasAccepted]);

  // Auto-select safest route once scoring is done, otherwise pick first
  useEffect(() => {
    if (bestRouteId) {
      setSelectedRouteId(bestRouteId);
    } else if (routes.length > 0) {
      setSelectedRouteId(routes[0].id);
    }
  }, [routes, bestRouteId]);

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

  const handleMapLongPress = async (coordinate: LatLng) => {
    const fallback: PlaceDetails = {
      placeId: `pin:${coordinate.latitude},${coordinate.longitude}`,
      name: 'Dropped pin',
      location: coordinate,
    };
    setManualDest(fallback);
    destSearch.clear();

    const resolved = await reverseGeocode(coordinate);
    if (resolved) setManualDest(resolved);
    setSelectedRouteId(null);
  };

  const distanceLabel = selectedRoute ? formatDistance(selectedRoute.distanceMeters) : '--';
  const durationLabel = selectedRoute ? formatDuration(selectedRoute.durationSeconds) : '--';
  const showSafety = Boolean(selectedRoute);
  const destDisplayName = manualDest?.name ?? destSearch.query ?? '';
  


  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        <RouteMap
          origin={effectiveOrigin}
          destination={effectiveDestination}
          routes={routes}
          selectedRouteId={selectedRouteId}
          safetyMarkers={safetyMarkers}
          roadOverlays={roadOverlays}
          onSelectRoute={setSelectedRouteId}
          onLongPress={handleMapLongPress}
        />
      </View>
      
      {/* Top Search Bar */}
      <View style={styles.topSearchContainer}>
        <View style={styles.searchCard}>
          {/* Origin Input */}
          <View style={styles.inputRow}>
            <View style={styles.iconDot} />
            {isUsingCurrentLocation ? (
              <Pressable
                style={styles.locationButton}
                onPress={() => setIsUsingCurrentLocation(false)}
                accessibilityRole="button"
              >
                <Text style={styles.locationButtonText}>
                  {location ? '📍 Your location' : '⏳ Getting location...'}
                </Text>
              </Pressable>
            ) : (
              <>
                <TextInput
                  value={originSearch.query}
                  onChangeText={originSearch.setQuery}
                  placeholder="Starting point"
                  accessibilityLabel="Starting point"
                  autoCorrect={false}
                  style={styles.searchInput}
                />
                {originSearch.status === 'searching' && (
                  <ActivityIndicator size="small" color="#1570ef" />
                )}
                {originSearch.status === 'found' && (
                  <Text style={styles.searchCheck}>✓</Text>
                )}
                <Pressable
                  style={styles.iconButton}
                  onPress={() => {
                    setIsUsingCurrentLocation(true);
                    originSearch.clear();
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.iconButtonText}>📍</Text>
                </Pressable>
              </>
            )}
          </View>
          
          {/* Divider */}
          <View style={styles.inputDivider} />
          
          {/* Destination Input */}
          <View style={styles.inputRow}>
            <View style={styles.iconPin} />
            <TextInput
              value={manualDest ? destDisplayName : destSearch.query}
              onChangeText={(text: string) => {
                setManualDest(null);
                destSearch.setQuery(text);
                setSelectedRouteId(null);
              }}
              placeholder="Where to?"
              accessibilityLabel="Destination"
              autoCorrect={false}
              style={styles.searchInput}
            />
            {destSearch.status === 'searching' && (
              <ActivityIndicator size="small" color="#1570ef" />
            )}
            {(destSearch.status === 'found' || manualDest) && (
              <Text style={styles.searchCheck}>✓</Text>
            )}
            {(destSearch.place || manualDest) && (
              <Pressable
                style={styles.iconButton}
                onPress={() => {
                  destSearch.clear();
                  setManualDest(null);
                  setSelectedRouteId(null);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.iconButtonText}>✕</Text>
              </Pressable>
            )}
          </View>
        </View>
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
            
            {scoringRoutes && (
              <View style={styles.scoringBanner}>
                <ActivityIndicator size="small" color="#1570ef" />
                <Text style={styles.scoringBannerText}>Scoring all routes for safety…</Text>
              </View>
            )}

            {routes.slice(0, 7).map((route, index) => {
              const isSelected = route.id === selectedRouteId;
              const isBest = route.id === bestRouteId;
              const scoreInfo = routeScores[route.id];
              const label = isBest ? 'Safest Route' : `Route ${index + 1}`;

              return (
                <Pressable
                  key={route.id}
                  onPress={() => setSelectedRouteId(route.id)}
                  accessibilityRole="button"
                  style={[
                    styles.routeCard,
                    isSelected && styles.routeCardSelected,
                    isBest && styles.routeCardBest,
                  ]}
                >
                  <View style={styles.routeHeader}>
                    <View style={styles.routeLabelRow}>
                      {isBest && (
                        <View style={styles.bestBadge}>
                          <Text style={styles.bestBadgeTick}>✓</Text>
                        </View>
                      )}
                      <Text
                        style={[
                          styles.routeLabel,
                          isSelected && styles.routeLabelSelected,
                          isBest && styles.routeLabelBest,
                        ]}
                      >
                        {label}
                      </Text>
                    </View>
                    {scoreInfo?.status === 'done' && (
                      <View style={[styles.scoreChip, { backgroundColor: scoreInfo.color + '20' }]}>
                        <View style={[styles.scoreChipDot, { backgroundColor: scoreInfo.color }]} />
                        <Text style={[styles.scoreChipText, { color: scoreInfo.color }]}>
                          {scoreInfo.score}
                        </Text>
                      </View>
                    )}
                    {scoreInfo?.status === 'pending' && (
                      <ActivityIndicator size="small" color="#94a3b8" />
                    )}
                  </View>
                  <Text style={styles.routeDetails}>
                    {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)}
                    {scoreInfo?.status === 'done' ? ` · ${scoreInfo.label}` : ''}
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
                  <>
                    {/* ── Safety Score Gauge ── */}
                    <View style={styles.scoreCard}>
                      <View style={styles.scoreGauge}>
                        {/* Background track */}
                        <View style={styles.gaugeTrack} />
                        {/* Filled portion */}
                        <View
                          style={[
                            styles.gaugeFill,
                            {
                              width: `${safetyResult.safetyScore}%`,
                              backgroundColor: safetyResult.safetyColor,
                            },
                          ]}
                        />
                      </View>
                      <View style={styles.scoreRow}>
                        <Text style={[styles.scoreNumber, { color: safetyResult.safetyColor }]}>
                          {safetyResult.safetyScore}
                        </Text>
                        <Text style={styles.scoreOutOf}>/100</Text>
                        <View style={[styles.scoreBadge, { backgroundColor: safetyResult.safetyColor + '22' }]}>
                          <View style={[styles.scoreDot, { backgroundColor: safetyResult.safetyColor }]} />
                          <Text style={[styles.scoreBadgeText, { color: safetyResult.safetyColor }]}>
                            {safetyResult.safetyLabel}
                          </Text>
                        </View>
                      </View>
                      {/* Mini breakdown bars */}
                      <View style={styles.breakdownRow}>
                        <MiniBar label="Crime" value={Math.max(0, 100 - safetyResult.crimeCount * 4)} color="#ef4444" />
                        <MiniBar label="Lights" value={Math.min(100, safetyResult.streetLights * 2)} color="#facc15" />
                        <MiniBar label="Activity" value={Math.min(100, safetyResult.openPlaces * 10)} color="#22c55e" />
                      </View>
                    </View>

                    {/* ── Stat Grid ── */}
                    <View style={styles.safetyGrid}>
                      <View style={styles.safetyItem}>
                        <Text style={styles.safetyValue}>{safetyResult.crimeCount}</Text>
                        <Text style={styles.safetyLabel}>Crime reports</Text>
                      </View>
                      <View style={styles.safetyItem}>
                        <Text style={styles.safetyValue}>{safetyResult.streetLights}</Text>
                        <Text style={styles.safetyLabel}>Street lights</Text>
                      </View>
                      <View style={styles.safetyItem}>
                        <Text style={styles.safetyValue}>{safetyResult.openPlaces}</Text>
                        <Text style={styles.safetyLabel}>Open places</Text>
                      </View>
                    </View>
                  </>
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

// ── Mini breakdown bar for safety chart ──
function MiniBar({ label, value, color }: { label: string; value: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.miniBarWrap}>
      <Text style={styles.miniBarLabel}>{label}</Text>
      <View style={styles.miniBarTrack}>
        <View style={[styles.miniBarFill, { width: `${clamped}%`, backgroundColor: color }]} />
      </View>
    </View>
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
  
  searchCheck: {
    fontSize: 14,
    color: '#22c55e',
    fontWeight: '700',
    marginRight: 2,
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
  routeCardBest: {
    borderColor: '#22c55e',
    backgroundColor: '#f0fdf4',
  },
  routeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeLabelBest: {
    color: '#16a34a',
  },
  bestBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestBadgeTick: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  scoreChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  scoreChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scoringBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
  },
  scoringBannerText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1570ef',
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
  
  // Safety Score
  scoreCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#f0f4ff',
    borderWidth: 1,
    borderColor: '#d0d5dd',
  },
  scoreGauge: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 12,
  },
  gaugeTrack: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#e5e7eb',
    borderRadius: 5,
  },
  gaugeFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 5,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 14,
  },
  scoreNumber: {
    fontSize: 36,
    fontWeight: '800',
  },
  scoreOutOf: {
    fontSize: 16,
    fontWeight: '500',
    color: '#667085',
  },
  scoreBadge: {
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  scoreDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scoreBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  breakdownRow: {
    gap: 8,
  },
  miniBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniBarLabel: {
    width: 52,
    fontSize: 11,
    fontWeight: '600',
    color: '#667085',
  },
  miniBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 3,
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
