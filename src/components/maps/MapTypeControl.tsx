import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MapType } from './RouteMap.types';

type MapTypeControlProps = {
  mapType: MapType;
  onMapTypeChange: (mapType: MapType) => void;
};

const MAP_TYPE_OPTIONS: { value: MapType; label: string }[] = [
  { value: 'roadmap', label: 'Default' },
  { value: 'satellite', label: 'Satellite' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'terrain', label: 'Terrain' },
];

export const MapTypeControl = ({ mapType, onMapTypeChange }: MapTypeControlProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View style={styles.container}>
      {isExpanded ? (
        <View style={styles.expandedContainer}>
          {MAP_TYPE_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.optionButton,
                mapType === option.value && styles.optionButtonActive,
              ]}
              onPress={() => {
                onMapTypeChange(option.value);
                setIsExpanded(false);
              }}>
              <Text
                style={[
                  styles.optionText,
                  mapType === option.value && styles.optionTextActive,
                ]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Pressable style={styles.compactButton} onPress={() => setIsExpanded(true)}>
          <Text style={styles.compactText}>
            {MAP_TYPE_OPTIONS.find((opt) => opt.value === mapType)?.label ?? 'Map'}
          </Text>
        </Pressable>
      )}
    </View>
  );
};
