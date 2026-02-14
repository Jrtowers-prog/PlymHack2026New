/**
 * LoginModal.tsx — Magic link login modal.
 *
 * Two steps:
 * 1. Enter email + name → sends magic link
 * 2. Enter OTP code from email → verifies
 *
 * Shown when unauthenticated user tries to use buddy features.
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { PathfindingAnimation } from '../PathfindingAnimation';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSendMagicLink: (email: string, name: string) => Promise<boolean>;
  onVerify: (email: string, token: string) => Promise<boolean>;
  error: string | null;
  dismissable?: boolean;
}

type Step = 'email' | 'otp';

export default function LoginModal({
  visible,
  onClose,
  onSendMagicLink,
  onVerify,
  error,
  dismissable = true,
}: Props) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSend = useCallback(async () => {
    if (!isEmailValid || !name.trim()) return;
    setIsLoading(true);
    const ok = await onSendMagicLink(email.trim().toLowerCase(), name.trim());
    setIsLoading(false);
    if (ok) {
      setStep('otp');
    } else {
      Alert.alert('Error', error || 'Failed to send login code. Try again.');
    }
  }, [email, name, isEmailValid, onSendMagicLink, error]);

  const handleVerify = useCallback(async () => {
    if (otp.length < 6) return;
    setIsLoading(true);
    const ok = await onVerify(email.trim().toLowerCase(), otp.trim());
    setIsLoading(false);
    if (ok) {
      // Reset state and close
      setStep('email');
      setEmail('');
      setName('');
      setOtp('');
      onClose();
    } else {
      Alert.alert('Error', error || 'Invalid or expired code. Try again.');
    }
  }, [email, otp, onVerify, error, onClose]);

  const handleClose = useCallback(() => {
    setStep('email');
    setEmail('');
    setName('');
    setOtp('');
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
      presentationStyle={Platform.OS === 'web' ? 'fullScreen' : 'pageSheet'}
      onRequestClose={dismissable ? handleClose : undefined}
      transparent={false}
    >
      {/* Web: Background animation */}
      {Platform.OS === 'web' && (
        <View style={styles.webBackground}>
          <PathfindingAnimation duration={18000} loop opacity={0.15} />
        </View>
      )}

      <KeyboardAvoidingView
        style={[
          styles.container,
          Platform.OS === 'web' && styles.webContainer,
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            Platform.OS === 'web' && styles.webScrollContent,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[
            styles.card,
            Platform.OS === 'web' && styles.webCard,
          ]}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>
                {step === 'email' ? 'Log In' : 'Enter Code'}
              </Text>
              {dismissable && (
                <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={12}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </Pressable>
              )}
            </View>

            <View style={styles.content}>
              {step === 'email' ? (
            <>
              <View style={styles.iconWrap}>
                <Ionicons name="shield-checkmark" size={48} color="#6366F1" />
              </View>
              <Text style={styles.heading}>Sign in to SafeNight</Text>
              <Text style={styles.subtitle}>
                We'll send a magic link to your email — no password needed.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor="#94A3B8"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
              />

              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor="#94A3B8"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />

              <Pressable
                style={[
                  styles.button,
                  (!isEmailValid || !name.trim()) && styles.buttonDisabled,
                ]}
                onPress={handleSend}
                disabled={!isEmailValid || !name.trim() || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Send Login Code</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.iconWrap}>
                <Ionicons name="mail" size={48} color="#6366F1" />
              </View>
              <Text style={styles.heading}>Check your email</Text>
              <Text style={styles.subtitle}>
                We sent a 6-digit code to{'\n'}
                <Text style={styles.emailHighlight}>{email}</Text>
              </Text>

              <TextInput
                style={[styles.input, styles.otpInput]}
                placeholder="000000"
                placeholderTextColor="#94A3B8"
                value={otp}
                onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                textAlign="center"
              />

              <Pressable
                style={[
                  styles.button,
                  otp.length < 6 && styles.buttonDisabled,
                ]}
                onPress={handleVerify}
                disabled={otp.length < 6 || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Verify</Text>
                )}
              </Pressable>

              <Pressable
                style={styles.linkBtn}
                onPress={() => {
                  setStep('email');
                  setOtp('');
                }}
              >
                <Text style={styles.linkText}>Use a different email</Text>
              </Pressable>
            </>
          )}

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  webBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F1F5F9',
  },
  webContainer: {
    backgroundColor: 'transparent',
  },
  scrollContent: {
    flexGrow: 1,
  },
  webScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  card: {
    flex: 1,
  },
  webCard: {
    flex: 0,
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
    overflow: 'hidden',
  } as any,
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: Platform.OS === 'web' ? 1 : 0,
    borderBottomColor: '#E2E8F0',
  } as any,
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    flex: Platform.OS === 'web' ? 0 : 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: Platform.OS === 'web' ? 32 : 60,
  } as any,
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  emailHighlight: {
    fontWeight: '700',
    color: '#6366F1',
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
    backgroundColor: '#FFF',
    marginBottom: 12,
  },
  otpInput: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 12,
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
  linkBtn: {
    marginTop: 16,
    padding: 8,
  },
  linkText: {
    color: '#6366F1',
    fontWeight: '600',
    fontSize: 14,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 16,
    width: '100%',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
