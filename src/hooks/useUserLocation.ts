import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getCurrentLocation,
  getForegroundPermission,
  requestForegroundPermission,
} from '@/src/services/locationService';
import { LocationError, UserLocationState } from '@/src/types/location';

const initialState: UserLocationState = {
  permission: 'unknown',
  status: 'idle',
};

const mapPermissionStatus = (status: 'granted' | 'denied' | 'undetermined') => {
  if (status === 'granted') {
    return 'granted' as const;
  }
  if (status === 'denied') {
    return 'denied' as const;
  }
  return 'unknown' as const;
};

export const useUserLocation = () => {
  const [state, setState] = useState<UserLocationState>(initialState);
  const isMountedRef = useRef(true);

  const safeSetState = useCallback((next: UserLocationState) => {
    if (isMountedRef.current) {
      setState(next);
    }
  }, []);

  const mergeState = useCallback((partial: Partial<UserLocationState>) => {
    if (isMountedRef.current) {
      setState((prev) => ({ ...prev, ...partial }));
    }
  }, []);

  const refreshLocation = useCallback(async () => {
    mergeState({ status: 'loading', errorMessage: undefined });
    try {
      const coords = await getCurrentLocation();
      mergeState({
        status: 'ready',
        coords,
        updatedAt: Date.now(),
      });
    } catch (error) {
      const message =
        error instanceof LocationError
          ? error.message
          : 'Unable to determine your location.';
      mergeState({ status: 'error', errorMessage: message });
    }
  }, [mergeState]);

  const requestPermissionAndFetch = useCallback(async () => {
    mergeState({ status: 'loading', errorMessage: undefined });
    const permission = await requestForegroundPermission();
    const mapped = mapPermissionStatus(permission.status);

    if (mapped !== 'granted') {
      safeSetState({
        permission: mapped,
        status: 'denied',
        canAskAgain: permission.canAskAgain,
        errorMessage:
          'Location permission is required to center the map and provide navigation.',
      });
      return;
    }

    mergeState({
      permission: 'granted',
      canAskAgain: permission.canAskAgain,
    });
    await refreshLocation();
  }, [mergeState, refreshLocation, safeSetState]);

  useEffect(() => {
    isMountedRef.current = true;
    const bootstrap = async () => {
      const permission = await getForegroundPermission();
      const mapped = mapPermissionStatus(permission.status);

      if (mapped !== 'granted') {
        safeSetState({
          permission: mapped,
          status: mapped === 'denied' ? 'denied' : 'idle',
          canAskAgain: permission.canAskAgain,
        });
        return;
      }

      safeSetState({
        permission: 'granted',
        status: 'idle',
        canAskAgain: permission.canAskAgain,
      });

      await refreshLocation();
    };

    void bootstrap();

    return () => {
      isMountedRef.current = false;
    };
  }, [refreshLocation, safeSetState]);

  return {
    state,
    refreshLocation,
    requestPermissionAndFetch,
  };
};
