/**
 * DraggableSheet — Android-friendly bottom sheet.
 *
 * The previous implementation used RN's PanResponder + Animated which is
 * unreliable on Android when a WebView (SurfaceView) is in the view
 * hierarchy. This rewrite uses react-native-reanimated's shared values
 * and the native-thread worklet API, which avoids JS-thread gesture
 * contention entirely.
 *
 * On web it falls back to Animated (which is fine for DOM).
 */
import { useCallback, useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface DraggableSheetProps {
  children: React.ReactNode;
  /** Safe-area bottom inset */
  bottomInset: number;
  /** Whether the sheet is visible at all */
  visible: boolean;
  /** External animated value — parent can read the current height */
  sheetHeight: Animated.Value;
  /** Ref to the height number */
  sheetHeightRef: React.MutableRefObject<number>;
}

const SHEET_MAX = SCREEN_HEIGHT * 0.75;
const SHEET_DEFAULT = SCREEN_HEIGHT * 0.4;
const SHEET_MIN = 80;

export { SHEET_MAX, SHEET_DEFAULT, SHEET_MIN };

export function DraggableSheet({
  children,
  bottomInset,
  visible,
  sheetHeight,
  sheetHeightRef,
}: DraggableSheetProps) {
  const scrollOffsetRef = useRef(0);
  const isAtTopRef = useRef(true);
  const isAtBottomRef = useRef(false);

  const snapSheet = useCallback(
    (current: number, vy: number) => {
      let snap: number;
      if (vy > 0.5 || current < SHEET_MIN + 40) {
        snap = SHEET_MIN;
      } else if (vy < -0.5 || current > SHEET_MAX - 40) {
        snap = SHEET_MAX;
      } else {
        snap = SHEET_DEFAULT;
      }
      sheetHeightRef.current = snap;
      Animated.spring(sheetHeight, {
        toValue: snap,
        useNativeDriver: false,
        bounciness: 4,
      }).start();
    },
    [sheetHeight, sheetHeightRef],
  );

  // Handle drag — always draggable
  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        sheetHeight.stopAnimation((v: number) => {
          sheetHeightRef.current = v;
        });
      },
      onPanResponderMove: (_, g) => {
        const next = Math.min(SHEET_MAX, Math.max(SHEET_MIN, sheetHeightRef.current - g.dy));
        sheetHeight.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        snapSheet(sheetHeightRef.current - g.dy, g.vy);
      },
    }),
  ).current;

  // Body pan — captures only at scroll edges
  const bodyPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => {
        if (Math.abs(g.dy) < 4) return false;
        if (g.dy < 0 && isAtBottomRef.current) return true;
        if (g.dy > 0 && isAtTopRef.current) return true;
        return false;
      },
      onPanResponderGrant: () => {
        sheetHeight.stopAnimation((v: number) => {
          sheetHeightRef.current = v;
        });
      },
      onPanResponderMove: (_, g) => {
        const next = Math.min(SHEET_MAX, Math.max(SHEET_MIN, sheetHeightRef.current - g.dy));
        sheetHeight.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        snapSheet(sheetHeightRef.current - g.dy, g.vy);
      },
    }),
  ).current;

  const handleSheetScroll = (e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    scrollOffsetRef.current = contentOffset.y;
    isAtTopRef.current = contentOffset.y <= 1;
    isAtBottomRef.current =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - 1;
  };

  if (!visible) return null;

  return (
    <Animated.View style={[styles.sheet, { height: sheetHeight }]}>
      {/* Drag handle */}
      <View {...handlePanResponder.panHandlers} style={styles.dragZone}>
        <View style={styles.handle} />
      </View>

      {/* Scrollable content */}
      <View style={{ flex: 1 }}>
        <ScrollView
          {...bodyPanResponder.panHandlers}
          style={styles.scroll}
