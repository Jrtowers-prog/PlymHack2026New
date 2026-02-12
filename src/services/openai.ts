/**
 * openai.ts
 *
 * Lightweight OpenAI chat-completion wrapper.
 * Sends ALL route safety data and gets a ≤150-word explanation
 * of why the safest route was chosen.
 */

import { env } from '@/src/config/env';
import type { RouteScore } from '@/src/hooks/useAllRoutesSafety';
import type { SafetyBreakdown, RouteStats, RoutePOIs } from '@/src/services/safeRoutes';
import type { SafetyMapResult } from '@/src/services/safetyMapData';

/** Summarised per-segment stats for the AI */
export interface SegmentSummary {
  highway: string;
  roadName: string;
  distance: number;
  safetyScore: number;
  lightScore: number;
  crimeScore: number;
  cctvScore: number;
  placeScore: number;
  trafficScore: number;
  isDeadEnd: boolean;
  hasSidewalk: boolean;
  surfaceType: string;
}

/** Per-route info bundle passed to the AI */
export interface RouteInfo {
  routeId: string;
  distanceMeters: number;
  durationSeconds: number;
  summary?: string;
  score: RouteScore | undefined;
  /** Full safety breakdown (roadType, lighting, crime, cctv, openPlaces, traffic) */
  safetyBreakdown?: SafetyBreakdown;
  /** Road type distribution e.g. { primary: 40, residential: 35 } */
  roadTypes?: Record<string, number>;
  /** Main road ratio 0-100 */
  mainRoadRatio?: number;
  /** Route statistics: dead ends, sidewalk %, transit stops, CCTV, etc. */
  routeStats?: RouteStats;
  /** POI counts along the route */
  poiCounts?: {
    cctv: number;
    transit: number;
    deadEnds: number;
    lights: number;
    places: number;
    crimes: number;
  };
  /** Per-segment safety data (summarised) */
  segments?: SegmentSummary[];
}

export interface AIExplanationInput {
  /** Full safety analysis of the recommended (safest) route */
  safetyResult: SafetyMapResult;
  /** Every route with distance, duration, summary & score */
  routes: RouteInfo[];
  /** Which route id is the recommended safest one */
  bestRouteId: string;
}

/**
 * Ask backend for a concise (≤150 word) explanation of why the
 * safest route is safer than the alternatives.
 *
 * NOTE: The OpenAI API key is kept SECRET on the backend.
 * This frontend function now only sends the route data to the backend,
 * which handles the OpenAI call securely.
 */
export const fetchAIExplanation = async (input: AIExplanationInput): Promise<string> => {
  const apiBaseUrl = env.apiBaseUrl;
  if (!apiBaseUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE_URL. Set it in your .env file.');
  }

  console.log(`[OpenAI] 🌐 Backend call → ${apiBaseUrl}/api/explain-route`);

  const response = await fetch(`${apiBaseUrl}/api/explain-route`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`[OpenAI] ❌ Backend error ${response.status}`);
    throw new Error(`Backend error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const explanation: string | undefined = data?.explanation;
  console.log(`[OpenAI] 📦 Response: ${explanation ? explanation.length + ' chars' : 'empty'}`);

  if (!explanation) {
    throw new Error('No explanation from backend');
  }

  return explanation.trim();
};
