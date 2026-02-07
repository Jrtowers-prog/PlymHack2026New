import { useCallback } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ActionButton } from '@/src/components/ActionButton';
import { SectionCard } from '@/src/components/SectionCard';
import { env } from '@/src/config/env';
import { useUserLocation } from '@/src/hooks/useUserLocation';

export default function HomeScreen() {
  const { state, refreshLocation, requestPermissionAndFetch } = useUserLocation();

  const openSettings = useCallback(() => {
    if (Platform.OS === 'web') {
      return;
    }
    void Linking.openSettings();
  }, []);

  const renderLocationStatus = () => {
    if (state.status === 'loading') {
      return (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#111827" />
          <Text style={[styles.statusText, styles.statusTextWithIcon]}>
            Getting your location...
          </Text>
        </View>
      );
    }

    if (state.status === 'error') {
      return <Text style={styles.statusError}>{state.errorMessage}</Text>;
    }

    if (state.status === 'denied') {
      return (
        <Text style={styles.statusError}>
          {Platform.OS === 'web'
            ? 'Location access is denied. Update your browser settings, then refresh to enable maps.'
            : 'Location access is denied. Enable it to show the map preview and navigation.'}
        </Text>
      );
    }

    if (state.status === 'ready' && state.coords) {
      return (
        <View>
          <Text style={styles.statusText}>Location confirmed.</Text>
          <Text style={styles.coordsText}>
            {state.coords.latitude.toFixed(5)}, {state.coords.longitude.toFixed(5)}
          </Text>
        </View>
      );
    }

    return <Text style={styles.statusText}>Location access is not yet granted.</Text>;
  };

  const primaryAction =
    state.permission === 'granted' ? 'Refresh location' : 'Enable location';

  const onPrimaryAction =
    state.permission === 'granted' ? refreshLocation : requestPermissionAndFetch;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Executive Summary</Text>
        <Text style={styles.subtitle}>
          Location-aware map features are configured here first to unlock navigation.
        </Text>
      </View>

      <SectionCard
        title="Map Access"
        description="We request your location so the Google Maps experience can center on your position."
        footer={
          env.hasGoogleMapsApiKey
            ? undefined
            : 'Google Maps API key is missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to enable maps.'
        }
      >
        {renderLocationStatus()}

        <View style={styles.actionsRow}>
          <View style={styles.actionItem}>
            <ActionButton label={primaryAction} onPress={onPrimaryAction} />
          </View>
          {state.permission === 'denied' &&
          state.canAskAgain === false &&
          Platform.OS !== 'web' ? (
            <View style={styles.actionItem}>
              <ActionButton
                label="Open settings"
                onPress={openSettings}
                variant="secondary"
              />
            </View>
          ) : null}
        </View>
      </SectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f8fafc',
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    color: '#1f2937',
  },
  statusTextWithIcon: {
    marginLeft: 8,
  },
  statusError: {
    fontSize: 14,
    color: '#b91c1c',
  },
  coordsText: {
    marginTop: 6,
    fontSize: 13,
    color: '#4b5563',
  },
  actionsRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionItem: {
    marginRight: 10,
    marginBottom: 10,
  },
});
