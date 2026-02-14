/**
 * userApi.ts — Frontend client for the User Data Service.
 *
 * All Supabase keys stay server-side. The app talks to our
 * Express user-service which proxies to Supabase.
 *
 * Auth tokens are stored in AsyncStorage and attached to every request.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '../config/env';

const BASE = env.userApiUrl;

const AUTH_KEYS = {
  accessToken: 'safenight_access_token',
  refreshToken: 'safenight_refresh_token',
  userId: 'safenight_user_id',
  userEmail: 'safenight_user_email',
};

// ─── Token management ────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(AUTH_KEYS.accessToken);
}

async function storeSession(session: {
  access_token: string;
  refresh_token: string;
  user?: { id: string; email: string };
}): Promise<void> {
  await AsyncStorage.multiSet([
    [AUTH_KEYS.accessToken, session.access_token],
    [AUTH_KEYS.refreshToken, session.refresh_token],
    ...(session.user
      ? [
          [AUTH_KEYS.userId, session.user.id] as [string, string],
          [AUTH_KEYS.userEmail, session.user.email] as [string, string],
        ]
      : []),
  ]);
}

async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(AUTH_KEYS));
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  // If 401, try refreshing the token once
  if (res.status === 401 && token) {
    const refreshToken = await AsyncStorage.getItem(AUTH_KEYS.refreshToken);
    if (refreshToken) {
      const refreshRes = await fetch(`${BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        await storeSession(data);

        // Retry original request with new token
        return fetch(`${BASE}${path}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.access_token}`,
            ...(options.headers || {}),
          },
        });
      } else {
        // Refresh failed — clear session
        await clearSession();
      }
    }
  }

  return res;
}

// ─── Auth API ────────────────────────────────────────────────────────────────

export const authApi = {
  /** Send magic link email */
  async sendMagicLink(email: string, name: string): Promise<{ message: string }> {
    const res = await fetch(`${BASE}/api/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Failed to send magic link');
    }
    return res.json();
  },

  /** Verify OTP token from magic link */
  async verify(
    email: string,
    token: string,
  ): Promise<{ access_token: string; user: { id: string; email: string } }> {
    const res = await fetch(`${BASE}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Verification failed' }));
      throw new Error(err.error || 'Invalid or expired token');
    }
    const data = await res.json();
    await storeSession(data);
    return data;
  },

  /** Get current user profile */
  async getProfile(): Promise<{
    id: string;
    name: string;
    email: string;
    platform: string;
    app_version: string;
    created_at: string;
    last_seen_at: string;
  } | null> {
    const token = await getAccessToken();
    if (!token) return null;

    const res = await authFetch('/api/auth/me');
    if (!res.ok) return null;
    return res.json();
  },

  /** Update profile (name, platform, app_version) */
  async updateProfile(updates: {
    name?: string;
    platform?: string;
    app_version?: string;
  }): Promise<void> {
    await authFetch('/api/auth/update-profile', {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  },

  /** Log out */
  async logout(): Promise<void> {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      await clearSession();
    }
  },

  /** Check if user is logged in (has stored token) */
  async isLoggedIn(): Promise<boolean> {
    const token = await getAccessToken();
    return !!token;
  },

  /** Get stored user info without a network call */
  async getStoredUser(): Promise<{ id: string; email: string } | null> {
    const [id, email] = await AsyncStorage.multiGet([
      AUTH_KEYS.userId,
      AUTH_KEYS.userEmail,
    ]);
    if (id[1] && email[1]) return { id: id[1], email: email[1] };
    return null;
  },
};

// ─── Usage API ───────────────────────────────────────────────────────────────

export const usageApi = {
  /** Track a usage event */
  async track(
    event_type: string,
    value_num?: number | null,
    value_text?: string | null,
  ): Promise<void> {
    try {
      await authFetch('/api/usage/track', {
        method: 'POST',
        body: JSON.stringify({ event_type, value_num, value_text }),
      });
    } catch {
      // Silently fail — usage tracking should never block the user
    }
  },

  /** Get aggregated stats */
  async getStats(): Promise<{
    total_app_opens: number;
    total_route_searches: number;
    total_navigations_started: number;
    total_navigations_completed: number;
    total_navigations_abandoned: number;
    total_distance_km: number;
    completion_rate: number;
  }> {
    const res = await authFetch('/api/usage/stats');
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },

  /** Get recent event history */
  async getHistory(): Promise<
    Array<{
      id: string;
      event_type: string;
      value_num: number | null;
      value_text: string | null;
      created_at: string;
    }>
  > {
    const res = await authFetch('/api/usage/history');
    if (!res.ok) throw new Error('Failed to fetch history');
    return res.json();
  },
};

// ─── Reports API ─────────────────────────────────────────────────────────────

export type ReportCategory =
  | 'poor_lighting'
  | 'unsafe_area'
  | 'obstruction'
  | 'harassment'
  | 'other';

export interface SafetyReport {
  id: string;
  lat: number;
  lng: number;
  category: ReportCategory;
  description: string;
  created_at: string;
  resolved_at?: string;
}

export const reportsApi = {
  /** Submit a safety report */
  async submit(report: {
    lat: number;
    lng: number;
    category: ReportCategory;
    description: string;
  }): Promise<SafetyReport> {
    const res = await authFetch('/api/reports', {
      method: 'POST',
      body: JSON.stringify(report),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Submit failed' }));
      throw new Error(err.error || 'Failed to submit report');
    }
    return res.json();
  },

  /** Get all unresolved reports (public, no auth needed) */
  async getAll(): Promise<SafetyReport[]> {
    const res = await fetch(`${BASE}/api/reports`);
    if (!res.ok) throw new Error('Failed to fetch reports');
    return res.json();
  },

  /** Get reports near a location */
  async getNearby(
    lat: number,
    lng: number,
    radiusKm = 1,
  ): Promise<SafetyReport[]> {
    const res = await fetch(
      `${BASE}/api/reports/nearby?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`,
    );
    if (!res.ok) throw new Error('Failed to fetch nearby reports');
    return res.json();
  },

  /** Get current user's reports */
  async getMine(): Promise<SafetyReport[]> {
    const res = await authFetch('/api/reports/mine');
    if (!res.ok) throw new Error('Failed to fetch your reports');
    return res.json();
  },

  /** Delete own report */
  async delete(id: string): Promise<void> {
    const res = await authFetch(`/api/reports/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Delete failed' }));
      throw new Error(err.error || 'Failed to delete report');
    }
  },
};

// ─── Reviews API ─────────────────────────────────────────────────────────────

export interface Review {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  user_name?: string;
}

export const reviewsApi = {
  /** Submit a review */
  async submit(rating: number, comment: string): Promise<Review> {
    const res = await authFetch('/api/reviews', {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Submit failed' }));
      throw new Error(err.error || 'Failed to submit review');
    }
    return res.json();
  },

  /** Get all reviews (public) */
  async getAll(): Promise<Review[]> {
    const res = await fetch(`${BASE}/api/reviews`);
    if (!res.ok) throw new Error('Failed to fetch reviews');
    return res.json();
  },

  /** Get review summary (avg + count) */
  async getSummary(): Promise<{ average_rating: number; total_reviews: number }> {
    const res = await fetch(`${BASE}/api/reviews/summary`);
    if (!res.ok) throw new Error('Failed to fetch summary');
    return res.json();
  },

  /** Get current user's review */
  async getMine(): Promise<Review | null> {
    const res = await authFetch('/api/reviews/mine');
    if (!res.ok) return null;
    return res.json();
  },

  /** Update own review */
  async update(
    id: string,
    updates: { rating?: number; comment?: string },
  ): Promise<Review> {
    const res = await authFetch(`/api/reviews/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Update failed' }));
      throw new Error(err.error || 'Failed to update review');
    }
    return res.json();
  },

  /** Delete own review */
  async delete(id: string): Promise<void> {
    const res = await authFetch(`/api/reviews/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete review');
  },
};

// ─── Contacts API ────────────────────────────────────────────────────────────

export interface Contact {
  id: string;
  nickname: string;
  user: { id: string; name: string; username: string | null };
  is_live: boolean;
  live_session: {
    id: string;
    current_lat: number;
    current_lng: number;
    destination_name: string | null;
    started_at: string;
    last_update_at: string;
  } | null;
}

export interface PendingContact {
  id: string;
  from: { id: string; name: string; username: string | null };
  created_at: string;
}

export const contactsApi = {
  /** Set or update my unique username (shown in QR code) */
  async setUsername(username: string): Promise<{ username: string }> {
    const res = await authFetch('/api/contacts/username', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed' }));
      throw new Error(err.error || 'Failed to set username');
    }
    return res.json();
  },

  /** Look up a user by username (from QR scan) */
  async lookupUser(
    username: string,
  ): Promise<{ id: string; name: string; username: string }> {
    const res = await authFetch(`/api/contacts/lookup/${encodeURIComponent(username)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Not found' }));
      throw new Error(err.error || 'User not found');
    }
    return res.json();
  },

  /** Send a contact request (after scanning QR) */
  async invite(contactId: string, nickname?: string): Promise<void> {
    const res = await authFetch('/api/contacts/invite', {
      method: 'POST',
      body: JSON.stringify({ contact_id: contactId, nickname: nickname || '' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed' }));
      throw new Error(err.error || 'Failed to send request');
    }
  },

  /** Respond to a pending contact request */
  async respond(
    contactRequestId: string,
    response: 'accepted' | 'rejected' | 'blocked',
  ): Promise<void> {
    const res = await authFetch('/api/contacts/respond', {
      method: 'POST',
      body: JSON.stringify({ contact_request_id: contactRequestId, response }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed' }));
      throw new Error(err.error || 'Failed to respond');
    }
  },

  /** Get all accepted contacts */
  async getAll(): Promise<Contact[]> {
    const res = await authFetch('/api/contacts');
    if (!res.ok) throw new Error('Failed to fetch contacts');
    return res.json();
  },

  /** Get pending incoming requests */
  async getPending(): Promise<PendingContact[]> {
    const res = await authFetch('/api/contacts/pending');
    if (!res.ok) throw new Error('Failed to fetch pending requests');
    return res.json();
  },

  /** Remove a contact */
  async remove(id: string): Promise<void> {
    const res = await authFetch(`/api/contacts/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove contact');
  },
};

// ─── Live Tracking API ───────────────────────────────────────────────────────

export interface LiveSession {
  id: string;
  user_id: string;
  status: 'active' | 'completed' | 'cancelled';
  current_lat: number;
  current_lng: number;
  destination_lat?: number;
  destination_lng?: number;
  destination_name?: string;
  started_at: string;
  last_update_at: string;
  ended_at?: string;
}

export interface WatchResult {
  active: boolean;
  user?: { name: string; username: string | null };
  session?: {
    id: string;
    current_lat: number;
    current_lng: number;
    destination_lat?: number;
    destination_lng?: number;
    destination_name?: string;
    started_at: string;
    last_update_at: string;
  };
}

export const liveApi = {
  /** Start a live session — notifies all contacts */
  async start(params: {
    current_lat: number;
    current_lng: number;
    destination_lat?: number;
    destination_lng?: number;
    destination_name?: string;
  }): Promise<LiveSession> {
    const res = await authFetch('/api/live/start', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed' }));
      throw new Error(err.error || 'Failed to start live session');
    }
    return res.json();
  },

  /** Update location during active session */
  async updateLocation(lat: number, lng: number): Promise<void> {
    try {
      await authFetch('/api/live/update', {
        method: 'POST',
        body: JSON.stringify({ current_lat: lat, current_lng: lng }),
      });
    } catch {
      // Silently fail — location updates should not block the user
    }
  },

  /** End the live session */
  async end(status: 'completed' | 'cancelled' = 'completed'): Promise<void> {
    await authFetch('/api/live/end', {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  /** Get my active session (if any) */
  async getMySession(): Promise<LiveSession | null> {
    const res = await authFetch('/api/live/my-session');
    if (!res.ok) return null;
    return res.json();
  },

  /** Watch a contact's live location (poll every 5s) */
  async watchContact(userId: string): Promise<WatchResult> {
    const res = await authFetch(`/api/live/watch/${userId}`);
    if (!res.ok) throw new Error('Failed to watch contact');
    return res.json();
  },

  /** Register Expo push token with the server */
  async registerPushToken(pushToken: string): Promise<void> {
    try {
      await authFetch('/api/auth/update-profile', {
        method: 'POST',
        body: JSON.stringify({ push_token: pushToken }),
      });
    } catch {
      // Silently fail
    }
  },
};
