/**
 * safetyGraph.js — Optimised safety-first walking graph + pathfinding.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SPEED OPTIMISATIONS (vs v1):
 *   1. A* with haversine heuristic — 3–10× faster than plain Dijkstra
 *      by focusing the search toward the destination
 *   2. Spatial-grid findNearestNode — O(1) instead of O(n) brute force
 *   3. Pre-computed coverage maps — lighting/crime/place density is
 *      computed once across a grid, then sampled per-edge, eliminating
 *      thousands of individual findNearby calls
 *   4. fastDistance() for proximity checks — 5× faster than haversine
 *   5. Numeric spatial-grid keys — faster hash than string keys
 *
 * ACCURACY IMPROVEMENTS (vs v1):
 *   1. Crime severity weighting — violent crimes penalised 3× more
 *      than shoplifting (robbery=1.0, shoplifting=0.2)
 *   2. Inverse-distance lighting — lamp 5m away = much brighter than
 *      one 45m away (uses 1/d² falloff)
 *   3. CCTV cameras — new safety factor from OSM surveillance data
 *   4. Time-of-day awareness — crime weight increases after midnight,
 *      open-place weight adjusts for likelihood of being open
 *   5. Surface quality — unpaved paths penalised (scarier at night)
 *   6. Dead-end detection — segments leading to dead-ends penalised
 *      (harder to escape dangerous situation)
 * ═══════════════════════════════════════════════════════════════════════
 */

const { haversine, fastDistance, buildSpatialGrid, findNearby, countNearby } = require('./geo');

// ── Road hierarchy scoring ──────────────────────────────────────────────────
const ROAD_TYPE_SCORES = {
  trunk: 0.90,
  primary: 0.95,
  secondary: 0.85,
  tertiary: 0.75,
  unclassified: 0.55,
  residential: 0.50,
  living_street: 0.55,
  service: 0.40,
  pedestrian: 0.60,
  cycleway: 0.35,
  footway: 0.25,
  path: 0.15,
  steps: 0.10,
  track: 0.10,
};

const WALKABLE_HIGHWAYS = new Set(Object.keys(ROAD_TYPE_SCORES));

// ── Time-adaptive weights ───────────────────────────────────────────────────
// Weights shift based on time of day (late night = crime matters more)
function getWeights(hour) {
  // hour = 0–23
  const isLateNight = hour >= 0 && hour < 5;   // midnight–5am
  const isEvening = hour >= 18 || hour < 0;     // 6pm–midnight

  if (isLateNight) {
    return {
      roadType: 0.22,
