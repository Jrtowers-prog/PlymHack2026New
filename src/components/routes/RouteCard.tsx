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
  card: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#eaecf0',
    backgroundColor: '#ffffff',
  },
  cardSelected: {
    borderColor: '#1570ef',
    backgroundColor: '#f0f9ff',
  },
  cardBest: {
    borderColor: '#22c55e',
    backgroundColor: '#f0fdf4',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
  },
  labelSelected: {
    color: '#1570ef',
  },
  labelBest: {
    color: '#16a34a',
  },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  scoreChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  scoreChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  details: {
    fontSize: 14,
    color: '#667085',
  },
  detailsSubtle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
});
