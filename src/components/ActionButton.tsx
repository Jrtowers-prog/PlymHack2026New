import { Pressable, StyleSheet, Text, View } from 'react-native';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  accessibilityLabel?: string;
  testID?: string;
};

const variantStyles = {
  primary: {
    backgroundColor: '#111827',
    textColor: '#ffffff',
    borderColor: '#111827',
  },
  secondary: {
    backgroundColor: '#ffffff',
    textColor: '#111827',
    borderColor: '#d1d5db',
  },
} as const;

export const ActionButton = ({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  accessibilityLabel,
  testID,
}: ActionButtonProps) => {
  const colors = variantStyles[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <View>
        <Text style={[styles.label, { color: colors.textColor }]}>{label}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
