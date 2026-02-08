/**
 * QUICK REFERENCE CARD
 * Segment-Based Route Safety System
 */

// ============================================================================
// IMPORTS YOU'LL NEED
// ============================================================================

import { useSegmentSafety } from '@/src/hooks/useSegmentSafety';
import { scoreToColor, combineScores } from '@/src/utils/colorCode';
import { segmentRoute, calculateDistance } from '@/src/utils/segmentRoute';
import { calculateLightingScore } from '@/src/utils/lightingScore';
import type { SegmentScore, DirectionsRoute } from '@/src/types/safety';

// ============================================================================
// BASIC USAGE
// ============================================================================

// In your route screen component:
const RouteScreen = ({ route }: { route: DirectionsRoute }) => {
  // This is all you need!
  const { segments, status, error, overallScore } = useSegmentSafety(route);

  return (
    <MapView>
      {status === 'loading' && <Spinner />}
      {error && <Error msg={error.message} />}
      
      {/* Render colored segments */}
      {segments.map((seg) => (
        <Polyline
          key={seg.segmentId}
          coordinates={[seg.startCoord, seg.endCoord]}
          strokeColor={seg.color}  // 🟢🟡🔴
        />
      ))}
    </MapView>
  );
};

// ============================================================================
// COMMON TASKS
// ============================================================================

// Task 1: Get segment colors
segments.forEach((seg) => {
  console.log(`Segment ${seg.segmentId}: ${seg.riskLevel} (${seg.color})`);
});

// Task 2: Find all red (dangerous) segments
const dangerousSegments = segments.filter((s) => s.riskLevel === 'danger');
console.log(`Found ${dangerousSegments.length} dangerous segments`);

// Task 3: Get worst segment
const worst = statistics?.worstSegment;
console.log(`Worst: ${worst?.riskLevel} (score ${worst?.combinedScore})`);

// Task 4: Show stats
console.log(`Safe: ${statistics?.safe}`);
console.log(`Caution: ${statistics?.caution}`);
console.log(`Danger: ${statistics?.danger}`);

// Task 5: Get overall route score
console.log(`Overall safety: ${Math.round((overallScore || 0) * 100)}%`);

// ============================================================================
// COLOR MAPPINGS
// ============================================================================

const COLORS = {
  SAFE: '#22c55e',    // Green
  CAUTION: '#eab308', // Yellow
  DANGER: '#ef4444',  // Red
};

const RISK_LEVELS = {
  'safe': '🟢 Safe',
  'caution': '🟡 Caution',
  'danger': '🔴 Danger',
};

// ============================================================================
// SEGMENT DATA STRUCTURE
// ============================================================================

/*
SegmentScore {
  segmentId: number,              // 0, 1, 2, ...
  startCoord: { latitude, longitude },   // Segment start
  endCoord: { latitude, longitude },     // Segment end
  color: string,                  // '#22c55e' | '#eab308' | '#ef4444'
  riskLevel: 'safe' | 'caution' | 'danger',
  combinedScore: number,          // 0-1
  lightingScore: number,          // 0-1
  crimeScore: number,             // 0-1
}
*/

// ============================================================================
// HOOK STATE
// ============================================================================

/*
useSegmentSafety returns:
{
  status: 'idle' | 'loading' | 'ready' | 'error',
  segments: SegmentScore[],
  overallScore: number | null,    // Average of all segments
  statistics: {
    total: number,
    safe: number,
    caution: number,
    danger: number,
    averageScore: number,
    worstSegment: SegmentScore,
    bestSegment: SegmentScore,
  },
  error: AppError | null,
  refresh: () => Promise<void>,
}
*/

// ============================================================================
// ADVANCED: MANUAL SCORING
// ============================================================================

// If you need to score a single segment manually:
import { scoreSegment } from '@/src/services/segmentScoring';

const manualScore = await scoreSegment({
  segment: mySegment,
  nearbyWays: osmWaysData,
  crimes: crimeArray,
  userReports: reportArray,
});

console.log(manualScore.color); // Use it!

// ============================================================================
// ADVANCED: DIRECT COLOR CODING
// ============================================================================

// If you have a score and want to color it:
const { color, riskLevel } = scoreToColor(0.85);
console.log(color); // '#22c55e' (green)

// With custom thresholds:
const custom = scoreToColor(0.5, {
  colors: {
    safe: '#00ff00',
    caution: '#ffff00',
    danger: '#ff0000',
  },
  thresholds: {
    dangerMax: 0.25,
    cautionMax: 0.65,
  },
});

// ============================================================================
// TROUBLESHOOTING
// ============================================================================

// Segments are all yellow/same color?
// → Check OSM data coverage in your area
// → Verify crime data is available
// → Adjust weights in segmentScoring.ts

// Wrong colors for obvious dark areas?
// → OSM lighting tags may be incomplete
// → Use road type heuristics as fallback
// → Consider adding weather data

// Hook returns 'error' status?
const { error } = useSegmentSafety(route);
console.error(error?.message);  // Check error message
// Common: "Unable to fetch safety data", network timeout

// Slow performance?
// → Segments takes ~3 seconds total (normal)
// → OSM/Police API calls are network-bound
// → Can optimize with caching (future)

// ============================================================================
// CONFIGURATION QUICK EDITS
// ============================================================================

// Change segment length (default 50m):
// File: src/hooks/useSegmentSafety.ts, line ~45
segmentRoute(route.path, 100); // ← Change 50 to 100

// Change color scheme:
// File: src/utils/colorCode.ts, line ~20
colors: {
  safe: '#YOUR_GREEN',
  caution: '#YOUR_YELLOW',
  danger: '#YOUR_RED',
}

// Change score thresholds:
// File: src/utils/colorCode.ts, line ~27
thresholds: {
  dangerMax: 0.3,  // ← Adjust these
  cautionMax: 0.7,
}

// Change scoring weights:
// File: src/services/segmentScoring.ts, line ~70
const combinedScore =
  lightingScoreObj.score * 0.4 +  // ← Lighting weight
  crimeScore * 0.4 +              // ← Crime weight
  reportScore * 0.2;              // ← Report weight

// ============================================================================
// STATS YOU CAN SHOW IN UI
// ============================================================================

<View>
  <Text>Overall: {Math.round((overallScore || 0) * 100)}%</Text>
  <Text>🟢 Safe: {statistics?.safe}/{statistics?.total}</Text>
  <Text>🟡 Caution: {statistics?.caution}/{statistics?.total}</Text>
  <Text>🔴 Danger: {statistics?.danger}/{statistics?.total}</Text>
  <Text>Worst area: {statistics?.worstSegment.riskLevel}</Text>
  <Text>Best area: {statistics?.bestSegment.riskLevel}</Text>
</View>

// ============================================================================
// TYPE HINTS FOR TYPESCRIPT
// ============================================================================

import type { SegmentScore } from '@/src/types/safety';
import type { RouteSegment } from '@/src/utils/segmentRoute';
import type { LightingData } from '@/src/utils/lightingScore';

// For component props:
interface RouteDisplayProps {
  segments: SegmentScore[];
  onSegmentPress?: (segment: SegmentScore) => void;
}

// ============================================================================
// REAL EXAMPLE: ROUTE DETAIL SCREEN
// ============================================================================

function RouteDetailScreen({ route }: { route: DirectionsRoute }) {
  const { segments, status, error, statistics } = useSegmentSafety(route);

  if (status === 'loading') {
    return <ActivityIndicator size="large" />;
  }

  if (error) {
    return (
      <View style={{ padding: 20 }}>
        <Text style={{ color: 'red' }}>Error: {error.message}</Text>
        <Button title="Retry" onPress={() => window.location.reload()} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Map with colored segments */}
      <MapView style={{ flex: 0.7 }}>
        {segments.map((seg) => (
          <Polyline
            key={seg.segmentId}
            coordinates={[seg.startCoord, seg.endCoord]}
            strokeColor={seg.color}
            strokeWidth={5}
          />
        ))}
      </MapView>

      {/* Statistics panel */}
      <ScrollView style={{ flex: 0.3, padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Route Safety</Text>
        
        <View style={{ marginTop: 12 }}>
          <Text>🟢 Safe segments: {statistics?.safe}</Text>
          <Text>🟡 Caution segments: {statistics?.caution}</Text>
          <Text>🔴 Danger segments: {statistics?.danger}</Text>
        </View>

        <Text style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
          Tip: Red segments are darker or have hazard reports. Consider
          alternative routes.
        </Text>
      </ScrollView>
    </View>
  );
}

// ============================================================================
// KEY NUMBERS
// ============================================================================

Typical scores:
  0.0 = Extremely dangerous (unlit, high crime)
  0.3 = Dangerous (red)
  0.5 = Moderate risk (yellow)
  0.7 = Safe (green threshold)
  1.0 = Perfectly safe (well-lit, no crime)

Typical performance:
  Route segmentation: 5ms
  OSM fetch: 500-2000ms
  Crime data: 500ms
  Scoring: 100ms
  Total: 1-3 seconds

Typical route:
  Length: 2-5km
  Segments: 40-100
  API calls: 4 (Directions, OSM, Police, Places)
  Data points: 100-500 per route

// ============================================================================
// FILE LOCATIONS
// ============================================================================

Core utilities:
  src/utils/colorCode.ts
  src/utils/segmentRoute.ts
  src/utils/lightingScore.ts

Services:
  src/services/safety.ts (enhanced)
  src/services/segmentScoring.ts

Hooks:
  src/hooks/useSegmentSafety.ts

Types:
  src/types/safety.ts (extended)

Docs:
  SEGMENT_SAFETY_GUIDE.md
  SEGMENT_SAFETY_QUICK_START.md
  SEGMENT_SAFETY_ARCHITECTURE.md
  SEGMENT_SAFETY_COMPLETE.md
  This file!

═════════════════════════════════════════════════════════════════════════════
That's everything you need! Ready to use! 🚀
═════════════════════════════════════════════════════════════════════════════
