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
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AnimatedNumbers from 'react-native-animated-numbers';
import ViewShot from 'react-native-view-shot';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { formatCurrency, formatDateShort } from '../utils/formatters';
import { getColors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import AssetChart from '../components/AssetChart';
import TimeRangeSelector, { TimeRange } from '../components/TimeRangeSelector';
import BackButton from '../components/BackButton';
import ExportButton from '../components/ExportButton';
import MSTRSymbol from '../components/MSTRSymbol';
import ASSTSymbol from '../components/ASSTSymbol';
import { hasMSTRParent, hasASTTParent, getParentTicker } from '../utils/assetUtils';
import { ParentNAVHistory, Position, Holdings } from '../types';
import { fetchAssetPriceHistory, transformToChartData, invalidateChartCache } from '../services/chartData';
import { TradingHoursMode } from '../utils/marketHours';

type RootStackParamList = {
  AssetDetail: { ticker: string };
  PayoutsDetail: { ticker: string };
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
  const [navData, setNavData] = useState<ParentNAVHistory | null>(null);
  const [navLoading, setNavLoading] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [positionLoading, setPositionLoading] = useState(false);
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [holdingsLoading, setHoldingsLoading] = useState(false);

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
  const chartViewShotRef = useRef<ViewShot>(null);

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

  // Fetch position data to determine if user holds this asset
  useEffect(() => {
    if (!token) return;

    const fetchPosition = async () => {
      try {
        setPositionLoading(true);
        const response = await api.get<{ positions: Position[] }>('/positions/', token);
        
        // Find position matching current ticker (case-insensitive)
        const matchingPosition = response.positions.find(
          pos => pos.ticker?.toUpperCase() === ticker.toUpperCase()
        );
        
        setPosition(matchingPosition || null);
      } catch (err: any) {
        console.error('Error fetching position:', err);
        // Don't set error state - just silently fail if position fetch fails
        setPosition(null);
      } finally {
        setPositionLoading(false);
      }
    };

    fetchPosition();
  }, [token, ticker]);

  // Fetch NAV data for details section (only fetch once, not on timeRange changes)
  useEffect(() => {
    if (!token) return;

    const fetchNAV = async () => {
      try {
        setNavLoading(true);
        // Use a fixed time range (e.g., 1Y) or just get latest - details section shows current value
        const response = await api.get<ParentNAVHistory>(
          `/assets/${ticker}/parent-nav?time_range=1Y`,
          token
        );
        setNavData(response);
      } catch (err: any) {
        console.error('Error fetching parent NAV:', err);
        // Don't set error state - just silently fail if NAV is not available
      } finally {
        setNavLoading(false);
      }
    };

    fetchNAV();
  }, [token, ticker]); // Removed timeRange from dependencies

  // Fetch holdings data (position amount and total dividends)
  useEffect(() => {
    if (!token) return;

    const fetchHoldings = async () => {
      try {
        setHoldingsLoading(true);
        const response = await api.get<Holdings>(
          `/assets/${ticker}/holdings`,
          token
        );
        setHoldings(response);
      } catch (err: any) {
        console.error('Error fetching holdings:', err);
        // Don't set error state - just silently fail if holdings are not available
        setHoldings(null);
      } finally {
        setHoldingsLoading(false);
      }
    };

    fetchHoldings();
  }, [token, ticker]);

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

  // Share handler - defined early so it can be used in early returns
  const handleShare = async () => {
    if (!data || !token) return;
    
    // Calculate price change for share message
    const previousPrice = data.series.length > 1 ? data.series[data.series.length - 2].price : currentPrice;
    const priceChange = currentPrice - previousPrice;
    const priceChangePercent = previousPrice !== 0 ? (priceChange / previousPrice) * 100 : 0;
    const isPositive = priceChange >= 0;
    
    const priceText = formatCurrency(currentPrice);
    const changeText = `${isPositive ? '+' : ''}${formatCurrency(priceChange)} (${isPositive ? '+' : ''}${priceChangePercent.toFixed(2)}%)`;
    const assetName = data?.name || ticker;
    
    try {
      // Capture the chart as an image
      let imageUri: string | undefined;
      if (chartViewShotRef.current && chartViewShotRef.current.capture) {
        try {
          imageUri = await chartViewShotRef.current.capture();
        } catch (captureError) {
          console.warn('Failed to capture chart image:', captureError);
          // Fall back to text-only share
          const message = `${assetName} (${ticker})\n${priceText}\n${changeText}`;
          await Share.share({
            message: message,
            title: `${ticker} Price`,
          });
          return;
        }
      }
      
      if (!imageUri) {
        // Fall back to text-only share
        const message = `${assetName} (${ticker})\n${priceText}\n${changeText}`;
        await Share.share({
          message: message,
          title: `${ticker} Price`,
        });
        return;
      }
      
      // Upload image to backend
      const formData = new FormData();
      formData.append('image', {
        uri: imageUri,
        type: 'image/png',
        name: `${ticker}-chart.png`,
      } as any);
      formData.append('ticker', ticker);
      
      const uploadResponse = await fetch(`${api.baseUrl}/assets/share-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('Failed to upload image:', errorText);
        // Fall back to sharing image directly
        await Share.share({
          message: `${assetName} (${ticker})\n${priceText}\n${changeText}`,
          url: imageUri,
          title: `${ticker} Price`,
        });
        return;
      }
      
      const { shareUrl } = await uploadResponse.json();
      
      // Share the URL - this will show as a rich preview in iMessage
      // The URL contains Universal Link metadata that opens the app
      const message = `${assetName} (${ticker})\n${priceText}\n${changeText}`;
      const result = await Share.share({
        message: message,
        url: shareUrl, // This URL will be clickable and show image preview
        title: `${ticker} Price`,
      });
      
      if (result.action === Share.sharedAction) {
        console.log('Shared successfully');
      } else if (result.action === Share.dismissedAction) {
        console.log('Share dismissed');
      }
    } catch (error) {
      console.error('Error sharing:', error);
      // Fall back to text-only share on error
      try {
        const message = `${assetName} (${ticker})\n${priceText}\n${changeText}`;
        await Share.share({
          message: message,
          title: `${ticker} Price`,
        });
      } catch (fallbackError) {
        console.error('Fallback share also failed:', fallbackError);
      }
    }
  };

  // Only show loading spinner on initial load (when we have no data at all)
  // For timeframe/mode changes, we preserve old data and show animation instead
  if (loading && !data && !previousDataRef.current) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <BackButton onPress={() => navigation.goBack()} />
          <ExportButton onPress={handleShare} />
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
          <ExportButton onPress={handleShare} />
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
          <ExportButton onPress={handleShare} />
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
        {/* Top Bar - Back Button and Export Button */}
        <View style={styles.topBar}>
          <BackButton onPress={() => navigation.goBack()} />
          <ExportButton onPress={handleShare} />
        </View>

        {/* Main Card - Contains Header and Chart */}
        <ViewShot
          ref={chartViewShotRef}
          style={styles.mainCard}
          options={{
            format: 'png',
            quality: 0.9,
          }}
        >
          {/* Header Content */}
          <View style={styles.header}>
            <View style={styles.assetNameRow}>
              {hasMSTRParent(ticker) ? (
                <MSTRSymbol 
                  size={24} 
                  color={getColors(isDark).orange} 
                  style={styles.parentLogo}
                />
              ) : hasASTTParent(ticker) ? (
                <ASSTSymbol 
                  size={24} 
                  style={styles.parentLogo}
                />
              ) : null}
              <Text style={styles.assetName}>{data?.name || ticker}</Text>
            </View>
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
        </ViewShot>

        {/* Time Range Selector - Outside Card */}
        <TimeRangeSelector
          value={timeRange}
          onChange={setTimeRange}
        />

        {/* My Holdings Section - Show if user holds the asset OR has pending payout */}
        {holdings && (holdings.shares > 0 || (holdings.next_pay_date_adjusted || holdings.next_pay_date)) && (
          <View style={styles.holdingsContainer}>
            <Text style={styles.holdingsTitle}>My Holdings</Text>
            
            <View style={styles.holdingsRow}>
              <View style={styles.holdingsLeft}>
                <Text style={styles.holdingsLabel}>Amount Held</Text>
                <Text style={styles.holdingsAmount}>
                  {holdingsLoading ? '...' : formatCurrency(holdings.position_amount || 0)}
                </Text>
              </View>
              
              <View style={styles.holdingsRight}>
                <Text style={styles.holdingsLabel}>Dividends Earned</Text>
                <Text style={styles.holdingsDividends}>
                  {holdingsLoading ? '...' : formatCurrency(holdings.total_dividends || 0)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Separator line between My Holdings and My Payouts */}
        {holdings && (holdings.shares > 0 || (holdings.next_pay_date_adjusted || holdings.next_pay_date)) && (holdings.next_pay_date_adjusted || holdings.next_pay_date) && (
          <View style={styles.sectionDivider} />
        )}

        {/* My Payouts Section - Show if user has upcoming payment (even if ex-date has passed or position is sold) */}
        {holdings && (holdings.next_pay_date_adjusted || holdings.next_pay_date) && (() => {
          const investByDate = holdings.next_invest_by_date || holdings.next_ex_date;
          const today = new Date().toISOString().split('T')[0];
          const showInvestBy = investByDate && investByDate >= today;
          const showPayday = holdings.next_pay_date_adjusted || holdings.next_pay_date;
          
          return (
            <View style={styles.payoutsContainer}>
              <TouchableOpacity 
                style={styles.payoutsHeader}
                onPress={() => navigation.navigate('PayoutsDetail', { ticker })}
                activeOpacity={0.7}
              >
                <Text style={styles.payoutsTitle}>My Payouts</Text>
                <Ionicons name="chevron-forward" size={20} color={getColors(isDark).textSecondary} />
              </TouchableOpacity>
              
              <View style={styles.payoutsRow}>
                {/* Only show "Invest By" if ex-date/invest_by_date is still upcoming */}
                {showInvestBy && (
                  <View style={styles.payoutCard}>
                    <View style={styles.payoutIconContainer}>
                      <Ionicons name="calendar-outline" size={18} color={getColors(isDark).textSecondary} />
                    </View>
                    <Text style={styles.payoutLabel}>Invest By</Text>
                    <Text style={styles.payoutDate}>
                      {holdingsLoading ? '...' : formatDateShort(investByDate)}
                    </Text>
                  </View>
                )}
                
                {/* Show divider only if both cards are visible */}
                {showInvestBy && showPayday && (
                  <View style={styles.payoutDividerContainer}>
                    <View style={styles.payoutDivider} />
                  </View>
                )}
                
                {/* Always show Payday if payment date exists and hasn't occurred */}
                {showPayday && (
                  <View style={styles.payoutCard}>
                    <View style={[styles.payoutIconContainer, styles.payoutIconContainerGreen]}>
                      <Text style={styles.payoutIcon}>$</Text>
                    </View>
                    <Text style={styles.payoutLabel}>Payday</Text>
                    <Text style={styles.payoutDate}>
                      {holdingsLoading ? '...' : (
                        <>
                          {holdings.next_payout_amount != null && holdings.next_payout_amount > 0
                            ? `${formatCurrency(holdings.next_payout_amount)} • ${formatDateShort(holdings.next_pay_date_adjusted || holdings.next_pay_date)}`
                            : formatDateShort(holdings.next_pay_date_adjusted || holdings.next_pay_date)
                          }
                        </>
                      )}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })()}

        {/* Separator line between My Payouts and Details */}
        {((navData?.current_nav !== null && navData?.current_nav !== undefined) || holdings?.daily_volume != null) && (
          <View style={styles.sectionDivider} />
        )}

        {/* Details Section */}
        {((navData?.current_nav !== null && navData?.current_nav !== undefined) || holdings?.daily_volume != null) && (
          <View style={styles.detailsContainer}>
            <Text style={styles.detailsSectionTitle}>Details</Text>
            
            {navData?.current_nav !== null && navData?.current_nav !== undefined && (
              <View style={styles.detailsRow}>
                <Text style={styles.detailsLabel}>mNAV ({navData.parent_ticker})</Text>
                <Text style={styles.detailsValue}>
                  {navLoading ? '...' : navData.current_nav.toFixed(4)}
                </Text>
              </View>
            )}
            
            {holdings?.daily_volume != null && (
              <View style={styles.detailsRow}>
                <Text style={styles.detailsLabel}>Daily Volume</Text>
                <Text style={styles.detailsValue}>
                  {holdingsLoading ? '...' : (holdings.daily_volume ?? 0).toLocaleString()}
                </Text>
              </View>
            )}
          </View>
        )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  assetNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  assetName: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Inter-Bold',
    color: colors.textSecondary,
    marginLeft: 6,
  },
  parentLogo: {
    marginRight: 0,
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
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary, // Lighter grey for inactive
  },
  rthEthButtonTextActive: {
    fontFamily: 'Inter-Medium',
    color: colors.backgroundWhite, // White text when active
  },
  detailsContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  detailsSection: {
    backgroundColor: isDark ? ((colors as any).glassBackground || colors.backgroundWhite) : 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    // Glass-like border (only in dark mode)
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? ((colors as any).glassBorder || 'rgba(70, 64, 56, 0.5)') : 'transparent',
    // Soft shadow with orange glow (only in dark mode)
    shadowColor: isDark ? ((colors as any).glassShadowGlow || '#CC6A1F') : '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: isDark ? 0.04 : 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  detailsSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailsLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
  },
  detailsValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
  },
  positionValuePositive: {
    color: isDark ? '#4CAF50' : '#2E7D32',
  },
  positionValueNegative: {
    color: isDark ? '#F44336' : '#C62828',
  },
  holdingsContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  holdingsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  holdingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  holdingsLeft: {
    flex: 1,
  },
  holdingsAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  holdingsRight: {
    alignItems: 'flex-end',
  },
  holdingsLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  holdingsDividends: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.green,
    marginBottom: 4,
  },
  payoutsContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  payoutsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  payoutsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  payoutsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payoutCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payoutDividerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
  },
  payoutIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: isDark ? colors.backgroundGrey : colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  payoutIconContainerGreen: {
    backgroundColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(45, 212, 191, 0.15)', // colors.green with opacity
  },
  payoutIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.green, // Match gain/loss green color
  },
  payoutLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  payoutDate: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
  },
  payoutDivider: {
    width: 40,
    height: 1,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)', // Lighter grey divider
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

