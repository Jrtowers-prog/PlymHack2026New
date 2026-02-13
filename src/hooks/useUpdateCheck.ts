/**
 * useUpdateCheck — Checks GitHub Releases for a newer APK build.
 *
 * Compares the app's build timestamp (injected at CI time via
 * EXPO_PUBLIC_BUILD_TIMESTAMP) against the latest GitHub Release's
 * published_at date. Shows an update prompt if a newer version exists.
 *
 * Only runs on Android (sideloaded APK). Web + iOS skip the check.
 */
import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

const REPO = 'Jrtowers-prog/PlymHack2026New';
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/tags/latest`;
const APK_URL = `https://github.com/${REPO}/releases/download/latest/SafeNightHome.apk`;
const IPA_URL = `https://github.com/${REPO}/releases/download/latest/SafeNightHome.ipa`;

// Injected at build time by CI; falls back to empty string in dev
const BUILD_TIMESTAMP = process.env.EXPO_PUBLIC_BUILD_TIMESTAMP ?? '';

export interface UpdateInfo {
  /** Whether an update is available */
  available: boolean;
  /** Dismiss the update banner */
  dismiss: () => void;
  /** Open the APK download link */
  download: () => void;
}

export function useUpdateCheck(): UpdateInfo {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only check on native (sideloaded APK / IPA)
    if (Platform.OS === 'web') return;
    if (!BUILD_TIMESTAMP) return; // dev build — no timestamp, skip

    const check = async () => {
      try {
        const res = await fetch(RELEASES_API, {
          headers: { Accept: 'application/vnd.github.v3+json' },
        });
        if (!res.ok) return;
        const data = await res.json();
        const publishedAt = data.published_at;
        if (!publishedAt) return;

        const buildDate = new Date(BUILD_TIMESTAMP).getTime();
        const releaseDate = new Date(publishedAt).getTime();

        // If the release is more than 2 minutes newer than this build
        if (releaseDate > buildDate + 120_000) {
          setAvailable(true);
        }
      } catch {
        // Silently fail — no network, no problem
      }
    };

    // Check after a short delay so it doesn't block app startup
    const timer = setTimeout(check, 3000);
    return () => clearTimeout(timer);
  }, []);

  return {
    available: available && !dismissed,
    dismiss: () => setDismissed(true),
    download: () => Linking.openURL(Platform.OS === 'ios' ? IPA_URL : APK_URL),
  };
}
