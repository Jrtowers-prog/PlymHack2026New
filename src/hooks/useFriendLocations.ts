/**
 * useFriendLocations — Poll live contact positions for map display.
 *
 * When enabled, fetches the full contacts list every 10 seconds and
 * extracts lat/lng + name from those who have an active live session.
 * Returns an array of FriendMarker objects ready for the map.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { contactsApi } from '../services/userApi';

export interface FriendMarker {
  userId: string;
  name: string;
  lat: number;
  lng: number;
  destinationName?: string;
}

const POLL_INTERVAL = 10_000; // 10 seconds

export function useFriendLocations(enabled: boolean): FriendMarker[] {
  const [friends, setFriends] = useState<FriendMarker[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const contacts = await contactsApi.getAll();
      const live = contacts
        .filter((c) => c.is_live && c.live_session)
        .map((c) => ({
          userId: c.user.id,
          name: c.user.name || c.nickname || 'Friend',
          lat: c.live_session!.current_lat,
          lng: c.live_session!.current_lng,
          destinationName: c.live_session!.destination_name ?? undefined,
        }));
      setFriends(live);
    } catch {
      // Silently fail — friend locations are supplementary
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setFriends([]);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial fetch
    poll();

    // Poll at regular intervals
    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, poll]);

  return friends;
}
