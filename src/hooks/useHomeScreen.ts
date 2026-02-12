/**
 * useHomeScreen — Centralised business logic for the Home screen.
 *
 * Pulls together onboarding, location, search, routing, safety, navigation
 * and AI explanation into a single hook.  The screen component just renders
 * the returned state — zero business logic in the JSX tree.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Keyboard } from 'react-native';

import type { MapType } from '@/src/components/maps/RouteMap.types';
import { SHEET_DEFAULT } from '@/src/components/sheets/DraggableSheet';
import { useAIExplanation } from '@/src/hooks/useAIExplanation';
import type { RouteScore } from '@/src/hooks/useAllRoutesSafety';
import { useAutoPlaceSearch } from '@/src/hooks/useAutoPlaceSearch';
import { useCurrentLocation } from '@/src/hooks/useCurrentLocation';
import { useNavigation } from '@/src/hooks/useNavigation';
import { useOnboarding } from '@/src/hooks/useOnboarding';
import { useSafeRoutes } from '@/src/hooks/useSafeRoutes';
import { reverseGeocode } from '@/src/services/openStreetMap';
import type { SafeRoute } from '@/src/services/safeRoutes';
import type { SafetyMapResult } from '@/src/services/safetyMapData';
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
  const [highlightCategory, setHighlightCategory] = useState<string | null>(null);

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

  // Clear manual dest when user starts typing
  useEffect(() => {
    if (destSearch.query.length > 0) setManualDest(null);
  }, [destSearch.query]);

  // Pan to location on first fix
  useEffect(() => {
    if (location && isUsingCurrentLocation) {
      setMapPanTo({ location, key: Date.now() });
    }
  }, [location !== null]);

  // Auto-select safest route
  useEffect(() => {
    if (bestRouteId) setSelectedRouteId(bestRouteId);
    else if (routes.length > 0) setSelectedRouteId(routes[0].id);
  }, [routes, bestRouteId]);

  // ── Selected route derivations ──
  const selectedRoute = useMemo<DirectionsRoute | null>(
    () => routes.find((r) => r.id === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );

  const selectedSafeRoute = useMemo<SafeRoute | null>(
    () => (safeRoutes as SafeRoute[]).find((r) => r.id === selectedRouteId) ?? null,
    [safeRoutes, selectedRouteId],
  );

  // ── POI markers ──
  const poiMarkers = useMemo(() => {
    const pois = selectedSafeRoute?.routePOIs;
    if (!pois) return [];
    const markers: Array<{ id: string; kind: string; coordinate: { latitude: number; longitude: number }; label: string }> = [];
    pois.cctv?.forEach((c, i) => markers.push({ id: `poi-cctv-${i}`, kind: 'cctv', coordinate: { latitude: c.lat, longitude: c.lng }, label: 'CCTV Camera' }));
    pois.transit?.forEach((t, i) => markers.push({ id: `poi-transit-${i}`, kind: 'bus_stop', coordinate: { latitude: t.lat, longitude: t.lng }, label: 'Transit Stop' }));
    pois.deadEnds?.forEach((d, i) => markers.push({ id: `poi-deadend-${i}`, kind: 'dead_end', coordinate: { latitude: d.lat, longitude: d.lng }, label: 'Dead End' }));
    pois.lights?.forEach((l, i) => markers.push({ id: `poi-light-${i}`, kind: 'light', coordinate: { latitude: l.lat, longitude: l.lng }, label: 'Street Light' }));
    pois.places?.forEach((p: any, i: number) => {
      const name = p.name || p.amenity || 'Place';
      let status = ' · hours unknown';
      if (p.open === true) status = p.nextChange ? ` · Open, ${p.nextChange}` : ' · Open';
      else if (p.open === false) status = p.nextChange ? ` · Closed, ${p.nextChange}` : ' · Closed';
      markers.push({ id: `poi-place-${i}`, kind: 'shop', coordinate: { latitude: p.lat, longitude: p.lng }, label: `${name}${status}` });
    });
    pois.crimes?.forEach((cr, i) => markers.push({ id: `poi-crime-${i}`, kind: 'crime', coordinate: { latitude: cr.lat, longitude: cr.lng }, label: cr.category || 'Crime' }));
    return markers;
  }, [selectedSafeRoute]);

  // ── Filtered markers when a category is highlighted ──
  const displayMarkers = useMemo(() => {
    if (!highlightCategory) return poiMarkers;
    return poiMarkers.filter((m) => m.kind === highlightCategory);
  }, [poiMarkers, highlightCategory]);

  // ── Safety result derived from SafeRoute ──
  const safetyResult = useMemo<SafetyMapResult | null>(() => {
    if (!selectedSafeRoute) return null;
    const s = selectedSafeRoute.safety;
    const stats = selectedSafeRoute.routeStats;
    const pois = selectedSafeRoute.routePOIs;
    const segs = selectedSafeRoute.enrichedSegments ?? [];

    // Count lit vs unlit segments for the lighting ratio
    let litSegments = 0;
    let unlitSegments = 0;
    for (const seg of segs) {
      if (seg.lightScore > 0.5) litSegments++;
      else unlitSegments++;
    }

    // Use actual POI counts so every number matches what's on the map
    const crimeCount = pois?.crimes?.length ?? 0;
    const lightCount = pois?.lights?.length ?? 0;
    const openPlaceCount = pois?.places?.length ?? 0;
    const cctvCount = pois?.cctv?.length ?? 0;

    return {
      markers: [],
      roadOverlays: [],
      roadLabels: [],
      routeSegments: [],
      crimeCount,
      streetLights: lightCount,
      cctvCount,
      litRoads: litSegments,
      unlitRoads: unlitSegments,
      openPlaces: openPlaceCount,
      busStops: pois?.transit?.length ?? 0,
      safetyScore: s.score,
      safetyLabel: s.label,
      safetyColor: s.color,
      mainRoadRatio: s.mainRoadRatio / 100,
      pathfindingScore: s.score,
      dataConfidence: 1,
    };
  }, [selectedSafeRoute]);

  // ── Route segments for coloured overlay ──
  const routeSegments = useMemo(() => {
    if (!selectedSafeRoute?.enrichedSegments) return [];
    return selectedSafeRoute.enrichedSegments.map((seg, i) => ({
      id: `seg-${i}`,
      path: [seg.startCoord, seg.endCoord],
      color: seg.color,
      score: seg.safetyScore,
    }));
  }, [selectedSafeRoute]);

  // ── Road labels ──
  const roadLabels = useMemo(() => {
    if (!selectedSafeRoute?.enrichedSegments) return [];
    const seen = new Set<string>();
    const labels: Array<{ id: string; coordinate: { latitude: number; longitude: number }; roadType: string; displayName: string; color: string }> = [];
    const typeColors: Record<string, string> = {
      primary: '#2563eb', secondary: '#3b82f6', tertiary: '#60a5fa',
      residential: '#64748b', footway: '#f59e0b', path: '#f59e0b',
      pedestrian: '#34d399', service: '#94a3b8',
    };
    for (const seg of selectedSafeRoute.enrichedSegments) {
      if (seg.roadName && !seen.has(seg.roadName)) {
        seen.add(seg.roadName);
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

  // ── Navigation ──
  const nav = useNavigation(selectedRoute);
  const isNavActive = nav.state === 'navigating' || nav.state === 'off-route';

  // ── AI Explanation ──
  const ai = useAIExplanation(safetyResult, routes, routeScores, bestRouteId, safeRoutes as SafeRoute[]);

  // ── Map interaction handlers ──
  const resolvePin = useCallback(async (coordinate: LatLng): Promise<PlaceDetails> => {
    const fallback: PlaceDetails = {
      placeId: `pin:${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`,
      name: 'Dropped pin',
      location: coordinate,
    };
    const resolved = await reverseGeocode(coordinate);
    return resolved ?? fallback;
  }, []);

  const handleMapPress = useCallback(
    async (coordinate: LatLng) => {
      Keyboard.dismiss();
      if (isNavActive) return;

      if (pinMode === 'origin') {
        setIsUsingCurrentLocation(false);
        originSearch.clear();
        // Reset destination so the user picks fresh start → end
        destSearch.clear();
        setManualDest(null);
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
    },
    [isNavActive, pinMode, originSearch, destSearch, resolvePin],
  );

  const handleMapLongPress = useCallback(
    async (coordinate: LatLng) => {
      Keyboard.dismiss();
      if (isNavActive) return;
      const pin = await resolvePin(coordinate);
      setManualDest(pin);
      destSearch.clear();
      setSelectedRouteId(null);
    },
    [isNavActive, destSearch, resolvePin],
  );

  const handleAcceptOnboarding = useCallback(async () => {
    await accept();
    setShowOnboarding(false);
    refreshLocation();
  }, [accept, refreshLocation]);

  const handlePanTo = useCallback((loc: LatLng) => {
    setMapPanTo({ location: loc, key: Date.now() });
  }, []);

  const clearSelectedRoute = useCallback(() => {
    setSelectedRouteId(null);
  }, []);

  /** Swap origin and destination (like Google Maps). */
  const swapOriginAndDest = useCallback(() => {
    // Snapshot current effective values
    const prevOriginIsGPS = isUsingCurrentLocation;
    const prevOriginPlace = originSearch.place;
    const prevManualOrigin = manualOrigin;
    const prevDestPlace = destSearch.place;
    const prevManualDest = manualDest;

    // Destination → new origin
    if (prevManualDest) {
      setManualOrigin(prevManualDest);
      setIsUsingCurrentLocation(false);
      originSearch.clear();
    } else if (prevDestPlace) {
      setManualOrigin({
        placeId: prevDestPlace.placeId ?? `swap-${Date.now()}`,
        name: prevDestPlace.name,
        location: prevDestPlace.location,
      });
      setIsUsingCurrentLocation(false);
      originSearch.clear();
    } else {
      // No destination was set — nothing to swap into origin
      return;
    }

    // Origin → new destination
    if (prevManualOrigin) {
      setManualDest(prevManualOrigin);
      destSearch.clear();
    } else if (!prevOriginIsGPS && prevOriginPlace) {
      setManualDest({
        placeId: prevOriginPlace.placeId ?? `swap-${Date.now()}`,
        name: prevOriginPlace.name,
        location: prevOriginPlace.location,
      });
      destSearch.clear();
    } else if (prevOriginIsGPS && location) {
      // GPS was origin — create a pin from current coords
      setManualDest({
        placeId: `gps-${Date.now()}`,
        name: 'Your location',
        location,
      });
      destSearch.clear();
      setIsUsingCurrentLocation(false);
    } else {
      setManualDest(null);
      destSearch.clear();
    }

    setSelectedRouteId(null);
  }, [isUsingCurrentLocation, originSearch, manualOrigin, destSearch, manualDest, location]);

  return {
    // Onboarding
    showOnboarding,
    setShowOnboarding,
    onboardingError,
    handleAcceptOnboarding,

    // Location
    location,

    // Origin
    isUsingCurrentLocation,
    setIsUsingCurrentLocation,
    originSearch,
    manualOrigin,
    setManualOrigin,

    // Destination
    destSearch,
    manualDest,
    setManualDest,

    // Routing
    routes,
    safeRoutes: safeRoutes as SafeRoute[],
    selectedRouteId,
    setSelectedRouteId,
    selectedRoute,
    selectedSafeRoute,
    directionsStatus,
    directionsError,
    outOfRange,
    outOfRangeMessage,

    // Map
    effectiveOrigin,
    effectiveDestination,
    mapPanTo,
    mapType,
    setMapType,
    pinMode,
    setPinMode,
    handleMapPress,
    handleMapLongPress,
    handlePanTo,
    clearSelectedRoute,
    swapOriginAndDest,

    // Safety
    safetyResult,
    poiMarkers: displayMarkers,
    routeSegments,
    roadLabels,
    highlightCategory,
    setHighlightCategory,

    // Sheet
    sheetHeight,
    sheetHeightRef,

    // Navigation
    nav,
    isNavActive,

    // AI
    ai,
    showAIModal,
    setShowAIModal,
  };
}
