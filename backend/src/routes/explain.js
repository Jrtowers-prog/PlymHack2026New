/**
 * explain.js
 *
 * Backend endpoint for AI route explanation.
 * Receives route data from frontend and calls OpenAI server-side.
 * This keeps the OPENAI_API_KEY secret and never exposes it to clients.
 */

const express = require('express');
const router = express.Router();

const fmtDist = (m) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
const fmtTime = (s) => `${Math.max(1, Math.round(s / 60))} min`;

/**
 * POST /api/explain-route
 *
 * Body:
 * {
 *   safetyResult: SafetyMapResult,
 *   routes: RouteInfo[],
 *   bestRouteId: string
 * }
 *
 * Returns: { explanation: string }
 */
router.post('/explain-route', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: 'Missing OPENAI_API_KEY on server' });
    }

    const { safetyResult, routes, bestRouteId } = req.body;

    // Validate input
    if (
      !safetyResult ||
      !routes ||
      !Array.isArray(routes) ||
      !bestRouteId
    ) {
      return res.status(400).json({
        error: 'Missing required fields: safetyResult, routes, bestRouteId',
      });
    }

    // Build route blocks for the AI
    const routeBlocks = routes
      .map((r, i) => {
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
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');

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

    console.log(`[OpenAI] 🌐 API call from backend → gpt-4o-mini`);

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
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(
        '[OpenAI] ❌ Error:',
        errorData?.error?.message || 'Unknown error'
      );
      return res.status(response.status).json({
        error: errorData?.error?.message || 'OpenAI API call failed',
      });
    }

    const data = await response.json();
    const explanation =
      data?.choices?.[0]?.message?.content?.trim() ||
      'Unable to generate explanation';

    console.log('[OpenAI] ✅ Success:', explanation.substring(0, 50) + '...');

    res.json({ explanation });
  } catch (error) {
    console.error('[Explain Route] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
