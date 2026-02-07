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

const PRIMARY_COLOR = '#1570ef';
const SECONDARY_COLOR = '#98a2b3';

export const RouteMap = ({
  origin,
  destination,
  routes,
  selectedRouteId,
  onSelectRoute,
}: RouteMapProps) => {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const markersRef = useRef<GoogleMarkerInstance[]>([]);
  const polylinesRef = useRef<GooglePolylineInstance[]>([]);
  const listenersRef = useRef<GoogleMapsEventListener[]>([]);
  const [googleMaps, setGoogleMaps] = useState<GoogleMapsApi | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isActive = true;

    loadGoogleMapsApi()
      .then((api: GoogleMapsApi) => {
        if (!isActive) {
          return;
        }

        setGoogleMaps(api);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setHasError(true);
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!googleMaps) {
      return;
    }

    if (!mapElementRef.current) {
      const element = document.getElementById('web-map-root');
      if (element instanceof HTMLDivElement) {
        mapElementRef.current = element;
      }
    }

    if (!mapElementRef.current) {
      return;
    }

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
    listenersRef.current.forEach((listener) => listener.remove());
    listenersRef.current = [];
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach((polyline) => polyline.setMap(null));
    polylinesRef.current = [];

    const bounds = new googleMaps.maps.LatLngBounds();
    let hasBounds = false;

    if (origin) {
      const position = new googleMaps.maps.LatLng(origin.latitude, origin.longitude);
      markersRef.current.push(
        new googleMaps.maps.Marker({
          position,
          map,
          title: 'Your location',
        })
      );
      bounds.extend(position);
      hasBounds = true;
    }

    if (destination) {
      const position = new googleMaps.maps.LatLng(destination.latitude, destination.longitude);
      markersRef.current.push(
        new googleMaps.maps.Marker({
          position,
          map,
          title: 'Destination',
        })
      );
      bounds.extend(position);
      hasBounds = true;
    }

    routes.forEach((route) => {
      const path = route.path.map(
        (point) => new googleMaps.maps.LatLng(point.latitude, point.longitude)
      );
      const isSelected = route.id === selectedRouteId;
      const polyline = new googleMaps.maps.Polyline({
        path,
        strokeColor: isSelected ? PRIMARY_COLOR : SECONDARY_COLOR,
        strokeOpacity: 1,
        strokeWeight: isSelected ? 6 : 4,
        map,
        clickable: Boolean(onSelectRoute),
      });

      if (onSelectRoute) {
        const listener = googleMaps.maps.event.addListener(polyline, 'click', () => {
          onSelectRoute(route.id);
        });
        listenersRef.current.push(listener);
      }

      polylinesRef.current.push(polyline);
      path.forEach((point) => bounds.extend(point));
      hasBounds = true;
    });

    if (hasBounds) {
      map.fitBounds(bounds);
    } else {
      map.setCenter(new googleMaps.maps.LatLng(center.latitude, center.longitude));
      map.setZoom(13);
    }
  }, [googleMaps, origin, destination, routes, selectedRouteId, onSelectRoute]);

  return (
    <View style={styles.container}>
      <View nativeID="web-map-root" style={StyleSheet.absoluteFill} />
      {hasError ? (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Map unavailable</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f4f7',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#667085',
    fontSize: 14,
  },
});

export default RouteMap;
