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
  
  const { ticker } = route.params;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AssetPriceHistory | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
  const [error, setError] = useState<string | null>(null);
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

  // Fetch asset price history
  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const backendTimeRange = timeRangeMap[timeRange];
        const response = await api.get<AssetPriceHistory>(
          `/assets/${ticker}/price-history?time_range=${backendTimeRange}`,
          token
        );
        
        setData(response);
      } catch (err: any) {
        console.error('Error fetching asset price history:', err);
        setError(err.message || 'Failed to load asset data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, ticker, timeRange]);

  // Convert price history to chart format with client-side filtering
  const chartData = useMemo(() => {
    if (!data || !data.series || data.series.length === 0) {
      return [];
    }
    
    // Filter data based on selected time range (client-side)
    let filteredSeries = data.series;
    if (timeRange !== 'ALL') {
      const now = new Date();
      const cutoffDate = new Date();
      
      switch (timeRange) {
        case '1W':
          cutoffDate.setDate(now.getDate() - 7);
          break;
        case '1M':
          cutoffDate.setDate(now.getDate() - 30);
          break;
        case '3M':
          cutoffDate.setDate(now.getDate() - 90);
          break;
        case '1Y':
          cutoffDate.setFullYear(now.getFullYear() - 1);
          break;
      }
      
      const cutoffTime = cutoffDate.getTime();
      filteredSeries = data.series.filter(point => {
        const pointTime = new Date(point.timestamp).getTime();
        return pointTime >= cutoffTime;
      });
    }
    
    return filteredSeries.map((point) => ({
      x: new Date(point.timestamp).getTime(),
      y: point.price,
    }));
  }, [data, timeRange]);

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
        setPriceColor(Colors.greenDark);
      } else {
        priceDirectionRef.current = 'decreasing';
        setPriceColor(Colors.redDark);
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

  if (loading) {
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
          <ActivityIndicator size="large" color={Colors.primary} />
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
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{ticker}</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Current Price Section */}
        <View style={styles.priceSection}>
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
          <View style={styles.priceChangeContainer}>
            <Text style={[styles.priceChangeArrow, isPositive ? styles.priceChangePositive : styles.priceChangeNegative]}>
              {isPositive ? '↑' : '↓'}
            </Text>
            <Text style={[styles.priceChangeText, isPositive ? styles.priceChangePositive : styles.priceChangeNegative]}>
              {formatCurrency(Math.abs(priceChange))} ({Math.abs(priceChangePercent).toFixed(2)}%)
            </Text>
          </View>
        </View>

        {/* Chart */}
        <View style={styles.chartContainer}>
          {chartData.length > 0 ? (
            <Chart
              data={chartData}
              height={250}
              width={screenWidth - 40}
              timeRange={timeRange}
              config={{
                lineColor: isPositive ? Colors.greenDark : Colors.redDark,
                gradientStartColor: isPositive ? Colors.greenDark : Colors.redDark,
                gradientEndColor: isPositive ? Colors.greenDark : Colors.redDark,
                gradientStartOpacity: 0.3,
                gradientEndOpacity: 0,
                curved: timeRange !== '1W', // Straight lines for 1W (spiky), curves for longer timeframes
                showDots: false,
                enableDrag: true,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: Colors.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  placeholder: {
    width: 60, // Same width as back button to center title
  },
  priceSection: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  currencySymbol: {
    fontSize: 24,
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
  priceChangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
    color: Colors.greenDark,
  },
  priceChangeNegative: {
    color: Colors.redDark,
  },
  chartContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
    minHeight: 250,
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
  timeRangeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  timeRangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: Colors.backgroundGrey,
  },
  timeRangeButtonActive: {
    backgroundColor: Colors.backgroundGrey,
  },
  timeRangeButtonText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  timeRangeButtonTextActive: {
    color: Colors.textPrimary,
    fontWeight: '600',
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
    backgroundColor: Colors.primary,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.backgroundWhite,
  },
});

