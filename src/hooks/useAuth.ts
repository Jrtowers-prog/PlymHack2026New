/**
 * useAuth.ts — Authentication hook.
 *
 * Manages magic link login flow, session state, and profile sync.
 * Tracks app version on every login/profile load.
 *
 * Session handling:
 * - Listens for session events (expired / refreshed) from userApi
 * - Proactively refreshes tokens before expiry
 * - Revalidates session on app foreground (phone) / tab focus (web)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  authApi,
  getTokenExpiresAt,
  onSessionChange,
  refreshIfNeeded,
  usageApi,
} from '../services/userApi';

// Read app version from app.json (bundled at build time via expo-constants)
let APP_VERSION = '1.0.0';
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Constants = require('expo-constants');
  APP_VERSION = Constants.default?.expoConfig?.version ?? '1.0.0';
} catch {
  // Fallback
}

/** Detect network vs server errors and return a friendly message */
function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes('network request failed') ||
    m.includes('failed to fetch') ||
    m.includes('econnrefused') ||
    m.includes('networkerror') ||
    m.includes('load failed') ||
    m.includes('timeout')
  );
}

function friendlyError(err: unknown, action: 'send' | 'verify'): string {
  if (isNetworkError(err)) return 'Server is down. Try again in a bit.';
  if (action === 'verify') return 'Invalid or expired code. Try again.';
  return 'Something went wrong. Give it another go.';
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

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Schedule proactive token refresh ──────────────────────────────────────

  const scheduleRefresh = useCallback(async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const expiresAt = await getTokenExpiresAt();
    if (!expiresAt) return;

    // Refresh 2 minutes before expiry, minimum 10s from now
    const refreshIn = Math.max(expiresAt - Date.now() - 2 * 60 * 1000, 10_000);

    refreshTimerRef.current = setTimeout(async () => {
      const ok = await refreshIfNeeded();
      if (ok) {
        scheduleRefresh(); // re-schedule after successful refresh
      }
      // If not ok, the session event listener below handles logout
    }, refreshIn);
  }, []);

  // ─── Load session on mount ─────────────────────────────────────────────────

  const loadSession = useCallback(async () => {
    try {
      const loggedIn = await authApi.isLoggedIn();
      if (!loggedIn) {
        setState((s) => ({ ...s, isLoading: false }));
        return;
      }

      // Proactively refresh if token is close to expiry
      const tokenOk = await refreshIfNeeded();
      if (!tokenOk) {
        // Token expired and refresh failed — already emits 'expired'
        setState({ isLoggedIn: false, isLoading: false, user: null, error: null });
        return;
      }

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

        // Schedule next refresh
        scheduleRefresh();
        return;
      }

      // Profile fetch failed — session is invalid
      setState({ isLoggedIn: false, isLoading: false, user: null, error: null });
    } catch {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, [scheduleRefresh]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // ─── Listen for session events from userApi ────────────────────────────────

  useEffect(() => {
    const unsub = onSessionChange((event) => {
      if (event === 'expired') {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        setState({ isLoggedIn: false, isLoading: false, user: null, error: null });
      } else if (event === 'refreshed') {
        // Token was auto-refreshed — re-schedule next refresh
        scheduleRefresh();
      }
    });
    return unsub;
  }, [scheduleRefresh]);

  // ─── Revalidate on app foreground (phone) / tab focus (web) ────────────────

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Web: listen for tab visibility changes
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          refreshIfNeeded().then((ok) => {
            if (!ok) {
              // Session expired while tab was hidden — handled by event
            } else {
              scheduleRefresh();
            }
          });
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
    } else {
      // Native: listen for app coming to foreground
      const sub = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          refreshIfNeeded().then((ok) => {
            if (ok) scheduleRefresh();
          });
        }
      });
      return () => sub.remove();
    }
  }, [scheduleRefresh]);

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // ─── Auth actions ──────────────────────────────────────────────────────────

  const sendMagicLink = useCallback(async (email: string, name: string) => {
    setState((s) => ({ ...s, error: null, isLoading: true }));
    try {
      await authApi.sendMagicLink(email, name);
      setState((s) => ({ ...s, isLoading: false }));
      return true;
    } catch (err: unknown) {
      const msg = friendlyError(err, 'send');
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

      // Schedule proactive token refresh
      scheduleRefresh();

      return true;
    } catch (err: unknown) {
      const msg = friendlyError(err, 'verify');
      setState((s) => ({ ...s, error: msg, isLoading: false }));
      return false;
    }
  }, [scheduleRefresh]);

  const logout = useCallback(async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
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
