module.exports = ({ config }) => {
  return {
    ...config,
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        NSLocationWhenInUseUsageDescription:
          'We use your location to show nearby routes and help you navigate safely.',
      },
    },
    android: {
      ...config.android,
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
