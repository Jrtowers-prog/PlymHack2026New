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
      lighting: 0.28,     // lighting matters most late night
      crimeRate: 0.25,    // crime matters more
      cctv: 0.08,         // CCTV is a reassurance factor
      openPlaces: 0.07,   // fewer places open, less weight
      gpsTraffic: 0.10,
    };
  }
  if (isEvening) {
    return {
      roadType: 0.23,
      lighting: 0.25,
      crimeRate: 0.22,
      cctv: 0.07,
      openPlaces: 0.12,
      gpsTraffic: 0.11,
    };
  }
  // Daytime fallback (shouldn't normally be used — app is for night)
  return {
    roadType: 0.25,
    lighting: 0.15,
    crimeRate: 0.20,
    cctv: 0.05,
    openPlaces: 0.15,
    gpsTraffic: 0.20,
  };
}

// ── Coverage maps ───────────────────────────────────────────────────────────
// Pre-compute density grids so edge scoring is O(1) per edge.
// Cell size ~25m for fine granularity.
const COVERAGE_CELL_DEG = 0.00025; // ~28m

/**
 * Build a lighting coverage map using inverse-distance-squared weighting.
 * Each cell gets a "brightness" value 0–1 based on nearby lamps.
 */
function buildLightingCoverage(lightNodes, litWayNodePositions, bbox) {
  const rows = Math.ceil((bbox.north - bbox.south) / COVERAGE_CELL_DEG);
  const cols = Math.ceil((bbox.east - bbox.west) / COVERAGE_CELL_DEG);
  const grid = new Float32Array(rows * cols); // flat 2D array

  const LAMP_RADIUS = 60; // metres — effective illumination range
  const LAMP_RADIUS_DEG = LAMP_RADIUS / 111320;

