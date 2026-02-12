/**
 * explain.js
 *
 * Backend endpoint for AI route explanation.
 * Receives AGGREGATED route data (no per-segment data) and calls OpenAI.
 * Caches explanations for 1 hour to minimise API costs.
 * Limits to top 3 routes and uses a compact prompt (~500-800 tokens).
 */

const express = require('express');
const router = express.Router();

// ─── 1-hour explanation cache ────────────────────────────────────────────────
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const explanationCache = new Map(); // key → { explanation, timestamp }

/** Evict expired entries (runs on each request, lightweight) */
const evictExpired = () => {
  const now = Date.now();
  for (const [key, entry] of explanationCache) {
    if (now - entry.timestamp > CACHE_TTL) explanationCache.delete(key);
  }
};

/** Build a stable cache key from route data */
const buildCacheKey = (routes, bestRouteId) => {
  const routePart = routes
    .map((r) => `${r.routeId}:${r.distanceMeters}:${r.score}`)
    .sort()
    .join('|');
  return `${routePart}__best=${bestRouteId}`;
};

const fmtDist = (m) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
const fmtTime = (s) => `${Math.max(1, Math.round(s / 60))}min`;

/**
 * POST /api/explain-route
 *
 * Body (compact — no segments):
 * {
 *   routes: CompactRouteInfo[] (max 3),
 *   bestRouteId: string
 * }
 *
 * Returns: { explanation: string, cached: boolean }
 */
router.post('/explain-route', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: 'Missing OPENAI_API_KEY on server' });
    }

    let { routes, bestRouteId } = req.body;

    // Validate input
    if (!routes || !Array.isArray(routes) || !bestRouteId) {
      return res.status(400).json({
        error: 'Missing required fields: routes, bestRouteId',
      });
    }

    // Limit to top 3 routes
    routes = routes.slice(0, 3);

    // ── Check cache ──
    evictExpired();
    const cacheKey = buildCacheKey(routes, bestRouteId);
    const cached = explanationCache.get(cacheKey);
    if (cached) {
      console.log('[OpenAI] ✅ Cache hit — skipping API call');
      return res.json({ explanation: cached.explanation, cached: true });
    }

    // ── Build compact prompt (~500-800 tokens) ──
    const routeBlocks = routes
      .map((r, i) => {
        const isBest = r.routeId === bestRouteId;
        const tag = isBest ? ' [SAFEST]' : '';
        const lines = [`Route ${i + 1}${tag}: ${fmtDist(r.distanceMeters)}, ${fmtTime(r.durationSeconds)}, safety ${r.score}/100`];

        // Safety factor scores
        if (r.breakdown) {
          lines.push(`  Scores: road=${r.breakdown.roadType} light=${r.breakdown.lighting} crime=${r.breakdown.crime} cctv=${r.breakdown.cctv} places=${r.breakdown.openPlaces} traffic=${r.breakdown.traffic}`);
        }

        // Totals
        if (r.totals) {
          const t = r.totals;
          lines.push(`  Totals: ${t.crimes} crimes, ${t.lights} lights, ${t.cctv} CCTV, ${t.places} open places, ${t.busStops} bus stops, ${t.deadEnds} dead ends`);
        }

        // Road data
        if (r.roadData) {
          const rd = r.roadData;
          const types = rd.roadTypes
            ? Object.entries(rd.roadTypes)
                .map(([k, v]) => `${k}:${v}%`)
                .join(' ')
            : '';
          lines.push(`  Roads: ${rd.mainRoadPct}% main, ${rd.pavedPct}% paved, ${rd.sidewalkPct}% sidewalk${types ? ` | ${types}` : ''}`);
        }

        return lines.join('\n');
      })
      .join('\n');

    const prompt = `You are a pedestrian safety analyst. ${routes.length} routes have been scored. The safety score (0-100) is a weighted composite of police-reported crime density, street lighting coverage, CCTV presence, road classification, nearby open premises, and estimated foot traffic.

${routeBlocks}

Write 2-3 concise sentences in clear, plain English with a professional tone:
(1) Explain why the safest route scores highest, referencing specific data differences (e.g. "X fewer recorded crimes", "Y% more lighting coverage").
(2) Briefly note the key trade-off for each alternative.
Keep it under 100 words. No bullet points, no generic safety tips.
End with: "Note: scores are estimates based on open data and may not reflect real-time conditions. Always stay aware of your surroundings."`;

    console.log(`[OpenAI] 🌐 API call → gpt-4o-mini (prompt ~${prompt.length} chars)`);

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
      const errorData = await response.json().catch(() => ({}));
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

    // Cache for 1 hour
    explanationCache.set(cacheKey, {
      explanation,
      timestamp: Date.now(),
    });

    console.log(`[OpenAI] ✅ Success (${explanation.length} chars), cached for 1hr`);

    res.json({ explanation, cached: false });
  } catch (error) {
    console.error('[Explain Route] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
