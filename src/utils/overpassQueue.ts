/**
 * overpassQueue.ts
 *
 * Global Overpass API request queue — manages concurrent Overpass requests
 * across the ENTIRE app, spreading load across multiple servers.
 *
 * All three Overpass callers (nearbyCache.ts, safety.ts, safetyMapData.ts)
 * import this single queue so they share concurrency control.
 *
 * Features:
 *   • Concurrent queue — up to 3 requests in-flight (one per server)
 *   • 80ms cooldown between requests to stay polite
 *   • 3-server round-robin: overpass-api.de → kumi.systems → mail.ru
 *   • Per-request timeout with AbortController
 *   • Retry on 429 / 5xx before trying next server
 */

import { env } from '@/src/config/env';

// ─── Overpass servers (with fallbacks) ───────────────────────────────────────
const OVERPASS_SERVERS = [
  env.overpassBaseUrl,
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// ─── Queue state ─────────────────────────────────────────────────────────────
const MAX_CONCURRENT = 3;  // up to 3 in-flight requests (spread across servers)
let inflight = 0;
const waiting: Array<() => void> = [];
let lastRequestTime = 0;
const MIN_GAP_MS = 80; // minimum ms between dispatches (polite pacing)

// ─── Stats ───────────────────────────────────────────────────────────────────
let totalCalls = 0;
let queuedCalls = 0;

/**
 * Low-level fetch: tries all Overpass servers in order for a single request.
 * Handles 429 / 5xx by moving to the next server.
 */
const fetchWithFallback = async (
  body: string,
  timeoutMs: number,
): Promise<any> => {
  let lastError: Error | null = null;

  for (const server of OVERPASS_SERVERS) {
    try {
      const controller = new AbortController();
