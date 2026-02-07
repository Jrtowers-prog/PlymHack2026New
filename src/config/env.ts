const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

export const env = {
  googleMapsApiKey,
};

export const requireGoogleMapsApiKey = (): string => {
  if (!env.googleMapsApiKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY. TODO: Set it in .env or EAS env vars.'
    );
  }

  return env.googleMapsApiKey;
};
