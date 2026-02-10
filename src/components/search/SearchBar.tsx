/**
 * SearchBar — Origin + Destination inputs with prediction dropdown.
 *
 * Extracted from index.tsx for cleaner separation. Uses a flat absolute
 * positioning approach that works reliably on Android (avoids z-index
 * battles with the WebView-based map).
 */
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { UseAutoPlaceSearchReturn } from '@/src/hooks/useAutoPlaceSearch';
import type { LatLng, PlaceDetails, PlacePrediction } from '@/src/types/google';

// ── Props ────────────────────────────────────────────────────────────────────

export interface SearchBarProps {
  /** Safe-area top inset */
  topInset: number;
  /** Live GPS location (null while loading) */
  location: LatLng | null;
  /** Whether we're using GPS as origin */
  isUsingCurrentLocation: boolean;
  setIsUsingCurrentLocation: (v: boolean) => void;
  /** Origin search hook state */
  originSearch: UseAutoPlaceSearchReturn;
  /** Manual origin (dropped pin) */
  manualOrigin: PlaceDetails | null;
  setManualOrigin: (v: PlaceDetails | null) => void;
  /** Destination search hook state */
  destSearch: UseAutoPlaceSearchReturn;
  /** Manual destination (dropped pin) */
  manualDest: PlaceDetails | null;
  setManualDest: (v: PlaceDetails | null) => void;
  /** Pin-drop mode */
  pinMode: 'origin' | 'destination' | null;
  setPinMode: (v: 'origin' | 'destination' | null) => void;
  /** Trigger map pan */
  onPanTo: (location: LatLng) => void;
  /** Clear selected route */
  onClearRoute: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SearchBar({
  topInset,
  location,
  isUsingCurrentLocation,
  setIsUsingCurrentLocation,
  originSearch,
  manualOrigin,
  setManualOrigin,
  destSearch,
  manualDest,
  setManualDest,
  pinMode,
  setPinMode,
  onPanTo,
  onClearRoute,
}: SearchBarProps) {
  const originInputRef = useRef<TextInput>(null);
  const destInputRef = useRef<TextInput>(null);

  // Focus / blur management
  const [focusedField, setFocusedFieldState] = React.useState<'origin' | 'destination' | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocusedFieldRef = useRef<'origin' | 'destination' | null>(null);
  const suppressBlurRef = useRef(false);

  const handleBlur = useCallback(() => {
    if (suppressBlurRef.current) {
      suppressBlurRef.current = false;
      return;
    }
    blurTimerRef.current = setTimeout(() => setFocusedFieldState(null), 200);
  }, []);

  const cancelBlurTimer = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (focusedField) lastFocusedFieldRef.current = focusedField;
  }, [focusedField]);

  const activePredictions =
    focusedField === 'origin' && !manualOrigin && !originSearch.place
      ? originSearch.predictions
      : focusedField === 'destination' && !manualDest && !destSearch.place
        ? destSearch.predictions
        : [];

  const handlePredictionSelect = useCallback(
    (pred: PlacePrediction) => {
      cancelBlurTimer();
      suppressBlurRef.current = false;
      const field = focusedField ?? lastFocusedFieldRef.current;
      if (field === 'origin') {
        originSearch.selectPrediction(pred);
        setManualOrigin(null);
        setIsUsingCurrentLocation(false);
        if (pred.location) onPanTo(pred.location);
      } else {
        destSearch.selectPrediction(pred);
        setManualDest(null);
        if (pred.location) onPanTo(pred.location);
      }
      onClearRoute();
      originInputRef.current?.blur();
      destInputRef.current?.blur();
      setFocusedFieldState(null);
    },
    [focusedField, originSearch, destSearch, setManualOrigin, setManualDest, setIsUsingCurrentLocation, onPanTo, onClearRoute, cancelBlurTimer],
  );

  return (
    <ScrollView
