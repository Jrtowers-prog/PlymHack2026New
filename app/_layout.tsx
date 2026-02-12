import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UpdateBanner } from '@/src/components/ui/UpdateBanner';
import { useUpdateCheck } from '@/src/hooks/useUpdateCheck';

export default function RootLayout() {
  const update = useUpdateCheck();

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" translucent />
      <Stack screenOptions={{ headerShown: false }} />
      <UpdateBanner update={update} />
    </SafeAreaProvider>
  );
}
