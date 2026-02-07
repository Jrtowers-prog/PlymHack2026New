import { useCallback, useMemo, useState } from 'react';
import { Linking } from 'react-native';

import {
  buildGoogleMapsDirectionsUrl,
  buildStaticMapUrl,
  getDefaultDestination,
} from '@/src/services/navigationService';
import { LatLng } from '@/src/types/location';
import { NavigationError, NavigationState } from '@/src/types/navigation';

const initialState: NavigationState = {
  status: 'idle',
};

type UseNavigationOptions = {
  origin?: LatLng;
};

export const useNavigation = ({ origin }: UseNavigationOptions) => {
  const [state, setState] = useState<NavigationState>(initialState);

  const { destination, destinationError } = useMemo(() => {
    try {
      return { destination: getDefaultDestination(), destinationError: null };
    } catch (error) {
      const message =
        error instanceof NavigationError
          ? error.message
          : 'Navigation is unavailable due to a configuration error.';
      return { destination: null, destinationError: message };
    }
  }, []);

  const previewUrl = useMemo(() => {
    if (!destination) {
      return null;
    }
    const center = origin ?? destination;
    return buildStaticMapUrl(center, destination) ?? null;
  }, [destination, origin]);

  const startNavigation = useCallback(
    async (origin?: LatLng) => {
      if (!destination) {
        setState({ status: 'error', errorMessage: destinationError ?? 'Destination not set.' });
        return;
      }

      setState({ status: 'loading' });

      try {
        const url = buildGoogleMapsDirectionsUrl(destination, origin);
        await Linking.openURL(url);
        setState({ status: 'idle', lastOpenedAt: Date.now() });
      } catch (error) {
        const message =
          error instanceof NavigationError
            ? error.message
            : 'Unable to open navigation. Please try again.';
        setState({ status: 'error', errorMessage: message });
      }
    },
    [destination, destinationError]
  );

  return {
    destination,
    destinationError,
    previewUrl,
    state,
    startNavigation,
  };
};
