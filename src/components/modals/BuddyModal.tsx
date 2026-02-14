/**
 * BuddyModal.tsx — QR code pairing modal.
 *
 * Two tabs:
 * 1. "My QR" — Shows your QR code (username) for others to scan
 * 2. "Scan"  — Camera scanner to scan a friend's QR code
 *
 * Also shows:
 * - List of accepted contacts (with live status indicator)
 * - Pending incoming requests with accept/reject buttons
 */

import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useContacts } from '../../hooks/useContacts';

const { width: SCREEN_W } = Dimensions.get('window');
const QR_SIZE = Math.min(SCREEN_W * 0.55, 220);

interface Props {
  visible: boolean;
  onClose: () => void;
  username: string | null;
  userId: string | null;
}

type Tab = 'qr' | 'scan' | 'contacts';

export default function BuddyModal({ visible, onClose, username: initialUsername, userId }: Props) {
  const [tab, setTab] = useState<Tab>('qr');
  const [hasScanned, setHasScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const {
    contacts,
    pending,
    username,
    isLoading,
    error,
    setUsername,
    lookupUser,
    invite,
    respond,
    removeContact,
    clearError,
    refresh,
    liveContacts,
  } = useContacts(true);

  const currentUsername = username || initialUsername;

  // Reset scan state when switching tabs
  useEffect(() => {
    if (tab === 'scan') setHasScanned(false);
  }, [tab]);

  // ─── Handle QR scan ───────────────────────────────────────────────────
  const handleBarCodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (hasScanned) return;
      setHasScanned(true);

      // QR data is the username
      const scannedUsername = data.trim().replace('safenight://', '');

      const user = await lookupUser(scannedUsername);
      if (!user) {
        Alert.alert('Not Found', 'This user was not found on SafeNight.', [
          { text: 'OK', onPress: () => setHasScanned(false) },
        ]);
        return;
      }

      Alert.alert(
        'Add Contact',
        `Add ${user.name || user.username} as an emergency contact?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setHasScanned(false) },
          {
            text: 'Add',
            onPress: async () => {
              const ok = await invite(user.id, user.name);
              if (ok) {
                Alert.alert('Sent!', 'Contact request sent.');
                setTab('contacts');
              } else {
                setHasScanned(false);
              }
            },
          },
        ],
      );
    },
    [hasScanned, lookupUser, invite],
  );

  // ─── Handle contact response ──────────────────────────────────────────
  const handleRespond = useCallback(
    (id: string, name: string, resp: 'accepted' | 'rejected') => {
      Alert.alert(
        resp === 'accepted' ? 'Accept Contact' : 'Reject Contact',
        `${resp === 'accepted' ? 'Accept' : 'Reject'} ${name}'s request?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: resp === 'accepted' ? 'Accept' : 'Reject', onPress: () => respond(id, resp) },
        ],
      );
    },
    [respond],
  );

  const handleRemove = useCallback(
    (id: string, name: string) => {
      Alert.alert('Remove Contact', `Remove ${name} as your emergency contact?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeContact(id),
        },
      ]);
    },
    [removeContact],
  );

  // ─── Render tabs ──────────────────────────────────────────────────────
  const renderMyQR = () => (
    <View style={styles.tabContent}>
      {currentUsername ? (
        <>
          <Text style={styles.subtitle}>Show this to a friend to add you</Text>
          <View style={styles.qrContainer}>
            <QRCode
              value={`safenight://${currentUsername}`}
              size={QR_SIZE}
              backgroundColor="#FFFFFF"
              color="#1E293B"
            />
          </View>
          <View style={styles.usernameTag}>
            <Ionicons name="person" size={16} color="#6366F1" />
            <Text style={styles.usernameText}>@{currentUsername}</Text>
          </View>
        </>
      ) : (
        <View style={styles.usernameSetup}>
          <Ionicons name="alert-circle" size={40} color="#F59E0B" />
          <Text style={styles.subtitle}>No username set</Text>
          <Text style={styles.hint}>
            Your username should have been set during onboarding. Please log out and log back in to complete setup.
          </Text>
        </View>
      )}
    </View>
  );

  const renderScanner = () => {
    if (!permission?.granted) {
      return (
        <View style={styles.tabContent}>
          <Ionicons name="camera" size={48} color="#94A3B8" />
          <Text style={styles.subtitle}>Camera access needed to scan QR codes</Text>
          <Pressable style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Allow Camera</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.scannerContainer}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={hasScanned ? undefined : handleBarCodeScanned}
        >
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.scanText}>
              Point at a friend's SafeNight QR code
            </Text>
          </View>
        </CameraView>
      </View>
    );
  };

  const renderContacts = () => (
    <ScrollView style={styles.contactsList} showsVerticalScrollIndicator={false}>
      {/* Pending requests */}
      {pending.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>
            Pending Requests ({pending.length})
          </Text>
          {pending.map((p) => (
            <View key={p.id} style={styles.contactRow}>
              <View style={styles.contactInfo}>
                <Ionicons name="person-add" size={20} color="#F59E0B" />
                <View style={styles.contactText}>
                  <Text style={styles.contactName}>
                    {p.from.name || p.from.username || 'Unknown'}
                  </Text>
                  {p.from.username && (
                    <Text style={styles.contactUsername}>@{p.from.username}</Text>
                  )}
                </View>
              </View>
              <View style={styles.actionButtons}>
                <Pressable
                  style={[styles.smallBtn, styles.acceptBtn]}
                  onPress={() =>
                    handleRespond(p.id, p.from.name || 'this user', 'accepted')
                  }
                >
                  <Ionicons name="checkmark" size={18} color="#FFF" />
                </Pressable>
                <Pressable
                  style={[styles.smallBtn, styles.rejectBtn]}
                  onPress={() =>
                    handleRespond(p.id, p.from.name || 'this user', 'rejected')
                  }
                >
                  <Ionicons name="close" size={18} color="#FFF" />
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Active contacts */}
      <Text style={styles.sectionTitle}>
        Emergency Contacts ({contacts.length})
      </Text>
      {contacts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={36} color="#94A3B8" />
          <Text style={styles.emptyText}>No contacts yet</Text>
          <Text style={styles.emptyHint}>
            Scan a friend's QR code to add them
          </Text>
        </View>
      ) : (
        contacts.map((c) => (
          <View key={c.id} style={styles.contactRow}>
            <View style={styles.contactInfo}>
              {c.is_live ? (
                <View style={styles.liveIndicator}>
                  <Ionicons name="radio" size={18} color="#22C55E" />
                </View>
              ) : (
                <Ionicons name="person" size={20} color="#6366F1" />
              )}
              <View style={styles.contactText}>
                <Text style={styles.contactName}>
                  {c.nickname || c.user.name || c.user.username || 'Unknown'}
                </Text>
                {c.user.username && (
                  <Text style={styles.contactUsername}>@{c.user.username}</Text>
                )}
                {c.is_live && c.live_session && (
                  <Text style={styles.liveText}>
                    Walking{c.live_session.destination_name
                      ? ` to ${c.live_session.destination_name}`
                      : ''}
                  </Text>
                )}
              </View>
            </View>
            <Pressable
              style={[styles.smallBtn, styles.removeBtn]}
              onPress={() =>
                handleRemove(c.id, c.nickname || c.user.name || 'this contact')
              }
            >
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Safety Circle</Text>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={24} color="#64748B" />
          </Pressable>
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {(['qr', 'scan', 'contacts'] as Tab[]).map((t) => (
            <Pressable
              key={t}
              style={[styles.tab, tab === t && styles.tabActive]}
              onPress={() => {
                setTab(t);
                if (t === 'contacts') refresh();
              }}
            >
              <Ionicons
                name={
                  t === 'qr'
                    ? 'qr-code'
                    : t === 'scan'
                      ? 'scan'
                      : 'people'
                }
                size={18}
                color={tab === t ? '#6366F1' : '#94A3B8'}
              />
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'qr' ? 'My QR' : t === 'scan' ? 'Scan' : `Contacts${pending.length > 0 ? ` (${pending.length})` : ''}`}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Error banner */}
        {error && (
          <Pressable style={styles.errorBanner} onPress={clearError}>
            <Text style={styles.errorText}>{error}</Text>
            <Ionicons name="close-circle" size={18} color="#FFF" />
          </Pressable>
        )}

        {/* Content */}
        {isLoading && tab === 'contacts' ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#6366F1" />
          </View>
        ) : (
          <>
            {tab === 'qr' && renderMyQR()}
            {tab === 'scan' && renderScanner()}
            {tab === 'contacts' && renderContacts()}
          </>
        )}

        {/* Live contacts banner */}
        {liveContacts.length > 0 && tab !== 'contacts' && (
          <Pressable style={styles.liveBanner} onPress={() => setTab('contacts')}>
            <View style={styles.liveIndicator}>
              <Ionicons name="radio" size={16} color="#22C55E" />
            </View>
            <Text style={styles.liveBannerText}>
              {liveContacts.length} contact{liveContacts.length > 1 ? 's' : ''} walking now
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#22C55E" />
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E293B',
  },
  closeBtn: {
    padding: 4,
  },
  // Tab bar
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  tabActive: {
    backgroundColor: '#EEF2FF',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: '#6366F1',
  },
  // Tab content
  tabContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
  },
  // QR code
  qrContainer: {
    padding: 20,
    backgroundColor: '#FFF',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 16,
  },
  usernameTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  usernameText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6366F1',
  },
  // Username setup
  usernameSetup: {
    alignItems: 'center',
    gap: 12,
  },
  input: {
    width: '100%',
    height: 48,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1E293B',
    backgroundColor: '#FFF',
  },
  hint: {
    fontSize: 12,
    color: '#94A3B8',
  },
  button: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  // Scanner
  scannerContainer: {
    flex: 1,
    overflow: 'hidden',
    margin: 16,
    borderRadius: 16,
  },
  camera: {
    flex: 1,
  },
  scanOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scanFrame: {
    width: 220,
    height: 220,
    borderWidth: 3,
    borderColor: '#6366F1',
    borderRadius: 20,
    backgroundColor: 'transparent',
    marginBottom: 20,
  },
  scanText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Contacts list
  contactsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  contactText: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  contactUsername: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
  },
  liveText: {
    fontSize: 12,
    color: '#22C55E',
    fontWeight: '600',
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  smallBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    backgroundColor: '#22C55E',
  },
  rejectBtn: {
    backgroundColor: '#EF4444',
  },
  removeBtn: {
    backgroundColor: '#FEF2F2',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
  },
  emptyHint: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },
  // Live indicator
  liveIndicator: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  errorText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  // Loading
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Live banner
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  liveBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#15803D',
  },
  // Validation
  inputError: {
    borderColor: '#EF4444',
  },
  validationError: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
  },
});
