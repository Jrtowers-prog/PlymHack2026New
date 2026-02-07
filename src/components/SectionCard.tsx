import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type SectionCardProps = PropsWithChildren<{
  title: string;
  description?: string;
  footer?: string;
}>;

export const SectionCard = ({ title, description, footer, children }: SectionCardProps) => {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      <View style={styles.content}>{children}</View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  description: {
    marginTop: 6,
    fontSize: 14,
    color: '#4b5563',
  },
  content: {
    marginTop: 12,
  },
  footer: {
    marginTop: 12,
    fontSize: 12,
    color: '#6b7280',
  },
});
