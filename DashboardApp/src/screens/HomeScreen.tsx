import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  Dimensions,
  Animated,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AnimatedNumbers from 'react-native-animated-numbers';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { dashboardApi } from '../services/dashboard';
import { DashboardSnapshot, Position } from '../types';
import { api } from '../services/api';
import { formatCurrency, formatPercentage, formatDateShort } from '../utils/formatters';
import { getColors } from '../constants/colors';
import Chart from '../components/Chart';
import { refreshRateLimiter } from '../utils/rateLimiter';
import { filterDashboardByTimeRange } from '../utils/dashboardFilter';
import MSTRSymbol from '../components/MSTRSymbol';
import ASSTSymbol from '../components/ASSTSymbol';
import { hasMSTRParent, hasASTTParent } from '../utils/assetUtils';

type RootStackParamList = {
  AssetDetail: { ticker: string };
  Settings: undefined;
};

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type TimeRange = '1W' | '1M' | '3M' | '1Y' | 'ALL';
type ContentFilter = 'Total' | 'Assets' | 'Dividends';

// Helper function to format portfolio label with proper apostrophe handling
const formatPortfolioLabel = (fullName?: string): string => {
  if (!fullName || fullName.trim() === '') {
    return "Portfolio";
  }
  
  // Extract first name (everything before the first space)
  const firstName = fullName.trim().split(' ')[0];
  
  // Handle apostrophe: names ending in 's' get just apostrophe, others get apostrophe + s
  const possessive = firstName.toLowerCase().endsWith('s') 
    ? `${firstName}'` 
    : `${firstName}'s`;
  
  return `${possessive} Portfolio`;
};

// Helper function to format portfolio value with conditional decimal places
const formatPortfolioValue = (value: number): number => {
  // For values under 10k, keep full precision (2 decimal places)
  // For values 10k and above, round to nearest integer
  if (value < 10000) {
    // Preserve 2 decimal places using proper rounding
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
  return Math.round(value); // Round to integer for 10k+
};

export default function HomeScreen() {
  const { token, loading: authLoading, user, logout } = useAuth();
  const { isDark } = useTheme();
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  
  // Initialize styles early so they're available for early returns
  const styles = useMemo(() => createStyles(getColors(isDark)), [isDark]);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
  const [contentFilter, setContentFilter] = useState<ContentFilter>('Total');
  const [error, setError] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [assetNames, setAssetNames] = useState<Record<string, string>>({});
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const modalOpacity = useRef(new Animated.Value(0)).current;
  
  // Store all data for client-side filtering (Coinbase-style)
  const allDataRef = useRef<DashboardSnapshot | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef<boolean>(false);
  const lastRefreshTimeRef = useRef<number>(0);
  const previousPortfolioValueRef = useRef<number | null>(null);
  const previousPortfolioDollarsDigitsRef = useRef<number[] | null>(null);
  const previousPortfolioCentsTensRef = useRef<number | null>(null);
  const previousPortfolioCentsOnesRef = useRef<number | null>(null);
  const valueDirectionRef = useRef<'increasing' | 'decreasing' | null>(null);
  const colorOpacityAnim = useRef(new Animated.Value(0)).current;
  const fadeOutTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [portfolioValueColor, setPortfolioValueColor] = useState<string>(getColors(isDark).textPrimary);
  const MIN_REFRESH_INTERVAL_MS = 30 * 1000; // Minimum 30 seconds between any refreshes

  // Calculate responsive scale factor (base: 375px iPhone standard)
  const scaleFactor = screenWidth / 375;
  
  // Responsive alignment values
  const deltaPaddingLeft = 3 * scaleFactor;
  const arrowMarginLeft = 0.5 * scaleFactor;

  const timeRangeMap: Record<TimeRange, string> = {
    '1W': '1M', // Backend uses 1M, 3M, 1Y, ALL
    '1M': '1M',
    '3M': '3M',
    '1Y': '1Y',
    'ALL': 'ALL',
  };

  // Load all data once on mount or when token changes, and set up auto-refresh
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      return;
    }
    
    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
    
    // If no token, show demo data instead of error
    if (!token) {
      setLoading(false);
      const demoData = getDemoData();
      allDataRef.current = demoData;
      setData(demoData);
      return;
    }
    
    // Load all data once (fetch with 'ALL' time range)
    loadAllData();
    
    // Fetch positions to get asset names
    loadAssetNames();
    
    // Set up automatic refresh every 30 seconds to update prices & portfolio totals
    refreshIntervalRef.current = setInterval(() => {
      console.log('⏰ Auto-refreshing dashboard data (30 second interval)');
      loadAllData(true); // Pass true to indicate this is an auto-refresh
    }, 30 * 1000); // 30 seconds
    
    // Cleanup interval on unmount or when dependencies change
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authLoading]);

  // Filter data client-side when timeRange changes (no API call)
  useEffect(() => {
    if (allDataRef.current) {
      const filteredData = filterDashboardByTimeRange(allDataRef.current, timeRange);
      setData(filteredData);
    }
  }, [timeRange]);

  // Animate overlay when modal visibility changes
  useEffect(() => {
    if (showLogoutModal) {
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [showLogoutModal]);

  // Update portfolio value color animation when value changes
  useEffect(() => {
    if (!data) return;
    
    const currentValue = Math.round(data.total.current);
    const previousValue = previousPortfolioValueRef.current;
    
    if (previousValue !== null && currentValue !== previousValue && portfolioLeftmostChangePosition !== -1) {
      if (portfolioIsIncrease) {
        valueDirectionRef.current = 'increasing';
        setPortfolioValueColor(getColors(isDark).greenDark);
      } else {
        valueDirectionRef.current = 'decreasing';
        setPortfolioValueColor(getColors(isDark).redDark);
      }
      
      previousPortfolioValueRef.current = currentValue;
      
      // Fade in the color (start at 1 for full color)
      colorOpacityAnim.setValue(1);
      
      // Clear any existing fade-out timeout
      if (fadeOutTimeoutRef.current) {
        clearTimeout(fadeOutTimeoutRef.current);
      }
      
      // Fade out after animation completes (800ms animation + 200ms delay)
      fadeOutTimeoutRef.current = setTimeout(() => {
        Animated.timing(colorOpacityAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: false,
        }).start(() => {
          // Reset direction and color after fade completes
          valueDirectionRef.current = null;
          setPortfolioValueColor(getColors(isDark).textPrimary);
        });
      }, 1000); // 800ms animation + 200ms delay
    } else if (previousValue === null) {
      // Initialize on first render
      previousPortfolioValueRef.current = currentValue;
    }
    
    return () => {
      if (fadeOutTimeoutRef.current) {
        clearTimeout(fadeOutTimeoutRef.current);
      }
    };
  }, [data?.total.current, colorOpacityAnim, portfolioLeftmostChangePosition, portfolioIsIncrease]);

  // Load all data once (Coinbase-style: fetch all, filter client-side)
  const loadAllData = async (isAutoRefresh = false) => {
    if (!token) {
      setLoading(false);
      setError('Authentication required');
      return;
    }
    
    // Stop-gap 1: Prevent concurrent requests
    if (isRefreshingRef.current) {
      console.log('⏸️ Refresh already in progress, skipping...');
      return;
    }
    
    // Stop-gap 2: Enforce minimum time between refreshes (ONLY for manual requests)
    // Auto-refreshes bypass this check to allow regular 30-second updates
    const now = Date.now();
    if (!isAutoRefresh) {
      const timeSinceLastRefresh = now - lastRefreshTimeRef.current;
      if (timeSinceLastRefresh < MIN_REFRESH_INTERVAL_MS) {
        const waitTime = Math.ceil((MIN_REFRESH_INTERVAL_MS - timeSinceLastRefresh) / 1000);
        console.log(`⏸️ Rate limit: Please wait ${waitTime} second${waitTime !== 1 ? 's' : ''} before refreshing again`);
        return;
      }
    }
    
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    // Mark as refreshing
    isRefreshingRef.current = true;
    lastRefreshTimeRef.current = now;
    
    // Only show loading spinner on initial load, not auto-refreshes
    if (!isAutoRefresh) {
      setLoading(true);
    }
    setError(null);
    
    try {
      console.log(`Loading all dashboard data...${isAutoRefresh ? ' (auto-refresh)' : ''}`);
      const snapshot = await dashboardApi.getSnapshot(token, {
        time_range: 'ALL',
      });
      
      // Check if request was aborted
      if (abortController.signal.aborted) {
        return;
      }
      
      console.log('All dashboard data loaded successfully:', {
        total: snapshot.total.current,
        seriesPoints: snapshot.performance.series.length,
        allocation: snapshot.allocation.length,
        activity: snapshot.activity.length,
      });
      
      // Store all data
      allDataRef.current = snapshot;
      
      // Filter for current time range
      const filteredData = filterDashboardByTimeRange(snapshot, timeRange);
      setData(filteredData);
    } catch (err) {
      // Don't set error if request was aborted
      if (abortController.signal.aborted) {
        return;
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard';
      console.error('Dashboard load error:', err);
      
      // Only show error on initial load, not auto-refreshes (to avoid annoying users)
      if (!isAutoRefresh) {
        setError(errorMessage);
        setData(null);
      }
    } finally {
      isRefreshingRef.current = false;
      if (!abortController.signal.aborted && !isAutoRefresh) {
        setLoading(false);
      }
    }
  };

  // Fetch positions to get asset names
  const loadAssetNames = async () => {
    if (!token) return;
    
    try {
      const response = await api.get<{ positions: Position[] }>('/positions/', token);
      const nameMap: Record<string, string> = {};
      response.positions.forEach((position) => {
        if (position.ticker && position.name) {
          nameMap[position.ticker] = position.name;
        }
      });
      setAssetNames(nameMap);
    } catch (err) {
      console.error('Error fetching asset names:', err);
      // Don't show error to user, just use ticker as fallback
    }
  };

  // Legacy function for refresh (reloads all data)
  const loadDashboard = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    }
    await loadAllData();
    if (isRefresh) {
      setRefreshing(false);
    }
  };

  const handleRefresh = React.useCallback(async () => {
    if (!token) {
      return;
    }

    // Always set refreshing to true first to show spinner
    console.log('🔄 Pull to refresh triggered, setting refreshing to true');
    setRefreshing(true);
    setError(null);

    // Check rate limit after showing spinner
    if (!refreshRateLimiter.canMakeRequest()) {
      const timeUntilNext = refreshRateLimiter.getTimeUntilNextRequest();
      const secondsUntilNext = Math.ceil(timeUntilNext / 1000);
      setError(`Please wait ${secondsUntilNext} second${secondsUntilNext !== 1 ? 's' : ''} before refreshing again`);
      // Small delay before hiding spinner so user sees feedback
      setTimeout(() => {
        setRefreshing(false);
      }, 500);
      return;
    }

    try {
      // Use loadAllData which has built-in rate limiting and spam prevention
      await loadAllData(false); // false = manual refresh (shows loading state)
      
      // Wait a bit longer to ensure the spinner animates back behind the content
      // This allows the native refresh control to complete its dismissal animation
      setTimeout(() => {
        setRefreshing(false);
      }, 300);
    } catch (err) {
      // Error handling is done in loadAllData, but we still need to hide the spinner
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh dashboard';
      console.error('Dashboard refresh error:', err);
      setError(errorMessage);
      // Also delay error case to allow smooth transition
      setTimeout(() => {
        setRefreshing(false);
      }, 100);
    }
  }, [token, timeRange]);

  // Get chart data based on filter (memoized for performance)
  const chartData = useMemo(() => {
    if (!data) return [];
    
    const series = contentFilter === 'Total'
      ? data.performance.series
      : contentFilter === 'Assets'
      ? data.performance.position_series || []
      : data.performance.cash_series || [];
    
    const mapped = series.map((point) => ({
      x: point.timestamp,
      y: point.value,
    }));
    
    if (__DEV__) {
      console.log('[HomeScreen] chartData:', {
        contentFilter,
        seriesLength: series.length,
        mappedLength: mapped.length,
        timeRange,
      });
    }
    
    return mapped;
  }, [data, contentFilter, timeRange]);

  // Get asset color based on index
  const getAssetColor = (index: number) => {
    const colors = [
      getColors(isDark).assetBlack,
      getColors(isDark).assetOrange,
      getColors(isDark).assetGrey,
      getColors(isDark).assetGreyLight,
      getColors(isDark).assetGreen,
    ];
    return colors[index % colors.length];
  };

  // Format asset type for display
  const formatAssetType = (assetType: string) => {
    const mapping: Record<string, { ticker: string; name: string }> = {
      'common_stock': { ticker: 'STOCK', name: 'Common Stock' },
      'preferred_stock': { ticker: 'PREF', name: 'Preferred Stock' },
      'CASH': { ticker: 'CASH', name: 'Cash & Interest' },
      'OTHER': { ticker: 'OTHER', name: 'Other Assets' },
    };
    return mapping[assetType] || { ticker: assetType.toUpperCase(), name: assetType };
  };

  // Generate demo data for preview
  const getDemoData = (): DashboardSnapshot => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Generate time series data
    const series: Array<{ timestamp: string; value: number }> = [];
    const positionSeries: Array<{ timestamp: string; value: number }> = [];
    const cashSeries: Array<{ timestamp: string; value: number }> = [];
    
    for (let i = 0; i <= 30; i++) {
      const date = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
      const baseValue = 137500 + (i * 500); // Growing trend
      const cashValue = 2000 + (i * 50); // Cumulative cash
      const positionValue = baseValue - cashValue;
      
      series.push({
        timestamp: date.toISOString(),
        value: baseValue,
      });
      positionSeries.push({
        timestamp: date.toISOString(),
        value: positionValue,
      });
      cashSeries.push({
        timestamp: date.toISOString(),
        value: cashValue,
      });
    }

    return {
      as_of: now.toISOString(),
      total: {
        current: 150000,
        start: 137500,
        delta: {
          absolute: 12500,
          percent: 9.09,
        },
      },
      performance: {
        series,
        position_series: positionSeries,
        cash_series: cashSeries,
        delta: {
          absolute: 12500,
          percent: 9.09,
        },
        max: 152000,
        min: 137000,
      },
      allocation: [
        { asset_type: 'preferred_stock', value: 85000, percent: 56.67 },
        { asset_type: 'common_stock', value: 45000, percent: 30.0 },
        { asset_type: 'CASH', value: 20000, percent: 13.33 },
      ],
      activity: [
        {
          timestamp: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          activity_type: 'DIVIDEND',
          ticker: 'STRC',
          dividend_amount: 250.0,
          quantity: 0,
          value: 0,
        },
        {
          timestamp: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString(),
          activity_type: 'UPCOMING_DIVIDEND',
          ticker: 'STRC',
          dividend_amount: 250.0,
          quantity: 0,
          value: 0,
        },
      ],
    };
  };

  // Show loading spinner while auth is loading or dashboard is loading (initial load only)
  if (authLoading || (loading && !data && !refreshing)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={getColors(isDark).orange} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  // Show error if no token or other error
  if (error && !data) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        {token && (
          <TouchableOpacity onPress={() => loadDashboard()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Show message if no data but no error
  if (!data) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No data available</Text>
        {token && (
          <TouchableOpacity onPress={() => loadDashboard()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const delta = data.total.delta;
  const isPositive = delta.absolute >= 0;
  
  const isIncreasing = valueDirectionRef.current === 'increasing';
  const isDecreasing = valueDirectionRef.current === 'decreasing';
  
  // Interpolate color opacity - when 0, use default color, when 1, use animated color
  const animatedColorOpacity = colorOpacityAnim;
  
  // Calculate dollars and cents separately for portfolio value
  const portfolioValue = Math.round(data.total.current * 100) / 100; // Round to 2 decimals
  const portfolioDollars = Math.floor(portfolioValue);
  const portfolioCents = Math.round((portfolioValue % 1) * 100);
  const portfolioCentsTens = Math.floor(portfolioCents / 10);
  const portfolioCentsOnes = portfolioCents % 10;
  
  // Split dollars into individual digits (left to right)
  const portfolioDollarsStr = portfolioDollars.toString();
  const portfolioDollarsDigits = portfolioDollarsStr.split('').map(Number);
  
  // Track previous values
  const prevPortfolioDollarsDigits = previousPortfolioDollarsDigitsRef.current ?? portfolioDollarsDigits;
  const prevPortfolioCentsTens = previousPortfolioCentsTensRef.current ?? portfolioCentsTens;
  const prevPortfolioCentsOnes = previousPortfolioCentsOnesRef.current ?? portfolioCentsOnes;
  
  // Find the leftmost changing digit position
  // Position is: 0 = leftmost dollar digit, portfolioDollarsStr.length = cents tens, portfolioDollarsStr.length + 1 = cents ones
  let portfolioLeftmostChangePosition = -1;
  let portfolioIsIncrease = false;
  
  // Check dollars digits (left to right)
  for (let i = 0; i < Math.max(portfolioDollarsDigits.length, prevPortfolioDollarsDigits.length); i++) {
    const currentDigit = i < portfolioDollarsDigits.length ? portfolioDollarsDigits[i] : 0;
    const prevDigit = i < prevPortfolioDollarsDigits.length ? prevPortfolioDollarsDigits[i] : 0;
    if (currentDigit !== prevDigit) {
      portfolioLeftmostChangePosition = i;
      portfolioIsIncrease = currentDigit > prevDigit;
      break;
    }
  }
  
  // If no change in dollars, check cents
  if (portfolioLeftmostChangePosition === -1) {
    if (portfolioCentsTens !== prevPortfolioCentsTens) {
      portfolioLeftmostChangePosition = portfolioDollarsStr.length;
      portfolioIsIncrease = portfolioCentsTens > prevPortfolioCentsTens;
    } else if (portfolioCentsOnes !== prevPortfolioCentsOnes) {
      portfolioLeftmostChangePosition = portfolioDollarsStr.length + 1;
      portfolioIsIncrease = portfolioCentsOnes > prevPortfolioCentsOnes;
    }
  }
  
  // Update refs
  previousPortfolioDollarsDigitsRef.current = portfolioDollarsDigits;
  previousPortfolioCentsTensRef.current = portfolioCentsTens;
  previousPortfolioCentsOnesRef.current = portfolioCentsOnes;

  // Get first letter of user's name
  const getInitial = (): string => {
    if (user?.full_name) {
      return user.full_name.trim().charAt(0).toUpperCase();
    }
    if (user?.email) {
      return user.email.trim().charAt(0).toUpperCase();
    }
    return '?';
  };

  const handleLogout = async () => {
    setShowLogoutModal(false);
    await logout();
  };

  return (
    <>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={getColors(isDark).backgroundWhite} />
      <ScrollView 
        style={styles.container} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 80 }]}
        bounces={true}
        alwaysBounceVertical={true}
        scrollEnabled={scrollEnabled}
        nestedScrollEnabled={false}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            progressViewOffset={Math.max(insets.top, 20) + 40}
          />
        }
      >
        {/* Total Portfolio Section */}
        <View style={[styles.portfolioSection, { paddingTop: Math.max(insets.top, 20) + 40 }]}>
          {/* Profile Icon - Positioned absolutely */}
          <TouchableOpacity 
            onPress={() => navigation.navigate('Settings')} 
            style={[styles.profileIcon, { top: Math.max(insets.top, 20) + 40, right: 20 }]}
          >
            <Text style={styles.profileIconText}>{getInitial()}</Text>
          </TouchableOpacity>
        <View style={styles.portfolioValueContainer}>
          <View style={styles.currencyContainer}>
            <Text style={styles.currencySymbol}>$</Text>
          </View>
          <View style={styles.valueContainer}>
            <View style={styles.portfolioValueWrapper}>
              {/* Default color layer (fades out when colored) */}
              <Animated.View
                style={{
                  opacity: animatedColorOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0],
                  }),
                }}
              >
                <View style={styles.portfolioValueInnerContainer}>
                  {/* Render dollars digits with commas */}
                  {portfolioDollarsStr.split('').map((digit, index) => {
                    const currentDigit = parseInt(digit);
                    const shouldAnimate = portfolioLeftmostChangePosition !== -1 && index >= portfolioLeftmostChangePosition;
                    // Add comma before every 3rd digit from right (except the last group)
                    const shouldAddComma = index > 0 && (portfolioDollarsStr.length - index) % 3 === 0;
                    
                    return (
                      <React.Fragment key={index}>
                        {shouldAddComma && (
                          <Text style={[styles.portfolioValue, styles.portfolioValueDefault]}>,
                          </Text>
                        )}
                        {shouldAnimate ? (
                          <AnimatedNumbers
                            animateToNumber={currentDigit}
                            fontStyle={[
                              styles.portfolioValue,
                              styles.portfolioValueDefault,
                            ]}
                            animationDuration={800}
                            includeComma={false}
                          />
                        ) : (
                          <Text style={[styles.portfolioValue, styles.portfolioValueDefault]}>
                            {digit}
                          </Text>
                        )}
                      </React.Fragment>
                    );
                  })}
                  <Text style={[styles.portfolioValueDecimal, styles.portfolioValueDefault]}>.</Text>
                  {portfolioLeftmostChangePosition !== -1 && portfolioLeftmostChangePosition <= portfolioDollarsStr.length ? (
                    <AnimatedNumbers
                      animateToNumber={portfolioCentsTens}
                      fontStyle={[
                        styles.portfolioValue,
                        styles.portfolioValueDefault,
                      ]}
                      animationDuration={800}
                      includeComma={false}
                    />
                  ) : (
                    <Text style={[styles.portfolioValue, styles.portfolioValueDefault]}>
                      {portfolioCentsTens}
                    </Text>
                  )}
                  {portfolioLeftmostChangePosition !== -1 && portfolioLeftmostChangePosition <= portfolioDollarsStr.length + 1 ? (
                    <AnimatedNumbers
                      animateToNumber={portfolioCentsOnes}
                      fontStyle={[
                        styles.portfolioValue,
                        styles.portfolioValueDefault,
                      ]}
                      animationDuration={800}
                      includeComma={false}
                    />
                  ) : (
                    <Text style={[styles.portfolioValue, styles.portfolioValueDefault]}>
                      {portfolioCentsOnes}
                    </Text>
                  )}
                </View>
              </Animated.View>
              {/* Animated color layer (fades in/out) */}
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    opacity: animatedColorOpacity,
                  },
                ]}
                pointerEvents="none"
              >
                <View style={styles.portfolioValueInnerContainer}>
                  {/* Render dollars digits with commas */}
                  {portfolioDollarsStr.split('').map((digit, index) => {
                    const currentDigit = parseInt(digit);
                    const shouldAnimate = portfolioLeftmostChangePosition !== -1 && index >= portfolioLeftmostChangePosition;
                    // Add comma before every 3rd digit from right (except the last group)
                    const shouldAddComma = index > 0 && (portfolioDollarsStr.length - index) % 3 === 0;
                    
                    return (
                      <React.Fragment key={index}>
                        {shouldAddComma && (
                          <Text style={[styles.portfolioValue, { color: portfolioValueColor }]}>,
                          </Text>
                        )}
                        {shouldAnimate ? (
                          <AnimatedNumbers
                            animateToNumber={currentDigit}
                            fontStyle={[
                              styles.portfolioValue,
                              {
                                color: portfolioValueColor,
                              },
                            ]}
                            animationDuration={800}
                            includeComma={false}
                          />
                        ) : (
                          <Text style={[styles.portfolioValue, { color: portfolioValueColor }]}>
                            {digit}
                          </Text>
                        )}
                      </React.Fragment>
                    );
                  })}
                  <Text style={[styles.portfolioValueDecimal, { color: portfolioValueColor }]}>.</Text>
                  {portfolioLeftmostChangePosition !== -1 && portfolioLeftmostChangePosition <= portfolioDollarsStr.length ? (
                    <AnimatedNumbers
                      animateToNumber={portfolioCentsTens}
                      fontStyle={[
                        styles.portfolioValue,
                        {
                          color: portfolioValueColor,
                        },
                      ]}
                      animationDuration={800}
                      includeComma={false}
                    />
                  ) : (
                    <Text style={[styles.portfolioValue, { color: portfolioValueColor }]}>
                      {portfolioCentsTens}
                    </Text>
                  )}
                  {portfolioLeftmostChangePosition !== -1 && portfolioLeftmostChangePosition <= portfolioDollarsStr.length + 1 ? (
                    <AnimatedNumbers
                      animateToNumber={portfolioCentsOnes}
                      fontStyle={[
                        styles.portfolioValue,
                        {
                          color: portfolioValueColor,
                        },
                      ]}
                      animationDuration={800}
                      includeComma={false}
                    />
                  ) : (
                    <Text style={[styles.portfolioValue, { color: portfolioValueColor }]}>
                      {portfolioCentsOnes}
                    </Text>
                  )}
                </View>
              </Animated.View>
            </View>
          </View>
        </View>
        <View style={[styles.deltaContainer, { paddingLeft: deltaPaddingLeft }]}>
          <Text style={[styles.deltaArrow, { marginLeft: arrowMarginLeft }, isPositive ? styles.deltaTextPositive : styles.deltaTextNegative]}>
            {isPositive ? '↑' : '↓'}
          </Text>
          <Text style={[styles.deltaText, isPositive ? styles.deltaTextPositive : styles.deltaTextNegative]}>
            {formatCurrency(Math.abs(delta.absolute))}
          </Text>
          <View style={[
            styles.deltaPercentPill,
            isPositive ? styles.deltaPercentPillPositive : styles.deltaPercentPillNegative
          ]}>
            <Text style={styles.deltaPercentPillText}>
              {Math.abs(delta.percent).toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>

      {/* Content Filters - Total, Assets, Dividends */}
      <View style={styles.filterContainer}>
        {(['Total', 'Assets', 'Dividends'] as ContentFilter[]).map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterButton,
              contentFilter === filter && styles.filterButtonActive,
            ]}
            onPress={() => setContentFilter(filter)}
          >
            <Text
              style={[
                styles.filterButtonText,
                contentFilter === filter && styles.filterButtonTextActive,
              ]}
            >
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Performance Chart */}
      <View style={styles.chartWrapper}>
        <View style={styles.chartContainer}>
          <Chart 
            data={chartData} 
            height={200} 
            timeRange={timeRange}
            onDragStart={() => setScrollEnabled(false)}
            onDragEnd={() => setScrollEnabled(true)}
            config={{
              lineColor: getColors(isDark).chartOrange,
              gradientStartColor: getColors(isDark).chartOrange,
              gradientEndColor: getColors(isDark).chartOrange,
              gradientStartOpacity: 0.3,
              gradientEndOpacity: 0,
              curved: timeRange !== '1W', // Straight lines for 1W (spiky), curves for longer timeframes
              showDots: false,
              enableDrag: true,
            }}
          />
        </View>
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

      {/* Portfolio Breakdown Section */}
      <View style={styles.assetSection}>
        <Text style={styles.assetSectionTitle}>My Allocations</Text>
        
        {/* Allocation Bar */}
        <View style={styles.allocationBar}>
          {data.allocation.map((item, index) => {
            const segmentColor = getAssetColor(index);
            return (
              <View
                key={item.ticker}
                style={[
                  styles.allocationSegment,
                  {
                    flex: item.percent / 100,
                    backgroundColor: segmentColor,
                  },
                ]}
              >
                <LinearGradient
                  colors={[
                    'rgba(255, 255, 255, 0.4)',
                    'rgba(255, 255, 255, 0.1)',
                    'transparent'
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={[styles.segmentGlow, { backgroundColor: segmentColor + '40' }]} />
              </View>
            );
          })}
        </View>

        {/* Asset List */}
        {data.allocation.map((item, index) => {
          return (
            <TouchableOpacity
              key={item.ticker}
              style={styles.assetItem}
              onPress={() => navigation.navigate('AssetDetail', { ticker: item.ticker })}
              activeOpacity={0.7}
            >
              <View style={styles.assetItemLeft}>
                {hasMSTRParent(item.ticker) ? (
                  <MSTRSymbol 
                    size={40} 
                    color={getColors(isDark).orange} 
                    style={styles.assetSymbol}
                  />
                ) : hasASTTParent(item.ticker) ? (
                  <ASSTSymbol 
                    size={40} 
                    style={styles.assetSymbol}
                  />
                ) : (
                  <View
                    style={[
                      styles.assetIcon,
                      { backgroundColor: getAssetColor(index) },
                    ]}
                  >
                    <LinearGradient
                      colors={[
                        'rgba(255, 255, 255, 0.5)',
                        'rgba(255, 255, 255, 0.1)',
                        'transparent'
                      ]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <View style={[styles.assetIconGlow, { backgroundColor: getAssetColor(index) + '30' }]} />
                  </View>
                )}
                <View style={styles.assetItemText}>
                  <Text style={styles.assetTicker}>{item.ticker}</Text>
                  <Text style={styles.assetName}>{assetNames[item.ticker] || item.ticker}</Text>
                </View>
              </View>
              <View style={styles.assetItemRight}>
                <Text style={styles.assetValue}>{formatCurrency(item.value)}</Text>
                <Text style={styles.assetPercent}>
                  {item.percent.toFixed(1)}%
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      </ScrollView>

      {/* Logout Modal */}
      <Modal
        visible={showLogoutModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalContent}>
          <View style={[styles.modalContentInner, { paddingTop: Math.max(insets.top, 20) + 20, paddingBottom: Math.max(insets.bottom, 20) }]}>
            <TouchableOpacity
              style={[styles.modalCloseButton, { top: Math.max(insets.top, 20) + 20 }]}
              onPress={() => setShowLogoutModal(false)}
            >
              <Text style={styles.modalCloseButtonText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.logoutButtonModal}
              onPress={handleLogout}
            >
              <Text style={styles.logoutButtonModalText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (colors: ReturnType<typeof getColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'visible', // Allow chart to extend beyond ScrollView bounds
  },
  scrollContent: {
    overflow: 'visible', // Allow content to extend beyond bounds
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  profileIcon: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  profileIconText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.backgroundWhite,
  },
  modalContent: {
    flex: 1,
    backgroundColor: colors.backgroundWhite,
  },
  modalContentInner: {
    flex: 1,
    paddingHorizontal: 20,
  },
  modalCloseButton: {
    position: 'absolute',
    left: 20,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalCloseButtonText: {
    fontSize: 24,
    fontWeight: '300',
    color: colors.textPrimary,
  },
  logoutButtonModal: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 20,
  },
  logoutButtonModalText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.red,
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
  portfolioSection: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    position: 'relative',
  },
  portfolioLabel: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: colors.textSecondary,
    marginBottom: 12,
  },
  portfolioValueContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  currencyContainer: {
    marginRight: 0,
  },
  currencySymbol: {
    fontSize: 36,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
    letterSpacing: -1,
    lineHeight: 36,
  },
  valueContainer: {
    flex: 1,
  },
  portfolioValueWrapper: {
    position: 'relative',
    height: 36, // Ensure enough height for absoluteFill
    justifyContent: 'center',
  },
  portfolioValueInnerContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  portfolioValue: {
    fontSize: 36,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
    letterSpacing: -1,
    lineHeight: 36,
  },
  portfolioValueDefault: {
    color: colors.textPrimary, // Explicitly set default color
  },
  portfolioValueDecimal: {
    fontSize: 36,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
    letterSpacing: -1,
    lineHeight: 36,
  },
  deltaContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
    // paddingLeft calculated dynamically based on screen size
  },
  deltaArrow: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 16,
    // marginLeft calculated dynamically based on screen size
    marginRight: 4,
    marginBottom: -1, // Slight adjustment to align with text baseline
  },
  deltaText: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    letterSpacing: -0.3,
  },
  deltaTextPositive: {
    color: colors.green, // Use same green as asset detail screen
  },
  deltaTextNegative: {
    color: colors.red, // Use same red as asset detail screen
  },
  deltaPercentPill: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  deltaPercentPillPositive: {
    backgroundColor: colors.green, // Use same green as asset detail screen
  },
  deltaPercentPillNegative: {
    backgroundColor: colors.red, // Use same red as asset detail screen
  },
  deltaPercentPillText: {
    color: colors.backgroundWhite,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
  },
  timeRangeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 24,
    gap: 8,
  },
  timeRangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.backgroundGrey,
  },
  timeRangeButtonActive: {
    backgroundColor: colors.backgroundGrey,
  },
  timeRangeButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
    fontWeight: '500',
  },
  timeRangeButtonTextActive: {
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
    fontWeight: '600',
  },
  chartWrapper: {
    marginBottom: 0,
  },
  chartContainer: {
    paddingHorizontal: 0,
    marginLeft: 0, // No negative margin needed - chart extends naturally
    marginRight: 0,
    width: Dimensions.get('window').width, // Full screen width
    overflow: 'visible', // Allow chart to extend beyond container
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20, // Match assetSection padding
    marginTop: 0,
    marginBottom: 20,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.backgroundGrey,
  },
  filterButtonActive: {
    backgroundColor: colors.textPrimary,
  },
  filterButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    fontFamily: 'Inter-SemiBold',
    color: colors.backgroundWhite,
    fontWeight: '600',
  },
  assetSection: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  assetSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Inter-Bold',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  allocationBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    marginBottom: 20,
    overflow: 'hidden',
    // iOS shadows for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    // Android shadow
    elevation: 3,
  },
  allocationSegment: {
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  segmentGlow: {
    position: 'absolute',
    top: -2,
    left: 0,
    right: 0,
    height: '40%',
    borderRadius: 4,
  },
  assetItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.backgroundGrey,
  },
  assetItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  assetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    overflow: 'hidden',
    // iOS shadows for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    // Android shadow
    elevation: 3,
  },
  assetIconGlow: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: '50%',
    height: '50%',
    borderRadius: 3,
  },
  assetSymbol: {
    marginRight: 12,
  },
  assetItemText: {
    flex: 1,
  },
  assetTicker: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  assetName: {
    fontSize: 12,
    fontFamily: 'Inter',
    color: colors.textSecondary,
  },
  assetItemRight: {
    alignItems: 'flex-end',
  },
  assetValue: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  assetPercent: {
    fontSize: 12,
    fontFamily: 'Inter',
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: colors.red,
    textAlign: 'center',
    marginTop: 20,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.orange,
    borderRadius: 8,
    alignSelf: 'center',
  },
  retryButtonText: {
    fontFamily: 'Inter-SemiBold',
    color: colors.backgroundWhite,
    fontWeight: '600',
  },
});
