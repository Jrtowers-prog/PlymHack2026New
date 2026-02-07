import { env } from '@/src/config/env';
import { LatLng } from '@/src/types/location';
import { NavigationDestination, NavigationError } from '@/src/types/navigation';

const parseLatLng = (raw: string): LatLng | null => {
  const [latRaw, lngRaw] = raw.split(',').map((value) => value.trim());
  if (!latRaw || !lngRaw) {
    return null;
  }

  const latitude = Number(latRaw);
  const longitude = Number(lngRaw);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
};

export const getDefaultDestination = (): NavigationDestination => {
  if (!env.navDestinationRaw) {
    throw new NavigationError(
      'MISSING_DESTINATION',
      'Set EXPO_PUBLIC_NAV_DESTINATION to enable navigation (format: "lat,lng").'
    );
  }

  const coords = parseLatLng(env.navDestinationRaw);
  if (!coords) {
    throw new NavigationError(
      'INVALID_DESTINATION',
      'EXPO_PUBLIC_NAV_DESTINATION must be in the format "lat,lng".'
    );
  }

  return {
    ...coords,
    label: env.navDestinationLabel || 'Destination',
  };
};

const encodeLatLng = (coords: LatLng) =>
  encodeURIComponent(`${coords.latitude},${coords.longitude}`);

export const buildGoogleMapsDirectionsUrl = (
  destination: LatLng,
  origin?: LatLng
): string => {
  const base = 'https://www.google.com/maps/dir/?api=1';
  const originParam = origin ? `&origin=${encodeLatLng(origin)}` : '';
  const destinationParam = `&destination=${encodeLatLng(destination)}`;
  const travelMode = '&travelmode=driving';
  return `${base}${originParam}${destinationParam}${travelMode}`;
};

export const buildStaticMapUrl = (
  center: LatLng,
  destination?: LatLng
): string | null => {
  if (!env.hasGoogleMapsApiKey || !env.googleMapsApiKey) {
    return null;
  }

  const size = '640x360';
  const scale = 2;
  const zoom = 13;
  const centerParam = `center=${encodeLatLng(center)}`;
  const sizeParam = `size=${size}`;
  const scaleParam = `scale=${scale}`;
  const zoomParam = `zoom=${zoom}`;
  const mapTypeParam = 'maptype=roadmap';
  const keyParam = `key=${encodeURIComponent(env.googleMapsApiKey)}`;
  const originMarker = encodeURIComponent(
    `color:0x2563EB|label:O|${center.latitude},${center.longitude}`
  );
  const destinationMarker = destination
    ? encodeURIComponent(
        `color:0xDC2626|label:D|${destination.latitude},${destination.longitude}`
      )
    : null;
  const markersParam = destinationMarker
    ? `markers=${originMarker}&markers=${destinationMarker}`
    : `markers=${originMarker}`;

  return `https://maps.googleapis.com/maps/api/staticmap?${[
    centerParam,
    zoomParam,
    sizeParam,
    scaleParam,
    mapTypeParam,
    markersParam,
    keyParam,
  ].join('&')}`;
};
