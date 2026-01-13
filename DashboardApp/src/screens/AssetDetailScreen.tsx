import React, { useState, useEffect, useMemo, useRef, Fragment, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AnimatedNumbers from 'react-native-animated-numbers';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { getColors } from '../constants/colors';
import AssetChart from '../components/AssetChart';
import TimeRangeSelector, { TimeRange } from '../components/TimeRangeSelector';
import BackButton from '../components/BackButton';
import { fetchAssetPriceHistory, transformToChartData, invalidateChartCache } from '../services/chartData';
import { TradingHoursMode } from '../utils/marketHours';

type RootStackParamList = {
  AssetDetail: { ticker: string };
};

type AssetDetailRouteProp = RouteProp<RootStackParamList, 'AssetDetail'>;
type AssetDetailNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AssetDetail'>;

interface PricePoint {
  timestamp: string;
  price: number;
  value?: number;
}

interface AssetPriceHistory {
  ticker: string;
  name?: string;
  current_price: number | null;
  granularity: string;
  series: PricePoint[];
}

export default function AssetDetailScreen() {
  const { token } = useAuth();
  const { isDark } = useTheme();
  const navigation = useNavigation<AssetDetailNavigationProp>();
  const route = useRoute<AssetDetailRouteProp>();
  const insets = useSafeAreaInsets();
  
  // Initialize styles early so they're available for early returns
  const styles = useMemo(() => createStyles(getColors(isDark), isDark), [isDark]);
  
  // Font size constants for responsive alignment
  const PRICE_FONT_SIZE = 42;
  // Calculate margin to align gain/loss with center of $ sign
  // The $ sign width is approximately 60% of font size, so half is ~30%
  // Adjusted to account for visual centering (6px works well for 42px font)
  const PRICE_CHANGE_MARGIN_LEFT = PRICE_FONT_SIZE * 0.143; // ~6px for 42px font
  
  const { ticker } = route.params;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AssetPriceHistory | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
  const [tradingHoursMode, setTradingHoursMode] = useState<TradingHoursMode>('market');
  const [error, setError] = useState<string | null>(null);

  // Ensure header is never shown (prevents default back arrow from appearing)
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
      headerBackVisible: false,
      headerLeft: () => null,
      header: () => null,
    });
  }, [navigation]);
  // Track previous timeRange to detect changes
  const previousTimeRangeRef = useRef<TimeRange>('1Y');
  // Preserve previous data only when switching trading hours modes (same timeRange)
  // When timeRange changes, don't preserve data to ensure snap points use correct data
  const previousDataRef = useRef<AssetPriceHistory | null>(null);
  const previousPriceRef = useRef<number | null>(null);
  const previousDollarsDigitsRef = useRef<number[] | null>(null);
  const previousCentsTensRef = useRef<number | null>(null);
  const previousCentsOnesRef = useRef<number | null>(null);
  const priceDirectionRef = useRef<'increasing' | 'decreasing' | null>(null);
  const colorOpacityAnim = useRef(new Animated.Value(0)).current;
  const fadeOutTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [priceColor, setPriceColor] = useState<string>(getColors(isDark).textPrimary);

  const timeRangeMap: Record<TimeRange, string> = {
    '1W': '1W',
    '1M': '1M',
    '3M': '3M',
    '1Y': '1Y',
    'ALL': 'ALL',
  };

  // Fetch asset price history with caching
  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        // Detect if timeRange changed (different from tradingHoursMode change)
        const timeRangeChanged = previousTimeRangeRef.current !== timeRange;
        const isInitialLoad = !data;
        
        // Only show loading spinner on initial load (when we have no data)
        // For timeframe/mode changes, preserve old data to enable smooth animations
        if (isInitialLoad) {
        setLoading(true);
        }
        setError(null);
        
        // Always fetch fresh data when trading hours mode changes
        // The cache doesn't differentiate between market/extended modes,
        // so we invalidate it to ensure we get the correct data
        invalidateChartCache(ticker);
        
        // IMPORTANT: Only preserve previous data when switching trading hours modes (same timeRange)
        // When timeRange changes, don't preserve data to ensure snap points use correct data for new timeRange
        // This prevents snap points from showing timestamps from the old timeRange
        if (data && !timeRangeChanged) {
          // Same timeRange, only tradingHoursMode changed - preserve for animation
          previousDataRef.current = data;
        } else if (timeRangeChanged) {
          // TimeRange changed - clear previous data to ensure snap points use correct data
          previousDataRef.current = null;
        }
        
        // Use cached service for efficient data fetching
        const response = await fetchAssetPriceHistory(ticker, timeRange, token, tradingHoursMode);
        
        // Update data - this will trigger the Chart animation
        setData(response);
        previousTimeRangeRef.current = timeRange;
      } catch (err: any) {
        console.error('Error fetching asset price history:', err);
        setError(err.message || 'Failed to load asset data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, ticker, timeRange, tradingHoursMode]);

  // Convert price history to chart format using optimized transformation
  // Uses efficient single-pass transformation for better performance
  // IMPORTANT: Preserve data during loading to enable smooth animations
  // The Chart component will animate from old data to new data
  const chartData = useMemo(() => {
    // Debug: Log raw API response
    if (__DEV__ && data && data.series && data.series.length > 0) {
      const firstPoint = data.series[0];
      const lastPoint = data.series[data.series.length - 1];
      console.log('[AssetDetailScreen] Raw API data (first and last points):', {
        firstPoint: {
          timestamp: firstPoint.timestamp,
          price: firstPoint.price,
          timestampType: typeof firstPoint.timestamp,
        },
        lastPoint: {
          timestamp: lastPoint.timestamp,
          price: lastPoint.price,
          timestampType: typeof lastPoint.timestamp,
        },
        totalPoints: data.series.length,
      });
    }
    
    // If we have current data, use it
    if (data) {
      const transformed = transformToChartData(data);
      
      // Debug: Log transformed data
      if (__DEV__ && transformed.length > 0) {
        const firstTransformed = transformed[0];
        const lastTransformed = transformed[transformed.length - 1];
        console.log('[AssetDetailScreen] Transformed chart data (first and last points):', {
          firstPoint: {
            x: firstTransformed.x,
            xAsDate: new Date(firstTransformed.x).toISOString(),
            xAsEST: new Date(firstTransformed.x).toLocaleString('en-US', { timeZone: 'America/New_York' }),
            y: firstTransformed.y,
          },
          lastPoint: {
            x: lastTransformed.x,
            xAsDate: new Date(lastTransformed.x).toISOString(),
            xAsEST: new Date(lastTransformed.x).toLocaleString('en-US', { timeZone: 'America/New_York' }),
            y: lastTransformed.y,
          },
        });
      }
      
      return transformed;
    }
    
    // If loading and we have previous data, use previous data for animation
    // This allows the Chart to animate from old to new data
    if (loading && previousDataRef.current) {
      return transformToChartData(previousDataRef.current);
    }
    
    // No data available
    return [];
  }, [data, loading]);

  // Calculate price values (safe defaults if no data)
  const currentPrice = data?.current_price || (data?.series && data.series.length > 0 ? data.series[data.series.length - 1].price : 0);
  const dollars = Math.floor(currentPrice);
  const cents = Math.round((currentPrice % 1) * 100);
  const centsTens = Math.floor(cents / 10);
  const centsOnes = cents % 10;
  
  // Split dollars into individual digits (left to right)
  const dollarsStr = dollars.toString();
  const dollarsDigits = dollarsStr.split('').map(Number);
  
  // Track previous values
  const prevDollarsDigits = previousDollarsDigitsRef.current ?? dollarsDigits;
  const prevCentsTens = previousCentsTensRef.current ?? centsTens;
  const prevCentsOnes = previousCentsOnesRef.current ?? centsOnes;
  
  // Find the leftmost changing digit position
  let leftmostChangePosition = -1;
  let isIncrease = false;
  
  if (data) {
    // Check dollars digits (left to right)
    for (let i = 0; i < Math.max(dollarsDigits.length, prevDollarsDigits.length); i++) {
      const currentDigit = i < dollarsDigits.length ? dollarsDigits[i] : 0;
      const prevDigit = i < prevDollarsDigits.length ? prevDollarsDigits[i] : 0;
      if (currentDigit !== prevDigit) {
        leftmostChangePosition = i;
        isIncrease = currentDigit > prevDigit;
        break;
      }
    }
    
    // If no change in dollars, check cents
    if (leftmostChangePosition === -1) {
      if (centsTens !== prevCentsTens) {
        leftmostChangePosition = dollarsStr.length;
        isIncrease = centsTens > prevCentsTens;
      } else if (centsOnes !== prevCentsOnes) {
        leftmostChangePosition = dollarsStr.length + 1;
        isIncrease = centsOnes > prevCentsOnes;
      }
    }
    
    // Update refs
    previousDollarsDigitsRef.current = dollarsDigits;
    previousCentsTensRef.current = centsTens;
    previousCentsOnesRef.current = centsOnes;
  }

  // Color animation effect for price changes (must be before early returns)
  useEffect(() => {
    if (!data) return;

    const currentValue = currentPrice;
    const previousValue = previousPriceRef.current;

    if (previousValue !== null && currentValue !== previousValue && leftmostChangePosition !== -1) {
      if (isIncrease) {
        priceDirectionRef.current = 'increasing';
        setPriceColor(getColors(isDark).orange);
      } else {
        priceDirectionRef.current = 'decreasing';
        setPriceColor(getColors(isDark).textSecondary);
      }

      previousPriceRef.current = currentValue;

      // Fade in the color
      colorOpacityAnim.setValue(1);

      // Clear any existing fade-out timeout
      if (fadeOutTimeoutRef.current) {
        clearTimeout(fadeOutTimeoutRef.current);
      }

      // Fade out after animation completes
      fadeOutTimeoutRef.current = setTimeout(() => {
        Animated.timing(colorOpacityAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: false,
        }).start(() => {
          priceDirectionRef.current = null;
          setPriceColor(getColors(isDark).textPrimary);
        });
      }, 1000);
    } else if (previousValue === null) {
      // Initialize on first render
      previousPriceRef.current = currentValue;
    }

    return () => {
      if (fadeOutTimeoutRef.current) {
        clearTimeout(fadeOutTimeoutRef.current);
      }
    };
  }, [currentPrice, colorOpacityAnim, leftmostChangePosition, isIncrease, data]);

  // Only show loading spinner on initial load (when we have no data at all)
  // For timeframe/mode changes, we preserve old data and show animation instead
  if (loading && !data && !previousDataRef.current) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <BackButton onPress={() => navigation.goBack()} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={getColors(isDark).orange} />
          <Text style={styles.loadingText}>Loading asset data...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <BackButton onPress={() => navigation.goBack()} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setError(null);
              setLoading(true);
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <BackButton onPress={() => navigation.goBack()} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No data available</Text>
        </View>
      </View>
    );
  }

  const previousPrice = data.series.length > 1 ? data.series[data.series.length - 2].price : currentPrice;
  const priceChange = currentPrice - previousPrice;
  const priceChangePercent = previousPrice !== 0 ? (priceChange / previousPrice) * 100 : 0;
  const isPositive = priceChange >= 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Back Button - Outside Card */}
        <View style={styles.topBar}>
          <BackButton onPress={() => navigation.goBack()} />
        </View>

        {/* Main Card - Contains Header and Chart */}
        <View style={styles.mainCard}>
          {/* Header Content */}
          <View style={styles.header}>
            <Text style={styles.assetName}>{data?.name || ticker}</Text>
            <Text style={styles.tickerText}>{ticker}</Text>
            
            {/* Current Price */}
            <View style={styles.priceContainer}>
              <Text style={styles.currencySymbol}>$</Text>
              <View style={styles.priceValueContainer}>
                <View style={styles.priceValueWrapper}>
                  {/* Default color layer */}
                  <Animated.View
                    style={{
                      opacity: colorOpacityAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 0],
                      }),
                    }}
                  >
                    <View style={styles.priceValueContainer}>
                      {/* Render dollars digits with commas */}
                      {dollarsStr.split('').map((digit, index) => {
                        const currentDigit = parseInt(digit);
                        const shouldAnimate = leftmostChangePosition !== -1 && index >= leftmostChangePosition;
                        // Add comma before every 3rd digit from right (except the last group)
                        const shouldAddComma = index > 0 && (dollarsStr.length - index) % 3 === 0;
                        
                        return (
                          <React.Fragment key={index}>
                            {shouldAddComma && (
                              <Text style={[styles.priceValue, { color: getColors(isDark).textPrimary }]}>,
                              </Text>
                            )}
                            {shouldAnimate ? (
                              <AnimatedNumbers
                                animateToNumber={currentDigit}
                                fontStyle={[styles.priceValue, { color: getColors(isDark).textPrimary }]}
                                animationDuration={800}
                                includeComma={false}
                              />
                            ) : (
                              <Text style={[styles.priceValue, { color: getColors(isDark).textPrimary }]}>
                                {digit}
                              </Text>
                            )}
                          </React.Fragment>
                        );
                      })}
                      <Text style={[styles.priceDecimalDot, { color: getColors(isDark).textPrimary }]}>.</Text>
                      {leftmostChangePosition !== -1 && leftmostChangePosition <= dollarsStr.length ? (
                        <AnimatedNumbers
                          animateToNumber={centsTens}
                          fontStyle={[styles.priceDecimal, { color: getColors(isDark).textPrimary }]}
                          animationDuration={800}
                          includeComma={false}
                        />
                      ) : (
                        <Text style={[styles.priceDecimal, { color: getColors(isDark).textPrimary }]}>
                          {centsTens}
                        </Text>
                      )}
                      {leftmostChangePosition !== -1 && leftmostChangePosition <= dollarsStr.length + 1 ? (
                        <AnimatedNumbers
                          animateToNumber={centsOnes}
                          fontStyle={[styles.priceDecimal, { color: getColors(isDark).textPrimary }]}
                          animationDuration={800}
                          includeComma={false}
                        />
                      ) : (
                        <Text style={[styles.priceDecimal, { color: getColors(isDark).textPrimary }]}>
                          {centsOnes}
                        </Text>
                      )}
                    </View>
                  </Animated.View>
                  {/* Animated color layer */}
                  <Animated.View
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        opacity: colorOpacityAnim,
                      },
                    ]}
                    pointerEvents="none"
                  >
                    <View style={styles.priceValueContainer}>
                      {/* Render dollars digits with commas */}
                      {dollarsStr.split('').map((digit, index) => {
                        const currentDigit = parseInt(digit);
                        const shouldAnimate = leftmostChangePosition !== -1 && index >= leftmostChangePosition;
                        // Add comma before every 3rd digit from right (except the last group)
                        const shouldAddComma = index > 0 && (dollarsStr.length - index) % 3 === 0;
                        
                        return (
                          <React.Fragment key={index}>
                            {shouldAddComma && (
                              <Text style={[styles.priceValue, { color: priceColor }]}>,
                              </Text>
                            )}
                            {shouldAnimate ? (
                              <AnimatedNumbers
                                animateToNumber={currentDigit}
                                fontStyle={[styles.priceValue, { color: priceColor }]}
                                animationDuration={800}
                                includeComma={false}
                              />
                            ) : (
                              <Text style={[styles.priceValue, { color: priceColor }]}>
                                {digit}
                              </Text>
                            )}
                          </React.Fragment>
                        );
                      })}
                      <Text style={[styles.priceDecimalDot, { color: priceColor }]}>.</Text>
                      {leftmostChangePosition !== -1 && leftmostChangePosition <= dollarsStr.length ? (
                        <AnimatedNumbers
                          animateToNumber={centsTens}
                          fontStyle={[styles.priceDecimal, { color: priceColor }]}
                          animationDuration={800}
                          includeComma={false}
                        />
                      ) : (
                        <Text style={[styles.priceDecimal, { color: priceColor }]}>
                          {centsTens}
                        </Text>
                      )}
                      {leftmostChangePosition !== -1 && leftmostChangePosition <= dollarsStr.length + 1 ? (
                        <AnimatedNumbers
                          animateToNumber={centsOnes}
                          fontStyle={[styles.priceDecimal, { color: priceColor }]}
                          animationDuration={800}
                          includeComma={false}
                        />
                      ) : (
                        <Text style={[styles.priceDecimal, { color: priceColor }]}>
                          {centsOnes}
                        </Text>
                      )}
                    </View>
                  </Animated.View>
                </View>
              </View>
            </View>
            <View style={styles.priceChangeRow}>
              <View style={[styles.priceChangeContainer, { marginLeft: PRICE_CHANGE_MARGIN_LEFT }]}>
                <Text style={[styles.priceChangeArrow, isPositive ? styles.priceChangePositive : styles.priceChangeNegative]}>
                  {isPositive ? '↑' : '↓'}
                </Text>
                <Text style={[styles.priceChangeText, isPositive ? styles.priceChangePositive : styles.priceChangeNegative]}>
                  {formatCurrency(Math.abs(priceChange))}
                </Text>
                <View style={[
                  styles.priceChangePercentPill,
                  isPositive ? styles.priceChangePercentPillPositive : styles.priceChangePercentPillNegative
                ]}>
                  <Text style={[
                    styles.priceChangePercentPillText,
                    isPositive ? styles.priceChangePercentPillTextPositive : styles.priceChangePercentPillTextNegative
                  ]}>
                    {Math.abs(priceChangePercent).toFixed(2)}%
                  </Text>
                </View>
              </View>
              {/* RTH/ETH Toggle */}
              <View style={styles.rthEthContainer}>
                <TouchableOpacity
                  style={[
                    styles.rthEthToggle,
                    tradingHoursMode === 'market' && styles.rthEthToggleActive,
                  ]}
                  onPress={() => setTradingHoursMode('market')}
                >
                  <Text style={[
                    styles.rthEthButtonText,
                    tradingHoursMode === 'market' && styles.rthEthButtonTextActive,
                  ]}>
                    RTH
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.rthEthToggle,
                    tradingHoursMode === 'extended' && styles.rthEthToggleActive,
                  ]}
                  onPress={() => setTradingHoursMode('extended')}
                >
                  <Text style={[
                    styles.rthEthButtonText,
                    tradingHoursMode === 'extended' && styles.rthEthButtonTextActive,
                  ]}>
                    ETH
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Chart */}
          <AssetChart
            data={chartData}
            timeRange={timeRange}
            tradingHoursMode={tradingHoursMode}
            isPositive={isPositive}
          />
        </View>

        {/* Time Range Selector - Outside Card */}
        <TimeRangeSelector
          value={timeRange}
          onChange={setTimeRange}
        />
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof getColors>, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background, // Warm dark background in dark mode
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  mainCard: {
    backgroundColor: isDark ? ((colors as any).glassBackground || colors.backgroundWhite) : 'rgba(255, 255, 255, 0.95)', // Semi-transparent white in light mode
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    overflow: 'hidden',
    // Glass-like border (only in dark mode)
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? ((colors as any).glassBorder || colors.border) : 'transparent', // No border in light mode
    // Soft shadow with orange glow in dark mode (subtle glow)
    shadowColor: (colors as any).glassShadowGlow || '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: isDark ? ((colors as any).glassShadowGlow ? 0.04 : 0.12) : 0.12, // Subtle glow matching TimeRangeSelector
    shadowRadius: 8, // Reduced for subtle glow
    elevation: 4, // Reduced for subtle glow
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    position: 'relative',
  },
  tickerText: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  assetName: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Inter-Bold',
    color: colors.textSecondary,
    marginBottom: 12,
    textAlign: 'left',
  },
  priceSection: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    alignSelf: 'flex-start',
  },
  currencySymbol: {
    fontSize: 42,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
    marginRight: 4,
  },
  priceValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceValueWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceValue: {
    fontSize: 42,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    letterSpacing: -1,
  },
  priceDecimalDot: {
    fontSize: 42,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    letterSpacing: -1,
  },
  priceDecimal: {
    fontSize: 42,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    letterSpacing: -1,
    minWidth: 20, // Ensure consistent width for single digits
  },
  priceChangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 2,
  },
  priceChangeContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceChangeArrow: {
    fontSize: 16,
    marginRight: 4,
  },
  priceChangeText: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
  },
  priceChangePositive: {
    color: colors.green,
  },
  priceChangeNegative: {
    color: colors.red, // Use red for negative changes
  },
  priceChangePercentPill: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priceChangePercentPillPositive: {
    backgroundColor: colors.green, // Colored background like home tab
  },
  priceChangePercentPillNegative: {
    backgroundColor: colors.red, // Colored background like home tab
  },
  priceChangePercentPillText: {
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold', // Use Chakra font like home tab
    color: colors.backgroundWhite, // White text like home tab
  },
  priceChangePercentPillTextPositive: {
    color: colors.backgroundWhite, // White text on green background
  },
  priceChangePercentPillTextNegative: {
    color: colors.backgroundWhite, // White text on red background
  },
  tradingHoursContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  tradingHoursLabel: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
  },
  tradingHoursToggle: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundGrey,
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  tradingHoursButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  tradingHoursButtonActive: {
    backgroundColor: colors.background,
  },
  tradingHoursButtonText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
  },
  tradingHoursButtonTextActive: {
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
    fontWeight: '600',
  },
  rthEthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rthEthToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    // No background by default (inactive state)
  },
  rthEthToggleActive: {
    backgroundColor: colors.textPrimary, // Black pill
  },
  rthEthButtonText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary, // Lighter grey for inactive
  },
  rthEthButtonTextActive: {
    fontFamily: 'Inter-Medium',
    color: colors.backgroundWhite, // White text when active
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'Inter',
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: colors.red,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.orange,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
    color: colors.backgroundWhite,
  },
});

