import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Dimensions, Image, StyleSheet, View } from 'react-native';
import { PathfindingAnimation } from './PathfindingAnimation';

const { width, height } = Dimensions.get('window');

interface AnimatedSplashScreenProps {
  onFinish: () => void;
  duration?: number;
}

export const AnimatedSplashScreen: React.FC<AnimatedSplashScreenProps> = ({
  onFinish,
  duration = 3000,
}) => {
  // Ring animations (expanding safety zones)
  const ring1Opacity = useRef(new Animated.Value(0)).current;
  const ring1Scale = useRef(new Animated.Value(0.3)).current;
  
  const ring2Opacity = useRef(new Animated.Value(0)).current;
  const ring2Scale = useRef(new Animated.Value(0.3)).current;
  
  const ring3Opacity = useRef(new Animated.Value(0)).current;
  const ring3Scale = useRef(new Animated.Value(0.3)).current;

  // Logo pulse
  const logoPulse = useRef(new Animated.Value(1)).current;

  // Eye/awareness animation (vertical scan)
  const eyeScan = useRef(new Animated.Value(0)).current;

  // Safety path animation
  const pathOpacity = useRef(new Animated.Value(0)).current;
  const pathScale = useRef(new Animated.Value(0.8)).current;

  // Overall fade out at end
  const fadeOut = useRef(new Animated.Value(1)).current;

  const startAnimations = useCallback(() => {
    // Ring 1 animation (expands first)
    Animated.loop(
      Animated.sequence([
        Animated.timing(ring1Opacity, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.timing(ring1Scale, {
          toValue: 0.3,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(ring1Opacity, {
            toValue: 0.6,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(ring1Scale, {
            toValue: 1.2,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(ring1Opacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Ring 2 animation (staggered)
    Animated.loop(
      Animated.sequence([
        Animated.delay(300),
        Animated.timing(ring2Opacity, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.timing(ring2Scale, {
          toValue: 0.3,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(ring2Opacity, {
            toValue: 0.6,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(ring2Scale, {
            toValue: 1.2,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(ring2Opacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Ring 3 animation (final ring)
    Animated.loop(
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(ring3Opacity, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.timing(ring3Scale, {
          toValue: 0.3,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(ring3Opacity, {
            toValue: 0.6,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(ring3Scale, {
            toValue: 1.2,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(ring3Opacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Logo pulse and scale
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoPulse, {
          toValue: 1.1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(logoPulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(logoPulse, {
          toValue: 1.05,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(logoPulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Eye scan animation (awareness of surroundings)
    Animated.loop(
      Animated.sequence([
        Animated.timing(eyeScan, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(eyeScan, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Path animation
    Animated.loop(
      Animated.sequence([
        Animated.delay(400),
        Animated.parallel([
          Animated.timing(pathOpacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pathScale, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(600),
        Animated.parallel([
          Animated.timing(pathOpacity, {
            toValue: 0.4,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pathScale, {
            toValue: 0.9,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();

    // Fade out at the end (only if duration is reasonable)
    if (duration < 60000) {
      const timer = setTimeout(() => {
        Animated.timing(fadeOut, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => {
          onFinish();
        });
      }, duration - 500);
      return () => clearTimeout(timer);
    }
  }, [duration, onFinish]);

  useEffect(() => {
    startAnimations();
  }, [startAnimations]);

  const eyeScanY = eyeScan.interpolate({
    inputRange: [0, 1],
    outputRange: [-30, 30],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeOut,
        },
      ]}
    >
      {/* Background */}
      <View style={styles.background} />

      {/* Pathfinding animation in the background */}
      <PathfindingAnimation />

      {/* Center content */}
      <View style={styles.centerContainer}>
        {/* Logo (below animations) */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Expanding safety rings (on top of logo) */}
        <Animated.View
          style={[
            styles.ring,
            {
              opacity: ring1Opacity,
              transform: [{ scale: ring1Scale }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.ring,
            {
              opacity: ring2Opacity,
              transform: [{ scale: ring2Scale }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.ring,
            {
              opacity: ring3Opacity,
              transform: [{ scale: ring3Scale }],
            },
          ]}
        />

        {/* Eye scan indicator (on top of logo) */}
        <Animated.View
          style={[
            styles.eyeScan,
            {
              transform: [{ translateY: eyeScanY }],
            },
          ]}
        />

        {/* Logo pulse overlay (scales on top) */}
        <Animated.View
          style={[
            styles.logoPulseOverlay,
            {
              transform: [{ scale: logoPulse }],
              opacity: logoPulse.interpolate({
                inputRange: [1, 1.1],
                outputRange: [0, 0.15],
              }),
            },
          ]}
        />
      </View>


    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8FAFC',
  },
  ring: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: '#1E3A8A',
    opacity: 0,
    zIndex: 2,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  logoContainer: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  logoPulseOverlay: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#1E3A8A',
    zIndex: 3,
  },
  eyeScan: {
    position: 'absolute',
    width: 160,
    height: 3,
    backgroundColor: '#1E3A8A',
    borderRadius: 1.5,
    opacity: 0.5,
    zIndex: 4,
  },
});
