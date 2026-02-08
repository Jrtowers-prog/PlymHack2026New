/**
 * QUICK START: Using Segment-Based Safety Scoring
 * 
 * This file shows the complete flow from route to colored segments
 */

// ============================================================================
// STEP 1: In your route component, use the hook
// ============================================================================

import { useSegmentSafety } from '@/src/hooks/useSegmentSafety';
import type { DirectionsRoute } from '@/src/types/google';

function RouteMapScreen({ route }: { route: DirectionsRoute }) {
  // Hook handles: segmentation → OSM fetch → crime fetch → scoring → coloring
  const { segments, overallScore, statistics, status, error } = useSegmentSafety(route);

  if (status === 'loading') {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage error={error} />;
  }

  // =========================================================================
  // STEP 2: Render colored polylines on the map
  // =========================================================================
  return (
    <>
      {segments.map((segmentScore) => (
        <Polyline
          key={segmentScore.segmentId}
          coordinates={[segmentScore.startCoord, segmentScore.endCoord]}
          strokeColor={segmentScore.color} // 🟢 Green | 🟡 Yellow | 🔴 Red
          strokeWidth={4}
        />
      ))}

      {/* Show stats */}
      <SummaryPanel
        overallScore={overallScore}
        statistics={statistics}
      />
    </>
  );
}

// ============================================================================
// DETAILED FLOW (what happens under the hood)
// ============================================================================

/*

1. useSegmentSafety(route) is called
   ↓
2. segmentRoute(route.path, 50)
   - Divides route into ~50m segments
   - Returns: [
     { id: 0, startCoord, endCoord, midpointCoord, length: 48.5m },
     { id: 1, startCoord, endCoord, midpointCoord, length: 50.2m },
     ...
   ]
   ↓
3. fetchRouteSafetySummary(route.path)
   - Calls fetchCrimesForRoute() → gets crime incidents
   - Calls fetchHighwaysForRoute() → gets highway stats
   - Calls fetchWaysWithNodesForRoute() → gets detailed ways with node coords
   - Returns: { crimes[], highwayStats, _waysData[] }
   ↓
4. scoreAllSegments(segments, waysData, crimes)
   - For each segment:
     ↓
     a. getLightingDataForSegment()
        - Finds nearby OSM ways (within 30m of segment midpoint)
        - For each way, checks "lit" tag: yes/no/unknown
        - Returns array of { isLit, confidence, roadType, source }
        ↓
     b. calculateLightingScore()
        - Averages lighting data
        - If night: emphasize lighting (60% weight)
        - If day: lighting less critical (20% weight)
        - Returns score 0-1
        ↓
     c. calculateCrimeScore()
        - Count crimes within 30m of segment
        - Normalize: 0 crimes = 1.0, 5+ crimes = 0.0
        - Returns score 0-1
        ↓
     d. calculateReportScore()
        - Count user reports within 30m
        - Weight by severity
        - Returns score 0-1
        ↓
     e. combineScores()
        - lightingScore × 0.4
        - crimeScore × 0.4
        - reportScore × 0.2
        - = combinedScore (0-1)
        ↓
     f. scoreToColor()
        - if score ≤ 0.3 → 🔴 Red (#ef4444)
        - if score ≤ 0.7 → 🟡 Yellow (#eab308)
        - if score > 0.7 → 🟢 Green (#22c55e)
        ↓
        Returns SegmentScore {
          segmentId,
          color,
          riskLevel,
          combinedScore,
          lightingScore,
          crimeScore
        }
   ↓
5. Return colored segments to component
   - Render as Polylines with their assigned colors
   - Result: Multi-colored route showing safety at a glance

*/

// ============================================================================
// EXAMPLE: Score Interpretation
// ============================================================================

/*

Segment 0: score 0.85
  ├─ lighting: 0.95 (well-lit main road)
  ├─ crime: 0.8 (low crime area)
  ├─ reports: 1.0 (no hazard reports)
  └─ color: 🟢 Green

Segment 5: score 0.35
  ├─ lighting: 0.2 (dark footpath)
  ├─ crime: 0.5 (moderate crime)
  ├─ reports: 0.3 (multiple hazard reports)
  └─ color: 🔴 Red

Segment 12: score 0.6
  ├─ lighting: 0.65 (some lighting)
  ├─ crime: 0.7 (low-moderate crime)
  ├─ reports: 0.4 (one recent report)
  └─ color: 🟡 Yellow

*/

// ============================================================================
// EXTENDING WITH NEW PARAMETERS (example: visibility)
// ============================================================================

/*

Want to add visibility scoring? Here's how:

1. Create scoring function:
   
   // src/utils/visibilityScore.ts
   export const calculateVisibilityScore = (
     segment: RouteSegment,
     weather: WeatherData
   ): number => {
     if (weather.rain > 10) return 0.2;  // Heavy rain
     if (weather.fog) return 0.4;         // Fog
     return 0.95;                         // Clear
   };

2. Add to segment scoring:

   // src/services/segmentScoring.ts
   const visibilityScore = calculateVisibilityScore(segment, weatherData);
   
   const combinedScore = combineScores(
     {
       lighting: lightingScore.score,
       crime: crimeScore,
       reports: reportScore,
       visibility: visibilityScore,  // ← New!
     },
     {
       lighting: 0.35,
       crime: 0.35,
       reports: 0.15,
       visibility: 0.15,  // ← Adjusted weight
     }
   );

3. That's it! Segments automatically recolor based on new parameter.

*/

// ============================================================================
// DATA FLOW DIAGRAM
// ============================================================================

/*

┌──────────────────────────────────────────────────────────────────────────┐
│                         Route (DirectionsRoute)                          │
│                    [array of lat/lng coordinates]                        │
└──────────────────────┬───────────────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │  segmentRoute() [50m chunks] │
         └──────┬──────────────────────┘
                │
                ▼
    ┌──────────────────────────────────────┐
    │ RouteSegment[] (id, start, end, mid) │
    └──────┬───────────────────────────────┘
           │
           ├──────────────────────┬─────────────────────┬──────────────────┐
           │                      │                     │                  │
           ▼                      ▼                     ▼                  ▼
    ┌────────────┐      ┌──────────────┐      ┌────────────┐      ┌────────┐
    │ Crime data │      │  OSM ways    │      │ User       │      │ Weather│
    │ (via       │      │ (via         │      │ reports    │      │ (future)│
    │ Police API)│      │ Overpass API)│      │ (Firestore)│      │        │
    └───┬────────┘      └──────┬───────┘      └────┬───────┘      └────┬───┘
        │                      │                    │                   │
        ▼                      ▼                    ▼                   ▼
    ┌──────────────────────────────────────────────────────────────────┐
    │            scoreSegment() for each segment                        │
    │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐  │
    │  │ Crime      │ │ Lighting   │ │ Reports    │ │ (Visibility) │  │
    │  │ Score 0-1  │ │ Score 0-1  │ │ Score 0-1  │ │ Score 0-1    │  │
    │  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └──────┬───────┘  │
    │        │              │              │               │          │
    │        └──────────────┬───────────────┴───────────────┘          │
    │                       │                                          │
    │                       ▼ (weight & combine)                      │
    │                  combinedScore (0-1)                            │
    │                       │                                          │
    │                       ▼ (scoreToColor)                          │
    │              Color code: 🟢🟡🔴                            │
    └──────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
                ┌──────────────────────────┐
                │  SegmentScore[]          │
                │  [{color, score, risk}]  │
                └──────┬───────────────────┘
                       │
                       ▼
            ┌─────────────────────────────┐
            │  renderPolylines() on map   │
            │  Each segment = Polyline    │
            │  with assigned color        │
            └─────────────────────────────┘

*/
