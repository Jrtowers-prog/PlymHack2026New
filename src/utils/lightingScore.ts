/**
 * Lighting score calculation based on OSM data and time of day
 * Returns a score 0-1 where 1 = very well lit, 0 = very dark/dangerous
 */

import type { LatLng } from '@/src/types/google';
import { calculateDistance } from '@/src/utils/segmentRoute';

export interface LightingData {
  isLit: boolean;
  confidence: number; // 0-1: how confident we are in the data (1 = explicit OSM tag, 0.5 = inferred)
  roadType: string;
  source: 'osm_explicit' | 'osm_inferred' | 'road_type_heuristic' | 'unknown';
  /** OSM lamp_type tag: e.g. 'electric', 'gas', 'solar' */
  lampType?: string;
  /** OSM light:method tag: e.g. 'LED', 'sodium', 'metal_halide', 'fluorescent' */
  lightMethod?: string;
  /** OSM light:count — number of lamps on the fixture */
  lightCount?: number;
  /** OSM light:direction — 'both', 'forward', 'backward' */
  lightDirection?: string;
}

export interface SegmentLightingScore {
  score: number; // 0-1
  dayScore: number; // Score during daytime (lighting less important)
  nightScore: number; // Score during nighttime (lighting critical)
  hasLighting: boolean;
  confidence: number;
  lightingData: LightingData[];
}

/**
 * Determine if it's currently nighttime
 * Simple implementation: consider 6 PM to 6 AM as night
 */
export const isNighttime = (date: Date = new Date()): boolean => {
  const hour = date.getHours();
  return hour >= 18 || hour < 6;
};

/**
 * Calculate time-weighted lighting risk
 * During night, lighting is much more critical
 */
export const getTimeWeight = (isNight: boolean): { lighting: number; other: number } => {
  if (isNight) {
    return { lighting: 0.6, other: 0.4 };
  } else {
    return { lighting: 0.2, other: 0.8 };
  }
};

/**
 * Convert OSM road type to a base lighting likelihood
 * Primary/secondary roads are more likely to be lit
 */
export const roadTypeToLightingLikelihood = (roadType: string): number => {
  switch (roadType) {
    case 'motorway':
    case 'trunk':
    case 'primary':
      return 0.95; // Almost certainly lit
    case 'secondary':
    case 'tertiary':
      return 0.85;
    case 'residential':
      return 0.6; // Maybe lit
    case 'living_street':
      return 0.5;
    case 'footway':
    case 'path':
    case 'pedestrian':
      return 0.2; // Likely unlit
    case 'steps':
      return 0.1; // Usually dark
    default:
      return 0.5;
  }
};

/**
 * Score lamp quality from OSM tags (light:method / lamp_type).
 * Returns a multiplier 0.5 – 1.5:
 *   LED/metal_halide = 1.4 (bright, even coverage)
 *   Fluorescent      = 1.2
 *   Sodium           = 1.0 (reference baseline)
 *   Mercury / gas    = 0.7 (dim / unreliable)
 *   Solar            = 0.8 (variable output)
 *   Unknown          = 1.0
 */
export const lampQualityMultiplier = (data: LightingData): number => {
  const method = (data.lightMethod ?? '').toLowerCase();
  const lamp = (data.lampType ?? '').toLowerCase();

  // Best: modern white-light sources
  if (method.includes('led') || method.includes('metal_halide')) return 1.4;
  if (method.includes('fluorescent')) return 1.2;
  if (lamp.includes('led')) return 1.4;

  // Reference: common sodium lamps
  if (method.includes('sodium') || method.includes('hps')) return 1.0;
  if (lamp.includes('electric')) return 1.0;

  // Weaker / less reliable
  if (lamp.includes('solar')) return 0.8;
  if (method.includes('mercury') || method.includes('gas') || lamp.includes('gas')) return 0.7;

  return 1.0; // unknown / no tag
};

/**
 * Factor in the number of lamps on a fixture and their direction.
 * Returns a multiplier ≥ 1.0.
 */
export const lampCountMultiplier = (data: LightingData): number => {
  let m = 1.0;

  // Multiple lamps per fixture = better coverage
  if (data.lightCount && data.lightCount > 1) {
    m *= Math.min(1.5, 1 + (data.lightCount - 1) * 0.15);
  }

  // Bidirectional lighting covers both sides of the road
  if (data.lightDirection === 'both') {
    m *= 1.1;
  }

  return m;
};

/**
 * Calculate lighting score for a segment
 * Combines OSM explicit tags with road type heuristics
 */
