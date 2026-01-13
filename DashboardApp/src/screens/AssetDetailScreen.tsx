import React, { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AnimatedNumbers from 'react-native-animated-numbers';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { Colors } from '../constants/colors';
import Chart from '../components/Chart';
import { fetchAssetPriceHistory, transformToChartData, invalidateChartCache } from '../services/chartData';
import { TradingHoursMode } from '../utils/marketHours';

type TimeRange = '1W' | '1M' | '3M' | '1Y' | 'ALL';

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
  const navigation = useNavigation<AssetDetailNavigationProp>();
  const route = useRoute<AssetDetailRouteProp>();
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  
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
  const [priceColor, setPriceColor] = useState<string>(Colors.textPrimary);

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
        setPriceColor(Colors.orange);
      } else {
        priceDirectionRef.current = 'decreasing';
        setPriceColor(Colors.textSecondary);
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
          setPriceColor(Colors.textPrimary);
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
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.orange} />
          <Text style={styles.loadingText}>Loading asset data...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
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
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
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
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
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
                            <Text style={[styles.priceValue, { color: Colors.textPrimary }]}>,
                            </Text>
                          )}
                          {shouldAnimate ? (
                            <AnimatedNumbers
                              animateToNumber={currentDigit}
                              fontStyle={[styles.priceValue, { color: Colors.textPrimary }]}
                              animationDuration={800}
                              includeComma={false}
                            />
                          ) : (
                            <Text style={[styles.priceValue, { color: Colors.textPrimary }]}>
                              {digit}
                            </Text>
                          )}
                        </React.Fragment>
                      );
                    })}
                    <Text style={[styles.priceDecimalDot, { color: Colors.textPrimary }]}>.</Text>
                    {leftmostChangePosition !== -1 && leftmostChangePosition <= dollarsStr.length ? (
                      <AnimatedNumbers
                        animateToNumber={centsTens}
                        fontStyle={[styles.priceDecimal, { color: Colors.textPrimary }]}
                        animationDuration={800}
                        includeComma={false}
                      />
                    ) : (
                      <Text style={[styles.priceDecimal, { color: Colors.textPrimary }]}>
                        {centsTens}
                      </Text>
                    )}
                    {leftmostChangePosition !== -1 && leftmostChangePosition <= dollarsStr.length + 1 ? (
                      <AnimatedNumbers
                        animateToNumber={centsOnes}
                        fontStyle={[styles.priceDecimal, { color: Colors.textPrimary }]}
                        animationDuration={800}
                        includeComma={false}
                      />
                    ) : (
                      <Text style={[styles.priceDecimal, { color: Colors.textPrimary }]}>
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
            <TouchableOpacity
              style={styles.rthEthToggle}
              onPress={() => setTradingHoursMode(tradingHoursMode === 'market' ? 'extended' : 'market')}
            >
              <Text style={styles.rthEthButtonText}>
                {tradingHoursMode === 'market' ? 'RTH' : 'ETH'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Chart */}
        <View style={styles.chartContainer}>
          {chartData.length > 0 ? (
            <Chart
              data={chartData}
              height={250}
              width={screenWidth}
              timeRange={timeRange}
              tradingHoursMode={tradingHoursMode}
              config={{
                lineColor: isPositive ? Colors.orange : Colors.textSecondary,
                gradientStartColor: isPositive ? Colors.orange : Colors.textSecondary,
                gradientEndColor: isPositive ? Colors.orange : Colors.textSecondary,
                gradientStartOpacity: 0.3,
                gradientEndOpacity: 0,
                curved: timeRange !== '1W', // Straight lines for 1W (spiky), curves for longer timeframes
                showDots: false,
                enableDrag: true,
                fadeIntensity: 0.75, // Increased fade intensity for more pronounced effect
              }}
            />
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>No price history available</Text>
            </View>
          )}
        </View>

        {/* Time Range Selector */}
        <View style={styles.timeRangeContainer}>
          <View style={styles.timeRangeButtons}>
            {(['1W', '1M', '3M', '1Y', 'ALL'] as TimeRange[]).map((range) => (
              <TouchableOpacity
                key={range}
                style={[
                  styles.timeRangeButton,
                  timeRange === range && styles.timeRangeButtonActive,
                ]}
                onPress={() => setTimeRange(range)}
              >
                <Text
                  style={[
                    styles.timeRangeButtonText,
                    timeRange === range && styles.timeRangeButtonTextActive,
                  ]}
                >
                  {range}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    position: 'relative',
  },
  backButton: {
    paddingVertical: 8,
    paddingLeft: 0,
    paddingRight: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
    marginLeft: -4, // Compensate for header padding to align with content
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 32,
    minHeight: 32,
  },
  backButtonText: {
    fontSize: 24,
    color: Colors.orange,
    fontWeight: '600',
  },
  tickerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  assetName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.textSecondary,
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
    color: Colors.textPrimary,
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
    letterSpacing: -1,
  },
  priceDecimalDot: {
    fontSize: 42,
    fontWeight: 'bold',
    letterSpacing: -1,
  },
  priceDecimal: {
    fontSize: 42,
    fontWeight: 'bold',
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
    fontWeight: '500',
  },
  priceChangePositive: {
    color: Colors.orange,
  },
  priceChangeNegative: {
    color: Colors.textSecondary,
  },
  priceChangePercentPill: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priceChangePercentPillPositive: {
    backgroundColor: 'transparent',
  },
  priceChangePercentPillNegative: {
    backgroundColor: 'transparent',
  },
  priceChangePercentPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  priceChangePercentPillTextPositive: {
    color: Colors.orange,
  },
  priceChangePercentPillTextNegative: {
    color: Colors.textSecondary,
  },
  chartContainer: {
    marginBottom: 12,
    minHeight: 250,
    overflow: 'hidden',
  },
  noDataContainer: {
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 14,
    color: Colors.textSecondary,
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
    color: Colors.textSecondary,
  },
  tradingHoursToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundGrey,
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
    backgroundColor: Colors.background,
  },
  tradingHoursButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  tradingHoursButtonTextActive: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  timeRangeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  timeRangeButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  timeRangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: Colors.backgroundGrey,
  },
  timeRangeButtonActive: {
    backgroundColor: Colors.textPrimary,
  },
  timeRangeButtonText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  timeRangeButtonTextActive: {
    color: Colors.backgroundWhite,
    fontWeight: '600',
  },
  rthEthToggle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: Colors.backgroundGrey,
  },
  rthEthButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    color: Colors.red,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Colors.orange,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.backgroundWhite,
  },
});

