/**
 * NavigationOverlay — Turn-by-turn UI during active navigation.
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, Platform } from 'react-native';

import type { NavigationInfo } from '@/src/hooks/useNavigation';
import { formatDistance, formatDuration, maneuverIcon, stripHtml } from '@/src/utils/format';

interface NavigationOverlayProps {
  nav: NavigationInfo;
  topInset: number;
  bottomInset: number;
}

export function NavigationOverlay({ nav, topInset, bottomInset }: NavigationOverlayProps) {
  const isActive = nav.state === 'navigating' || nav.state === 'off-route';

  if (!isActive && nav.state !== 'arrived') return null;

  return (
    <>
      {isActive && (
        <View style={[styles.overlay, { pointerEvents: 'box-none' }]}>
          {/* Instruction card */}
          <View style={[styles.instructionCard, { marginTop: topInset + 8 }]}>
            <View style={styles.iconRow}>
              <Ionicons
                name={maneuverIcon(nav.currentStep?.maneuver) as any}
                size={28}
                color="#1570EF"
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.distance}>
                  {nav.distanceToNextTurn < 1000
                    ? `${nav.distanceToNextTurn} m`
                    : `${(nav.distanceToNextTurn / 1000).toFixed(1)} km`}
                </Text>
                <Text style={styles.instruction} numberOfLines={2}>
                  {stripHtml(nav.currentStep?.instruction ?? 'Continue on route')}
                </Text>
              </View>
            </View>
            {nav.nextStep && (
              <Text style={styles.then} numberOfLines={1}>
                Then: {stripHtml(nav.nextStep.instruction)}
              </Text>
            )}
          </View>

          {/* Bottom bar */}
          <View style={[styles.bottomBar, { marginBottom: bottomInset + 8 }]}>
            <View>
              <Text style={styles.remaining}>
                {formatDistance(nav.remainingDistance)} · {formatDuration(nav.remainingDuration)}
              </Text>
              {nav.state === 'off-route' && (
                <Text style={styles.offRoute}>Off route — rerouting…</Text>
              )}
            </View>
            <Pressable style={styles.stopButton} onPress={nav.stop}>
              <Ionicons name="stop-circle" size={20} color="#ffffff" />
              <Text style={styles.stopText}>Stop</Text>
            </Pressable>
          </View>
        </View>
      )}

      {nav.state === 'arrived' && (
        <View style={[styles.arrivedBanner, { bottom: bottomInset + 16 }]}>
          <Ionicons name="checkmark-circle" size={28} color="#22c55e" />
          <Text style={styles.arrivedText}>You have arrived!</Text>
          <Pressable style={styles.dismissButton} onPress={nav.stop}>
            <Text style={styles.dismissText}>Done</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
