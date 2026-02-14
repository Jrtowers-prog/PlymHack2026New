/**
 * MapToast — Lightweight animated toast that slides up from the bottom.
 *
 * Auto-dismisses after a configurable duration. Supports icon + message.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type IoniconsName = keyof typeof Ionicons.glyphMap;

export interface ToastConfig {
  message: string;
  icon?: IoniconsName;
  iconColor?: string;
  bgColor?: string;
  duration?: number;
}

interface Props {
  toast: ToastConfig | null;
  onDismiss: () => void;
}

export function MapToast({ toast, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) return;

    // Slide in
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss
    timerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 120,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => onDismiss());
    }, toast.duration ?? 3000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast, slideAnim, opacityAnim, onDismiss]);

  if (!toast) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: insets.bottom + 24,
          backgroundColor: toast.bgColor ?? 'rgba(30, 30, 46, 0.95)',
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
      pointerEvents="none"
    >
      {toast.icon && (
        <View style={[styles.iconWrap, { backgroundColor: (toast.iconColor ?? '#7C3AED') + '22' }]}>
          <Ionicons name={toast.icon} size={18} color={toast.iconColor ?? '#7C3AED'} />
        </View>
      )}
      <Text style={styles.text} numberOfLines={2}>{toast.message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    gap: 10,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }
      : {}),
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    lineHeight: 20,
  },
});
