import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedNumbers from 'react-native-animated-numbers';
import { useAuth } from '../context/AuthContext';
import { dashboardApi } from '../services/dashboard';
import { DashboardSnapshot } from '../types';
import { formatCurrency, formatPercentage, formatDateShort } from '../utils/formatters';
import { Colors } from '../constants/colors';
import Chart from '../components/Chart';
import { refreshRateLimiter } from '../utils/rateLimiter';

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

export default function HomeScreen() {
  const { token, loading: authLoading, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('1Y');
  const [contentFilter, setContentFilter] = useState<ContentFilter>('Total');
  const [error, setError] = useState<string | null>(null);

  const timeRangeMap: Record<TimeRange, string> = {
    '1W': '1M', // Backend uses 1M, 3M, 1Y, ALL
    '1M': '1M',
    '3M': '3M',
    '1Y': '1Y',
    'ALL': 'ALL',
  };

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      return;
    }
    
    // If no token, show demo data instead of error
    if (!token) {
      setLoading(false);
      setData(getDemoData());
      return;
    }
    
    // Load dashboard when token is available
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, timeRange, authLoading]);

  const loadDashboard = async (isRefresh = false) => {
    if (!token) {
      setLoading(false);
      setError('Authentication required');
      return;
    }
    
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      console.log('Loading dashboard with time range:', timeRange);
      const backendRange = timeRangeMap[timeRange];
      const snapshot = await dashboardApi.getSnapshot(token, {
        time_range: backendRange as '1M' | '3M' | '1Y' | 'ALL',
      });
      console.log('Dashboard loaded successfully:', {
        total: snapshot.total.current,
        allocation: snapshot.allocation.length,
        activity: snapshot.activity.length,
      });
      setData(snapshot);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard';
      console.error('Dashboard load error:', err);
      setError(errorMessage);
      setData(null);
    } finally {
      setLoading(false);
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
      console.log('Refreshing dashboard with time range:', timeRange);
      const backendRange = timeRangeMap[timeRange];
      const snapshot = await dashboardApi.getSnapshot(token, {
        time_range: backendRange as '1M' | '3M' | '1Y' | 'ALL',
      });
      console.log('Dashboard refreshed successfully');
      // Update data first
      setData(snapshot);
      // Wait a bit longer to ensure the spinner animates back behind the content
      // This allows the native refresh control to complete its dismissal animation
      setTimeout(() => {
        setRefreshing(false);
      }, 300);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh dashboard';
      console.error('Dashboard refresh error:', err);
      setError(errorMessage);
      // Also delay error case to allow smooth transition
      setTimeout(() => {
        setRefreshing(false);
      }, 100);
    }
  }, [token, timeRange]);

  // Get chart data based on filter
  const getChartData = () => {
    if (!data) return [];
    
    const series = contentFilter === 'Total'
      ? data.performance.series
      : contentFilter === 'Assets'
      ? data.performance.position_series || []
      : data.performance.cash_series || [];
    
    return series.map((point) => ({
      x: point.timestamp,
      y: point.value,
    }));
  };

  // Get asset color based on index
  const getAssetColor = (index: number) => {
    const colors = [
      Colors.assetBlack,
      Colors.assetOrange,
      Colors.assetGrey,
      Colors.assetGreyLight,
      Colors.assetGreen,
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
        <ActivityIndicator size="large" color={Colors.orange} />
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

  const chartData = getChartData();
  const delta = data.total.delta;
  const isPositive = delta.absolute >= 0;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.backgroundWhite} />
      <ScrollView 
        style={styles.container} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 80 }}
        bounces={true}
        alwaysBounceVertical={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            progressViewOffset={Math.max(insets.top, 20) + 20}
          />
        }
      >
        {/* Total Portfolio Section */}
        <View style={[styles.portfolioSection, { paddingTop: Math.max(insets.top, 20) + 20 }]}>
        <Text style={styles.portfolioLabel}>{formatPortfolioLabel(user?.full_name)}</Text>
        <View style={styles.portfolioValueContainer}>
          <Text style={styles.currencySymbol}>$</Text>
          <AnimatedNumbers
            animateToNumber={Math.round(data.total.current * 100) / 100}
            fontStyle={styles.portfolioValue}
            animationDuration={800}
            includeComma={true}
          />
        </View>
        <View style={[styles.deltaBadge, isPositive && styles.deltaBadgePositive]}>
          <Text style={styles.deltaIcon}>{isPositive ? '↑' : '↓'}</Text>
          <Text style={styles.deltaText}>
            {formatCurrency(Math.abs(delta.absolute))}
          </Text>
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

      {/* Performance Chart */}
      <View style={styles.chartContainer}>
        <Chart data={chartData} height={200} />
      </View>

      {/* Content Filters */}
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

      {/* By Asset Section */}
      <View style={styles.assetSection}>
        <Text style={styles.assetSectionTitle}>By Asset</Text>
        
        {/* Allocation Bar */}
        <View style={styles.allocationBar}>
          {data.allocation.map((item, index) => (
            <View
              key={item.asset_type}
              style={[
                styles.allocationSegment,
                {
                  flex: item.percent / 100,
                  backgroundColor: getAssetColor(index),
                },
              ]}
            />
          ))}
        </View>

        {/* Asset List */}
        {data.allocation.map((item, index) => {
          const assetInfo = formatAssetType(item.asset_type);
          return (
            <View key={item.asset_type} style={styles.assetItem}>
              <View style={styles.assetItemLeft}>
                <View
                  style={[
                    styles.assetIcon,
                    { backgroundColor: getAssetColor(index) },
                  ]}
                />
                <View style={styles.assetItemText}>
                  <Text style={styles.assetTicker}>{assetInfo.ticker}</Text>
                  <Text style={styles.assetName}>{assetInfo.name}</Text>
                </View>
              </View>
              <View style={styles.assetItemRight}>
                <Text style={styles.assetValue}>{formatCurrency(item.value)}</Text>
                <Text style={styles.assetPercent}>
                  {item.percent.toFixed(1)}%
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
  portfolioSection: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  portfolioLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  portfolioValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  currencySymbol: {
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginRight: 4,
  },
  portfolioValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  deltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.greenLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  deltaBadgePositive: {
    backgroundColor: Colors.greenLight,
  },
  deltaIcon: {
    fontSize: 14,
    color: Colors.green,
    marginRight: 4,
  },
  deltaText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.green,
  },
  timeRangeContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
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
  chartContainer: {
    marginBottom: 20,
    paddingHorizontal: 0,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: Colors.backgroundGrey,
  },
  filterButtonActive: {
    backgroundColor: Colors.textPrimary,
  },
  filterButtonText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: Colors.backgroundWhite,
    fontWeight: '600',
  },
  assetSection: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  assetSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  allocationBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    marginBottom: 20,
    overflow: 'hidden',
  },
  allocationSegment: {
    height: '100%',
  },
  assetItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundGrey,
  },
  assetItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  assetIcon: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  assetItemText: {
    flex: 1,
  },
  assetTicker: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  assetName: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  assetItemRight: {
    alignItems: 'flex-end',
  },
  assetValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  assetPercent: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: 16,
    color: Colors.red,
    textAlign: 'center',
    marginTop: 20,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.orange,
    borderRadius: 8,
    alignSelf: 'center',
  },
  retryButtonText: {
    color: Colors.backgroundWhite,
    fontWeight: '600',
  },
});
