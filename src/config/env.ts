const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';

const hasGoogleMapsApiKey = googleMapsApiKey.length > 0;

if (!hasGoogleMapsApiKey && process.env.NODE_ENV === 'production') {
  // In production we should not ship without a maps key; surface this early.
  console.warn(
    'Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY. Maps features will be disabled until it is set.'
  );
}

export const env = {
  googleMapsApiKey: hasGoogleMapsApiKey ? googleMapsApiKey : null,
  hasGoogleMapsApiKey,
};
