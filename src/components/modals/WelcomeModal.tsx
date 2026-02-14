/**
 * WelcomeModal — Post-login onboarding wizard.
 *
 * Three steps:
 * 1. Welcome + username setup
 * 2. Location permission
 * 3. Buddy system intro
 *
 * Shown once after first login. Persisted via AsyncStorage.
 */

import { setOnboardingAccepted } from '@/src/services/onboarding';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

const WELCOME_KEY = 'safenight_welcome_done_v1';
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

interface Props {
  visible: boolean;
  onComplete: () => void;
  userName: string;
  currentUsername: string | null;
  onSetUsername: (username: string) => Promise<boolean>;
  onAcceptLocation: () => void;
  hasLocationPermission: boolean;
}

type Step = 'welcome' | 'location' | 'buddy';

export default function WelcomeModal({
  visible,
  onComplete,
  userName,
  currentUsername,
  onSetUsername,
  onAcceptLocation,
  hasLocationPermission,
}: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [username, setUsername] = useState(currentUsername ?? '');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'granted' | 'denied'>(
    hasLocationPermission ? 'granted' : 'idle',
  );

  // Sync location status from prop
  useEffect(() => {
    if (hasLocationPermission) setLocationStatus('granted');
  }, [hasLocationPermission]);

  // ─── Step 1: Welcome + Username ────────────────────────────────────────────

  const handleSaveUsername = useCallback(async () => {
    const clean = username.trim();
    if (!USERNAME_RE.test(clean)) {
      setUsernameError('3-20 characters, letters, numbers, and underscores only.');
      return;
    }
    setSaving(true);
    setUsernameError(null);
    const ok = await onSetUsername(clean);
    setSaving(false);
    if (ok) {
      setStep('location');
    } else {
      setUsernameError('Username taken. Try another one.');
    }
  }, [username, onSetUsername]);

  const handleSkipUsername = useCallback(() => {
    setStep('location');
  }, []);

  // ─── Step 2: Location ──────────────────────────────────────────────────────

  const handleEnableLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      setLocationStatus('granted');
      onAcceptLocation();
      // Auto-advance after a beat
      setTimeout(() => setStep('buddy'), 600);
    } else {
      setLocationStatus('denied');
    }
  }, [onAcceptLocation]);

  const handleSkipLocation = useCallback(() => {
    setStep('buddy');
  }, []);

  // ─── Step 3: Buddy ────────────────────────────────────────────────────────

  const handleFinish = useCallback(async () => {
    await AsyncStorage.setItem(WELCOME_KEY, 'true');
    // Also mark old onboarding as done so OnboardingModal never shows
    await setOnboardingAccepted();
    onComplete();
  }, [onComplete]);

  // ─── Progress dots ─────────────────────────────────────────────────────────

  const steps: Step[] = ['welcome', 'location', 'buddy'];
  const stepIndex = steps.indexOf(step);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, Platform.OS === 'web' && styles.webCard]}>
          {/* Progress dots */}
          <View style={styles.dots}>
            {steps.map((s, i) => (
              <View
                key={s}
                style={[styles.dot, i <= stepIndex && styles.dotActive]}
              />
            ))}
          </View>

          {/* ─── Step 1: Welcome ─── */}
          {step === 'welcome' && (
            <View style={styles.stepContent}>
              <View style={styles.iconCircle}>
                <Ionicons name="hand-left" size={36} color="#6366F1" />
              </View>
              <Text style={styles.heading}>
                Welcome{userName ? `, ${userName.split(' ')[0]}` : ''}!
              </Text>
              <Text style={styles.subtext}>
                Let's get you set up. Pick a username so your friends can find you.
              </Text>

              <TextInput
                style={[styles.input, usernameError && styles.inputError]}
                placeholder="e.g. nightwalker42"
                placeholderTextColor="#94A3B8"
                value={username}
                onChangeText={(t) => {
                  setUsername(t.replace(/[^a-zA-Z0-9_]/g, ''));
                  setUsernameError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
              />
              {usernameError && (
                <Text style={styles.errorText}>{usernameError}</Text>
              )}

              <Pressable
                style={[styles.button, !username.trim() && styles.buttonDisabled]}
                onPress={handleSaveUsername}
                disabled={!username.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Set Username</Text>
                )}
              </Pressable>

              <Pressable style={styles.skipBtn} onPress={handleSkipUsername}>
                <Text style={styles.skipText}>Skip for now</Text>
              </Pressable>
            </View>
          )}

          {/* ─── Step 2: Location ─── */}
          {step === 'location' && (
            <View style={styles.stepContent}>
              <View style={[styles.iconCircle, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="location" size={36} color="#10B981" />
              </View>
              <Text style={styles.heading}>Enable Location</Text>
              <Text style={styles.subtext}>
                SafeNight uses your location to find the safest walking routes near you. Your location is never shared without your permission.
              </Text>

              {locationStatus === 'granted' ? (
                <View style={styles.successRow}>
                  <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                  <Text style={styles.successText}>Location enabled</Text>
                </View>
              ) : locationStatus === 'denied' ? (
                <>
                  <View style={styles.warningRow}>
                    <Ionicons name="alert-circle" size={22} color="#F59E0B" />
                    <Text style={styles.warningText}>
                      Permission denied. You can enable it later in Settings.
                    </Text>
                  </View>
                  <Pressable style={styles.button} onPress={handleSkipLocation}>
                    <Text style={styles.buttonText}>Continue</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable style={styles.button} onPress={handleEnableLocation}>
                    <Text style={styles.buttonText}>Enable Location</Text>
                  </Pressable>
                  <Pressable style={styles.skipBtn} onPress={handleSkipLocation}>
                    <Text style={styles.skipText}>Not now</Text>
                  </Pressable>
                </>
              )}

              {locationStatus === 'granted' && (
                <Pressable
                  style={[styles.button, { marginTop: 16 }]}
                  onPress={() => setStep('buddy')}
                >
                  <Text style={styles.buttonText}>Continue</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* ─── Step 3: Buddy System ─── */}
          {step === 'buddy' && (
            <View style={styles.stepContent}>
              <View style={[styles.iconCircle, { backgroundColor: '#FFF7ED' }]}>
                <Ionicons name="people" size={36} color="#F97316" />
              </View>
              <Text style={styles.heading}>Buddy System</Text>
              <Text style={styles.subtext}>
                Add emergency contacts and share your live location while walking. Your buddies get notified when you start a journey.
              </Text>

              <View style={styles.featureList}>
                <FeatureRow icon="qr-code" text="Pair with friends via QR code" />
                <FeatureRow icon="navigate" text="Share live location while navigating" />
                <FeatureRow icon="notifications" text="Buddies get notified if you need help" />
              </View>

              <Pressable style={styles.button} onPress={handleFinish}>
                <Text style={styles.buttonText}>Get Started</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Check if the user has completed the welcome flow */
export async function hasCompletedWelcome(): Promise<boolean> {
  const val = await AsyncStorage.getItem(WELCOME_KEY);
  return val === 'true';
}

// ─── FeatureRow helper ───────────────────────────────────────────────────────

function FeatureRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureRow}>
      <Ionicons name={icon as any} size={20} color="#6366F1" style={styles.featureIcon} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    ...(Platform.OS !== 'web'
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 12 }
      : {}),
  } as any,
  webCard: {
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
  } as any,
  dots: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 8,
    marginBottom: 28,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
  },
  dotActive: {
    backgroundColor: '#6366F1',
    width: 24,
  },
  stepContent: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  input: {
    width: '100%',
    height: 52,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  button: {
    backgroundColor: '#6366F1',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
  skipBtn: {
    marginTop: 12,
    padding: 8,
  },
  skipText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 14,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  successText: {
    color: '#10B981',
    fontWeight: '600',
    fontSize: 15,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  warningText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  featureList: {
    width: '100%',
    gap: 14,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    width: 24,
  },
  featureText: {
    fontSize: 15,
    color: '#334155',
    fontWeight: '500',
    flex: 1,
  },
});
