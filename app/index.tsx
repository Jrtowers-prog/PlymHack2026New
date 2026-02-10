import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  type GestureResponderEvent,
  Image,
  Keyboard,
  type LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapTypeControl } from '@/src/components/maps/MapTypeControl';
import RouteMap from '@/src/components/maps/RouteMap';
import type { MapType } from '@/src/components/maps/RouteMap.types';
import { useAIExplanation } from '@/src/hooks/useAIExplanation';
import type { RouteScore } from '@/src/hooks/useAllRoutesSafety';
import { useAutoPlaceSearch } from '@/src/hooks/useAutoPlaceSearch';
import { useCurrentLocation } from '@/src/hooks/useCurrentLocation';
import { useNavigation } from '@/src/hooks/useNavigation';
import { useOnboarding } from '@/src/hooks/useOnboarding';
import { useSafeRoutes } from '@/src/hooks/useSafeRoutes';
import { reverseGeocode } from '@/src/services/openStreetMap';
import type { EnrichedSegment, SafeRoute } from '@/src/services/safeRoutes';
import type { SafetyMapResult } from '@/src/services/safetyMapData';
import type { DirectionsRoute, LatLng, PlaceDetails } from '@/src/types/google';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

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
  const [mapType, setMapType] = useState<MapType>('roadmap');

  // Which field gets the next map tap: 'origin' | 'destination' | null
  const [pinMode, setPinMode] = useState<'origin' | 'destination' | null>(null);

  // Track which search input is focused for blue glow + dropdown
  const [focusedField, setFocusedField] = useState<'origin' | 'destination' | null>(null);
  const originInputRef = useRef<TextInput>(null);
  const destInputRef = useRef<TextInput>(null);

  // Blur fires before onPress on dropdown items on ALL platforms.
  // We delay clearing focusedField so the prediction tap can register first.
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Remember the last focused field so prediction taps work even if blur fires first
  const lastFocusedFieldRef = useRef<'origin' | 'destination' | null>(null);
  // Suppress blur when a prediction tap is in progress (web: onPressIn fires before onBlur)
  const suppressBlurRef = useRef(false);
  const handleBlur = () => {
    if (suppressBlurRef.current) {
      // A prediction item was pressed — don't clear the dropdown
      suppressBlurRef.current = false;
      return;
    }
    blurTimerRef.current = setTimeout(() => setFocusedField(null), 200);
  };
  const cancelBlurTimer = () => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  };

  // Keep lastFocusedFieldRef in sync so prediction taps know which field was active
  useEffect(() => {
    if (focusedField) lastFocusedFieldRef.current = focusedField;
  }, [focusedField]);

  // Determine which dropdown predictions to show.
  // The blur timer (200 ms) keeps focusedField alive long enough for onPress to fire.
  const activePredictions =
    focusedField === 'origin' && !manualOrigin && !originSearch.place ? originSearch.predictions :
    focusedField === 'destination' && !manualDest && !destSearch.place ? destSearch.predictions :
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

  // ── Safety-first pathfinding (replaces useDirections + useAllRoutesSafety) ──
  const {
    status: safeRoutesStatus,
    routes: safeRoutes,
    safestRoute,
    error: safeRoutesError,
    outOfRange,
    outOfRangeMessage,
    meta: safeRoutesMeta,
  } = useSafeRoutes(effectiveOrigin, effectiveDestination);

  // Derive values the rest of the UI expects
  const routes: DirectionsRoute[] = safeRoutes;
  const directionsStatus = safeRoutesStatus;
  const directionsError = safeRoutesError;
  const bestRouteId = safestRoute?.id ?? null;
  const scoringRoutes = false; // scoring is done server-side, no separate loading state

  // Build routeScores map from SafeRoute.safety data (for AI explanation compatibility)
  const routeScores: Record<string, RouteScore> = useMemo(() => {
    const scores: Record<string, RouteScore> = {};
    for (const r of safeRoutes) {
      scores[r.id] = {
        routeId: r.id,
        score: r.safety.score,
        pathfindingScore: r.safety.score, // same for our engine
        label: r.safety.label,
        color: r.safety.color,
        mainRoadRatio: r.safety.mainRoadRatio / 100,
        dataConfidence: 1, // server always has full data
        status: 'done',
      };
    }
    return scores;
  }, [safeRoutes]);

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

  // Full SafeRoute for the selected route (with routeStats, routePOIs, enrichedSegments)
  const selectedSafeRoute = useMemo<SafeRoute | null>(() => {
    return (safeRoutes as SafeRoute[]).find((r) => r.id === selectedRouteId) ?? null;
  }, [safeRoutes, selectedRouteId]);

  // Generate map markers from route POIs
  const poiMarkers = useMemo(() => {
    const pois = selectedSafeRoute?.routePOIs;
    if (!pois) return [];
    const markers: Array<{ id: string; kind: string; coordinate: { latitude: number; longitude: number }; label: string }> = [];
    pois.cctv?.forEach((c, i) => markers.push({
      id: `poi-cctv-${i}`, kind: 'cctv',
      coordinate: { latitude: c.lat, longitude: c.lng }, label: 'CCTV Camera',
    }));
    pois.transit?.forEach((t, i) => markers.push({
      id: `poi-transit-${i}`, kind: 'bus_stop',
      coordinate: { latitude: t.lat, longitude: t.lng }, label: 'Transit Stop',
    }));
    pois.deadEnds?.forEach((d, i) => markers.push({
      id: `poi-deadend-${i}`, kind: 'dead_end',
      coordinate: { latitude: d.lat, longitude: d.lng }, label: 'Dead End',
    }));
    pois.lights?.forEach((l, i) => markers.push({
      id: `poi-light-${i}`, kind: 'light',
      coordinate: { latitude: l.lat, longitude: l.lng }, label: 'Street Light',
    }));
    pois.places?.forEach((p, i) => markers.push({
      id: `poi-place-${i}`, kind: 'shop',
      coordinate: { latitude: p.lat, longitude: p.lng }, label: 'Open Place',
    }));
    pois.crimes?.forEach((cr, i) => markers.push({
      id: `poi-crime-${i}`, kind: 'crime',
      coordinate: { latitude: cr.lat, longitude: cr.lng }, label: cr.category || 'Crime',
    }));
    return markers;
  }, [selectedSafeRoute]);

  // ── Derive safety data INSTANTLY from the already-fetched SafeRoute ──
  // No extra network calls — the backend already computed everything.
  // All counts are PER-ROUTE (from enriched segments + routeStats), not area-wide.
  const safetyResult = useMemo<SafetyMapResult | null>(() => {
    if (!selectedSafeRoute) return null;
    const s = selectedSafeRoute.safety;
    const stats = selectedSafeRoute.routeStats;
    const segs = selectedSafeRoute.enrichedSegments ?? [];

    // Count lights along THIS route: segments with good lighting (> 0.5)
    let litSegments = 0;
    let unlitSegments = 0;
    for (const seg of segs) {
      if (seg.lightScore > 0.5) litSegments++;
      else unlitSegments++;
    }

    // Count crime hotspots along THIS route
    // crimeScore is inverted: 1.0 = safe, 0.0 = high crime
    // Only count segments near actual crime hotspots (score < 0.4)
    let crimeHotspots = 0;
    for (const seg of segs) {
      if (seg.crimeScore < 0.4) crimeHotspots++;
    }

    // Count open/active places along THIS route (placeScore > 0 means nearby activity)
    let openPlaceCount = 0;
    for (const seg of segs) {
      if (seg.placeScore > 0.1) openPlaceCount++;
    }

    return {
      markers: [],
      roadOverlays: [],
      roadLabels: [],
      routeSegments: [],
      crimeCount: crimeHotspots,
      streetLights: litSegments,
      litRoads: litSegments,
      unlitRoads: unlitSegments,
      openPlaces: openPlaceCount,
      busStops: stats?.transitStopsNearby ?? 0,
      safetyScore: s.score,
      safetyLabel: s.label,
      safetyColor: s.color,
      mainRoadRatio: s.mainRoadRatio / 100,
      pathfindingScore: s.score,
      dataConfidence: 1,
    };
  }, [selectedSafeRoute]);

  const safetyStatus: 'idle' | 'loading' | 'ready' | 'error' =
    safeRoutesStatus === 'loading' ? 'loading'
    : selectedSafeRoute ? 'ready'
    : 'idle';
  const safetyError = safeRoutesError;
  const safetyProgressMessage = safeRoutesStatus === 'loading' ? 'Computing safest routes…' : '';
  const safetyProgressPercent = safeRoutesStatus === 'loading' ? 50 : 0;

  // safetyMarkers no longer needed — all POI markers come from routePOIs
  const safetyMarkers: Array<{ id: string; kind: string; coordinate: { latitude: number; longitude: number }; label?: string }> = [];

  // Build route segments for the coloured route overlay on the map
  const routeSegments = useMemo(() => {
    if (!selectedSafeRoute?.enrichedSegments) return [];
    return selectedSafeRoute.enrichedSegments.map((seg, i) => ({
      id: `seg-${i}`,
      path: [seg.startCoord, seg.endCoord],
      color: seg.color,
      score: seg.safetyScore,
    }));
  }, [selectedSafeRoute]);

  // Build road labels from enriched segments (deduplicated by road name)
  const roadLabels = useMemo(() => {
    if (!selectedSafeRoute?.enrichedSegments) return [];
    const seen = new Set<string>();
    const labels: Array<{ id: string; coordinate: { latitude: number; longitude: number }; roadType: string; displayName: string; color: string }> = [];
    for (const seg of selectedSafeRoute.enrichedSegments) {
      if (seg.roadName && !seen.has(seg.roadName)) {
        seen.add(seg.roadName);
        const typeColors: Record<string, string> = {
          primary: '#2563eb', secondary: '#3b82f6', tertiary: '#60a5fa',
          residential: '#64748b', footway: '#f59e0b', path: '#f59e0b',
          pedestrian: '#34d399', service: '#94a3b8',
        };
        labels.push({
          id: `rl-${labels.length}`,
          coordinate: seg.midpointCoord,
          roadType: seg.highway,
          displayName: seg.roadName,
          color: typeColors[seg.highway] || '#64748b',
        });
      }
    }
    return labels;
  }, [selectedSafeRoute]);

  // Merge POI markers with safety markers
  const allMarkers = useMemo(() => {
    return [...safetyMarkers, ...poiMarkers] as any[];
  }, [safetyMarkers, poiMarkers]);

  // ── Navigation ──
  const nav = useNavigation(selectedRoute);
  const isNavActive = nav.state === 'navigating' || nav.state === 'off-route';

  // ── AI Explanation ──
  const ai = useAIExplanation(
    safetyResult,
    routes,
    routeScores,
    bestRouteId,
  );
  const [showAIModal, setShowAIModal] = useState(false);

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
    // Dismiss keyboard and search dropdown when tapping the map
    Keyboard.dismiss();
    cancelBlurTimer();
    setFocusedField(null);

    // During navigation, don't process map taps for pin/destination setting
    if (isNavActive) return;

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
    // Dismiss keyboard on map interaction
    Keyboard.dismiss();
    cancelBlurTimer();
    setFocusedField(null);

    // During navigation, don't process long-press for destination setting
    if (isNavActive) return;

    // Long-press always sets destination (legacy behaviour)
    const pin = await resolvePin(coordinate);
    setManualDest(pin);
    destSearch.clear();
    setSelectedRouteId(null);
  };

  const distanceLabel = selectedRoute ? `🚶 ${formatDistance(selectedRoute.distanceMeters)}` : '--';
  const durationLabel = selectedRoute ? formatDuration(selectedRoute.durationSeconds) : '--';
  const showSafety = Boolean(selectedRoute);
  


  return (
    <View style={styles.container}>
      {/* Map fills the screen as a flex child.
          All subsequent absolutely-positioned siblings render on top —
          this is the ONLY reliable z-ordering approach on Android
          when a WebView (SurfaceView) is involved. */}
      <RouteMap
        origin={effectiveOrigin}
        destination={effectiveDestination}
        routes={routes}
        selectedRouteId={selectedRouteId}
        safetyMarkers={allMarkers}
        routeSegments={routeSegments}
        roadLabels={roadLabels}
        panTo={mapPanTo}
        isNavigating={isNavActive}
        navigationLocation={nav.userLocation}
        navigationHeading={nav.userHeading}
        mapType={mapType}
        onSelectRoute={setSelectedRouteId}
        onLongPress={handleMapLongPress}
        onMapPress={handleMapPress}
      />

      {/* Map Type Control */}
      {!isNavActive && (
        <MapTypeControl mapType={mapType} onMapTypeChange={setMapType} />
      )}
      
      {/* Pin-mode banner — outside mapContainer so it renders above WebView on Android */}
      {pinMode && (
        <View style={[styles.pinBanner, { bottom: insets.bottom + 12 }]}>
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
      
      {/* Top Search Bar — hidden during navigation */}
      {!isNavActive && <ScrollView
        style={[styles.topSearchContainer, { top: insets.top + 8 }]}
        contentContainerStyle={styles.topSearchContent}
        keyboardShouldPersistTaps="always"
        scrollEnabled={false}
        pointerEvents="box-none"
      >
        <View style={styles.searchCard}>
          {/* Logo Header */}
          <View style={styles.logoHeader}>
            <Text style={styles.logoText}>SAFE NIGHT HOME</Text>
          </View>

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
                  onFocus={() => { cancelBlurTimer(); setFocusedField('origin'); }}
                  onBlur={handleBlur}
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
