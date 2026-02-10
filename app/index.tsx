/**
 * HomeScreen — Main app screen.
 *
 * All business logic lives in useHomeScreen. Each UI section is a
 * standalone component, keeping this file under 200 lines.
 *
 * Android-specific: every overlay is absolutely positioned above the
 * flex-child RouteMap. This is the ONLY reliable z-ordering approach
 * on Android when a WebView (SurfaceView) is involved — no nesting
 * inside the map container.
 */
import { Ionicons } from '@expo/vector-icons';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapTypeControl } from '@/src/components/maps/MapTypeControl';
import RouteMap from '@/src/components/maps/RouteMap';
import { AIExplanationModal } from '@/src/components/modals/AIExplanationModal';
import { OnboardingModal } from '@/src/components/modals/OnboardingModal';
import { NavigationOverlay } from '@/src/components/navigation/NavigationOverlay';
import { RouteList } from '@/src/components/routes/RouteList';
import { SafetyPanel } from '@/src/components/safety/SafetyPanel';
import { SafetyProfileChart } from '@/src/components/safety/SafetyProfileChart';
import { SearchBar } from '@/src/components/search/SearchBar';
import { DraggableSheet } from '@/src/components/sheets/DraggableSheet';
import { JailLoadingAnimation } from '@/src/components/ui/JailLoadingAnimation';
import { useHomeScreen } from '@/src/hooks/useHomeScreen';
import { formatDistance, formatDuration } from '@/src/utils/format';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const h = useHomeScreen();

export default function HomeScreen() { return null; }
