import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { RouteMapProps } from '@/src/components/maps/RouteMap.types';
import { loadGoogleMapsApi } from '@/src/services/googleMaps.web';
import type {
  GoogleMapInstance,
  GoogleMapsApi,
  GoogleMapsEventListener,
  GoogleMarkerInstance,
  GooglePolylineInstance,
} from '@/src/types/googleMapsWeb';

const ROUTE_COLOR = '#4285F4';       // Blue route line
const ROUTE_COLOR_ALT = '#98a2b3';   // Grey for unselected

const MARKER_COLORS: Record<string, string> = {
  crime: '#ef4444',   // red
  shop:  '#22c55e',   // green
  light: '#facc15',   // yellow
};

const MARKER_SCALE = 4; // small dot radius

export const RouteMap = ({
  origin,
  destination,
  routes,
  selectedRouteId,
  safetyMarkers = [],
  routeSegments = [],
  roadLabels = [],
  panTo,
  isNavigating = false,
  navigationLocation,
  navigationHeading,
  onSelectRoute,
  onLongPress,
  onMapPress,
}: RouteMapProps) => {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markersRef = useRef<GoogleMarkerInstance[]>([]);
  const polylinesRef = useRef<GooglePolylineInstance[]>([]);
  const circlesRef = useRef<any[]>([]);
  const listenersRef = useRef<GoogleMapsEventListener[]>([]);
  const [googleMaps, setGoogleMaps] = useState<GoogleMapsApi | null>(null);
  const [hasError, setHasError] = useState(false);

  // Track previous viewport-relevant values so we only re-centre when
  // the actual geography changes, not on marker / segment / label updates.
  const prevOriginRef = useRef<string | null>(null);
  const prevDestRef = useRef<string | null>(null);
  const prevRoutesKeyRef = useRef<string>('');
  const prevSelectedRef = useRef<string | null>(null);

  // Load Google Maps API
  useEffect(() => {
    let active = true;
    loadGoogleMapsApi()
      .then((api: GoogleMapsApi) => { if (active) setGoogleMaps(api); })
      .catch(() => { if (active) setHasError(true); });
    return () => { active = false; };
  }, []);

  // Smooth-pan to a location when panTo prop changes
  const prevPanKeyRef = useRef<number>(-1);
  useEffect(() => {
    if (!panTo || !googleMaps || !mapRef.current) return;
    if (panTo.key === prevPanKeyRef.current) return;
    prevPanKeyRef.current = panTo.key;
    const map = mapRef.current;
    map.panTo(new googleMaps.maps.LatLng(panTo.location.latitude, panTo.location.longitude));
    if ((map.getZoom?.() ?? 10) < 14) map.setZoom(14);
  }, [panTo, googleMaps]);

  // Navigation mode: follow user location + show heading marker
  const wasNavigatingRef = useRef(false);
  const navMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  useEffect(() => {
    if (!googleMaps || !mapRef.current) return;
    const map = mapRef.current;

    // Clean previous nav marker
    if (navMarkerRef.current) {
      navMarkerRef.current.setMap(null);
      navMarkerRef.current = null;
    }

    if (!isNavigating || !navigationLocation) {
      // Reset camera when navigation ends
      if (wasNavigatingRef.current) {
        wasNavigatingRef.current = false;
        (map as any).setTilt?.(0);
        (map as any).setHeading?.(0);
      }
      return;
    }

    wasNavigatingRef.current = true;

    // Create a directional arrow marker for the user
    const heading = navigationHeading ?? 0;
    const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="16" fill="#1570EF" stroke="white" stroke-width="3"/>
      <polygon points="18,6 24,22 18,18 12,22" fill="white" transform="rotate(${heading}, 18, 18)"/>
    </svg>`;

    navMarkerRef.current = new googleMaps.maps.Marker({
      position: new googleMaps.maps.LatLng(navigationLocation.latitude, navigationLocation.longitude),
      map,
      icon: {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(arrowSvg),
        scaledSize: new googleMaps.maps.Size(36, 36),
        anchor: new googleMaps.maps.Point(18, 18),
      } as unknown as string,
      zIndex: 999,
      clickable: false,
    });

    // Navigation camera: 3D tilt, heading rotation, close zoom
    map.panTo(new googleMaps.maps.LatLng(navigationLocation.latitude, navigationLocation.longitude));
    (map as any).setTilt?.(45);
    (map as any).setHeading?.(heading);
    if ((map.getZoom?.() ?? 10) < 18) map.setZoom(18);

    return () => {
      if (navMarkerRef.current) {
        navMarkerRef.current.setMap(null);
        navMarkerRef.current = null;
      }
    };
  }, [googleMaps, isNavigating, navigationLocation, navigationHeading]);

  // Render map contents
  useEffect(() => {
    if (!googleMaps) return;

    if (!mapElementRef.current) {
      const el = document.getElementById('web-map-root');
      if (el instanceof HTMLDivElement) mapElementRef.current = el;
    }
    if (!mapElementRef.current) return;

    const fallback = { latitude: 51.5072, longitude: -0.1276 };
    const center = origin ?? fallback;

    if (!mapRef.current) {
      mapRef.current = new googleMaps.maps.Map(mapElementRef.current, {
        center: new googleMaps.maps.LatLng(center.latitude, center.longitude),
        zoom: 12,
        disableDefaultUI: true,
        clickableIcons: false,
      });
    }

    const map = mapRef.current;

    // Clean up previous elements
    listenersRef.current.forEach((l) => l.remove());
    listenersRef.current = [];
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    circlesRef.current.forEach((c) => c.setMap(null));
    circlesRef.current = [];

    const bounds = new googleMaps.maps.LatLngBounds();
    let hasBounds = false;

    // Origin marker – Google-style blue dot (hidden during navigation — arrow replaces it)
    if (origin && !isNavigating) {
      const pos = new googleMaps.maps.LatLng(origin.latitude, origin.longitude);
      const blueDotSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
        <circle cx="12" cy="12" r="11" fill="#4285F4" opacity="0.25"/>
        <circle cx="12" cy="12" r="7" fill="#4285F4"/>
        <circle cx="12" cy="12" r="3.5" fill="#ffffff"/>
      </svg>`;
      markersRef.current.push(new googleMaps.maps.Marker({
        position: pos,
        map,
        title: 'Your location',
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(blueDotSvg),
          scaledSize: new googleMaps.maps.Size(24, 24),
          anchor: new googleMaps.maps.Point(12, 12),
        } as unknown as string,
        zIndex: 50,
      }));
      bounds.extend(pos);
      hasBounds = true;
    }

    // Destination marker
    if (destination) {
      const pos = new googleMaps.maps.LatLng(destination.latitude, destination.longitude);
      markersRef.current.push(new googleMaps.maps.Marker({ position: pos, map, title: 'Destination' }));
      bounds.extend(pos);
      hasBounds = true;
    }

    // --- Route polylines ---
    // Unselected routes: grey
    for (const route of routes) {
      if (route.id === selectedRouteId) continue;
      const path = route.path.map((p) => new googleMaps.maps.LatLng(p.latitude, p.longitude));
      const polyline = new googleMaps.maps.Polyline({
        path,
        strokeColor: ROUTE_COLOR_ALT,
        strokeOpacity: 0.5,
        strokeWeight: 3,
        map,
        clickable: Boolean(onSelectRoute),
      });
      if (onSelectRoute) {
        const listener = googleMaps.maps.event.addListener(polyline, 'click', () => onSelectRoute(route.id));
        listenersRef.current.push(listener);
      }
      polylinesRef.current.push(polyline);
      path.forEach((p) => bounds.extend(p));
      hasBounds = true;
    }

    // Selected route: safety-coloured segments (or fallback blue)
    // During navigation, split into traveled (black) + remaining (colored)
    const selRoute = routes.find((r) => r.id === selectedRouteId);
    if (selRoute) {
      const isNav = isNavigating && navigationLocation;

      // Find nearest path index to navigation location
      const findNearestIdx = (path: { latitude: number; longitude: number }[], pt: { latitude: number; longitude: number }) => {
        let best = 0, bestD = Infinity;
        for (let i = 0; i < path.length; i++) {
          const dlat = path[i].latitude - pt.latitude;
          const dlng = path[i].longitude - pt.longitude;
          const d = dlat * dlat + dlng * dlng;
          if (d < bestD) { bestD = d; best = i; }
        }
        return best;
      };

      if (isNav && selRoute.path.length > 1) {
        const splitIdx = findNearestIdx(selRoute.path, navigationLocation!);

        // ── Traveled portion → black ──
        if (splitIdx > 0) {
          const traveledCoords = selRoute.path.slice(0, splitIdx + 1).map((p) =>
            new googleMaps.maps.LatLng(p.latitude, p.longitude)
          );
          traveledCoords.push(new googleMaps.maps.LatLng(navigationLocation!.latitude, navigationLocation!.longitude));
          polylinesRef.current.push(new googleMaps.maps.Polyline({
            path: traveledCoords,
            strokeColor: '#1D2939',
            strokeOpacity: 0.7,
            strokeWeight: 7,
            map,
            clickable: false,
          }));
        }

        // ── Remaining portion → safety colors or blue ──
        if (routeSegments.length > 0) {
          for (const seg of routeSegments) {
            const filteredPath: any[] = [];
            let started = false;
            for (const sp of seg.path) {
              if (!started) {
                const spIdx = findNearestIdx(selRoute.path, sp);
                if (spIdx >= splitIdx) started = true;
              }
              if (started) filteredPath.push(new googleMaps.maps.LatLng(sp.latitude, sp.longitude));
            }
            if (filteredPath.length >= 2) {
              polylinesRef.current.push(new googleMaps.maps.Polyline({
                path: filteredPath,
                strokeColor: seg.color,
                strokeOpacity: 0.9,
                strokeWeight: 6,
                map,
                clickable: false,
              }));
            }
          }
        } else {
          const remCoords = [new googleMaps.maps.LatLng(navigationLocation!.latitude, navigationLocation!.longitude)];
          for (let i = splitIdx; i < selRoute.path.length; i++) {
            remCoords.push(new googleMaps.maps.LatLng(selRoute.path[i].latitude, selRoute.path[i].longitude));
          }
          polylinesRef.current.push(new googleMaps.maps.Polyline({
            path: remCoords,
            strokeColor: ROUTE_COLOR,
            strokeOpacity: 0.85,
            strokeWeight: 5,
            map,
            clickable: false,
          }));
        }
      } else {
        // Not navigating — normal rendering
        if (routeSegments.length > 0) {
          for (const seg of routeSegments) {
            const segPath = seg.path.map((p) => new googleMaps.maps.LatLng(p.latitude, p.longitude));
            const polyline = new googleMaps.maps.Polyline({
              path: segPath,
              strokeColor: seg.color,
              strokeOpacity: 0.9,
              strokeWeight: 6,
              map,
              clickable: false,
            });
            polylinesRef.current.push(polyline);
          }
        } else {
          const path = selRoute.path.map((p) => new googleMaps.maps.LatLng(p.latitude, p.longitude));
          const polyline = new googleMaps.maps.Polyline({
            path,
            strokeColor: ROUTE_COLOR,
            strokeOpacity: 0.85,
            strokeWeight: 5,
            map,
            clickable: false,
          });
          polylinesRef.current.push(polyline);
        }
      }
      selRoute.path.forEach((p) => bounds.extend(new googleMaps.maps.LatLng(p.latitude, p.longitude)));
      hasBounds = true;
    }

    // --- Safety markers (small SVG circles) ---
    for (const m of safetyMarkers) {
      const color = MARKER_COLORS[m.kind] ?? '#94a3b8';
      const marker = new googleMaps.maps.Marker({
        position: new googleMaps.maps.LatLng(m.coordinate.latitude, m.coordinate.longitude),
        map,
        title: m.label ?? m.kind,
        icon: {
          path: 0 as unknown as string, // google.maps.SymbolPath.CIRCLE = 0
          scale: MARKER_SCALE,
          fillColor: color,
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 1,
        } as unknown as string,
      });
      markersRef.current.push(marker);
    }

    // --- Road-type labels (small pill tags) ---
    for (const label of roadLabels) {
      const pos = new googleMaps.maps.LatLng(label.coordinate.latitude, label.coordinate.longitude);
      const text = label.displayName.slice(0, 12);
      // Measure approximate width: ~6.5px per char + 16px padding
      const w = Math.round(text.length * 6.5 + 16);
      const h = 18;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
        <rect rx="${h / 2}" ry="${h / 2}" width="${w}" height="${h}" fill="${label.color}" opacity="0.8"/>
        <text x="${w / 2}" y="12.5" text-anchor="middle" fill="white" font-size="9" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,sans-serif" letter-spacing="0.3">${text}</text>
      </svg>`;
      const marker = new googleMaps.maps.Marker({
        position: pos,
        map,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
          scaledSize: new googleMaps.maps.Size(w, h),
          anchor: new googleMaps.maps.Point(w / 2, h / 2),
        } as unknown as string,
        clickable: false,
        zIndex: 30,
      });
      markersRef.current.push(marker);
    }

    // --- Viewport: only move the camera when geography actually changed ---
    const originKey = origin ? `${origin.latitude},${origin.longitude}` : '';
    const destKey = destination ? `${destination.latitude},${destination.longitude}` : '';
    const routesKey = routes.map((r) => r.id).join(',');
    const selectedKey = selectedRouteId ?? '';

    const geographyChanged =
      originKey !== prevOriginRef.current ||
      destKey !== prevDestRef.current ||
      routesKey !== prevRoutesKeyRef.current ||
      selectedKey !== prevSelectedRef.current;

    if (geographyChanged && !isNavigating) {
      prevOriginRef.current = originKey;
      prevDestRef.current = destKey;
      prevRoutesKeyRef.current = routesKey;
      prevSelectedRef.current = selectedKey;

      const hasRoutes = routes.length > 0;
      const hasBothEndpoints = Boolean(origin) && Boolean(destination);
      if (hasBounds && (hasRoutes || hasBothEndpoints)) {
        map.fitBounds(bounds);
        // Cap zoom so fitBounds never zooms in too close
        const listener = googleMaps.maps.event.addListenerOnce(map, 'idle', () => {
          if ((map.getZoom?.() ?? 10) > 16) map.setZoom(16);
        });
        listenersRef.current.push(listener);
      } else if (!mapRef.current) {
        // Only set center on first initialisation — after that, leave
        // the map wherever the user has panned to.
        map.setCenter(new googleMaps.maps.LatLng(center.latitude, center.longitude));
        map.setZoom(12);
      }
    }

    // Long-press (right-click)
    if (onLongPress) {
      const listener = googleMaps.maps.event.addListener(map, 'rightclick', (event) => {
        const target = (event as { latLng?: { lat: () => number; lng: () => number } })?.latLng;
        const pt = target ?? map.getCenter?.();
        if (!pt) return;
        onLongPress({ latitude: pt.lat(), longitude: pt.lng() });
      });
      listenersRef.current.push(listener);
    }

    // Single click / tap
    if (onMapPress) {
      const listener = googleMaps.maps.event.addListener(map, 'click', (event) => {
        const target = (event as { latLng?: { lat: () => number; lng: () => number } })?.latLng;
        if (!target) return;
        onMapPress({ latitude: target.lat(), longitude: target.lng() });
      });
      listenersRef.current.push(listener);
    }
  }, [
    googleMaps,
    origin,
    destination,
    routes,
    selectedRouteId,
    safetyMarkers,
    routeSegments,
    roadLabels,
    onSelectRoute,
    onLongPress,
    onMapPress,
    isNavigating,
    navigationLocation,
  ]);

  return (
    <View style={styles.container}>
      <View nativeID="web-map-root" style={StyleSheet.absoluteFill} />
      {hasError ? (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Map unavailable</Text>
        </View>
      ) : null}
      <View style={styles.attribution}>
        <Text style={styles.attributionText}>© Google Maps</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f4f7' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#667085', fontSize: 14 },
  attribution: {
    position: 'absolute', right: 8, bottom: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.9)',
  },
  attributionText: { fontSize: 10, color: '#475467' },
});

export default RouteMap;
