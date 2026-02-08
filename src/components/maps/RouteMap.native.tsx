import { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import type { RouteMapProps } from '@/src/components/maps/RouteMap.types';

const PRIMARY_COLOR = '#1570ef';
const SECONDARY_COLOR = '#98a2b3';
const CRIME_ICON = require('../../../assets/images/crime.png');
const MARKER_SPREAD_METERS = 4;

const getRouteColor = (isSelected: boolean): string =>
  isSelected ? PRIMARY_COLOR : SECONDARY_COLOR;

const toKey = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(6)},${longitude.toFixed(6)}`;

const spreadCrimePoints = (points: RouteMapProps['crimePoints']) => {
  const counts = new Map<string, number>();

  points.forEach((crime) => {
    const key = toKey(crime.location.latitude, crime.location.longitude);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const indexTracker = new Map<string, number>();

  return points.map((crime) => {
    const { latitude, longitude } = crime.location;
    const key = toKey(latitude, longitude);
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
  const region = useMemo(() => {
    const fallback = { latitude: 51.5072, longitude: -0.1276 };
    const center = origin ?? fallback;

    return {
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [origin]);

  return (
    <View style={styles.container}>
      <MapView style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE} initialRegion={region}>
        {origin ? (
          <Marker coordinate={origin} title="Your location" pinColor={PRIMARY_COLOR} />
        ) : null}
        {destination ? (
          <Marker coordinate={destination} title="Destination" pinColor="#d92d20" />
        ) : null}
        {routes.map((route) => {
          const isSelected = route.id === selectedRouteId;

          return (
            <Polyline
              key={route.id}
              coordinates={route.path}
              strokeColor={getRouteColor(isSelected)}
              strokeWidth={isSelected ? 6 : 4}
              tappable
              onPress={() => onSelectRoute?.(route.id)}
            />
          );
        })}
        {spreadCrimePoints(crimePoints).map((crime, index) => (
          <Marker
            key={`crime-${crime.id ?? index}`}
            coordinate={crime.location}
            title={crime.category}
          >
            <Image source={CRIME_ICON} style={styles.crimeIcon} />
          </Marker>
        ))}
        {openPlaces.map((place) => (
          <Marker
            key={`place-${place.placeId}`}
            coordinate={place.location}
            title={place.name ?? 'Open place'}
            pinColor="#12b76a"
          />
        ))}
        {lightPoints.map((point, index) => (
          <Marker
            key={`light-${index}`}
            coordinate={point}
            title="Street light"
          >
            <View style={styles.lightMarker} />
          </Marker>
        ))}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f4f7',
  },
  crimeIcon: {
    width: 28,
    height: 28,
  },
  lightMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#facc15',
    borderWidth: 1,
    borderColor: '#ca8a04',
  },
});

export default RouteMap;
