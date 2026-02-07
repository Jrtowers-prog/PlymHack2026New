module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

  return {
    ...config,
    ios: {
      ...config.ios,
      config: {
        ...config.ios?.config,
        googleMapsApiKey,
      },
      infoPlist: {
        ...config.ios?.infoPlist,
        NSLocationWhenInUseUsageDescription:
          'We use your location to show nearby routes and help you navigate safely.',
      },
    },
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: googleMapsApiKey,
        },
      },
      permissions: Array.from(
        new Set([
          ...(config.android?.permissions ?? []),
          'ACCESS_FINE_LOCATION',
          'ACCESS_COARSE_LOCATION',
        ])
      ),
    },
  };
};
