import { Asset } from 'expo-asset';
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
const CRIME_ICON_URL = Asset.fromModule(
  require('../../../assets/images/crime.png')
).uri;
const LIGHT_ICON_URL = 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png';
const MARKER_SPREAD_METERS = 4;

export const RouteMap = ({
  origin,
  destination,
  routes,
  selectedRouteId,
  onSelectRoute,
  crimePoints = [],
  openPlaces = [],
  lightPoints = [],
}: RouteMapProps) => {
  const spreadCrimePoints = (points: RouteMapProps['crimePoints']) => {
    const counts = new Map<string, number>();

    points.forEach((crime) => {
      const key = `${crime.location.latitude.toFixed(6)},${crime.location.longitude.toFixed(6)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    const indexTracker = new Map<string, number>();

    return points.map((crime) => {
      const { latitude, longitude } = crime.location;
      const key = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
      const total = counts.get(key) ?? 1;
      const index = indexTracker.get(key) ?? 0;
      indexTracker.set(key, index + 1);

      if (total === 1) {
        return crime;
      }

      const angle = (2 * Math.PI * index) / total;
      const metersPerDegreeLat = 111320;
      const metersPerDegreeLng = 111320 * Math.cos((latitude * Math.PI) / 180);
      const latOffset = (MARKER_SPREAD_METERS * Math.sin(angle)) / metersPerDegreeLat;
      const lngOffset = (MARKER_SPREAD_METERS * Math.cos(angle)) / metersPerDegreeLng;

      return {
        ...crime,
        location: {
          latitude: latitude + latOffset,
          longitude: longitude + lngOffset,
        },
      };
    });
  };
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

    openPlaces.forEach((place) => {
      const position = new googleMaps.maps.LatLng(
        place.location.latitude,
        place.location.longitude
      );
      markersRef.current.push(
        new googleMaps.maps.Marker({
          position,
          map,
          title: place.name ?? 'Open place',
          icon: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
        })
      );
      bounds.extend(position);
      hasBounds = true;
    });

    lightPoints.forEach((point, index) => {
      const position = new googleMaps.maps.LatLng(point.latitude, point.longitude);
      markersRef.current.push(
        new googleMaps.maps.Marker({
          position,
          map,
          title: 'Street light',
          icon: {
            url: LIGHT_ICON_URL,
            scaledSize: new googleMaps.maps.Size(16, 16),
          },
        })
      );
      bounds.extend(position);
      hasBounds = true;
    });

    spreadCrimePoints(crimePoints).forEach((crime, index) => {
      const position = new googleMaps.maps.LatLng(
        crime.location.latitude,
        crime.location.longitude
      );
      markersRef.current.push(
        new googleMaps.maps.Marker({
          position,
          map,
          title: crime.category,
          icon: {
            url: CRIME_ICON_URL,
            scaledSize: new googleMaps.maps.Size(28, 28),
          },
        })
      );
      bounds.extend(position);
      hasBounds = true;
    });

    if (hasBounds) {
      map.fitBounds(bounds);
    } else {
      map.setCenter(new googleMaps.maps.LatLng(center.latitude, center.longitude));
      map.setZoom(13);
    }
  }, [
    googleMaps,
    origin,
    destination,
    routes,
    selectedRouteId,
    onSelectRoute,
    openPlaces,
    crimePoints,
    lightPoints,
  ]);

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
