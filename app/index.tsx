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
