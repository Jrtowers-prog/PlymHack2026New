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
