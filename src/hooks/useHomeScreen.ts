/**
 * useHomeScreen — Centralised business logic for the Home screen.
 *
 * Pulls together onboarding, location, search, routing, safety, navigation
 * and AI explanation into a single hook.  The screen component just renders
 * the returned state — zero business logic in the JSX tree.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Keyboard } from 'react-native';

import { SHEET_DEFAULT } from '@/src/components/sheets/DraggableSheet';
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
import type { MapType } from '@/src/components/maps/RouteMap.types';
import type { DirectionsRoute, LatLng, PlaceDetails } from '@/src/types/google';

// ── Public interface ────────────────────────────────────────────────────────

export function useHomeScreen() {
  // ── Onboarding ──
  const { status: onboardingStatus, hasAccepted, error: onboardingError, accept } = useOnboarding();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (onboardingStatus === 'ready' && !hasAccepted) setShowOnboarding(true);
  }, [onboardingStatus, hasAccepted]);

  // ── Location ──
  const {
    location,
    error: locationError,
    refresh: refreshLocation,
  } = useCurrentLocation({ enabled: hasAccepted });

  // ── Origin ──
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState(true);
  const originSearch = useAutoPlaceSearch(location);
  const [manualOrigin, setManualOrigin] = useState<PlaceDetails | null>(null);

  // ── Destination ──
  const destSearch = useAutoPlaceSearch(location);
  const [manualDest, setManualDest] = useState<PlaceDetails | null>(null);

  // ── Route selection ──
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [mapPanTo, setMapPanTo] = useState<{ location: LatLng; key: number } | null>(null);
  const [mapType, setMapType] = useState<MapType>('roadmap');
  const [pinMode, setPinMode] = useState<'origin' | 'destination' | null>(null);

  // ── AI ──
  const [showAIModal, setShowAIModal] = useState(false);

  // ── Bottom sheet ──
  const SCREEN_HEIGHT = Dimensions.get('window').height;
  const sheetHeight = useRef(new Animated.Value(SHEET_DEFAULT)).current;
  const sheetHeightRef = useRef(SHEET_DEFAULT);

  // ── Derived origins / destinations ──
  const effectiveOrigin = isUsingCurrentLocation
    ? location
    : manualOrigin?.location ?? originSearch.place?.location ?? null;
  const effectiveDestination = manualDest?.location ?? destSearch.place?.location ?? null;

  // ── Safe routes ──
  const {
    status: safeRoutesStatus,
    routes: safeRoutes,
    safestRoute,
    error: safeRoutesError,
    outOfRange,
    outOfRangeMessage,
    meta: safeRoutesMeta,
  } = useSafeRoutes(effectiveOrigin, effectiveDestination);

  const routes: DirectionsRoute[] = safeRoutes;
  const directionsStatus = safeRoutesStatus;
  const directionsError = safeRoutesError;
  const bestRouteId = safestRoute?.id ?? null;

  // ── Route scores ──
  const routeScores: Record<string, RouteScore> = useMemo(() => {
    const scores: Record<string, RouteScore> = {};
    for (const r of safeRoutes) {
      scores[r.id] = {
        routeId: r.id,
        score: r.safety.score,
        pathfindingScore: r.safety.score,
        label: r.safety.label,
        color: r.safety.color,
        mainRoadRatio: r.safety.mainRoadRatio / 100,
        dataConfidence: 1,
        status: 'done',
      };
    }
    return scores;
  }, [safeRoutes]);

  // ── Effects ──

  // Reset sheet when routes change
  useEffect(() => {
    if (routes.length > 0) {
      Animated.spring(sheetHeight, { toValue: SHEET_DEFAULT, useNativeDriver: false }).start();
      sheetHeightRef.current = SHEET_DEFAULT;
    }
  }, [routes.length]);

