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
      style={[styles.container, { top: topInset + 8 }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="always"
      scrollEnabled={false}
      pointerEvents="box-none"
    >
      <View style={styles.card}>
        {/* Logo */}
        <View style={styles.logoHeader}>
          <Text style={styles.logoText}>SAFE NIGHT HOME</Text>
        </View>

        {/* Origin Input */}
        <View style={styles.inputRow}>
          <View style={styles.inputIconWrap}>
            <View style={styles.iconDot} />
            <View style={styles.iconConnector} />
          </View>
          <Pressable
            style={[styles.inputFieldWrap, focusedField === 'origin' && styles.inputFieldWrapFocused]}
            onPress={() => {
              if (!isUsingCurrentLocation) originInputRef.current?.focus();
            }}
          >
            {isUsingCurrentLocation ? (
              <Pressable
                style={[styles.inputField, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                onPress={() => setIsUsingCurrentLocation(false)}
                accessibilityRole="button"
              >
                <Ionicons name={location ? 'navigate' : 'hourglass-outline'} size={16} color="#1570ef" />
                <Text style={styles.locationDisplayText}>
                  {location ? 'Your location' : 'Getting location...'}
                </Text>
              </Pressable>
            ) : (
              <TextInput
                ref={originInputRef}
                value={manualOrigin ? (manualOrigin.name ?? 'Dropped pin') : originSearch.query}
                onChangeText={(t: string) => {
                  setManualOrigin(null);
                  originSearch.setQuery(t);
                  onClearRoute();
                }}
                placeholder="Starting point"
                placeholderTextColor="#98a2b3"
                accessibilityLabel="Starting point"
                autoCorrect={false}
                style={styles.inputField}
                onFocus={() => { cancelBlurTimer(); setFocusedFieldState('origin'); }}
                onBlur={handleBlur}
              />
            )}
            <View style={[styles.inputActions, { pointerEvents: 'box-none' }]}>
              {originSearch.status === 'searching' && <ActivityIndicator size="small" color="#1570ef" />}
              {(originSearch.status === 'found' || manualOrigin) && (
                <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
              )}
              <Pressable
                style={styles.mapPinButton}
                onPress={() => setPinMode(pinMode === 'origin' ? null : 'origin')}
                accessibilityRole="button"
                accessibilityLabel="Pick on map"
              >
                <Ionicons name="location-outline" size={20} color={pinMode === 'origin' ? '#1570ef' : '#667085'} />
              </Pressable>
              {!isUsingCurrentLocation && (
                <Pressable
                  style={styles.mapPinButton}
                  onPress={() => {
                    setIsUsingCurrentLocation(true);
                    setManualOrigin(null);
                    originSearch.clear();
                    if (location) onPanTo(location);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Use current location"
                >
                  <Ionicons name="locate-outline" size={20} color="#667085" />
                </Pressable>
              )}
            </View>
          </Pressable>
        </View>

        {/* Divider */}
        <View style={styles.inputDivider} />

        {/* Destination Input */}
        <View style={styles.inputRow}>
          <View style={styles.inputIconWrap}>
            <View style={styles.iconPin} />
          </View>
          <Pressable
            style={[styles.inputFieldWrap, focusedField === 'destination' && styles.inputFieldWrapFocused]}
            onPress={() => destInputRef.current?.focus()}
          >
            <TextInput
              ref={destInputRef}
              value={manualDest ? (manualDest.name ?? 'Dropped pin') : destSearch.query}
              onChangeText={(text: string) => {
                setManualDest(null);
                destSearch.setQuery(text);
                onClearRoute();
              }}
              placeholder="Where to?"
              placeholderTextColor="#98a2b3"
              accessibilityLabel="Destination"
              autoCorrect={false}
              style={styles.inputField}
              onFocus={() => { cancelBlurTimer(); setFocusedFieldState('destination'); }}
              onBlur={handleBlur}
            />
            <View style={[styles.inputActions, { pointerEvents: 'box-none' }]}>
              {destSearch.status === 'searching' && <ActivityIndicator size="small" color="#1570ef" />}
              {(destSearch.status === 'found' || manualDest) && (
                <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
              )}
              <Pressable
                style={styles.mapPinButton}
                onPress={() => setPinMode(pinMode === 'destination' ? null : 'destination')}
                accessibilityRole="button"
                accessibilityLabel="Pick on map"
              >
                <Ionicons name="location-outline" size={20} color={pinMode === 'destination' ? '#d92d20' : '#667085'} />
              </Pressable>
              {(destSearch.place || manualDest) && (
                <Pressable
                  style={styles.mapPinButton}
                  onPress={() => {
                    destSearch.clear();
                    setManualDest(null);
                    onClearRoute();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear destination"
                >
                  <Ionicons name="close-circle-outline" size={20} color="#98a2b3" />
                </Pressable>
              )}
            </View>
          </Pressable>
        </View>
      </View>

      {/* Predictions Dropdown */}
      {activePredictions.length > 0 && (
        <View style={styles.predictionsDropdown}>
          {activePredictions.map((pred, idx) => (
            <Pressable
              key={pred.placeId}
              style={({ pressed }: { pressed: boolean }) => [
                styles.predictionItem,
                idx === 0 && styles.predictionItemFirst,
                idx === activePredictions.length - 1 && styles.predictionItemLast,
                pressed && styles.predictionItemPressed,
              ]}
              onPressIn={() => {
                suppressBlurRef.current = true;
                cancelBlurTimer();
              }}
              onPress={() => handlePredictionSelect(pred)}
            >
              <View style={styles.predictionIcon}>
                <Ionicons name="location-outline" size={18} color="#667085" />
              </View>
              <View style={styles.predictionText}>
                <Text style={styles.predictionPrimary} numberOfLines={1}>
                  {pred.primaryText}
                </Text>
                {pred.secondaryText ? (
                  <Text style={styles.predictionSecondary} numberOfLines={1}>
                    {pred.secondaryText}
                  </Text>
                ) : null}
              </View>
              {idx === 0 && (
                <View style={styles.predictionBadge}>
                  <Text style={styles.predictionBadgeText}>Top</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// We need React for the useState inside the component
import React from 'react';

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: '#ffffff',
