/**
 * ARCHITECTURE SUMMARY: Segment-Based Route Safety System
 * 
 * All new files and their roles in the system
 */

// ============================================================================
// NEW FILES CREATED
// ============================================================================

/*

┌─────────────────────────────────────────────────────────────────────────────┐
│                          UTILITIES LAYER                                    │
│                    (Pure functions, no side effects)                       │
└─────────────────────────────────────────────────────────────────────────────┘

📄 src/utils/colorCode.ts
   Purpose: Convert safety scores (0-1) to colors and risk levels
   Functions:
   - scoreToColor(score) → { color, riskLevel, score }
   - combineScores(scores, weights) → number (0-1)
   - getRiskLabel(riskLevel) → string
   - getScoreDescription(score) → string
   
   Features:
   ✓ Configurable thresholds (currently: 0.3, 0.7)
   ✓ Extensible for future parameters
   ✓ Returns hex colors: #ef4444 (red), #eab308 (yellow), #22c55e (green)
   
   Used by: scoreSegment(), UI components

───────────────────────────────────────────────────────────────────────────────

📄 src/utils/segmentRoute.ts
   Purpose: Split routes into uniform 50m segments
   Functions:
   - segmentRoute(path, targetLength) → RouteSegment[]
   - calculateDistance(point1, point2) → number (meters)
   - interpolatePoint(p1, p2, fraction) → LatLng
   - findNearestSegment(point, segments) → RouteSegment
   - getTotalDistance(segments) → number
   
   Features:
   ✓ Haversine formula for accurate distances
   ✓ Interpolation for exact segment lengths
   ✓ Midpoint calculation for analysis
   ✓ Cumulative distance tracking
   
   Used by: useSegmentSafety hook

───────────────────────────────────────────────────────────────────────────────

📄 src/utils/lightingScore.ts
   Purpose: Calculate lighting safety scores based on OSM data and time
   Functions:
   - calculateLightingScore(lightingDataArray, currentTime) → SegmentLightingScore
   - getLightingDataForSegment(midpoint, nearbyWays, radiusMeters) → LightingData[]
   - roadTypeToLightingLikelihood(roadType) → number (0-1)
   - isNighttime(date) → boolean
   - getTimeWeight(isNight) → { lighting: number, other: number }
   
   Features:
   ✓ Explicit OSM "lit" tags weighted more heavily
   ✓ Heuristic scoring for missing data
   ✓ Day/night weighting (night = lighting more critical)
   ✓ Confidence scores for data reliability
   ✓ Road type mapping (primary=95% lit, footway=20% lit, etc.)
   
   Used by: scoreSegment()

┌─────────────────────────────────────────────────────────────────────────────┐
│                          SERVICES LAYER                                     │
│             (API calls, data fetching, business logic)                     │
└─────────────────────────────────────────────────────────────────────────────┘

📄 src/services/safety.ts [MODIFIED]
   New Functions:
   - fetchWaysWithNodesForRoute(path, bufferMeters) → Way[]
     • Returns OSM ways with node coordinates
     • Much more detailed than previous fetchHighwaysForRoute()
     • Includes highway type and lighting tags
   
   Modified Functions:
   - fetchRouteSafetySummary() now includes _waysData
   
   Used by: useSegmentSafety hook

───────────────────────────────────────────────────────────────────────────────

📄 src/services/segmentScoring.ts [NEW]
   Purpose: Score individual segments and compile results
   Functions:
   - scoreSegment(input) → SegmentScore
     • Combines lighting, crime, reports
     • Applies weights (40%, 40%, 20%)
     • Returns color, score, riskLevel
   
   - scoreAllSegments(segments, waysData, crimes) → SegmentScore[]
     • Processes all segments in parallel
     • Returns array ready for map rendering
   
   - calculateCrimeScore(segment, crimes, radius) → number
     • Counts nearby crimes
     • Normalizes to 0-1 scale
   
   - calculateReportScore(segment, reports, radius) → number
     • Weights user-submitted hazard reports
   
   - calculateOverallScore(segmentScores) → number
     • Average safety across all segments
   
   - getSegmentStatistics(segmentScores) → Statistics
     • Returns counts of safe/caution/danger segments
     • Worst and best segments
     • Average score
   
   Features:
   ✓ Parallel processing for speed
   ✓ Flexible weighting system
   ✓ Comprehensive statistics
   
   Used by: useSegmentSafety hook

┌─────────────────────────────────────────────────────────────────────────────┐
│                          HOOKS LAYER                                        │
│          (React hooks for component integration)                           │
└─────────────────────────────────────────────────────────────────────────────┘

📄 src/hooks/useSegmentSafety.ts [NEW]
   Purpose: Main integration hook - orchestrates entire system
   Export:
   - useSegmentSafety(route) → UseSegmentSafetyState
   
   What it does:
   1. Segments the route
   2. Fetches OSM, crime, report data
   3. Scores all segments
   4. Calculates statistics
   5. Manages loading/error states
   
   Returns:
   {
     status: 'idle' | 'loading' | 'ready' | 'error',
     segments: SegmentScore[],           // Array of colored segments
     overallScore: number,               // Average score
     statistics: Statistics,             // Safe/caution/danger counts
     error: AppError | null,
     refresh: () => Promise<void>
   }
   
   Usage in components:
   ```tsx
   const { segments, status } = useSegmentSafety(route);
   segments.forEach(seg => renderPolyline(seg.color));
   ```
   
   Used by: Route display components (map screens)

┌─────────────────────────────────────────────────────────────────────────────┐
│                          TYPES LAYER                                        │
│                  (TypeScript type definitions)                             │
└─────────────────────────────────────────────────────────────────────────────┘

📄 src/types/safety.ts [MODIFIED]
   New Types:
   - SegmentScore
     {
       segmentId: number,
       lightingScore: number,
       crimeScore: number,
       combinedScore: number,
       color: string,
       riskLevel: 'safe' | 'caution' | 'danger'
     }
   
   Modified Types:
   - SafetySummary now includes segmentScores[]
   
   Used by: All services and hooks

┌─────────────────────────────────────────────────────────────────────────────┐
│                      DOCUMENTATION FILES                                    │
└─────────────────────────────────────────────────────────────────────────────┘

📄 SEGMENT_SAFETY_GUIDE.md
   Complete reference documentation with:
   - Architecture overview
   - Usage examples
   - Scoring methodology
   - How to extend with new parameters
   - Performance notes
   - Known limitations

📄 SEGMENT_SAFETY_QUICK_START.md
   Quick reference with:
   - Step-by-step usage
   - Complete data flow diagram
   - Example interpretations
   - Extension examples

───────────────────────────────────────────────────────────────────────────────

📄 This file (ARCHITECTURE.md)
   Overview of all files and their relationships

*/

// ============================================================================
// DATA FLOW THROUGH THE SYSTEM
// ============================================================================

/*

INPUT: DirectionsRoute (array of coordinates)
  │
  ├─→ useSegmentSafety(route)
  │    │
  │    ├─→ segmentRoute(route.path, 50)
  │    │    └─→ RouteSegment[] (each ~50m)
  │    │
  │    └─→ fetchRouteSafetySummary(route.path)
  │         │
  │         ├─→ fetchCrimesForRoute()     [Police API]
  │         ├─→ fetchHighwaysForRoute()   [Overpass API]
  │         └─→ fetchWaysWithNodesForRoute() [Overpass API] ← NEW
  │
  │    For each RouteSegment:
  │    │
  │    └─→ scoreSegment(segment, waysData, crimes)
  │         │
  │         ├─→ getLightingDataForSegment(segment.midpoint, waysData)
  │         │    └─→ LightingData[] [OSM "lit" tags]
  │         │
  │         ├─→ calculateLightingScore(lightingData, currentTime)
  │         │    └─→ lightingScore (0-1)
  │         │
  │         ├─→ calculateCrimeScore(segment, crimes)
  │         │    └─→ crimeScore (0-1)
  │         │
  │         ├─→ calculateReportScore(segment, userReports)
  │         │    └─→ reportScore (0-1)
  │         │
  │         └─→ combineScores(scores, weights)
  │              │
  │              ├─→ combinedScore (0-1)
  │              │
  │              └─→ scoreToColor(combinedScore)
  │                   └─→ SegmentScore {color, riskLevel, ...}
  │
  └─→ SegmentScore[]

OUTPUT: Array of colored segments ready for rendering
  {
    segmentId: 0,
    color: '#22c55e',      // 🟢 Green
    riskLevel: 'safe',
    combinedScore: 0.85,
    lightingScore: 0.95,
    crimeScore: 0.8
  },
  {
    segmentId: 1,
    color: '#ef4444',      // 🔴 Red
    riskLevel: 'danger',
    combinedScore: 0.35,
    lightingScore: 0.2,
    crimeScore: 0.5
  },
  ...

*/

// ============================================================================
// INTEGRATION WITH EXISTING COMPONENTS
// ============================================================================

/*

RouteMapScreen
  │
  ├─→ useSegmentSafety(selectedRoute) ← Hook that orchestrates everything
  │    │
  │    └─→ segments: SegmentScore[]
  │
  └─→ MapView
      ├─→ segments.map((seg) => 
      │    <Polyline
      │      coordinates={[seg.startCoord, seg.endCoord]}
      │      strokeColor={seg.color}
      │    />
      │   )
      │
      └─→ Statistics panel showing:
          - Overall score
          - Count of safe/caution/danger segments
          - Worst segment info
          - Best segment info

*/

// ============================================================================
// WEIGHT CONFIGURATION (Easy to tune)
// ============================================================================

/*

Current weights in scoreSegment():
  lighting: 0.4  (40%)
  crime:    0.4  (40%)
  reports:  0.2  (20%)

To change priorities:
  - Edit src/services/segmentScoring.ts, line ~70
  - Increase weight for factors that matter more
  - Must sum to 1.0
  
Example: prioritize crime over lighting
  lighting: 0.3  (30%)
  crime:    0.5  (50%)
  reports:  0.2  (20%)

*/

// ============================================================================
// FUTURE IMPROVEMENTS
// ============================================================================

/*

Ready to add:
1. Visibility scoring (weather + time of day)
2. Foot traffic density (crowd-sourced or Google Popular Times)
3. Accessibility checks (wheelchair accessible paths)
4. Real-time crowd density (Foursquare, Strava heatmaps)
5. Proximity to emergency services
6. Public transport availability
7. Elevation/terrain difficulty

To add new parameter:
1. Create src/utils/newParameterScore.ts
2. Implement calculateNewScore(segment, data) → number (0-1)
3. Call it from scoreSegment()
4. Adjust weights to include new parameter
5. Done! Segments automatically recolor

*/

// ============================================================================
// FILE INTERDEPENDENCIES
// ============================================================================

/*

                          src/hooks/useSegmentSafety.ts
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
        src/utils/segmentRoute  services/safety  services/segmentScoring
                    │                               │
        ┌───────────┴───────────┐     ┌────────────┼──────────────┐
        │                       │     │            │              │
        ▼                       ▼     ▼            ▼              ▼
  calculateDistance   interpolatePoint  getLightingData  calculateCrimeScore
                                       │                │
                        ┌──────────────┴────────────────┘
                        │
                        ▼
                  scoreToColor()
                        │
                        ▼
                  SegmentScore[]


Dependency graph:
  useSegmentSafety
  ├── segmentRoute ─→ calculateDistance, interpolatePoint
  ├── fetchRouteSafetySummary ─→ fetchWaysWithNodesForRoute
  └── scoreAllSegments
      ├── scoreSegment
      │   ├── getLightingDataForSegment
      │   ├── calculateLightingScore ─→ isNighttime, getTimeWeight
      │   ├── calculateCrimeScore
      │   ├── calculateReportScore
      │   ├── combineScores ─→ scoreToColor
      │   │
      │   └── scoreToColor

*/

// ============================================================================
// TESTING STRATEGY
// ============================================================================

/*

Unit Tests (test individual utilities):
  ✓ test/utils/colorCode.test.ts
    - scoreToColor returns correct colors
    - combineScores calculates weighted average
  
  ✓ test/utils/segmentRoute.test.ts
    - segmentRoute splits route correctly
    - calculateDistance uses Haversine formula
  
  ✓ test/utils/lightingScore.test.ts
    - isNighttime returns correct boolean
    - calculateLightingScore handles missing data

Integration Tests (test services):
  ✓ test/services/segmentScoring.test.ts
    - scoreSegment combines factors correctly
    - scoreAllSegments processes all segments

Hook Tests (test React integration):
  ✓ test/hooks/useSegmentSafety.test.ts
    - Hook returns segments when ready
    - Hook handles errors gracefully
    - Hook re-fetches when route changes

E2E Tests (full user flow):
  ✓ Select route → segments render with colors
  ✓ Colors match expected safety levels
  ✓ Statistics shown correctly

*/

export {};
