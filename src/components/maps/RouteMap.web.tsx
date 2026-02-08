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
  roadOverlays = [],
  onSelectRoute,
  onLongPress,
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
        zoom: 13,
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

    // Origin marker
    if (origin) {
      const pos = new googleMaps.maps.LatLng(origin.latitude, origin.longitude);
      markersRef.current.push(new googleMaps.maps.Marker({ position: pos, map, title: 'Your location' }));
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

    // --- Road overlays (coloured road type polylines) ---
    for (const overlay of roadOverlays) {
      if (overlay.coordinates.length < 2) continue;
      const path = overlay.coordinates.map((c) => new googleMaps.maps.LatLng(c.latitude, c.longitude));
      const polyline = new googleMaps.maps.Polyline({
        path,
        strokeColor: overlay.color,
        strokeOpacity: 0.7,
        strokeWeight: 4,
        map,
        clickable: false,
      });
      polylinesRef.current.push(polyline);
    }

    // --- Route polylines (blue) ---
    for (const route of routes) {
      const path = route.path.map((p) => new googleMaps.maps.LatLng(p.latitude, p.longitude));
      const isSelected = route.id === selectedRouteId;
      const polyline = new googleMaps.maps.Polyline({
        path,
        strokeColor: isSelected ? ROUTE_COLOR : ROUTE_COLOR_ALT,
        strokeOpacity: isSelected ? 0.85 : 0.5,
        strokeWeight: isSelected ? 5 : 3,
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

    // Fit bounds
    if (hasBounds) {
      map.fitBounds(bounds);
    } else {
      map.setCenter(new googleMaps.maps.LatLng(center.latitude, center.longitude));
      map.setZoom(13);
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
  }, [
    googleMaps,
    origin,
    destination,
    routes,
    selectedRouteId,
    safetyMarkers,
    roadOverlays,
    onSelectRoute,
    onLongPress,
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
