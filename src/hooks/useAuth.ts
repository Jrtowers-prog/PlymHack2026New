/**
 * useAuth.ts — Authentication hook.
 *
 * Manages magic link login flow, session state, and profile sync.
 * Tracks app version on every login/profile load.
 */

import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { authApi, usageApi } from '../services/userApi';

// Read app version from app.json (bundled at build time via expo-constants)
let APP_VERSION = '1.0.0';
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Constants = require('expo-constants');
  APP_VERSION = Constants.default?.expoConfig?.version ?? '1.0.0';
} catch {
  // Fallback
}

interface AuthState {
  isLoggedIn: boolean;
  isLoading: boolean;
  user: {
    id: string;
    email: string;
    name: string;
    username: string | null;
    platform: string;
    app_version: string;
  } | null;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isLoggedIn: false,
    isLoading: true,
    user: null,
    error: null,
  });

  // Check existing session on mount
  useEffect(() => {
    (async () => {
      try {
        const loggedIn = await authApi.isLoggedIn();
        if (loggedIn) {
          const profile = await authApi.getProfile();
          if (profile) {
            setState({
              isLoggedIn: true,
              isLoading: false,
              user: {
                id: profile.id,
                email: profile.email,
                name: profile.name,
                username: profile.username ?? null,
                platform: profile.platform,
                app_version: profile.app_version,
              },
              error: null,
            });

            // Sync version + platform
            const platform = Platform.OS;
            if (profile.app_version !== APP_VERSION || profile.platform !== platform) {
              authApi.updateProfile({ app_version: APP_VERSION, platform });
            }

            // Track app open
            usageApi.track('app_open', null, APP_VERSION);
            return;
          }
        }
        setState((s) => ({ ...s, isLoading: false }));
      } catch {
        setState((s) => ({ ...s, isLoading: false }));
      }
    })();
  }, []);

  const sendMagicLink = useCallback(async (email: string, name: string) => {
    setState((s) => ({ ...s, error: null, isLoading: true }));
    try {
      await authApi.sendMagicLink(email, name);
      setState((s) => ({ ...s, isLoading: false }));
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send magic link';
      setState((s) => ({ ...s, error: msg, isLoading: false }));
      return false;
    }
  }, []);

  const verify = useCallback(async (email: string, token: string) => {
    setState((s) => ({ ...s, error: null, isLoading: true }));
    try {
      const data = await authApi.verify(email, token);

      // Fetch full profile
      const profile = await authApi.getProfile();

      setState({
        isLoggedIn: true,
        isLoading: false,
        user: profile
          ? {
              id: profile.id,
              email: profile.email,
              name: profile.name,
              username: profile.username ?? null,
              platform: profile.platform,
              app_version: profile.app_version,
            }
          : {
              id: data.user.id,
              email: data.user.email,
              name: '',
              username: null,
              platform: Platform.OS,
              app_version: APP_VERSION,
            },
        error: null,
      });

      // Sync version + platform
      authApi.updateProfile({
        app_version: APP_VERSION,
        platform: Platform.OS,
      });

      // Track app open
      usageApi.track('app_open', null, APP_VERSION);

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      setState((s) => ({ ...s, error: msg, isLoading: false }));
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setState({
      isLoggedIn: false,
      isLoading: false,
      user: null,
      error: null,
    });
  }, []);

  const updateName = useCallback(async (name: string) => {
    try {
      await authApi.updateProfile({ name });
      setState((s) =>
        s.user ? { ...s, user: { ...s.user, name } } : s,
      );
    } catch {
      // Silent fail
    }
  }, []);

  const updateUsername = useCallback(async (username: string) => {
    try {
      await authApi.updateProfile({ username });
      setState((s) =>
        s.user ? { ...s, user: { ...s.user, username } } : s,
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    ...state,
    sendMagicLink,
    verify,
    logout,
    updateName,
    updateUsername,
  };
}
