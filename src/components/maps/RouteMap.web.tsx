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

  // Load Google Maps API
  useEffect(() => {
    let active = true;
    loadGoogleMapsApi()
      .then((api: GoogleMapsApi) => { if (active) setGoogleMaps(api); })
      .catch(() => { if (active) setHasError(true); });
    return () => { active = false; };
  }, []);

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

    // Origin marker – Google-style blue dot
    if (origin) {
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
    const selRoute = routes.find((r) => r.id === selectedRouteId);
    if (selRoute) {
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
        // No segments yet (still loading) – draw a solid blue line
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

    // --- Road-type labels (text markers at road transitions) ---
    for (const label of roadLabels) {
      const pos = new googleMaps.maps.LatLng(label.coordinate.latitude, label.coordinate.longitude);
      // Create a small label using a custom SVG marker
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="26">
        <rect rx="6" ry="6" width="120" height="26" fill="${label.color}" opacity="0.85"/>
        <text x="60" y="17" text-anchor="middle" fill="white" font-size="11" font-weight="bold" font-family="sans-serif">${label.displayName.slice(0, 18)}</text>
      </svg>`;
      const marker = new googleMaps.maps.Marker({
        position: pos,
        map,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
          scaledSize: new googleMaps.maps.Size(120, 26),
          anchor: new googleMaps.maps.Point(60, 13),
        } as unknown as string,
        clickable: false,
        zIndex: 30,
      });
      markersRef.current.push(marker);
    }

    // Fit bounds – only zoom in when there's a real route or both endpoints
    const hasRoutes = routes.length > 0;
    const hasBothEndpoints = Boolean(origin) && Boolean(destination);
    if (hasBounds && (hasRoutes || hasBothEndpoints)) {
      map.fitBounds(bounds);
      // Cap zoom so fitBounds never zooms in too close
      const listener = googleMaps.maps.event.addListenerOnce(map, 'idle', () => {
        if ((map.getZoom?.() ?? 10) > 16) map.setZoom(16);
      });
      listenersRef.current.push(listener);
    } else {
      map.setCenter(new googleMaps.maps.LatLng(center.latitude, center.longitude));
      map.setZoom(12);
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
