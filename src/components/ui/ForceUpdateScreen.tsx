/**
 * ForceUpdateScreen — Full-screen blocker shown when a mandatory update is required.
 *
 * Replaces the old dismissable UpdateBanner. When a force update is detected,
 * this screen covers the entire app with clear instructions and a download link.
 * The user cannot dismiss it — they must update/reinstall the app to continue.
 */

import { Ionicons } from '@expo/vector-icons';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const REPO = 'Jrtowers-prog/PlymHack2026New';
const APK_URL = `https://github.com/${REPO}/releases/download/latest/SafeNightHome.apk`;
const IPA_URL = `https://github.com/${REPO}/releases/download/latest/SafeNightHome.ipa`;

function getDownloadUrl(): string {
  if (Platform.OS === 'ios') return IPA_URL;
  return APK_URL;
}

function getPlatformInstructions(): string[] {
  if (Platform.OS === 'ios') {
    return [
      '1. Tap the "Download Update" button below',
      '2. The new IPA file will download',
      '3. Install it via your preferred method (AltStore, Sideloadly, etc.)',
      '4. Reopen SafeNight after installation',
    ];
  }
  // Android (default)
  return [
    '1. Tap the "Download Update" button below',
    '2. The APK file will begin downloading',
    '3. Open the downloaded file to install',
    '4. If prompted, allow installation from this source',
    '5. Reopen SafeNight after installation',
  ];
}

export default function ForceUpdateScreen() {
  const insets = useSafeAreaInsets();
  const instructions = getPlatformInstructions();

  const handleDownload = () => {
    Linking.openURL(getDownloadUrl());
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 },
      ]}
    >
      {/* Icon */}
      <View style={styles.iconContainer}>
        <Ionicons name="cloud-download" size={56} color="#1570EF" />
      </View>

      {/* Title */}
      <Text style={styles.title}>Update Required</Text>
      <Text style={styles.subtitle}>
        A new version of SafeNight is available and this version is no longer supported.
        Please update to continue using the app.
      </Text>

      {/* What's new box */}
      <View style={styles.infoBox}>
        <View style={styles.infoHeader}>
          <Ionicons name="information-circle" size={18} color="#1570EF" />
          <Text style={styles.infoTitle}>Why do I need to update?</Text>
        </View>
        <Text style={styles.infoBody}>
          This update includes important security patches, safety data improvements,
          and new features. Older versions may not work correctly or may display
          inaccurate safety information.
        </Text>
      </View>

      {/* Instructions */}
      <View style={styles.instructionsBox}>
        <Text style={styles.instructionsTitle}>How to update:</Text>
        {instructions.map((step, i) => (
          <Text key={i} style={styles.instructionStep}>
            {step}
          </Text>
        ))}
      </View>

      {/* Download button */}
      <Pressable style={styles.downloadBtn} onPress={handleDownload}>
        <Ionicons name="download" size={22} color="#fff" />
        <Text style={styles.downloadText}>Download Update</Text>
      </Pressable>

      {/* Version info */}
      <Text style={styles.versionNote}>
        Your current version is no longer compatible.{'\n'}
        Please reinstall with the latest version.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#EFF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#101828',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#667085',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  infoBox: {
    backgroundColor: '#EFF4FF',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#C6D7F5',
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1570EF',
  },
  infoBody: {
    fontSize: 13,
    lineHeight: 20,
    color: '#344054',
  },
  instructionsBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#101828',
    marginBottom: 10,
  },
  instructionStep: {
    fontSize: 13,
    lineHeight: 22,
    color: '#344054',
  },
  downloadBtn: {
    backgroundColor: '#1570EF',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  downloadText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  versionNote: {
    fontSize: 11,
    color: '#98A2B3',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 17,
  },
});
