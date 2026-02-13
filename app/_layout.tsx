import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashScreen } from '@/src/components/AnimatedSplashScreen';
import { UpdateBanner } from '@/src/components/ui/UpdateBanner';
import { useUpdateCheck } from '@/src/hooks/useUpdateCheck';

// Hide native splash as fast as possible
SplashScreen.preventAutoHideAsync().then(() => SplashScreen.hideAsync());

const MIN_SPLASH_MS = 3500;

export default function RootLayout() {
  const [splashVisible, setSplashVisible] = useState(true);
  const [appReady, setAppReady] = useState(false);
  const [minTimePassed, setMinTimePassed] = useState(false);
  const update = useUpdateCheck();

  // Start minimum timer on mount
  useEffect(() => {
    const timer = setTimeout(() => setMinTimePassed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  // Mark app as ready once the main content has mounted
  const onMainLayout = useCallback(() => {
    setAppReady(true);
  }, []);

  // Dismiss splash when both conditions are met
  useEffect(() => {
    if (appReady && minTimePassed) {
      setSplashVisible(false);
    }
  }, [appReady, minTimePassed]);

  return (
    <View style={styles.root}>
      {/* App loads underneath the splash */}
      <View style={[styles.app, !splashVisible && styles.appVisible]} onLayout={onMainLayout}>
        <SafeAreaProvider>
          <StatusBar style="dark" translucent />
          <Stack screenOptions={{ headerShown: false }} />
          <UpdateBanner update={update} />
        </SafeAreaProvider>
      </View>

      {/* Splash overlays on top while loading */}
      {splashVisible && (
        <View style={styles.splashOverlay}>
          <AnimatedSplashScreen
            onFinish={() => {
              // Animation loops, so this is only called by the fade-out
              // which we trigger via the duration prop — but now we control
              // dismissal via state, so just keep it as a no-op
            }}
            duration={999999}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  app: {
    flex: 1,
    opacity: 0,
  },
  appVisible: {
    opacity: 1,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
});
