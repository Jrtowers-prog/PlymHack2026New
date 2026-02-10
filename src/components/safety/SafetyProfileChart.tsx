/**
 * SafetyProfileChart — Interactive safety profile visualisation.
 *
 * Shows a smooth line chart of segment safety scores with annotations
 * for road changes, dead ends, CCTV, etc.
 */
import { useMemo, useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { EnrichedSegment } from '@/src/services/safeRoutes';
import { lerpColor } from '@/src/utils/format';

interface SafetyProfileChartProps {
  segments: { score: number; color: string }[];
  enrichedSegments?: EnrichedSegment[];
  roadNameChanges?: Array<{ segmentIndex: number; name: string; distance: number }>;
  totalDistance?: number;
}

const CHART_H = 140;
const PAD_TOP = 14;
const PAD_BOT = 6;
const DRAW_H = CHART_H - PAD_TOP - PAD_BOT;
const ANNOTATION_H = 28;

export function SafetyProfileChart({
  segments,
  enrichedSegments,
  roadNameChanges,
  totalDistance,
}: SafetyProfileChartProps) {
  const [chartWidth, setChartWidth] = useState(0);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width);

  const segScores = useMemo(() => {
    if (enrichedSegments && enrichedSegments.length > 0) {
      return enrichedSegments.map((s) => s.safetyScore);
    }
    return segments.map((s) => s.score);
  }, [segments, enrichedSegments]);

  const smoothed = useMemo(() => {
    if (segScores.length === 0) return [];
    const raw = segScores;
    const windowSize = Math.max(3, Math.ceil(raw.length / 8));
    const half = Math.floor(windowSize / 2);
    return raw.map((_, i) => {
      let sum = 0;
      let count = 0;
      for (let j = i - half; j <= i + half; j++) {
        if (j >= 0 && j < raw.length) {
          sum += raw[j];
          count++;
        }
      }
      return sum / count;
    });
  }, [segScores]);

  const annotations = useMemo(() => {
    if (!enrichedSegments || !chartWidth || smoothed.length === 0) return [];
    const step = chartWidth / Math.max(1, smoothed.length - 1);
    const annots: Array<{ x: number; label: string; icon: string; color: string }> = [];
    const usedX: number[] = [];

    if (roadNameChanges) {
      for (const ch of roadNameChanges) {
        if (ch.segmentIndex < smoothed.length) {
          const x = ch.segmentIndex * step;
          if (!usedX.some((ux) => Math.abs(ux - x) < 50)) {
            usedX.push(x);
            annots.push({ x, label: ch.name.length > 14 ? ch.name.slice(0, 12) + '…' : ch.name, icon: '📍', color: '#475467' });
          }
        }
      }
    }

    for (let i = 0; i < enrichedSegments.length; i++) {
      const seg = enrichedSegments[i];
      const x = i * step;
      if (seg.isDeadEnd && !usedX.some((ux) => Math.abs(ux - x) < 40)) {
        usedX.push(x);
        annots.push({ x, label: 'Dead end', icon: '⛔', color: '#f97316' });
      }
      if (
        seg.surfaceType !== 'paved' && seg.surfaceType !== 'asphalt' && seg.surfaceType !== 'concrete' &&
        i > 0 && enrichedSegments[i - 1].surfaceType !== seg.surfaceType &&
        !usedX.some((ux) => Math.abs(ux - x) < 40)
      ) {
        usedX.push(x);
        annots.push({ x, label: seg.surfaceType, icon: '🪨', color: '#92400e' });
      }
      if (seg.cctvScore > 0 && (i === 0 || enrichedSegments[i - 1].cctvScore === 0) && !usedX.some((ux) => Math.abs(ux - x) < 40)) {
        usedX.push(x);
        annots.push({ x, label: 'CCTV', icon: '📷', color: '#7c3aed' });
      }
    }
    return annots;
  }, [enrichedSegments, chartWidth, smoothed, roadNameChanges]);

  const avg = useMemo(() => {
    if (smoothed.length === 0) return 0;
    return smoothed.reduce((a, b) => a + b, 0) / smoothed.length;
  }, [smoothed]);

  const points = useMemo(() => {
    if (!chartWidth || smoothed.length === 0) return [];
    const step = chartWidth / Math.max(1, smoothed.length - 1);
    return smoothed.map((val, i) => {
      const score100 = Math.round(val * 100);
      const c =
        val < 0.5 ? lerpColor(0xef4444, 0xeab308, val / 0.5) : lerpColor(0xeab308, 0x22c55e, (val - 0.5) / 0.5);
      return {
        x: i * step,
        y: PAD_TOP + DRAW_H * (1 - val),
        score: score100,
        color: c,
        raw: segments[i]?.score ?? val,
      };
    });
  }, [chartWidth, smoothed, segments]);

  const avgY = PAD_TOP + DRAW_H * (1 - avg);

  const chartRef = useRef<View>(null);
  const viewXRef = useRef(0);

  const idxFromX = (pageX: number, viewX: number) => {
    if (!chartWidth || points.length === 0) return null;
    const x = pageX - viewX;
    const step = chartWidth / Math.max(1, points.length - 1);
    const idx = Math.round(x / step);
    return Math.max(0, Math.min(points.length - 1, idx));
  };

  const handleTouchStart = (e: GestureResponderEvent) => {
    chartRef.current?.measureInWindow((wx: number) => {
      viewXRef.current = wx;
      setActiveIdx(idxFromX(e.nativeEvent.pageX, wx));
    });
  };
  const handleTouchMove = (e: GestureResponderEvent) => {
    setActiveIdx(idxFromX(e.nativeEvent.pageX, viewXRef.current));
  };

  const activePoint = activeIdx !== null ? points[activeIdx] : null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Safety Profile</Text>
        {activePoint ? (
          <View style={[styles.pill, { backgroundColor: activePoint.color + '22' }]}>
            <View style={[styles.pillDot, { backgroundColor: activePoint.color }]} />
            <Text style={[styles.pillText, { color: activePoint.color }]}>{activePoint.score}</Text>
          </View>
        ) : (
          <View style={[styles.pill, { backgroundColor: '#64748b18' }]}>
            <Text style={styles.pillHint}>Tap to inspect</Text>
          </View>
        )}
      </View>

      <View
        ref={chartRef}
        style={[styles.area, { height: CHART_H }]}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouchStart}
        onResponderMove={handleTouchMove}
        onResponderRelease={() => {}}
      >
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((v) => {
          const y = PAD_TOP + DRAW_H * (1 - v / 100);
          return (
            <View key={`g-${v}`} style={[styles.gridLine, { top: y }]}>
              {(v === 0 || v === 50 || v === 100) && <Text style={styles.gridLabel}>{v}</Text>}
            </View>
          );
        })}

        {/* Filled columns */}
        {points.map((pt, i) => {
          if (!chartWidth) return null;
          const step = chartWidth / Math.max(1, points.length - 1);
          const colW = Math.max(2, step + 1);
          const h = Math.max(0, CHART_H - PAD_BOT - pt.y);
          return (
            <View
              key={`area-${i}`}
              style={{
                position: 'absolute',
                left: pt.x - colW / 2,
                bottom: PAD_BOT,
                width: colW,
                height: h,
                backgroundColor: pt.color + '20',
              }}
            />
          );
        })}

        {/* Line segments */}
        {points.map((pt, i) => {
          if (i === 0) return null;
          const prev = points[i - 1];
          const dx = pt.x - prev.x;
          const dy = pt.y - prev.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View
              key={`ln-${i}`}
              style={{
                position: 'absolute',
                left: prev.x,
                top: prev.y - 1.5,
                width: len + 1,
                height: 3,
                borderRadius: 1.5,
                backgroundColor: pt.color,
                transform: [{ rotate: `${angle}deg` }],
                transformOrigin: '0 50%',
                opacity: 0.85,
              }}
            />
          );
        })}

        {/* Avg line */}
        <View style={[styles.avgLine, { top: avgY }]} />
        <View style={[styles.avgBadge, { top: avgY - 9 }]}>
          <Text style={styles.avgText}>avg {Math.round(avg * 100)}</Text>
        </View>

        {/* Active cursor */}
        {activePoint && (
          <>
            <View
              style={{
                position: 'absolute',
                left: activePoint.x - 0.5,
                top: PAD_TOP,
                width: 1,
                height: DRAW_H,
                backgroundColor: activePoint.color + '66',
                zIndex: 4,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: activePoint.x - 8,
                top: activePoint.y - 8,
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: activePoint.color + '33',
                zIndex: 5,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: activePoint.x - 5,
                top: activePoint.y - 5,
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: activePoint.color,
                borderWidth: 2,
                borderColor: '#ffffff',
                zIndex: 6,
              }}
            />
          </>
        )}
      </View>

      {/* Annotations */}
      {annotations.length > 0 && (
        <View style={{ height: ANNOTATION_H, position: 'relative', marginTop: 2 }}>
          {annotations.map((a, i) => (
            <View
              key={`ann-${i}`}
              style={{
                position: 'absolute',
                left: Math.max(0, Math.min(chartWidth - 60, a.x - 30)),
                top: 0,
                alignItems: 'center',
                width: 60,
              }}
            >
              <Text style={{ fontSize: 10, lineHeight: 12 }}>{a.icon}</Text>
              <Text
                style={{ fontSize: 7, color: a.color, textAlign: 'center', fontWeight: '600' }}
                numberOfLines={1}
              >
                {a.label}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* X axis */}
      <View style={styles.xAxis}>
        <Text style={styles.xLabel}>🏠 Start</Text>
        <Text style={[styles.xLabel, { color: '#cbd5e1' }]}>
          {totalDistance ? `${(totalDistance / 1000).toFixed(1)} km • ${segments.length} seg` : `── ${segments.length} segments ──`}
        </Text>
        <Text style={styles.xLabel}>📍 End</Text>
      </View>
    </View>
