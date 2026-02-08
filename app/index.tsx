import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  PanResponder,
  Platform,
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
import { useNavigation } from '@/src/hooks/useNavigation';
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
  const [manualOrigin, setManualOrigin] = useState<PlaceDetails | null>(null);

  // Destination (auto-detect)
  const destSearch = useAutoPlaceSearch(location);
  const [manualDest, setManualDest] = useState<PlaceDetails | null>(null);

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [mapPanTo, setMapPanTo] = useState<{ location: LatLng; key: number } | null>(null);

  // Which field gets the next map tap: 'origin' | 'destination' | null
  const [pinMode, setPinMode] = useState<'origin' | 'destination' | null>(null);

  // Track which search input is focused for blue glow + dropdown
  const [focusedField, setFocusedField] = useState<'origin' | 'destination' | null>(null);
  const originInputRef = useRef<TextInput>(null);
  const destInputRef = useRef<TextInput>(null);

  // Determine which dropdown predictions to show
  const activePredictions =
    focusedField === 'origin' && !manualOrigin ? originSearch.predictions :
    focusedField === 'destination' && !manualDest ? destSearch.predictions :
    [];

  // ── Draggable bottom sheet ──
  const SCREEN_HEIGHT = Dimensions.get('window').height;
  const SHEET_MAX = SCREEN_HEIGHT * 0.75;   // max: up to ~search inputs area
  const SHEET_DEFAULT = SCREEN_HEIGHT * 0.4; // default: 40 % of screen
  const SHEET_MIN = 80;                      // collapsed: just the handle + header
  const sheetHeight = useRef(new Animated.Value(SHEET_DEFAULT)).current;
  const sheetHeightRef = useRef(SHEET_DEFAULT);
  const scrollOffsetRef = useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const sheetBodyRef = useRef<View>(null);
  const isAtTopRef = useRef(true);
  const isAtBottomRef = useRef(false);
  const isDraggingSheetRef = useRef(false);
  const wheelAccumulatorRef = useRef(0);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle-only pan responder (always drags the sheet)
  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDraggingSheetRef.current = true;
        sheetHeight.stopAnimation((v: number) => { sheetHeightRef.current = v; });
      },
      onPanResponderMove: (_, g) => {
        const next = Math.min(SHEET_MAX, Math.max(SHEET_MIN, sheetHeightRef.current - g.dy));
        sheetHeight.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        isDraggingSheetRef.current = false;
        snapSheet(sheetHeightRef.current - g.dy, g.vy);
      },
    }),
  ).current;

  // Body pan responder — only captures when scroll is at an edge (touch devices)
  const bodyPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => {
        if (Math.abs(g.dy) < 4) return false;
        if (g.dy < 0 && isAtBottomRef.current) return true;
        if (g.dy > 0 && isAtTopRef.current) return true;
        return false;
      },
      onPanResponderGrant: () => {
        isDraggingSheetRef.current = true;
        sheetHeight.stopAnimation((v: number) => { sheetHeightRef.current = v; });
      },
      onPanResponderMove: (_, g) => {
        const next = Math.min(SHEET_MAX, Math.max(SHEET_MIN, sheetHeightRef.current - g.dy));
        sheetHeight.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        isDraggingSheetRef.current = false;
        snapSheet(sheetHeightRef.current - g.dy, g.vy);
      },
    }),
  ).current;

  const snapSheet = (current: number, vy: number) => {
    let snap: number;
    if (vy > 0.5 || current < SHEET_MIN + 40) {
      snap = SHEET_MIN;
    } else if (vy < -0.5 || current > SHEET_MAX - 40) {
      snap = SHEET_MAX;
    } else {
      snap = SHEET_DEFAULT;
    }
    sheetHeightRef.current = snap;
    Animated.spring(sheetHeight, {
      toValue: snap,
      useNativeDriver: false,
      bounciness: 4,
    }).start();
  };

  const handleSheetScroll = (e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    scrollOffsetRef.current = contentOffset.y;
    isAtTopRef.current = contentOffset.y <= 1;
    isAtBottomRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 1;
  };

  // Web: attach a wheel listener so overscroll at top/bottom drags the sheet
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = (sheetBodyRef.current as any)?._nativeTag
      ?? (sheetBodyRef.current as any)?.getInnerViewNode?.()
      ?? (sheetBodyRef.current as any);
    // In React Native Web the ref is a DOM element or has a property pointing to one
    const el: HTMLElement | null =
      node instanceof HTMLElement ? node : (node as any)?._node ?? null;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // deltaY > 0 = scrolling down,  deltaY < 0 = scrolling up
      const scrollingDown = e.deltaY > 0;
      const scrollingUp = e.deltaY < 0;

      // If content can still scroll in the wheel direction, let the browser handle it
      if (scrollingDown && !isAtBottomRef.current) return;
      if (scrollingUp && !isAtTopRef.current) return;

      // We're at an edge — prevent default scroll and drag the sheet instead
      e.preventDefault();
      e.stopPropagation();

      // Accumulate wheel deltas and apply to sheet height
      // scrolling down at bottom → deltaY>0 → grow sheet (pull up)
      // scrolling up at top → deltaY<0 → shrink sheet (push down)
      const sensitivity = 1.5;
      wheelAccumulatorRef.current += e.deltaY * sensitivity;

      const next = Math.min(
        SHEET_MAX,
        Math.max(SHEET_MIN, sheetHeightRef.current + wheelAccumulatorRef.current),
      );
      sheetHeight.setValue(next);

      // Debounce: snap after user stops scrolling (150 ms)
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => {
        const final = sheetHeightRef.current + wheelAccumulatorRef.current;
        wheelAccumulatorRef.current = 0;
        snapSheet(final, 0);
      }, 150);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const effectiveOrigin = isUsingCurrentLocation
    ? location
    : manualOrigin?.location ?? originSearch.place?.location ?? null;
  const effectiveDestination = manualDest?.location ?? destSearch.place?.location ?? null;

  const {
    status: directionsStatus,
    routes,
    error: directionsError,
  } = useDirections(effectiveOrigin, effectiveDestination);

  // Background safety scoring for ALL routes
  const { scores: routeScores, bestRouteId, loading: scoringRoutes } =
    useAllRoutesSafety(routes);

  // Reset sheet height when routes change
  useEffect(() => {
    if (routes.length > 0) {
      Animated.spring(sheetHeight, {
        toValue: SHEET_DEFAULT,
        useNativeDriver: false,
      }).start();
      sheetHeightRef.current = SHEET_DEFAULT;
    }
  }, [routes.length]);

  // When user types a new destination, clear the manual pin
  useEffect(() => {
    if (destSearch.query.length > 0) setManualDest(null);
  }, [destSearch.query]);

  useEffect(() => {
    if (onboardingStatus === 'ready' && !hasAccepted) {
      setShowOnboarding(true);
    }
  }, [onboardingStatus, hasAccepted]);

  // Pan to user's location when it first becomes available
  useEffect(() => {
    if (location && isUsingCurrentLocation) {
      setMapPanTo({ location, key: Date.now() });
    }
  }, [location !== null]);

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
    routeSegments,
    roadLabels, 
    result: safetyResult, 
    error: safetyError,
    progressMessage: safetyProgressMessage,
    progressPercent: safetyProgressPercent,
  } =
    useRouteSafety(selectedRoute);

  // ── Navigation ──
  const nav = useNavigation(selectedRoute);

  const resolvePin = async (coordinate: LatLng): Promise<PlaceDetails> => {
    const fallback: PlaceDetails = {
      placeId: `pin:${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`,
      name: 'Dropped pin',
      location: coordinate,
    };
    const resolved = await reverseGeocode(coordinate);
    return resolved ?? fallback;
  };

  const handleMapPress = async (coordinate: LatLng) => {
    if (pinMode === 'origin') {
      setIsUsingCurrentLocation(false);
      originSearch.clear();
      const pin = await resolvePin(coordinate);
      setManualOrigin(pin);
      setPinMode(null);
      setSelectedRouteId(null);
    } else if (pinMode === 'destination') {
      destSearch.clear();
      const pin = await resolvePin(coordinate);
      setManualDest(pin);
      setPinMode(null);
      setSelectedRouteId(null);
    }
    // If no pinMode active, tap does nothing special
  };

  const handleMapLongPress = async (coordinate: LatLng) => {
    // Long-press always sets destination (legacy behaviour)
    const pin = await resolvePin(coordinate);
    setManualDest(pin);
    destSearch.clear();
    setSelectedRouteId(null);
  };

  const distanceLabel = selectedRoute ? formatDistance(selectedRoute.distanceMeters) : '--';
  const durationLabel = selectedRoute ? formatDuration(selectedRoute.durationSeconds) : '--';
  const showSafety = Boolean(selectedRoute);
  


  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        <RouteMap
          origin={effectiveOrigin}
          destination={effectiveDestination}
          routes={routes}
          selectedRouteId={selectedRouteId}
          safetyMarkers={safetyMarkers}
          routeSegments={routeSegments}
          roadLabels={roadLabels}
          panTo={mapPanTo}
          isNavigating={nav.state === 'navigating' || nav.state === 'off-route'}
          navigationLocation={nav.userLocation}
          navigationHeading={nav.userHeading}
          onSelectRoute={setSelectedRouteId}
          onLongPress={handleMapLongPress}
          onMapPress={handleMapPress}
        />
        {/* Pin-mode banner */}
        {pinMode && (
          <View style={styles.pinBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Ionicons name="location" size={18} color="#ffffff" />
              <Text style={styles.pinBannerText}>
                Tap anywhere on the map to set your {pinMode === 'origin' ? 'starting point' : 'destination'}
              </Text>
            </View>
            <Pressable onPress={() => setPinMode(null)} style={styles.pinBannerCancel}>
              <Text style={styles.pinBannerCancelText}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </View>
      
      {/* Top Search Bar — hidden during navigation */}
      {nav.state !== 'navigating' && nav.state !== 'off-route' && <View style={styles.topSearchContainer}>
        <View style={styles.searchCard}>
          {/* Origin Input */}
          <View style={styles.inputRow}>
            <View style={styles.inputIconWrap}>
              <View style={styles.iconDot} />
              <View style={styles.iconConnector} />
            </View>
            <Pressable
              style={[styles.inputFieldWrap, focusedField === 'origin' && styles.inputFieldWrapFocused]}
              onPress={() => { if (!isUsingCurrentLocation) originInputRef.current?.focus(); }}
            >
              {isUsingCurrentLocation ? (
                <Pressable
                  style={[styles.inputField, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                  onPress={() => setIsUsingCurrentLocation(false)}
                  accessibilityRole="button"
                >
                  <Ionicons name={location ? 'navigate' : 'hourglass-outline'} size={16} color="#1570ef" />
                  <Text style={styles.locationDisplayText}>
                    {location ? 'Your location' : 'Getting location...'}
                  </Text>
                </Pressable>
              ) : (
                <TextInput
                  ref={originInputRef}
                  value={manualOrigin ? (manualOrigin.name ?? 'Dropped pin') : originSearch.query}
                  onChangeText={(t: string) => {
                    setManualOrigin(null);
                    originSearch.setQuery(t);
                    setSelectedRouteId(null);
                  }}
                  placeholder="Starting point"
                  placeholderTextColor="#98a2b3"
                  accessibilityLabel="Starting point"
                  autoCorrect={false}
                  style={styles.inputField}
                  onFocus={() => setFocusedField('origin')}
                  onBlur={() => setFocusedField(null)}
                />
              )}
              <View style={[styles.inputActions, { pointerEvents: 'box-none' }]}>
                {originSearch.status === 'searching' && (
                  <ActivityIndicator size="small" color="#1570ef" />
                )}
                {(originSearch.status === 'found' || manualOrigin) && (
                  <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
                )}
                <Pressable
                  style={styles.mapPinButton}
                  onPress={() => {
                    if (pinMode === 'origin') { setPinMode(null); }
                    else { setPinMode('origin'); }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Pick on map"
                >
                  <Ionicons name="location-outline" size={20} color={pinMode === 'origin' ? '#1570ef' : '#667085'} />
                </Pressable>
                {!isUsingCurrentLocation && (
                  <Pressable
                    style={styles.mapPinButton}
                    onPress={() => {
                      setIsUsingCurrentLocation(true);
                      setManualOrigin(null);
                      originSearch.clear();
                      if (location) {
                        setMapPanTo({ location, key: Date.now() });
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Use current location"
                  >
                    <Ionicons name="locate-outline" size={20} color="#667085" />
                  </Pressable>
                )}
              </View>
            </Pressable>
          </View>

          {/* Divider line connecting the dots */}
          <View style={styles.inputDivider} />

          {/* Destination Input */}
          <View style={styles.inputRow}>
            <View style={styles.inputIconWrap}>
              <View style={styles.iconPin} />
            </View>
            <Pressable
              style={[styles.inputFieldWrap, focusedField === 'destination' && styles.inputFieldWrapFocused]}
              onPress={() => destInputRef.current?.focus()}
            >
              <TextInput
                ref={destInputRef}
                value={manualDest ? (manualDest.name ?? 'Dropped pin') : destSearch.query}
                onChangeText={(text: string) => {
                  setManualDest(null);
                  destSearch.setQuery(text);
                  setSelectedRouteId(null);
                }}
                placeholder="Where to?"
                placeholderTextColor="#98a2b3"
                accessibilityLabel="Destination"
                autoCorrect={false}
                style={styles.inputField}
                onFocus={() => setFocusedField('destination')}
                onBlur={() => setFocusedField(null)}
              />
              <View style={[styles.inputActions, { pointerEvents: 'box-none' }]}>
                {destSearch.status === 'searching' && (
                  <ActivityIndicator size="small" color="#1570ef" />
                )}
                {(destSearch.status === 'found' || manualDest) && (
                  <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
                )}
                <Pressable
                  style={styles.mapPinButton}
                  onPress={() => {
                    if (pinMode === 'destination') { setPinMode(null); }
                    else { setPinMode('destination'); }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Pick on map"
                >
                  <Ionicons name="location-outline" size={20} color={pinMode === 'destination' ? '#d92d20' : '#667085'} />
                </Pressable>
                {(destSearch.place || manualDest) && (
                  <Pressable
                    style={styles.mapPinButton}
                    onPress={() => {
                      destSearch.clear();
                      setManualDest(null);
                      setSelectedRouteId(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Clear destination"
                  >
                    <Ionicons name="close-circle-outline" size={20} color="#98a2b3" />
                  </Pressable>
                )}
              </View>
            </Pressable>
          </View>
        </View>

        {/* Search predictions dropdown */}
        {activePredictions.length > 0 && (
          <View style={styles.predictionsDropdown}>
            {activePredictions.map((pred, idx) => (
              <Pressable
                key={pred.placeId}
                style={({ pressed }: { pressed: boolean }) => [
                  styles.predictionItem,
                  idx === 0 && styles.predictionItemFirst,
                  idx === activePredictions.length - 1 && styles.predictionItemLast,
                  pressed && styles.predictionItemPressed,
                ]}
                onPress={() => {
                  if (focusedField === 'origin') {
                    originSearch.selectPrediction(pred);
                    setManualOrigin(null);
                    setIsUsingCurrentLocation(false);
                  } else {
                    destSearch.selectPrediction(pred);
                    setManualDest(null);
                  }
                  setSelectedRouteId(null);
                  originInputRef.current?.blur();
                  destInputRef.current?.blur();
                  setFocusedField(null);
                }}
              >
                <View style={styles.predictionIcon}>
                  <Ionicons name="location-outline" size={18} color="#667085" />
                </View>
                <View style={styles.predictionText}>
                  <Text style={styles.predictionPrimary} numberOfLines={1}>
                    {pred.primaryText}
                  </Text>
                  {pred.secondaryText ? (
                    <Text style={styles.predictionSecondary} numberOfLines={1}>
                      {pred.secondaryText}
                    </Text>
                  ) : null}
                </View>
                {idx === 0 && (
                  <View style={styles.predictionBadge}>
                    <Text style={styles.predictionBadgeText}>Top</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>}
      
      {/* Bottom Sheet with Results — hidden during navigation */}
      {(routes.length > 0 || directionsStatus === 'loading') && nav.state !== 'navigating' && nav.state !== 'off-route' && (
        <Animated.View style={[styles.bottomSheet, { height: sheetHeight }]}>
          <View {...handlePanResponder.panHandlers} style={styles.sheetDragZone}>
            <View style={styles.sheetHandle} />
          </View>
          <View ref={sheetBodyRef} style={{ flex: 1 }}>
            <ScrollView
              ref={scrollViewRef}
              {...bodyPanResponder.panHandlers}
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetContent}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={handleSheetScroll}
              bounces={false}
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

            {routes.slice(0, 5).map((route, index) => {
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

            {/* Start Navigation Button */}
            {selectedRoute && nav.state === 'idle' && (
              <Pressable
                style={styles.startNavButton}
                onPress={nav.start}
                accessibilityRole="button"
                accessibilityLabel="Start navigation"
              >
                <Ionicons name="navigate" size={20} color="#ffffff" />
                <Text style={styles.startNavButtonText}>Start Navigation</Text>
              </Pressable>
            )}
            
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
        </Animated.View>
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

      {/* ── Navigation Turn-by-turn Overlay ── */}
      {(nav.state === 'navigating' || nav.state === 'off-route') && (
        <View style={[styles.navOverlay, { pointerEvents: 'box-none' }]}>
          {/* Instruction card */}
          <View style={styles.navInstructionCard}>
            <View style={styles.navIconRow}>
              <Ionicons
                name={maneuverIcon(nav.currentStep?.maneuver) as any}
                size={28}
                color="#1570EF"
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.navDistance}>
                  {nav.distanceToNextTurn < 1000
                    ? `${nav.distanceToNextTurn} m`
                    : `${(nav.distanceToNextTurn / 1000).toFixed(1)} km`}
                </Text>
                <Text style={styles.navInstruction} numberOfLines={2}>
                  {stripHtml(nav.currentStep?.instruction ?? 'Continue on route')}
                </Text>
              </View>
            </View>
            {nav.nextStep && (
              <Text style={styles.navThen} numberOfLines={1}>
                Then: {stripHtml(nav.nextStep.instruction)}
              </Text>
            )}
          </View>

          {/* Bottom bar: remaining info + stop */}
          <View style={styles.navBottomBar}>
            <View>
              <Text style={styles.navRemaining}>
                {formatDistance(nav.remainingDistance)} · {formatDuration(nav.remainingDuration)}
              </Text>
              {nav.state === 'off-route' && (
                <Text style={styles.navOffRoute}>Off route — rerouting…</Text>
              )}
            </View>
            <Pressable style={styles.navStopButton} onPress={nav.stop}>
              <Ionicons name="stop-circle" size={20} color="#ffffff" />
              <Text style={styles.navStopText}>Stop</Text>
            </Pressable>
          </View>
        </View>
      )}

      {nav.state === 'arrived' && (
        <View style={styles.navArrivedBanner}>
          <Ionicons name="checkmark-circle" size={28} color="#22c55e" />
          <Text style={styles.navArrivedText}>You have arrived!</Text>
          <Pressable style={styles.navDismissButton} onPress={nav.stop}>
            <Text style={styles.navDismissText}>Done</Text>
          </Pressable>
        </View>
      )}
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

/** Map Google maneuver strings to Ionicons names */
function maneuverIcon(maneuver?: string): string {
  switch (maneuver) {
    case 'turn-left': return 'arrow-back';
    case 'turn-right': return 'arrow-forward';
    case 'turn-slight-left': return 'arrow-back';
    case 'turn-slight-right': return 'arrow-forward';
    case 'turn-sharp-left': return 'return-down-back';
    case 'turn-sharp-right': return 'return-down-forward';
    case 'uturn-left': case 'uturn-right': return 'refresh';
    case 'roundabout-left': case 'roundabout-right': return 'sync';
    default: return 'arrow-up';
  }
}

/** Strip HTML tags from Google's instruction strings */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
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
  
  // Top Search Container
  topSearchContainer: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
    elevation: 6,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 600,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  inputIconWrap: {
    width: 24,
    alignItems: 'center',
  },
  iconDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1570ef',
    borderWidth: 2,
    borderColor: '#93c5fd',
  },
  iconConnector: {
    width: 2,
    height: 20,
    backgroundColor: '#d0d5dd',
    marginTop: 2,
  },
  iconPin: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#d92d20',
    borderWidth: 2,
    borderColor: '#fca5a5',
  },
  inputFieldWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  inputFieldWrapFocused: {
    borderColor: '#1570ef',
    backgroundColor: '#ffffff',
    boxShadow: '0 0 0 3px rgba(21, 112, 239, 0.2)',
  },
  inputField: {
    flex: 1,
    height: '100%',
    fontSize: 18,
    color: '#101828',
    fontWeight: '400',
    outlineStyle: 'none',
  },
  locationDisplayText: {
    fontSize: 18,
    color: '#1570ef',
    fontWeight: '500',
  },
  inputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  mapPinButton: {
    padding: 4,
    borderRadius: 6,
  },
  inputDivider: {
    height: 1,
    backgroundColor: '#f2f4f7',
    marginLeft: 48,
    marginRight: 14,
  },
  // Search predictions dropdown
  predictionsDropdown: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.14)',
    elevation: 8,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 600,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f4f7',
  },
  predictionItemFirst: {
    // top result highlight
  },
  predictionItemLast: {
    borderBottomWidth: 0,
  },
  predictionItemPressed: {
    backgroundColor: '#f0f6ff',
  },
  predictionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  predictionText: {
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
  predictionBadge: {
    backgroundColor: '#ecfdf3',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  predictionBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#027a48',
  },
  // Pin-mode banner
  pinBanner: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    backgroundColor: '#1570ef',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 4px 12px rgba(21, 112, 239, 0.35)',
    elevation: 6,
  },
  pinBannerText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  pinBannerCancel: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  pinBannerCancelText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
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
    overflow: 'hidden',
    userSelect: 'none',
    cursor: 'default',
  } as any,
  sheetDragZone: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    cursor: 'grab',
  },
  sheetHandle: {
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
    paddingBottom: 80,
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

  // ── Navigation UI ──
  startNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    marginHorizontal: 4,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#1570ef',
  },
  startNavButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  navOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  navInstructionCard: {
    margin: 16,
    marginTop: Platform.OS === 'web' ? 16 : 56,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    elevation: 8,
  },
  navIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navDistance: {
    fontSize: 24,
    fontWeight: '800',
    color: '#101828',
  },
  navInstruction: {
    fontSize: 15,
    color: '#475467',
    marginTop: 2,
    lineHeight: 20,
  },
  navThen: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f2f4f7',
    fontSize: 13,
    color: '#667085',
  },
  navBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    elevation: 8,
  },
  navRemaining: {
    fontSize: 15,
    fontWeight: '600',
    color: '#101828',
  },
  navOffRoute: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ef4444',
    marginTop: 2,
  },
  navStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#ef4444',
  },
  navStopText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  navArrivedBanner: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    elevation: 8,
  },
  navArrivedText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#101828',
  },
  navDismissButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#22c55e',
  },
  navDismissText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
