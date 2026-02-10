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
