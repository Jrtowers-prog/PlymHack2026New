import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashScreen } from '@/src/components/AnimatedSplashScreen';
import LoginModal from '@/src/components/modals/LoginModal';
import { UpdateBanner } from '@/src/components/ui/UpdateBanner';
import { useAuth } from '@/src/hooks/useAuth';
import { useUpdateCheck } from '@/src/hooks/useUpdateCheck';

// Hide native splash as fast as possible
SplashScreen.preventAutoHideAsync().then(() => SplashScreen.hideAsync());

const MIN_SPLASH_MS = 3500;

export default function RootLayout() {
  const [splashVisible, setSplashVisible] = useState(true);
  const [appReady, setAppReady] = useState(false);
  const [minTimePassed, setMinTimePassed] = useState(false);
  const update = useUpdateCheck();
  const auth = useAuth();

  // Start minimum timer on mount
  useEffect(() => {
    const timer = setTimeout(() => setMinTimePassed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  // Mark app as ready once the main content has mounted
  const onMainLayout = useCallback(() => {
    setAppReady(true);
  }, []);

  // Dismiss splash when both conditions are met AND auth check is complete
  useEffect(() => {
    if (appReady && minTimePassed && !auth.isLoading) {
      setSplashVisible(false);
    }
  }, [appReady, minTimePassed, auth.isLoading]);

  // Show login modal after splash if not authenticated
  const showLoginGate = !splashVisible && !auth.isLoggedIn;

  return (
    <View style={styles.root}>
      {/* App loads underneath the splash */}
      <View 
        style={[
          styles.app, 
          !splashVisible && styles.appVisible,
          showLoginGate && styles.appBlocked
        ]} 
        onLayout={onMainLayout}
      >
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

      {/* Web: Opaque backdrop when login gate is active */}
      {Platform.OS === 'web' && showLoginGate && (
        <View style={styles.webBackdrop} />
      )}

      {/* Auth gate — force login before accessing app */}
      <LoginModal
        visible={showLoginGate}
        onClose={() => {}} // Cannot close - mandatory login
        onSendMagicLink={auth.sendMagicLink}
        onVerify={auth.verify}
        error={auth.error}
        dismissable={false}
      />
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
  appBlocked: {
    pointerEvents: 'none',
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  webBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8FAFC',
    zIndex: 9,
  },
});
