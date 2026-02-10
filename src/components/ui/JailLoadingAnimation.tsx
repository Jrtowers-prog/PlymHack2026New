/**
 * JailLoadingAnimation — Animated "Jailing Criminals" loading indicator.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

const LOADING_STAGES = [
  { icon: '🔍', text: 'Scanning the streets…' },
  { icon: '🗺️', text: 'Mapping every dark alley…' },
  { icon: '💡', text: 'Counting street lights…' },
  { icon: '📹', text: 'Locating CCTV cameras…' },
  { icon: '🚨', text: 'Checking crime reports…' },
  { icon: '🔒', text: 'Locking down unsafe zones…' },
  { icon: '👮', text: 'Dispatching safety patrol…' },
  { icon: '⛓️', text: 'Jailing the criminals…' },
  { icon: '🛡️', text: 'Building your safe route…' },
  { icon: '✅', text: 'Almost there…' },
];

export function JailLoadingAnimation() {
  const [stageIdx, setStageIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const barWidth = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setStageIdx((prev) => (prev + 1) % LOADING_STAGES.length);
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      });
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(barWidth, { toValue: 1, duration: 3000, useNativeDriver: false }),
        Animated.timing(barWidth, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    ).start();
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -6, duration: 400, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const stage = LOADING_STAGES[stageIdx];

  return (
    <View style={styles.container}>
      <View style={styles.barsContainer}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <View key={i} style={styles.bar} />
        ))}
      </View>

      <Animated.View style={[styles.iconWrap, { transform: [{ translateY: bounceAnim }] }]}>
        <Text style={styles.icon}>{stage.icon}</Text>
      </Animated.View>

      <Animated.Text style={[styles.statusText, { opacity: fadeAnim }]}>
        {stage.text}
      </Animated.Text>

      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: barWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>

      <Text style={styles.subtitle}>Finding the safest path for you</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    gap: 12,
  },
  barsContainer: {
    position: 'absolute',
    top: 10,
    left: 20,
    right: 20,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    opacity: 0.06,
  },
  bar: {
    width: 4,
    height: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 2,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#bfdbfe',
  },
  icon: {
    fontSize: 30,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
  },
  progressTrack: {
    width: '80%',
    height: 5,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 3,
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
});
