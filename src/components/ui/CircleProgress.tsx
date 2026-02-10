/**
 * CircleProgress — Pure RN circular progress indicator.
 * Uses rotation-based clip technique (no SVG needed).
 */
import { Text, View } from 'react-native';

interface CircleProgressProps {
  size: number;
  strokeWidth: number;
  progress: number; // 0–100
  color: string;
}

export function CircleProgress({ size, strokeWidth, progress, color }: CircleProgressProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  const isMoreThanHalf = clamped > 50;
  const rightRotation = isMoreThanHalf ? 180 : (clamped / 50) * 180;
  const leftRotation = isMoreThanHalf ? ((clamped - 50) / 50) * 180 : 0;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Background circle */}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: '#e5e7eb',
          position: 'absolute',
        }}
      />
      {/* Right half */}
      <View style={{ position: 'absolute', width: size, height: size, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', width: size / 2, height: size, right: 0, overflow: 'hidden' }}>
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: strokeWidth,
              borderColor: color,
              borderLeftColor: 'transparent',
              borderBottomColor: 'transparent',
              transform: [{ rotate: `${rightRotation}deg` }],
              position: 'absolute',
              right: 0,
            }}
          />
        </View>
      </View>
      {/* Left half (only when > 50%) */}
