import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import RouteMap from '@/src/components/maps/RouteMap';
import { useCurrentLocation } from '@/src/hooks/useCurrentLocation';
import { useDirections } from '@/src/hooks/useDirections';
import { useOpenPlacesForRoute } from '@/src/hooks/useOpenPlacesForRoute';
import { useOsmRoutesData } from '@/src/hooks/useOsmRouteData';
import { usePlaceAutocomplete } from '@/src/hooks/usePlaceAutocomplete';
import { fetchCrimeForRoute } from '@/src/services/crime';
import { fetchOpenPlacesForRoute, fetchPlaceDetails } from '@/src/services/googleMaps';
import type { CrimePoint } from '@/src/types/crime';
import { AppError } from '@/src/types/errors';
import type { DirectionsRoute, PlaceDetails, PlacePrediction } from '@/src/types/google';

export default function HomeScreen() {
  const { status, location, error, refresh } = useCurrentLocation();
  const [query, setQuery] = useState('');
  const [originQuery, setOriginQuery] = useState('');
  const [originPlace, setOriginPlace] = useState<PlaceDetails | null>(null);
  const [destination, setDestination] = useState<PlaceDetails | null>(null);
  const [originStatus, setOriginStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>(
    'idle'
  );
  const [originError, setOriginError] = useState<AppError | null>(null);
  const [destinationStatus, setDestinationStatus] = useState<
    'idle' | 'loading' | 'error' | 'ready'
  >('idle');
  const [destinationError, setDestinationError] = useState<AppError | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [crimeStatus, setCrimeStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>(
    'idle'
  );
  const [crimeCount, setCrimeCount] = useState<number | null>(null);
  const [crimeError, setCrimeError] = useState<AppError | null>(null);
  const [crimePoints, setCrimePoints] = useState<CrimePoint[]>([]);
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [routeMetrics, setRouteMetrics] = useState<
    Record<string, { crimeCount: number; openPlacesCount: number }>
  >({});
  const [safetyStatus, setSafetyStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>(
    'idle'
  );
  const [safetyError, setSafetyError] = useState<AppError | null>(null);

  const {
    status: originAutocompleteStatus,
    predictions: originPredictions,
    error: originAutocompleteError,
  } = usePlaceAutocomplete(originQuery, location);
  const {
    status: autocompleteStatus,
    predictions,
    error: autocompleteError,
  } = usePlaceAutocomplete(query, location);
  const resolvedOrigin = originPlace?.location ?? location;
  const {
    status: directionsStatus,
    routes,
    error: directionsError,
  } = useDirections(resolvedOrigin, destination?.location ?? null);
  const {
    status: osmStatus,
    data: osmSummaries,
    error: osmError,
  } = useOsmRoutesData(routes);

  useEffect(() => {
    if (routes.length > 0) {
      setSelectedRouteId(routes[0].id);
    }
  }, [routes]);

  const selectedRoute = useMemo<DirectionsRoute | null>(() => {
    return routes.find((route) => route.id === selectedRouteId) ?? null;
  }, [routes, selectedRouteId]);

  const {
    status: openPlacesStatus,
    data: openPlacesSummary,
    error: openPlacesError,
  } = useOpenPlacesForRoute(selectedRoute?.path ?? null, {
    intervalMeters: 50,
    radiusMeters: 25,
    maxSamples: 25,
  });

  const selectedOsmSummary = useMemo(() => {
    if (!selectedRoute) {
      return null;
    }

    return osmSummaries.find((summary) => summary.routeId === selectedRoute.id) ?? null;
  }, [osmSummaries, selectedRoute]);

  useEffect(() => {
    if (routes.length === 0) {
      setRouteMetrics({});
      setSafetyStatus('idle');
      setSafetyError(null);
      return;
    }

    let isActive = true;
    setSafetyStatus('loading');
    setSafetyError(null);

    const withConcurrency = async <T, R>(
      items: T[],
      concurrency: number,
      worker: (item: T) => Promise<R>
    ): Promise<R[]> => {
      const results: R[] = [];
      let index = 0;

      const runners = Array.from({ length: Math.max(1, concurrency) }).map(async () => {
        while (index < items.length) {
          const currentIndex = index;
          index += 1;
          results[currentIndex] = await worker(items[currentIndex]);
        }
      });

      await Promise.all(runners);
      return results;
    };

    const run = async () => {
      const results = await withConcurrency(routes, 2, async (route) => {
        try {
          const [crime, openPlaces] = await Promise.all([
            fetchCrimeForRoute(route.path),
            fetchOpenPlacesForRoute(route.path, {
              intervalMeters: 50,
              radiusMeters: 25,
              maxSamples: 25,
            }),
          ]);

          return {
            routeId: route.id,
            crimeCount: crime.count,
            openPlacesCount: openPlaces.count,
            ok: true as const,
          };
        } catch (caught) {
          return {
            routeId: route.id,
            error: caught,
            ok: false as const,
          };
        }
      });

      if (!isActive) {
        return;
      }

      const metrics: Record<string, { crimeCount: number; openPlacesCount: number }> = {};
      let hadError = false;

      results.forEach((result) => {
        if (result.ok) {
          metrics[result.routeId] = {
            crimeCount: result.crimeCount,
            openPlacesCount: result.openPlacesCount,
          };
        } else {
          hadError = true;
        }
      });

      setRouteMetrics(metrics);
      setSafetyStatus(hadError ? 'error' : 'ready');
      setSafetyError(
        hadError
          ? new AppError('safety_metrics_error', 'Unable to calculate safety scores')
          : null
      );
    };

    run().catch((caught) => {
      if (!isActive) {
        return;
      }
      setSafetyStatus('error');
      setSafetyError(
        caught instanceof AppError
          ? caught
          : new AppError('safety_metrics_error', 'Unable to calculate safety scores', caught)
      );
    });

    return () => {
      isActive = false;
    };
  }, [routes]);

  const safetyData = useMemo(() => {
    if (routes.length === 0) {
      return {
        scores: {} as Record<string, { score: number; color: string }>,
        breakdowns: {} as Record<
          string,
          {
            crimeScore: number;
            openScore: number;
            lightingScore: number;
            roadScore: number;
            crimeDensity: number;
            openDensity: number;
            lightingRatio: number;
            roadType: string;
          }
        >,
      };
    }

    const osmByRoute = new Map(
      osmSummaries.map((summary) => [summary.routeId, summary.summary])
    );

    const entries = routes.map((route) => {
      const metrics = routeMetrics[route.id];
      const osmSummary = osmByRoute.get(route.id);
      const distanceKm = Math.max(route.distanceMeters / 1000, 0.1);

      const crimeDensity = metrics ? metrics.crimeCount / distanceKm : null;
      const openDensity = metrics ? metrics.openPlacesCount / distanceKm : null;

      const lightingTotal = osmSummary
        ? osmSummary.lighting.litYes +
          osmSummary.lighting.litNo +
          osmSummary.lighting.litUnknown
        : 0;
      const lightingRatio = osmSummary
        ? lightingTotal > 0
          ? osmSummary.lighting.litYes / lightingTotal
          : 0
        : null;

      const roadType = osmSummary?.roadTypes[0]?.type ?? null;
      const roadScore = roadType ? roadTypeScore(roadType) : null;

      return {
        routeId: route.id,
        crimeDensity,
        openDensity,
        lightingRatio,
        roadScore,
        roadType,
      };
    });

    const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
    const normalizeRange = (value: number, min: number, max: number): number => {
      if (max === min) {
        return 1;
      }

      return clamp01((value - min) / (max - min));
    };

    const scores: Record<string, { score: number; color: string }> = {};
    const breakdowns: Record<
      string,
      {
        crimeScore: number;
        openScore: number;
        lightingScore: number;
        roadScore: number;
        crimeDensity: number;
        openDensity: number;
        lightingRatio: number;
        roadType: string;
      }
    > = {};

    entries.forEach((entry) => {
        if (
          entry.crimeDensity === null ||
          entry.openDensity === null ||
          entry.lightingRatio === null ||
          entry.roadScore === null
        ) {
        return;
      }

      const crimeScore = 1 - normalizeRange(entry.crimeDensity, 0, 50);
      const openScore = normalizeRange(entry.openDensity, 0, 10);
      const lightingScore = normalizeRange(entry.lightingRatio, 0, 0.8);
      const roadScore = normalizeRange(entry.roadScore, 0.3, 1);

      const weighted =
        crimeScore * 0.4 +
        openScore * 0.3 +
        lightingScore * 0.2 +
        roadScore * 0.1;

      const score = Math.min(10, Math.max(1, 1 + weighted * 9));

      scores[entry.routeId] = {
        score,
        color: scoreToColor(score),
      };

      breakdowns[entry.routeId] = {
        crimeScore,
        openScore,
        lightingScore,
        roadScore,
        crimeDensity: entry.crimeDensity,
        openDensity: entry.openDensity,
        lightingRatio: entry.lightingRatio,
        roadType: entry.roadType ?? 'unknown',
      };
    });

    return { scores, breakdowns };
  }, [routes, osmSummaries, routeMetrics]);

  useEffect(() => {
    if (!selectedRoute) {
      setCrimeStatus('idle');
      setCrimeCount(null);
      setCrimeError(null);
      setCrimePoints([]);
      return;
    }

    let isActive = true;
    setCrimeStatus('loading');
    setCrimeError(null);

    fetchCrimeForRoute(selectedRoute.path)
      .then((crime) => {
        if (!isActive) {
          return;
        }
        setCrimeCount(crime.count);
        setCrimePoints(crime.points);
        setCrimeStatus('ready');
      })
      .catch((caught) => {
        if (!isActive) {
          return;
        }
        setCrimePoints([]);
        const normalizedError =
          caught instanceof AppError
            ? caught
            : new AppError('crime_error', 'Unable to fetch crime data', caught);
        setCrimeError(normalizedError);
        setCrimeStatus('error');
      });

    return () => {
      isActive = false;
    };
  }, [selectedRoute]);

  const handlePredictionPress = async (prediction: PlacePrediction) => {
    setDestinationStatus('loading');
    setDestinationError(null);
    try {
      const details = await fetchPlaceDetails(prediction.placeId);
      setDestination(details);
      setQuery(details.name);
      setDestinationStatus('ready');
      setIsSearchOpen(false);
    } catch (caught) {
      const normalizedError =
        caught instanceof AppError
          ? caught
          : new AppError('place_details_error', 'Unable to fetch place details', caught);

      setDestinationError(normalizedError);
      setDestinationStatus('error');
    }
  };

  const handleOriginPredictionPress = async (prediction: PlacePrediction) => {
    setOriginStatus('loading');
    setOriginError(null);
    try {
      const details = await fetchPlaceDetails(prediction.placeId);
      setOriginPlace(details);
      setOriginQuery(details.name);
      setOriginStatus('ready');
      setIsSearchOpen(false);
    } catch (caught) {
      const normalizedError =
        caught instanceof AppError
          ? caught
          : new AppError('place_details_error', 'Unable to fetch place details', caught);

      setOriginError(normalizedError);
      setOriginStatus('error');
    }
  };

  const distanceLabel = selectedRoute ? formatDistance(selectedRoute.distanceMeters) : '--';
  const durationLabel = selectedRoute ? formatDuration(selectedRoute.durationSeconds) : '--';
  const showRoutes =
    directionsStatus === 'loading' || directionsError !== null || routes.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        <RouteMap
          origin={resolvedOrigin}
          destination={destination?.location ?? null}
          routes={routes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={setSelectedRouteId}
          routeColors={Object.fromEntries(
            Object.entries(safetyData.scores).map(([routeId, score]) => [routeId, score.color])
          )}
          crimePoints={crimePoints}
          openPlaces={openPlacesSummary?.places ?? []}
          lightPoints={selectedOsmSummary?.summary.lightPoints ?? []}
        />
      </View>
      <View style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Pressable
            style={styles.destinationButton}
            onPress={() => setIsSearchOpen((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel="Add destination"
          >
            <Text style={styles.destinationButtonText}>+</Text>
          </Pressable>
          <Pressable style={styles.refreshButton} onPress={refresh} accessibilityRole="button">
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </Pressable>
        </View>
        {isSearchOpen ? (
          <View style={styles.searchCard}>
            <Text style={styles.statusText}>Location: {status}</Text>
            {error ? <Text style={styles.error}>{error.message}</Text> : null}
            <TextInput
              value={originQuery}
              onChangeText={(text) => {
                setOriginQuery(text);
                setOriginPlace(null);
                setSelectedRouteId(null);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Enter start location"
              accessibilityLabel="Start location"
              autoCorrect={false}
              style={styles.input}
            />
            {originAutocompleteStatus === 'loading' ? (
              <View style={styles.inlineRow}>
                <ActivityIndicator size="small" color="#1570ef" />
                <Text style={styles.helperText}>Searching start locations...</Text>
              </View>
            ) : null}
            {originAutocompleteError ? (
              <Text style={styles.error}>{originAutocompleteError.message}</Text>
            ) : null}
            {originPredictions.length > 0 ? (
              <ScrollView
                style={styles.predictions}
                keyboardShouldPersistTaps="handled"
              >
                {originPredictions.slice(0, 5).map((prediction) => (
                  <Pressable
                    key={`origin-${prediction.placeId}`}
                    onPress={() => handleOriginPredictionPress(prediction)}
                    accessibilityRole="button"
                    style={styles.predictionRow}
                  >
                    <Text style={styles.predictionText}>{prediction.primaryText}</Text>
                    {prediction.secondaryText ? (
                      <Text style={styles.predictionSubtext}>
                        {prediction.secondaryText}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {originStatus === 'loading' ? (
              <View style={styles.inlineRow}>
                <ActivityIndicator size="small" color="#1570ef" />
                <Text style={styles.helperText}>Loading start location...</Text>
              </View>
            ) : null}
            {originError ? <Text style={styles.error}>{originError.message}</Text> : null}
            {originPlace ? (
              <Text style={styles.helperText}>Start: {originPlace.name}</Text>
            ) : null}
            <TextInput
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                setDestination(null);
                setSelectedRouteId(null);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Enter destination"
              accessibilityLabel="Destination"
              autoCorrect={false}
              style={styles.input}
            />
            {autocompleteStatus === 'loading' ? (
              <View style={styles.inlineRow}>
                <ActivityIndicator size="small" color="#1570ef" />
                <Text style={styles.helperText}>Searching places...</Text>
              </View>
            ) : null}
            {autocompleteError ? (
              <Text style={styles.error}>{autocompleteError.message}</Text>
            ) : null}
            {predictions.length > 0 ? (
              <ScrollView
                style={styles.predictions}
                keyboardShouldPersistTaps="handled"
              >
                {predictions.slice(0, 5).map((prediction) => (
                  <Pressable
                    key={prediction.placeId}
                    onPress={() => handlePredictionPress(prediction)}
                    accessibilityRole="button"
                    style={styles.predictionRow}
                  >
                    <Text style={styles.predictionText}>{prediction.primaryText}</Text>
                    {prediction.secondaryText ? (
                      <Text style={styles.predictionSubtext}>
                        {prediction.secondaryText}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {destinationStatus === 'loading' ? (
              <View style={styles.inlineRow}>
                <ActivityIndicator size="small" color="#1570ef" />
                <Text style={styles.helperText}>Loading destination...</Text>
              </View>
            ) : null}
            {destinationError ? <Text style={styles.error}>{destinationError.message}</Text> : null}
            {destination ? (
              <Text style={styles.helperText}>Selected: {destination.name}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {showRoutes ? (
        <View style={styles.bottomOverlay} pointerEvents="box-none">
          <View style={styles.routesCard}>
            <View style={styles.routesHeader}>
              <Text style={styles.sectionTitle}>Routes</Text>
              <Text style={styles.routeMeta}>
                {distanceLabel} · {durationLabel}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Police API:</Text>
              <Text style={styles.statusValue}>
                {crimeStatus === 'loading'
                  ? 'Loading'
                  : crimeStatus === 'error'
                  ? 'Error'
                  : crimeCount === null
                  ? '--'
                  : `${crimeCount} incidents`}
              </Text>
              <Text style={styles.statusLabel}>Open places:</Text>
              <Text style={styles.statusValue}>
                {openPlacesStatus === 'loading'
                  ? 'Loading'
                  : openPlacesStatus === 'error'
                  ? 'Error'
                  : openPlacesSummary
                  ? `${openPlacesSummary.count} open`
                  : '--'}
              </Text>
            </View>
            {crimeError ? <Text style={styles.error}>{crimeError.message}</Text> : null}
            {openPlacesError ? <Text style={styles.error}>{openPlacesError.message}</Text> : null}
            {safetyError ? <Text style={styles.error}>{safetyError.message}</Text> : null}
            {directionsStatus === 'loading' ? (
              <View style={styles.inlineRow}>
                <ActivityIndicator size="small" color="#1570ef" />
                <Text style={styles.helperText}>Fetching routes...</Text>
              </View>
            ) : null}
            {directionsError ? (
              <Text style={styles.error}>{directionsError.message}</Text>
            ) : null}
            {routes.length === 0 && directionsStatus === 'ready' ? (
              <Text style={styles.helperText}>No routes available.</Text>
            ) : null}
            {routes.map((route, index) => {
              const isSelected = route.id === selectedRouteId;
              const isExpanded = expandedRouteId === route.id;
              const label = index === 0 ? 'Primary' : `Alt ${index}`;
              const safety = safetyData.scores[route.id];
              const breakdown = safetyData.breakdowns[route.id];
              const safetyLabel =
                safetyStatus === 'loading'
                  ? '...'
                  : safety
                  ? safety.score.toFixed(1)
                  : '--';

              return (
                <Pressable
                  key={route.id}
                  onPress={() => setSelectedRouteId(route.id)}
                  accessibilityRole="button"
                  style={[styles.routeRow, isSelected ? styles.routeRowSelected : null]}
                >
                  <View style={styles.routeRowHeader}>
                    <Text style={styles.routeTitle}>{label}</Text>
                    <View style={styles.routeRowMeta}>
                      {safety ? (
                        <View
                          style={[styles.scoreBadge, { backgroundColor: safety.color }]}
                        >
                          <Text style={styles.scoreText}>{safetyLabel}</Text>
                        </View>
                      ) : (
                        <Text style={styles.scorePlaceholder}>{safetyLabel}</Text>
                      )}
                      <Pressable
                        onPress={() =>
                          setExpandedRouteId((prev) => (prev === route.id ? null : route.id))
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Toggle safety breakdown"
                        style={styles.detailsButton}
                      >
                        <Text style={styles.detailsButtonText}>
                          {isExpanded ? 'Hide' : 'Details'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.routeMeta}>
                    {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)}
                  </Text>
                  {isExpanded && breakdown ? (
                    <View style={styles.breakdownCard}>
                      <View style={styles.breakdownScore}>
                        <Text
                          style={[
                            styles.breakdownScoreValue,
                            { color: safety?.color ?? '#667085' },
                          ]}
                        >
                          {safetyLabel}
                        </Text>
                        <Text style={styles.breakdownScoreLabel}>Safety</Text>
                      </View>
                      <View style={styles.breakdownBars}>
                        <View style={styles.breakdownRowLine}>
                          <Text style={styles.breakdownRowLabel}>Crime</Text>
                          <View style={styles.breakdownBarTrack}>
                            <View
                              style={[
                                styles.breakdownBarFill,
                                {
                                  width: `${Math.round(breakdown.crimeScore * 100)}%`,
                                  backgroundColor: '#f04438',
                                },
                              ]}
                            />
                          </View>
                        </View>
                        <View style={styles.breakdownRowLine}>
                          <Text style={styles.breakdownRowLabel}>Lighting</Text>
                          <View style={styles.breakdownBarTrack}>
                            <View
                              style={[
                                styles.breakdownBarFill,
                                {
                                  width: `${Math.round(breakdown.lightingScore * 100)}%`,
                                  backgroundColor: '#facc15',
                                },
                              ]}
                            />
                          </View>
                        </View>
                        <View style={styles.breakdownRowLine}>
                          <Text style={styles.breakdownRowLabel}>Open places</Text>
                          <View style={styles.breakdownBarTrack}>
                            <View
                              style={[
                                styles.breakdownBarFill,
                                {
                                  width: `${Math.round(breakdown.openScore * 100)}%`,
                                  backgroundColor: '#12b76a',
                                },
                              ]}
                            />
                          </View>
                        </View>
                      </View>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const formatDistance = (meters: number): string => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }

  return `${meters.toFixed(0)} m`;
};

const formatDuration = (seconds: number): string => {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  return `${Math.max(1, Math.round(seconds / 60))} min`;
};

const roadTypeScore = (type: string): number => {
  switch (type) {
    case 'primary':
    case 'primary_link':
    case 'secondary':
    case 'secondary_link':
    case 'tertiary':
    case 'tertiary_link':
      return 1;
    case 'residential':
    case 'living_street':
      return 0.7;
    case 'cycleway':
      return 0.6;
    case 'service':
      return 0.5;
    case 'track':
      return 0.4;
    case 'footway':
    case 'path':
    case 'pedestrian':
    case 'steps':
      return 0.3;
    default:
      return 0.5;
  }
};

const scoreToColor = (score: number): string => {
  const clamped = Math.min(10, Math.max(1, score));
  const ratio = (clamped - 1) / 9;
  const hue = Math.round(120 * ratio);
  return `hsl(${hue} 70% 45%)`;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  mapContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  topOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  destinationButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#1570ef',
    shadowColor: '#101828',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  destinationButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f2f4f7',
  },
  refreshButtonText: {
    color: '#101828',
    fontWeight: '600',
    fontSize: 14,
  },
  searchCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    shadowColor: '#101828',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  statusText: {
    fontSize: 13,
    color: '#475467',
    marginBottom: 8,
  },
  error: {
    fontSize: 14,
    color: '#b42318',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },
  predictions: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#eaecf0',
    borderRadius: 10,
    maxHeight: 180,
  },
  predictionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f4f7',
    backgroundColor: '#f9fafb',
  },
  predictionText: {
    fontSize: 15,
    color: '#101828',
    fontWeight: '600',
  },
  predictionSubtext: {
    marginTop: 2,
    fontSize: 13,
    color: '#667085',
  },
  inlineRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  helperText: {
    fontSize: 14,
    color: '#475467',
  },
  bottomOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
  },
  routesCard: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    shadowColor: '#101828',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  routesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  statusLabel: {
    fontSize: 12,
    color: '#667085',
  },
  statusValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#101828',
  },
  routeRow: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eaecf0',
    backgroundColor: '#ffffff',
  },
  routeRowSelected: {
    borderColor: '#1570ef',
    backgroundColor: '#eff8ff',
  },
  routeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#101828',
  },
  routeRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  routeRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreBadge: {
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d0d5dd',
  },
  detailsButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#344054',
  },
  scoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  scorePlaceholder: {
    fontSize: 12,
    fontWeight: '600',
    color: '#98a2b3',
  },
  routeMeta: {
    fontSize: 13,
    color: '#667085',
  },
  breakdownCard: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eaecf0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  breakdownScore: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownScoreValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  breakdownScoreLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#667085',
  },
  breakdownBars: {
    flex: 1,
    gap: 8,
  },
  breakdownRowLine: {
    gap: 4,
  },
  breakdownRowLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475467',
  },
  breakdownBarTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#f2f4f7',
    overflow: 'hidden',
  },
  breakdownBarFill: {
    height: '100%',
    borderRadius: 999,
  },
});
