/**
 * RouteList — Displays the list of route cards + start navigation button.
 */
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { RouteCard } from '@/src/components/routes/RouteCard';
import type { NavigationState } from '@/src/hooks/useNavigation';
import type { SafeRoute } from '@/src/services/safeRoutes';

interface RouteListProps {
  routes: SafeRoute[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  navState: NavigationState;
  onStartNav: () => void;
}

export function RouteList({
  routes,
  selectedRouteId,
  onSelectRoute,
  navState,
  onStartNav,
}: RouteListProps) {
  return (
    <View style={[styles.column, Platform.OS === 'web' && styles.columnWeb]}>
      {routes.slice(0, 5).map((route, index) => (
        <RouteCard
          key={route.id}
          route={route}
          index={index}
          isSelected={route.id === selectedRouteId}
          onSelect={() => onSelectRoute(route.id)}
        />
      ))}

      {selectedRouteId && navState === 'idle' && (
        <Pressable
          style={styles.startNavButton}
          onPress={onStartNav}
          accessibilityRole="button"
          accessibilityLabel="Start navigation"
        >
          <Ionicons name="navigate" size={20} color="#ffffff" />
          <Text style={styles.startNavButtonText}>Start Navigation</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {},
  columnWeb: {
    flex: 1,
    maxWidth: '50%' as any,
  },
  startNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    marginHorizontal: 4,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#1570ef',
  },
  startNavButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
});
