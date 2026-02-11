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
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AndroidOverlayHost } from '@/src/components/android/AndroidOverlayHost';
import { MapTypeControl } from '@/src/components/maps/MapTypeControl';
import RouteMap from '@/src/components/maps/RouteMap';
import { AIExplanationModal } from '@/src/components/modals/AIExplanationModal';
import { OnboardingModal } from '@/src/components/modals/OnboardingModal';
import { NavigationOverlay } from '@/src/components/navigation/NavigationOverlay';
import { RouteList } from '@/src/components/routes/RouteList';
import { SafetyPanel } from '@/src/components/safety/SafetyPanel';
import { SafetyProfileChart } from '@/src/components/safety/SafetyProfileChart';
import { SearchBar } from '@/src/components/search/SearchBar';
import { DraggableSheet } from '@/src/components/sheets/DraggableSheet';
import { JailLoadingAnimation } from '@/src/components/ui/JailLoadingAnimation';
import { useHomeScreen } from '@/src/hooks/useHomeScreen';
import { formatDistance, formatDuration } from '@/src/utils/format';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const h = useHomeScreen();

  const distanceLabel = h.selectedRoute ? `🚶 ${formatDistance(h.selectedRoute.distanceMeters)}` : '--';
  const durationLabel = h.selectedRoute ? formatDuration(h.selectedRoute.durationSeconds) : '--';
  const showSafety = Boolean(h.selectedRoute);
  const sheetVisible = Platform.OS === 'android' ? true : ((h.routes.length > 0 || h.directionsStatus === 'loading') && !h.isNavActive); // TEMP: always visible on Android

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
        {/* ── Map type toggle ── */}
        {!h.isNavActive && <MapTypeControl mapType={h.mapType} onMapTypeChange={h.setMapType} />}

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
          />
        )}

        {/* ── AI floating button ── */}
        {h.safetyResult && !h.isNavActive && h.routes.length > 0 && (
          <Animated.View
            style={[styles.aiWrap, { bottom: Animated.add(h.sheetHeight, 12) }]}
            pointerEvents="box-none"
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
          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Routes</Text>
            <Text style={styles.sheetMeta}>{distanceLabel} · {durationLabel}</Text>
          </View>

          {/* Loading state */}
          {h.directionsStatus === 'loading' && <JailLoadingAnimation />}

          {/* Out-of-range warning */}
          {h.outOfRange && (
            <View style={styles.warningBanner}>
              <Ionicons name="alert-circle" size={18} color="#dc2626" />
              <Text style={styles.warningText}>
                {h.outOfRangeMessage || 'Destination is out of range (max 20 km).'}
              </Text>
            </View>
          )}

          {h.directionsError && !h.outOfRange && (
            <Text style={styles.error}>{h.directionsError.message}</Text>
          )}

          {/* Route cards + safety panel side-by-side on web */}
          <View style={[styles.routeSafetyRow, Platform.OS === 'web' && styles.routeSafetyRowWeb]}>
            <RouteList
              routes={h.safeRoutes}
              selectedRouteId={h.selectedRouteId}
              onSelectRoute={h.setSelectedRouteId}
              navState={h.nav.state}
              onStartNav={h.nav.start}
            />

            {showSafety && h.safetyResult && h.selectedSafeRoute && (
              <SafetyPanel safetyResult={h.safetyResult} selectedSafeRoute={h.selectedSafeRoute} />
            )}
          </View>

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

        <NavigationOverlay
          nav={h.nav}
          topInset={insets.top}
          bottomInset={insets.bottom}
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
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
  },
  warningText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#dc2626',
  },
  error: {
    fontSize: 14,
    color: '#d92d20',
    paddingVertical: 8,
  },
  routeSafetyRow: {},
  routeSafetyRowWeb: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  } as any,
});
