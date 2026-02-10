/**
 * SafetyPanel — Hero score + 2×2 grid + detailed breakdown cards.
 */
import { Platform, StyleSheet, Text, View } from 'react-native';

import { CircleProgress } from '@/src/components/ui/CircleProgress';
import type { SafeRoute } from '@/src/services/safeRoutes';
import type { SafetyMapResult } from '@/src/services/safetyMapData';

interface SafetyPanelProps {
  safetyResult: SafetyMapResult;
  selectedSafeRoute: SafeRoute;
}

export function SafetyPanel({ safetyResult, selectedSafeRoute }: SafetyPanelProps) {
  const stats = selectedSafeRoute.routeStats;

  return (
    <View style={[styles.column, Platform.OS === 'web' && styles.columnWeb]}>
      {/* Hero Score */}
      <View style={[styles.heroCard, { borderColor: safetyResult.safetyColor + '44' }]}>
        <CircleProgress
          size={Platform.OS === 'web' ? 64 : 52}
          strokeWidth={5}
          progress={safetyResult.safetyScore}
          color={safetyResult.safetyColor}
        />
        <Text style={[styles.heroLabel, { color: safetyResult.safetyColor }]}>
          {safetyResult.safetyLabel}
        </Text>
      </View>

      {/* 2×2 grid */}
      <View style={styles.grid}>
        <GridCard emoji="🔴" value={safetyResult.crimeCount} label="Crimes" color="#ef4444" />
        <GridCard emoji="💡" value={safetyResult.streetLights} label="Lights" color="#eab308" />
        <GridCard emoji="📷" value={stats?.cctvCamerasNearby ?? 0} label="CCTV" color="#6366f1" />
        <GridCard emoji="🏪" value={safetyResult.openPlaces} label="Open" color="#22c55e" />
      </View>

      {/* Detailed route stats */}
      {stats && (
        <>
          <Text style={styles.sectionLabel}>Route Details</Text>

          <View style={styles.row}>
            <DetailCard icon="🛣️" value={`${selectedSafeRoute.safety.mainRoadRatio}%`} label="Main Roads" />
            <DetailCard icon="🚶" value={`${stats.sidewalkPct}%`} label="Sidewalks" />
            <DetailCard icon="🚏" value={`${stats.transitStopsNearby}`} label="Transit" />
          </View>
          <View style={styles.row}>
            <DetailCard
              icon="⛔"
              value={`${stats.deadEnds}`}
              label="Dead Ends"
              warn={stats.deadEnds > 0}
            />
            <DetailCard
              icon="🪨"
              value={`${stats.unpavedPct}%`}
              label="Unpaved"
              warn={stats.unpavedPct > 0}
            />
            <DetailCard icon="👣" value={`${selectedSafeRoute.safety.breakdown.traffic}%`} label="Foot Traffic" />
          </View>

          {/* Road type bar */}
          {Object.keys(selectedSafeRoute.safety.roadTypes).length > 0 && (
            <RoadTypeBreakdown roadTypes={selectedSafeRoute.safety.roadTypes} />
          )}
        </>
      )}
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function GridCard({ emoji, value, label, color }: { emoji: string; value: number; label: string; color: string }) {
  return (
    <View style={[styles.gridCard, { borderColor: color + '44' }]}>
      <Text style={[styles.gridIcon, { color }]}>{emoji}</Text>
