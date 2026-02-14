/**
 * HomeScreen — Main app screen.
 *
 * All business logic lives in useHomeScreen. Each UI section is a
 * standalone component, keeping this file under 200 lines.
 *
 * Android-specific: every overlay is absolutely positioned above the
 * flex-child RouteMap. This is the ONLY reliable z-ordering approach
 * on Android when a WebView (SurfaceView) is involved — no nesting
 * inside the map container.
 */
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AndroidOverlayHost } from '@/src/components/android/AndroidOverlayHost';
import RouteMap from '@/src/components/maps/RouteMap';
import { AIExplanationModal } from '@/src/components/modals/AIExplanationModal';
import { DownloadAppModal } from '@/src/components/modals/DownloadAppModal';
import LoginModal from '@/src/components/modals/LoginModal';
import { OnboardingModal } from '@/src/components/modals/OnboardingModal';
import { NavigationOverlay } from '@/src/components/navigation/NavigationOverlay';
import { RouteList } from '@/src/components/routes/RouteList';
import { RoadTypeBreakdown, SafetyPanel } from '@/src/components/safety/SafetyPanel';
import { SafetyProfileChart } from '@/src/components/safety/SafetyProfileChart';
import { SearchBar } from '@/src/components/search/SearchBar';
import { DraggableSheet, SHEET_DEFAULT, SHEET_MIN } from '@/src/components/sheets/DraggableSheet';
import { AndroidDownloadBanner } from '@/src/components/ui/AndroidDownloadBanner';
import { BuddyButton } from '@/src/components/ui/BuddyButton';
import { JailLoadingAnimation } from '@/src/components/ui/JailLoadingAnimation';
import { useAuth } from '@/src/hooks/useAuth';
import { useContacts } from '@/src/hooks/useContacts';
import { useHomeScreen } from '@/src/hooks/useHomeScreen';
import { useLiveTracking } from '@/src/hooks/useLiveTracking';
import { formatDistance, formatDuration } from '@/src/utils/format';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const h = useHomeScreen();
  const auth = useAuth();
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Only load contacts when logged in
  const { liveContacts } = useContacts(auth.isLoggedIn);

  // Live tracking — auto-register push token on mount, share location during nav
  const live = useLiveTracking();
  const liveStarted = useRef(false);

  // Auto-start live tracking when navigation begins (if logged in with contacts)
  useEffect(() => {
    if (h.nav.state === 'navigating' && auth.isLoggedIn && liveContacts.length > 0 && !liveStarted.current) {
      liveStarted.current = true;
      const dest = h.effectiveDestination;
      live.startTracking({
        destination_lat: dest?.latitude,
        destination_lng: dest?.longitude,
        destination_name: h.destSearch?.place?.name ?? 'Unknown destination',
      });
    }
  }, [h.nav.state, auth.isLoggedIn, liveContacts.length, h.effectiveDestination, h.destSearch?.place?.name, live]);

  // Auto-stop live tracking when navigation ends
  useEffect(() => {
    if (liveStarted.current && (h.nav.state === 'arrived' || h.nav.state === 'idle')) {
      liveStarted.current = false;
      live.stopTracking(h.nav.state === 'arrived' ? 'completed' : 'cancelled');
    }
  }, [h.nav.state, live]);

  const distanceLabel = h.selectedRoute ? `🚶 ${formatDistance(h.selectedRoute.distanceMeters)}` : '--';
  const durationLabel = h.selectedRoute ? formatDuration(h.selectedRoute.durationSeconds) : '--';
  const showSafety = Boolean(h.selectedRoute);
  const hasError = h.directionsStatus === 'error';
  const sheetVisible = (h.routes.length > 0 || h.directionsStatus === 'loading' || hasError) && !h.isNavActive;

  // Category label map for the highlight banner
  const categoryLabels: Record<string, string> = {
    crime: 'Crimes', light: 'Street Lights', cctv: 'CCTV Cameras', shop: 'Open Places',
    bus_stop: 'Transit Stops', dead_end: 'Dead Ends',
  };

  const handleCategoryPress = useCallback((category: string) => {
    h.setHighlightCategory(category);
    // Collapse the sheet so the map markers are fully visible
    h.sheetHeightRef.current = SHEET_MIN;
    Animated.spring(h.sheetHeight, {
      toValue: SHEET_MIN,
      useNativeDriver: false,
      bounciness: 4,
    }).start();
  }, [h.sheetHeight, h.sheetHeightRef, h.setHighlightCategory]);

  const handleClearHighlight = useCallback(() => {
    h.setHighlightCategory(null);
    // Re-expand the sheet
    h.sheetHeightRef.current = SHEET_DEFAULT;
    Animated.spring(h.sheetHeight, {
      toValue: SHEET_DEFAULT,
      useNativeDriver: false,
      bounciness: 4,
    }).start();
  }, [h.sheetHeight, h.sheetHeightRef, h.setHighlightCategory]);

  return (
    <View style={styles.container}>
      {/* ── Map (fills the screen as a flex child) ── */}
      <RouteMap
        origin={h.effectiveOrigin}
        destination={h.effectiveDestination}
        routes={h.routes}
        selectedRouteId={h.selectedRouteId}
        safetyMarkers={h.poiMarkers as any}
        routeSegments={h.routeSegments}
        roadLabels={h.roadLabels}
        panTo={h.mapPanTo}
        isNavigating={h.isNavActive}
        navigationLocation={h.nav.userLocation}
        navigationHeading={h.nav.userHeading}
        mapType={h.mapType}
        highlightCategory={h.highlightCategory}
        onSelectRoute={h.setSelectedRouteId}
        onLongPress={h.handleMapLongPress}
        onMapPress={h.handleMapPress}
      />

      {/*
       * ── Overlay layer ──
       * On Android, AndroidOverlayHost creates a separate compositing layer
       * with high elevation so all UI renders above the native map view.
       * On iOS/web it's a no-op passthrough.
       */}
      <AndroidOverlayHost>
        {/* ── Web: Android download banner ── */}
        <AndroidDownloadBanner />

        {/* ── Pin-mode banner ── */}
        {h.pinMode && (
          <View style={[styles.pinBanner, { bottom: insets.bottom + 12 }]}>
            <View style={styles.pinBannerInner}>
              <Ionicons name="location" size={18} color="#ffffff" />
              <Text style={styles.pinBannerText}>
                Tap anywhere on the map to set your {h.pinMode === 'origin' ? 'starting point' : 'destination'}
              </Text>
            </View>
            <Pressable onPress={() => h.setPinMode(null)} style={styles.pinBannerCancel}>
              <Text style={styles.pinBannerCancelText}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* ── Search bar ── */}
        {!h.isNavActive && (
          <SearchBar
            topInset={insets.top}
            location={h.location}
            isUsingCurrentLocation={h.isUsingCurrentLocation}
            setIsUsingCurrentLocation={h.setIsUsingCurrentLocation}
            originSearch={h.originSearch}
            manualOrigin={h.manualOrigin}
            setManualOrigin={h.setManualOrigin}
            destSearch={h.destSearch}
            manualDest={h.manualDest}
            setManualDest={h.setManualDest}
            pinMode={h.pinMode}
            setPinMode={h.setPinMode}
            onPanTo={h.handlePanTo}
            onClearRoute={h.clearSelectedRoute}
            onSwap={h.swapOriginAndDest}
          />
        )}

        {/* ── Buddy button (QR / contacts) ── */}
        {!h.isNavActive && (
          <View style={{ position: 'absolute', top: insets.top + 120, right: 12, zIndex: 100 }}>
            <BuddyButton
              username={auth.user?.username ?? null}
              userId={auth.user?.id ?? null}
              isLoggedIn={auth.isLoggedIn}
              hasLiveContacts={liveContacts.length > 0}
              onLoginPress={() => setShowLoginModal(true)}
            />
          </View>
        )}

        {/* ── Category highlight banner — shows when user tapped a stat card ── */}
        {h.highlightCategory && (
          <View style={[styles.highlightBanner, { top: insets.top + 120 }]}>
            <Pressable
              style={styles.highlightBannerInner}
              onPress={handleClearHighlight}
              accessibilityRole="button"
              accessibilityLabel="Show all markers"
            >
              <Text style={styles.highlightBannerText}>
                Showing {(categoryLabels[h.highlightCategory] || h.highlightCategory).toLowerCase()} only · tap to view all
              </Text>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </View>
        )}

        {/* ── AI floating button ── */}
        {h.safetyResult && !h.isNavActive && h.routes.length > 0 && (
          <Animated.View
            style={[styles.aiWrap, { bottom: Animated.add(h.sheetHeight, 12), pointerEvents: 'box-none' }]}
          >
            <Pressable
              style={styles.aiButton}
              onPress={() => {
                h.setShowAIModal(true);
                if (h.ai.status === 'idle') h.ai.ask();
              }}
              accessibilityRole="button"
              accessibilityLabel="Why is this the safest route"
            >
              <Ionicons name="sparkles" size={16} color="#ffffff" />
              <Text style={styles.aiText}>Why is this the safest route?</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* ── Bottom sheet ── */}
        <DraggableSheet
          visible={sheetVisible}
          bottomInset={insets.bottom}
          sheetHeight={h.sheetHeight}
          sheetHeightRef={h.sheetHeightRef}
        >
          {/* Header — hide distance/duration when there's only an error */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{hasError && h.routes.length === 0 ? 'Oops!!' : 'Routes'}</Text>
            {!hasError && <Text style={styles.sheetMeta}>{distanceLabel} · {durationLabel}</Text>}
          </View>

          {/* Loading state */}
          {h.directionsStatus === 'loading' && <JailLoadingAnimation />}

          {/* Out-of-range warning */}
          {h.outOfRange && (
            <View style={styles.warningBanner}>
              <Ionicons name="ban-outline" size={20} color="#dc2626" />
              <View style={{ flex: 1 }}>
                <Text style={styles.warningTitle}>Destination out of range</Text>
                <Text style={styles.warningText}>
                  {h.outOfRangeMessage || 'Destination is too far away (max 10 km walking distance).'}
                </Text>
                {h.directionsError?.details?.detail ? (
                  <Text style={styles.warningDetail}>
                    {String(h.directionsError.details.detail)}
                  </Text>
                ) : null}
                <Text style={styles.warningHint}>💡 Try selecting a closer destination, or split your journey into shorter legs.</Text>
              </View>
            </View>
          )}

          {h.directionsError && !h.outOfRange && (
            <View style={[
              styles.warningBanner,
              h.directionsError.code === 'INTERNAL_ERROR' && { backgroundColor: '#fffbeb' },
            ]}>
              <Ionicons
                name={
                  h.directionsError.code === 'NO_ROUTE_FOUND' ? 'git-branch-outline'
                  : h.directionsError.code === 'NO_NEARBY_ROAD' ? 'location-outline'
                  : h.directionsError.code === 'NO_WALKING_NETWORK' ? 'walk-outline'
                  : h.directionsError.code === 'safe_routes_timeout' ? 'time-outline'
                  : h.directionsError.code === 'INTERNAL_ERROR' ? 'cloud-offline-outline'
                  : 'alert-circle'
                }
                size={20}
                color={
                  h.directionsError.code === 'safe_routes_timeout' || h.directionsError.code === 'INTERNAL_ERROR'
                    ? '#d97706' : '#dc2626'
                }
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.warningTitle}>
                  {h.directionsError.code === 'NO_ROUTE_FOUND' ? 'No route found'
                  : h.directionsError.code === 'NO_NEARBY_ROAD' ? 'No road nearby'
                  : h.directionsError.code === 'NO_WALKING_NETWORK' ? 'No walkable roads'
                  : h.directionsError.code === 'safe_routes_timeout' ? 'Request timed out'
                  : h.directionsError.code === 'INTERNAL_ERROR' ? 'Something went wrong'
                  : 'Route error'}
                </Text>
                <Text style={styles.warningText}>{h.directionsError.message}</Text>
                {h.directionsError.details?.detail ? (
                  <Text style={styles.warningDetail}>
                    {String(h.directionsError.details.detail)}
                  </Text>
                ) : null}
                <Text style={styles.warningHint}>
                  {h.directionsError.code === 'NO_ROUTE_FOUND'
                    ? '💡 The two points are probably on separate road networks — try a destination on the same side of any rivers, motorways, or railways.'
                    : h.directionsError.code === 'NO_NEARBY_ROAD'
                      ? '💡 Move the pin closer to a visible street or footpath on the map.'
                      : h.directionsError.code === 'NO_WALKING_NETWORK'
                        ? '💡 This area only has motorways or private roads. Pick a more residential destination.'
                        : h.directionsError.code === 'safe_routes_timeout'
                          ? '💡 Shorter routes compute faster. Try somewhere within 5 km.'
                          : h.directionsError.code === 'INTERNAL_ERROR'
                            ? '💡 This is usually temporary — wait a moment and try again.'
                            : '💡 Try again, or pick a different destination.'}
                </Text>
              </View>
            </View>
          )}

          {/* Route cards + safety panel side-by-side on web */}
          <View style={[styles.routeSafetyRow, Platform.OS === 'web' && styles.routeSafetyRowWeb]}>
            <RouteList
              routes={h.safeRoutes}
              selectedRouteId={h.selectedRouteId}
              onSelectRoute={h.setSelectedRouteId}
            />

            {showSafety && h.safetyResult && h.selectedSafeRoute && (
              <SafetyPanel
                safetyResult={h.safetyResult}
                selectedSafeRoute={h.selectedSafeRoute}
                onCategoryPress={handleCategoryPress}
              />
            )}
          </View>

          {/* Start navigation — full width */}
          {h.selectedRouteId && h.nav.state === 'idle' && (
            <Pressable
              style={styles.startNavButton}
              onPress={Platform.OS === 'web' ? () => setShowDownloadModal(true) : h.nav.start}
              accessibilityRole="button"
              accessibilityLabel="Start navigation"
            >
              <Ionicons name="navigate" size={20} color="#ffffff" />
              <Text style={styles.startNavButtonText}>Start Navigation</Text>
            </Pressable>
          )}

          {/* Road type breakdown — full width */}
          {showSafety &&
            h.selectedSafeRoute &&
            Object.keys(h.selectedSafeRoute.safety.roadTypes).length > 0 && (
              <RoadTypeBreakdown roadTypes={h.selectedSafeRoute.safety.roadTypes} />
            )}

          {/* Safety profile chart */}
          {showSafety &&
            h.selectedSafeRoute?.enrichedSegments &&
            h.selectedSafeRoute.enrichedSegments.length > 1 && (
              <SafetyProfileChart
                segments={h.routeSegments}
                enrichedSegments={h.selectedSafeRoute.enrichedSegments}
                roadNameChanges={h.selectedSafeRoute.routeStats?.roadNameChanges ?? []}
                totalDistance={h.selectedSafeRoute.distanceMeters}
              />
            )}
        </DraggableSheet>

        {/* ── Modals / Overlays ── */}
        <AIExplanationModal
          visible={h.showAIModal}
          ai={h.ai}
          onClose={() => {
            h.setShowAIModal(false);
            h.ai.reset();
          }}
        />

        <OnboardingModal
          visible={h.showOnboarding}
          error={h.onboardingError}
          onAccept={h.handleAcceptOnboarding}
          onDismiss={() => h.setShowOnboarding(false)}
        />

        {Platform.OS !== 'web' && (
          <NavigationOverlay
            nav={h.nav}
            topInset={insets.top}
            bottomInset={insets.bottom}
          />
        )}

        <DownloadAppModal
          visible={showDownloadModal}
          onClose={() => setShowDownloadModal(false)}
        />

        <LoginModal
          visible={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSendMagicLink={auth.sendMagicLink}
          onVerify={auth.verify}
          error={auth.error}
        />
      </AndroidOverlayHost>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
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
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(21, 112, 239, 0.35)' } : {}),
    elevation: 10,
    zIndex: 10,
  },
  pinBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
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
  aiWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 13,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: '#7c3aed',
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)' } : {}),
    elevation: 14,
  },
  aiText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
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
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 2,
  },
  warningText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#dc2626',
  },
  warningDetail: {
    fontSize: 12,
    fontWeight: '400',
    color: '#374151',
    marginTop: 4,
    lineHeight: 17,
  },
  warningHint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  error: {
    fontSize: 14,
    color: '#d92d20',
    paddingVertical: 8,
  },
  startNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#1570ef',
    width: '100%',
  } as any,
  startNavButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  routeSafetyRow: {
    width: '100%',
  },
  routeSafetyRowWeb: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  } as any,
  highlightBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 13,
    alignItems: 'center',
  },
  highlightBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(21, 112, 239, 0.9)',
    maxWidth: 360,
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(0,0,0,0.18)' } : {}),
    elevation: 14,
  } as any,
  highlightBannerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});
