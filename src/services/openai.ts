/**
 * openai.ts
 *
 * Lightweight OpenAI chat-completion wrapper.
 * Sends route safety insights and gets a plain-English explanation
 * of why the safest route was chosen.
 */

import { env } from '@/src/config/env';
import type { RouteScore } from '@/src/hooks/useAllRoutesSafety';
import type { SafetyMapResult } from '@/src/services/safetyMapData';

export interface AIExplanationInput {
  /** The safety result for the selected (safest) route */
  safetyResult: SafetyMapResult;
  /** All route scores so the AI can compare */
  allScores: RouteScore[];
  /** Distance of the safest route in metres */
  distanceMeters: number;
  /** Duration of the safest route in seconds */
  durationSeconds: number;
}

/**
 * Ask OpenAI for a two-paragraph explanation of why the safest route
 * was recommended, based on the safety data we collected.
 */
export const fetchAIExplanation = async (input: AIExplanationInput): Promise<string> => {
  const apiKey = env.openaiApiKey;
  if (!apiKey) {
    throw new Error('Missing EXPO_PUBLIC_OPENAI_API_KEY. Set it in your .env file.');
  }

  const { safetyResult, allScores, distanceMeters, durationSeconds } = input;

  const sortedScores = [...allScores]
    .filter((s) => s.status === 'done')
    .sort((a, b) => b.score - a.score);

  const routeSummaries = sortedScores
    .map(
      (s, i) =>
        `Route ${i + 1}: safety score ${s.score}/100 (${s.label}), ` +
        `pathfinding score ${s.pathfindingScore}, main road ratio ${(s.mainRoadRatio * 100).toFixed(0)}%`,
    )
    .join('\n');

  const prompt = `You are a walking-safety assistant. The user asked for walking directions and we analysed multiple routes. Based on the data below, write exactly two short paragraphs explaining why the recommended (safest) route is the best choice. Be concise, friendly, and reference specific numbers.

SAFEST ROUTE DATA:
- Safety score: ${safetyResult.safetyScore}/100 (${safetyResult.safetyLabel})
- Crime reports nearby: ${safetyResult.crimeCount}
- Street lights along route: ${safetyResult.streetLights}
- Lit roads: ${safetyResult.litRoads}, Unlit roads: ${safetyResult.unlitRoads}
- Open places (shops/cafes): ${safetyResult.openPlaces}
- Main road ratio: ${(safetyResult.mainRoadRatio * 100).toFixed(0)}%
- Distance: ${(distanceMeters / 1000).toFixed(1)} km
- Walking time: ${Math.max(1, Math.round(durationSeconds / 60))} min

ALL ROUTES COMPARED:
${routeSummaries}

Write two short paragraphs. First paragraph: why this route is safest. Second paragraph: practical tips for the walk.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('No response from OpenAI');
  }

  return text.trim();
};
