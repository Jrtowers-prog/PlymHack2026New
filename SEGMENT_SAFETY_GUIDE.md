# Segment-Based Route Safety System

## Overview

This new system replaces the simple route-level safety scoring with a more granular, **segment-based approach**:

- Routes are divided into **50m segments**
- Each segment is scored independently based on:
  - **Lighting**: OSM data + road type heuristics + time of day
  - **Crime**: Police incidents nearby
  - **User reports**: Community-submitted hazard reports
- Each segment gets a **color code**: 🟢 Safe | 🟡 Caution | 🔴 Danger
- The color coding algorithm is **extensible** - easily add more parameters later

## Architecture

### Core Files

1. **`src/utils/colorCode.ts`** - Flexible color coding system
   - Converts scores (0-1) to colors
   - Supports combining multiple scoring parameters with weights
   - Easy to extend with new factors

2. **`src/utils/segmentRoute.ts`** - Route segmentation
   - Splits routes into uniform 50m segments
   - Calculates distances using Haversine formula
   - Provides segment midpoints for analysis

3. **`src/utils/lightingScore.ts`** - Lighting analysis
   - Queries OSM for `lit` tags
   - Uses road type heuristics (primary roads = more likely lit)
   - Considers time of day (night = lighting critical)
   - Returns confidence levels for data quality

4. **`src/services/segmentScoring.ts`** - Segment scoring engine
   - Combines all factors (lighting, crime, reports)
   - Applies weights: lighting 40%, crime 40%, reports 20%
   - Produces final score per segment

5. **`src/services/safety.ts`** - Enhanced to fetch detailed OSM data
   - New function: `fetchWaysWithNodesForRoute()`
   - Returns highway ways with node coordinates
   - Enables per-segment analysis

6. **`src/hooks/useSegmentSafety.ts`** - React hook for the whole system
   - Orchestrates segmentation, fetching, scoring
   - Returns segment-level color-coded data
   - Ready to display on map

## Usage Example

```typescript
import { useSegmentSafety } from '@/src/hooks/useSegmentSafety';

export function RouteDetailsScreen({ route }: { route: DirectionsRoute }) {
  const { segments, overallScore, statistics, status, error } = useSegmentSafety(route);

  if (status === 'loading') return <ActivityIndicator />;
  if (error) return <Text>{error.message}</Text>;

  return (
    <View>
      <Text>Overall Safety: {Math.round((overallScore || 0) * 100)}%</Text>
      
      {statistics && (
        <View>
          <Text>🟢 Safe segments: {statistics.safe}</Text>
          <Text>🟡 Caution segments: {statistics.caution}</Text>
          <Text>🔴 Danger segments: {statistics.danger}</Text>
        </View>
      )}

      {/* Render segments on map */}
      {segments.map((segment) => (
        <Polyline
          key={segment.segmentId}
          coordinates={[segment.startCoord, segment.endCoord]}
          strokeColor={segment.color}
          strokeWidth={3}
        />
      ))}
    </View>
  );
}
```

## Scoring System

### How Lighting Score is Calculated

**Input**: OSM lighting data for roads near a 50m segment

**Logic**:
```
1. Fetch all nearby roads (within 30m radius)
2. For each road, check OSM "lit" tag:
   - "yes", "24/7", "automatic" → lit (score += 1)
   - "no", "disused" → unlit (score += 0)
   - Missing → use road type heuristic
3. Average all values
4. Adjust for time of day:
   - Nighttime: lighting is critical (more weight)
   - Daytime: lighting matters less
```

**Road Type Heuristics** (if no explicit `lit` tag):
- Primary roads (95%) → assumed lit
- Secondary roads (85%) → mostly lit
- Residential (60%) → maybe lit
- Footways (20%) → likely unlit
- Paths/steps (10%) → usually dark

### How Crime Score is Calculated

```
1. Fetch all crimes from last 12 months within route buffer
2. For each 50m segment, count crimes within 30m radius
3. Normalize: 0 crimes = score 1.0, 5+ crimes = score 0
4. Result: crime score (0-1)
```

### How Final Color is Determined

```
combinedScore = (lightingScore × 0.4) + (crimeScore × 0.4) + (reportScore × 0.2)

if combinedScore ≤ 0.3  → 🔴 Red (Danger)
if combinedScore ≤ 0.7  → 🟡 Yellow (Caution)
if combinedScore > 0.7  → 🟢 Green (Safe)
```

## Extending with New Parameters

The system is designed to be extensible. To add a new parameter (e.g., visibility, foot traffic):

### Step 1: Create scoring function

```typescript
// src/utils/visibilityScore.ts
export const calculateVisibilityScore = (
  segment: RouteSegment,
  weatherData: WeatherData,
): number => {
  // Return 0-1 score
  // 1 = excellent visibility, 0 = fog/heavy rain
};
```

### Step 2: Add to segment scoring

```typescript
// In src/services/segmentScoring.ts
const visibilityScore = calculateVisibilityScore(segment, weatherData);

const combinedScore = combineScores(
  {
    lighting: lightingScore.score,
    crime: crimeScore,
    reports: reportScore,
    visibility: visibilityScore,  // ← new parameter
  },
  {
    lighting: 0.35,
    crime: 0.35,
    reports: 0.15,
    visibility: 0.15,  // ← adjusted weight
  },
);
```

### Step 3: Done! The color coding updates automatically

## Real-Time Considerations

### Current Implementation
- Fetches OSM data at the time of request
- Checks current time to determine day/night
- Weather data integration can be added later

### Improvements for Future Versions
1. **Real-time weather**: Integrate weather API for visibility/rain
2. **Crowd density**: Use Google Popular Times or Foursquare
3. **User location frequency**: OSM heat maps show popular routes
4. **Traffic data**: Add pedestrian traffic patterns
5. **Accessibility**: Check for wheelchair accessibility via OSM
6. **Toilet/emergency facilities**: Add nearby resources

## Testing the System

### Unit Tests
```typescript
import { scoreToColor } from '@/src/utils/colorCode';
import { segmentRoute } from '@/src/utils/segmentRoute';

test('scoreToColor maps 0 to red', () => {
  const { color, riskLevel } = scoreToColor(0);
  expect(riskLevel).toBe('danger');
  expect(color).toBe('#ef4444');
});

test('segmentRoute splits 1km path into ~20 segments', () => {
  const path = generateStraightLine(1000); // 1km
  const segments = segmentRoute(path, 50);
  expect(segments.length).toBeGreaterThan(15);
  expect(segments.length).toBeLessThan(25);
});
```

### Integration Test
```typescript
test('useSegmentSafety returns colored segments', async () => {
  const route = createTestRoute('King Cross', 'Camden Market');
  const { result } = renderHook(() => useSegmentSafety(route));

  await waitFor(() => expect(result.current.status).toBe('ready'));

  expect(result.current.segments.length).toBeGreaterThan(0);
  result.current.segments.forEach((seg) => {
    expect(['#ef4444', '#eab308', '#22c55e']).toContain(seg.color);
  });
});
```

## Performance Notes

- **Segment creation**: ~5ms for typical route
- **OSM query**: ~500-2000ms depending on route length
- **Crime data fetch**: ~500ms
- **Segment scoring**: ~100ms for 50 segments
- **Total**: ~1-3 seconds for full analysis

**Optimization opportunities**:
1. Cache OSM data by bounding box
2. Batch process multiple routes
3. Progressive rendering (show segments as they're scored)

## Known Limitations

1. **OSM data quality**: Lighting tags are only as good as community contributions
2. **Crime data latency**: Police data updated monthly
3. **Road type inference**: If OSM missing `lit` tag, we guess based on road type
4. **Weather**: Currently not integrated (can be added)
5. **Accessibility**: Not yet considered

## API Reference

### `scoreToColor(score, config?)`
Convert a 0-1 score to color and risk level

### `combineScores(scores, weights)`
Combine multiple factors with weights into single score

### `segmentRoute(path, targetLength?)`
Split route into ~50m segments

### `calculateLightingScore(lightingDataArray, currentTime?)`
Calculate lighting risk for a segment

### `scoreSegment(input)`
Score a single segment (returns SegmentScore with color)

### `useSegmentSafety(route)`
React hook that orchestrates full segment safety analysis

---

**Last Updated**: February 2026
**Status**: Production Ready for MVP
