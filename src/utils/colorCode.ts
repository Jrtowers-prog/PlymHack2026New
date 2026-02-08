/**
 * Flexible color coding system for scoring values (0-1).
 * Designed to be extensible - can combine multiple scoring parameters.
 * 
 * Score meanings:
 * 0 = Dangerous/Bad (Red)
 * 0.5 = Medium risk/Neutral (Yellow/Orange)
 * 1 = Safe/Good (Green)
 */

export type RiskLevel = 'safe' | 'caution' | 'danger';

export interface ColorThresholds {
  dangerMax: number;    // Score above this = danger (red) - typically 0.3
  cautionMax: number;   // Score above this = caution (yellow) - typically 0.7
  // Score above cautionMax = safe (green)
}

export interface ColorConfig {
  colors: {
    safe: string;      // Green
    caution: string;   // Yellow/Orange
    danger: string;    // Red
  };
  thresholds: ColorThresholds;
}

export const DEFAULT_COLOR_CONFIG: ColorConfig = {
  colors: {
    safe: '#22c55e',      // Green
    caution: '#eab308',   // Yellow
    danger: '#ef4444',    // Red
  },
  thresholds: {
    dangerMax: 0.3,
    cautionMax: 0.7,
  },
};

/**
 * Convert a score (0-1) to a risk level and hex color
 * @param score - Value between 0 (dangerous) and 1 (safe)
 * @param config - Custom color configuration (uses defaults if not provided)
 * @returns Object with color, riskLevel, and score
 */
export const scoreToColor = (
  score: number,
  config: ColorConfig = DEFAULT_COLOR_CONFIG,
): {
  color: string;
  riskLevel: RiskLevel;
  score: number;
} => {
  // Clamp score between 0 and 1
  const clampedScore = Math.max(0, Math.min(1, score));

  let riskLevel: RiskLevel;
  let color: string;

  if (clampedScore <= config.thresholds.dangerMax) {
    color = config.colors.danger;
    riskLevel = 'danger';
  } else if (clampedScore <= config.thresholds.cautionMax) {
    color = config.colors.caution;
    riskLevel = 'caution';
  } else {
    color = config.colors.safe;
    riskLevel = 'safe';
  }

  return {
    color,
    riskLevel,
    score: clampedScore,
  };
};

/**
 * Combine multiple normalized scores (0-1) into a single score with weights
 * This allows us to add more parameters later (lighting, crime, activity, etc.)
 * 
 * @param scores - Object with parameter names and their scores
 * @param weights - Object with parameter names and their weights (should sum to 1)
 * @returns Combined score (0-1)
 */
export const combineScores = (
  scores: Record<string, number>,
  weights: Record<string, number>,
): number => {
  let totalWeight = 0;
  let weightedSum = 0;

  Object.entries(weights).forEach(([key, weight]) => {
    if (!(key in scores)) {
      console.warn(`Score key "${key}" not found in scores object`);
      return;
    }

    const score = Math.max(0, Math.min(1, scores[key]));
    weightedSum += score * weight;
    totalWeight += weight;
  });

  if (totalWeight === 0) {
    return 0.5; // Default neutral score
  }

  return weightedSum / totalWeight;
};

/**
 * Get a human-readable label for a risk level
 */
export const getRiskLabel = (riskLevel: RiskLevel): string => {
  switch (riskLevel) {
    case 'safe':
      return 'Safe';
    case 'caution':
      return 'Caution';
    case 'danger':
      return 'Danger';
    default:
      return 'Unknown';
  }
};

/**
 * Get descriptive text for a score
 */
export const getScoreDescription = (score: number): string => {
  const percentage = Math.round(score * 100);
  if (score >= 0.8) return `Very Safe (${percentage}%)`;
  if (score >= 0.6) return `Safe (${percentage}%)`;
  if (score >= 0.4) return `Moderate (${percentage}%)`;
  if (score >= 0.2) return `Risky (${percentage}%)`;
  return `Very Risky (${percentage}%)`;
};

/**
 * Example usage for combining lighting + future parameters:
 * 
 * const lightingScore = 0.8;  // Road is well lit
 * const crimeScore = 0.6;     // Some crime history
 * const activityScore = 0.9;  // Busy area
 * 
 * const combinedScore = combineScores(
 *   { lighting: lightingScore, crime: crimeScore, activity: activityScore },
 *   { lighting: 0.4, crime: 0.3, activity: 0.3 }  // Weights
 * );
 * 
 * const { color, riskLevel } = scoreToColor(combinedScore);
 */
