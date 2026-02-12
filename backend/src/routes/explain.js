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

    // Build detailed per-route blocks with EVERY safety parameter
    const routeBlocks = routes
      .map((r, i) => {
        const isBest = r.routeId === bestRouteId;
        const tag = isBest ? ' ← RECOMMENDED' : '';
        const s = r.score;
        const bd = r.safetyBreakdown;
        const stats = r.routeStats;
        const pois = r.poiCounts;
        const segs = r.segments || [];

        const lines = [`Route ${i + 1}${tag}:`];
        lines.push(`  Distance: ${fmtDist(r.distanceMeters)}, Walking time: ${fmtTime(r.durationSeconds)}`);
        if (r.summary) lines.push(`  Summary: ${r.summary}`);

        // Overall scores
        if (s?.status === 'done') {
          lines.push(`  Overall safety score: ${s.score}/100 (${s.label})`);
          lines.push(`  Pathfinding score: ${s.pathfindingScore}/100`);
          lines.push(`  Main-road ratio: ${(s.mainRoadRatio * 100).toFixed(0)}%`);
          lines.push(`  Data confidence: ${(s.dataConfidence * 100).toFixed(0)}%`);
        }

        // Safety breakdown (per-factor scores)
        if (bd) {
          lines.push(`  Safety breakdown:`);
          lines.push(`    Road type score: ${bd.roadType}/100`);
          lines.push(`    Lighting score: ${bd.lighting}/100`);
          lines.push(`    Crime score: ${bd.crime}/100 (higher=safer)`);
          lines.push(`    CCTV coverage score: ${bd.cctv}/100`);
          lines.push(`    Open places score: ${bd.openPlaces}/100`);
          lines.push(`    Traffic/activity score: ${bd.traffic}/100`);
        }

        // Road type distribution
        if (r.roadTypes && Object.keys(r.roadTypes).length > 0) {
          const roadStr = Object.entries(r.roadTypes)
            .map(([type, pct]) => `${type}: ${pct}%`)
            .join(', ');
          lines.push(`  Road types: ${roadStr}`);
        }
        if (r.mainRoadRatio != null) {
          lines.push(`  Main road ratio: ${r.mainRoadRatio}%`);
        }

        // Route stats
        if (stats) {
          lines.push(`  Route stats:`);
          lines.push(`    Dead ends: ${stats.deadEnds}`);
          lines.push(`    Sidewalk coverage: ${stats.sidewalkPct}%`);
          lines.push(`    Unpaved sections: ${stats.unpavedPct}%`);
          lines.push(`    Transit stops nearby: ${stats.transitStopsNearby}`);
          lines.push(`    CCTV cameras nearby: ${stats.cctvCamerasNearby}`);
        }

        // POI counts
        if (pois) {
          lines.push(`  Points of interest along route:`);
          lines.push(`    CCTV cameras: ${pois.cctv}, Transit stops: ${pois.transit}, Street lights: ${pois.lights}`);
          lines.push(`    Open places: ${pois.places}, Dead ends: ${pois.deadEnds}, Crime reports: ${pois.crimes}`);
        }

        // Segment summary (aggregate stats)
        if (segs.length > 0) {
          const avgLight = (segs.reduce((a, s) => a + s.lightScore, 0) / segs.length).toFixed(2);
          const avgCrime = (segs.reduce((a, s) => a + s.crimeScore, 0) / segs.length).toFixed(2);
          const avgCctv = (segs.reduce((a, s) => a + s.cctvScore, 0) / segs.length).toFixed(2);
          const avgPlace = (segs.reduce((a, s) => a + s.placeScore, 0) / segs.length).toFixed(2);
          const avgTraffic = (segs.reduce((a, s) => a + s.trafficScore, 0) / segs.length).toFixed(2);
          const deadEndSegs = segs.filter(s => s.isDeadEnd).length;
          const sidewalkSegs = segs.filter(s => s.hasSidewalk).length;
          lines.push(`  Segment analysis (${segs.length} segments):`);
          lines.push(`    Avg lighting: ${avgLight}, Avg crime safety: ${avgCrime}, Avg CCTV: ${avgCctv}`);
          lines.push(`    Avg place activity: ${avgPlace}, Avg traffic: ${avgTraffic}`);
          lines.push(`    Dead-end segments: ${deadEndSegs}, Segments with sidewalks: ${sidewalkSegs}`);
        }

        return lines.join('\n');
      })
      .join('\n\n');

    const prompt = `You are a concise walking-safety assistant. We analysed ${routes.length} walking routes using our safety algorithm. Based ONLY on the data below, write exactly ONE paragraph (max 150 words) that: (1) explains how the safety score was calculated from the factors shown, (2) explains why the recommended route is the safest compared to the alternatives using specific numbers, and (3) gives one brief practical suggestion for the walker. Do NOT use bullet points. Do NOT give general safety tips. Reference specific data points.

ALL ${routes.length} ROUTES WITH FULL SAFETY DATA:
${routeBlocks}

THE RECOMMENDED ROUTE IS: Route ${routes.findIndex(r => r.routeId === bestRouteId) + 1}

Respond with exactly ONE paragraph, max 150 words.`;

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
