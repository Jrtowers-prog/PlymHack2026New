/**
 * RouteCard — A single route in the route list.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SafeRoute } from '@/src/services/safeRoutes';
import { formatDistance, formatDuration } from '@/src/utils/format';

interface RouteCardProps {
  route: SafeRoute;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

export function RouteCard({ route, index, isSelected, onSelect }: RouteCardProps) {
  const isBest = route.isSafest;
  const safety = route.safety;
  const label = isBest ? 'Safest Route' : `Route ${index + 1}`;

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      style={[
        styles.card,
        isSelected && styles.cardSelected,
        isBest && styles.cardBest,
      ]}
    >
      <View style={styles.header}>
        <View style={styles.labelRow}>
          {isBest && (
            <View style={styles.bestBadge}>
              <Text style={styles.bestBadgeTick}>✓</Text>
            </View>
          )}
          <Text
            style={[
              styles.label,
              isSelected && styles.labelSelected,
              isBest && styles.labelBest,
            ]}
          >
            {label}
          </Text>
        </View>
        <View style={[styles.scoreChip, { backgroundColor: safety.color + '20' }]}>
          <View style={[styles.scoreChipDot, { backgroundColor: safety.color }]} />
          <Text style={[styles.scoreChipText, { color: safety.color }]}>{safety.score}</Text>
        </View>
      </View>
      <Text style={styles.details}>
        🚶 {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)}
        {` · ${safety.label}`}
      </Text>
      {isSelected && (
        <Text style={styles.detailsSubtle}>
          Main roads: {safety.mainRoadRatio}% · Lighting: {safety.breakdown.lighting}% · CCTV: {safety.breakdown.cctv}%
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
