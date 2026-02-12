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
  /** Swap origin and destination */
  onSwap: () => void;
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
  onSwap,
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
    // Longer delay on Android — focus/blur fires unreliably above WebView
    const delay = Platform.OS === 'android' ? 1000 : 200;
    blurTimerRef.current = setTimeout(() => setFocusedFieldState(null), delay);
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

  // On Android, focus/blur events are unreliable above a WebView, so
  // fall back to checking which field has active predictions when
  // focusedField is null.
  const activeField: 'origin' | 'destination' | null =
    focusedField ?? lastFocusedFieldRef.current ?? null;

  const activePredictions =
    Platform.OS === 'android'
      ? // Android: use activeField (focus OR last-focused), then fall back
        // to whichever field actually has predictions available.
        activeField === 'origin' && !manualOrigin && !originSearch.place
        ? originSearch.predictions
        : activeField === 'destination' && !manualDest && !destSearch.place
          ? destSearch.predictions
          : !manualDest && !destSearch.place && destSearch.predictions.length > 0
            ? destSearch.predictions
            : !manualOrigin && !originSearch.place && originSearch.predictions.length > 0
              ? originSearch.predictions
              : []
      : // Web / iOS: original strict focus-based logic
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

        {/* Divider + Swap button */}
        <View style={styles.dividerRow}>
          <View style={styles.inputDivider} />
          <Pressable
            style={styles.swapButton}
            onPress={() => {
              onSwap();
              onClearRoute();
            }}
            accessibilityRole="button"
            accessibilityLabel="Swap origin and destination"
          >
            <Ionicons name="swap-vertical" size={18} color="#667085" />
          </Pressable>
        </View>

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
    borderRadius: 16,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)' } : {}),
    elevation: 8,
    overflow: Platform.OS === 'web' ? 'hidden' : 'visible',
    width: '100%',
    maxWidth: 600,
  },
  logoHeader: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 14 : 10,
    paddingBottom: Platform.OS === 'web' ? 8 : 4,
    justifyContent: 'center',
  },
  logoText: {
    fontSize: Platform.OS === 'web' ? 22 : 16,
    fontWeight: '900',
    letterSpacing: Platform.OS === 'web' ? 3 : 2,
    color: '#000000',
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Platform.OS === 'web' ? 14 : 10,
    paddingVertical: Platform.OS === 'web' ? 6 : 4,
  },
  inputIconWrap: {
    width: 24,
    alignItems: 'center',
  },
  iconDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1570ef',
    borderWidth: 2,
    borderColor: '#93c5fd',
  },
  iconConnector: {
    width: 2,
    height: 20,
    backgroundColor: '#d0d5dd',
    marginTop: 2,
  },
  iconPin: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#d92d20',
    borderWidth: 2,
    borderColor: '#fca5a5',
  },
  inputFieldWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    paddingHorizontal: Platform.OS === 'web' ? 18 : 12,
    paddingVertical: Platform.OS === 'web' ? 16 : 10,
  },
  inputFieldWrapFocused: {
    borderColor: '#1570ef',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 0 3px rgba(21, 112, 239, 0.2)' } : {}),
  },
  inputField: {
    flex: 1,
    height: '100%',
    fontSize: Platform.OS === 'web' ? 16 : 14,
    color: '#101828',
    fontWeight: '400',
    borderWidth: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  } as any,
  locationDisplayText: {
    fontSize: Platform.OS === 'web' ? 18 : 14,
    color: '#1570ef',
    fontWeight: '500',
  },
  inputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  mapPinButton: {
    padding: 4,
    borderRadius: 6,
  },
  inputDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#f2f4f7',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 48,
    marginRight: 14,
  },
  swapButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  predictionsDropdown: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 24px rgba(0, 0, 0, 0.14)' }
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.14,
          shadowRadius: 24,
        }),
    elevation: 12,
    zIndex: 20,
    overflow: Platform.OS === 'web' ? 'hidden' : 'visible',
    width: '100%',
    maxWidth: 600,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f4f7',
  },
  predictionItemFirst: {},
  predictionItemLast: {
    borderBottomWidth: 0,
  },
  predictionItemPressed: {
    backgroundColor: '#f0f6ff',
  },
  predictionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  predictionText: {
    flex: 1,
  },
  predictionPrimary: {
    fontSize: 15,
    fontWeight: '500',
    color: '#101828',
  },
  predictionSecondary: {
    fontSize: 13,
    color: '#667085',
    marginTop: 2,
  },
  predictionBadge: {
    backgroundColor: '#ecfdf3',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  predictionBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#027a48',
  },
});
