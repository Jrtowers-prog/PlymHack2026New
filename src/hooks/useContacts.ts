/**
 * useContacts.ts — Emergency contacts hook.
 *
 * Manages the buddy system: set username, QR pairing,
 * contact requests, and listing contacts with live status.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  authApi,
  contactsApi,
  type Contact,
  type PendingContact,
} from '../services/userApi';

interface ContactsState {
  contacts: Contact[];
  pending: PendingContact[];
  username: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useContacts(enabled: boolean = true) {
  const [state, setState] = useState<ContactsState>({
    contacts: [],
    pending: [],
    username: null,
    isLoading: enabled,
    error: null,
  });

  // Load contacts, pending, and username on mount
  const refresh = useCallback(async () => {
    if (!enabled) return;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const [contacts, pending, profile] = await Promise.all([
        contactsApi.getAll(),
        contactsApi.getPending(),
        authApi.getProfile(),
      ]);
      setState((s) => ({
        ...s,
        contacts,
        pending,
        username: profile?.username ?? s.username,
        isLoading: false,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load contacts';
      setState((s) => ({ ...s, error: msg, isLoading: false }));
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      refresh();
    } else {
      // Reset state when not logged in
      setState({
        contacts: [],
        pending: [],
        username: null,
        isLoading: false,
        error: null,
      });
    }
  }, [enabled, refresh]);

  // Set or update username (for QR code)
  const setUsername = useCallback(async (username: string) => {
    try {
      const result = await contactsApi.setUsername(username);
      setState((s) => ({ ...s, username: result.username }));
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set username';
      setState((s) => ({ ...s, error: msg }));
      return false;
    }
  }, []);

  // Look up a user by username (from QR scan)
  const lookupUser = useCallback(async (username: string) => {
    try {
      return await contactsApi.lookupUser(username);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'User not found';
      setState((s) => ({ ...s, error: msg }));
      return null;
    }
  }, []);

  // Send invite (after QR scan → lookup → confirm)
  const invite = useCallback(
    async (contactId: string, nickname?: string) => {
      try {
        await contactsApi.invite(contactId, nickname);
        await refresh();
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to invite';
        setState((s) => ({ ...s, error: msg }));
        return false;
      }
    },
    [refresh],
  );

  // Accept or reject a pending request
  const respond = useCallback(
    async (
      requestId: string,
      response: 'accepted' | 'rejected' | 'blocked',
    ) => {
      try {
        console.log('[useContacts] Responding to request:', { requestId, response });
        await contactsApi.respond(requestId, response);
        console.log('[useContacts] Response successful, refreshing...');
        await refresh();
        console.log('[useContacts] Refresh complete');
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to respond';
        console.error('[useContacts] Respond error:', msg);
        setState((s) => ({ ...s, error: msg }));
        return false;
      }
    },
    [refresh],
  );

  // Remove a contact
  const removeContact = useCallback(
    async (contactId: string) => {
      try {
        await contactsApi.remove(contactId);
        setState((s) => ({
          ...s,
          contacts: s.contacts.filter((c) => c.id !== contactId),
        }));
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to remove';
        setState((s) => ({ ...s, error: msg }));
        return false;
      }
    },
    [],
  );

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return {
    ...state,
    refresh,
    setUsername,
    lookupUser,
    invite,
    respond,
    removeContact,
    clearError,
    liveContacts: state.contacts.filter((c) => c.is_live),
  };
}
