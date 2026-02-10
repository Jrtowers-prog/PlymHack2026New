/**
 * openai.ts
 *
 * Lightweight OpenAI chat-completion wrapper.
 * Sends ALL route safety data and gets a ≤150-word explanation
 * of why the safest route was chosen.
 */

import { env } from '@/src/config/env';
import type { RouteScore } from '@/src/hooks/useAllRoutesSafety';
import type { SafetyMapResult } from '@/src/services/safetyMapData';

/** Per-route info bundle passed to the AI */
export interface RouteInfo {
  routeId: string;
  distanceMeters: number;
  durationSeconds: number;
  summary?: string;
  score: RouteScore | undefined;
}

export interface AIExplanationInput {
  /** Full safety analysis of the recommended (safest) route */
  safetyResult: SafetyMapResult;
  /** Every route with distance, duration, summary & score */
  routes: RouteInfo[];
  /** Which route id is the recommended safest one */
  bestRouteId: string;
}

const fmtDist = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
const fmtTime = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;

/**
 * Ask OpenAI for a concise (≤150 word) explanation of why the
 * safest route is safer than the alternatives.
 */
export const fetchAIExplanation = async (input: AIExplanationInput): Promise<string> => {
  const apiKey = env.openaiApiKey;
  if (!apiKey) {
    throw new Error('Missing EXPO_PUBLIC_OPENAI_API_KEY. Set it in your .env file.');
  }

  const { safetyResult, routes, bestRouteId } = input;

  // Build a block for every route so the AI can compare all of them
  const routeBlocks = routes.map((r, i) => {
    const isBest = r.routeId === bestRouteId;
    const tag = isBest ? ' ← RECOMMENDED' : '';
    const s = r.score;
    return [
      `Route ${i + 1}${tag}:`,
      `  Distance: ${fmtDist(r.distanceMeters)}, Walking time: ${fmtTime(r.durationSeconds)}`,
      s?.status === 'done'
        ? `  Safety score: ${s.score}/100 (${s.label}), Pathfinding score: ${s.pathfindingScore}, Main-road ratio: ${(s.mainRoadRatio * 100).toFixed(0)}%`
        : '  Safety score: not available',
      r.summary ? `  Summary: ${r.summary}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  const prompt = `You are a concise walking-safety assistant. We analysed ${routes.length} walking routes. Based ONLY on the data below, explain in 1–2 short paragraphs (max 150 words total) why the recommended route is the safest choice compared to the others. Reference specific numbers. Do NOT give general safety tips.

RECOMMENDED ROUTE DETAILED DATA:
- Safety score: ${safetyResult.safetyScore}/100 (${safetyResult.safetyLabel})
- Crime reports nearby: ${safetyResult.crimeCount}
- Street lights: ${safetyResult.streetLights}
- Lit roads: ${safetyResult.litRoads}, Unlit roads: ${safetyResult.unlitRoads}
- Open places (shops/cafés): ${safetyResult.openPlaces}
- Bus stops nearby: ${safetyResult.busStops}
- Main-road ratio: ${(safetyResult.mainRoadRatio * 100).toFixed(0)}%

ALL ${routes.length} ROUTES:
${routeBlocks}

Respond with 1–2 paragraphs, max 150 words. Explain why the recommended route is safer.`;

  console.log(`[OpenAI] 🌐 API call → gpt-4o-mini (max_tokens=200)`);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.6,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`[OpenAI] ❌ API error ${response.status}`);
    throw new Error(`OpenAI API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  console.log(`[OpenAI] 📦 Response: ${text ? text.length + ' chars' : 'empty'}, tokens=${data?.usage?.total_tokens ?? '?'}`);

  if (!text) {
    throw new Error('No response from OpenAI');
  }

  return text.trim();
};
