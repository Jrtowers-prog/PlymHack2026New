/**
 * UpdateBanner — Shown at the top of the screen when a new APK is available.
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { UpdateInfo } from '@/src/hooks/useUpdateCheck';

interface UpdateBannerProps {
  update: UpdateInfo;
}

export function UpdateBanner({ update }: UpdateBannerProps) {
  const insets = useSafeAreaInsets();
  if (!update.available) return null;

  return (
    <View style={[styles.banner, { paddingTop: insets.top + 8 }]}>
      <Ionicons name="cloud-download-outline" size={20} color="#fff" />
      <Text style={styles.text}>A new version is available</Text>
      <Pressable style={styles.updateBtn} onPress={update.download}>
        <Text style={styles.updateText}>Update</Text>
      </Pressable>
      <Pressable onPress={update.dismiss} hitSlop={12}>
        <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    elevation: 200,
    backgroundColor: '#1570EF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  updateBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  updateText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1570EF',
  },
});
