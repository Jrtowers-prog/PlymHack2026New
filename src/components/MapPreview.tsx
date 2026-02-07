import { Image, StyleSheet, Text, View } from 'react-native';

type MapPreviewProps = {
  uri?: string | null;
  accessibilityLabel: string;
  fallbackText?: string;
};

export const MapPreview = ({ uri, accessibilityLabel, fallbackText }: MapPreviewProps) => {
  if (!uri) {
    return (
      <View style={styles.placeholder} accessibilityLabel={accessibilityLabel}>
        <Text style={styles.placeholderText}>
          {fallbackText ?? 'Map preview unavailable.'}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      accessibilityLabel={accessibilityLabel}
      style={styles.image}
      resizeMode="cover"
    />
  );
};

const styles = StyleSheet.create({
  placeholder: {
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  placeholderText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  image: {
    height: 180,
    width: '100%',
    borderRadius: 12,
  },
});
