/**
 * Chart data service - provides efficient data fetching with caching
 * and optimized data transformation for client-side processing
 */

import { api } from './api';
import { chartDataCache } from './chartDataCache';
import { TradingHoursMode } from '../utils/marketHours';

type TimeRange = '1W' | '1M' | '3M' | '1Y' | 'ALL';

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

interface ChartDataPoint {
  x: number; // Timestamp in milliseconds
  y: number; // Price value
  value?: number; // Optional position value
}

/**
 * Fetch asset price history with caching and request deduplication
 */
export async function fetchAssetPriceHistory(
  ticker: string,
  timeRange: TimeRange,
  token: string,
  tradingHoursMode: TradingHoursMode = 'market'
): Promise<AssetPriceHistory> {
  // Always fetch fresh data when toggling between modes
  // The cache doesn't differentiate between market/extended modes, so we bypass it
  // to ensure we get the correct data for the selected mode
  console.log(`🌐 [ChartData] Fetching ${ticker} (${timeRange}, mode: ${tradingHoursMode}) from API`);
  
  const fetchPromise = api.get<AssetPriceHistory>(
    `/assets/${ticker}/price-history?time_range=${timeRange}&trading_hours_mode=${tradingHoursMode}`,
    token
  );

  // Register pending request to prevent duplicate calls
  // This will return the existing promise if one is already pending
  const promise = chartDataCache.registerPendingRequest(ticker, timeRange, fetchPromise);

  try {
    const data = await promise;
    
    // Don't cache data when mode is 'extended' to avoid cache conflicts
    // Only cache market mode data
    if (tradingHoursMode === 'market') {
      chartDataCache.set(ticker, timeRange, data);
    }
    
    console.log(`✅ [ChartData] Fetched ${ticker} (${timeRange}, mode: ${tradingHoursMode}) - ${data.series.length} points`);
    
    return data;
  } catch (error) {
    console.error(`❌ [ChartData] Error fetching ${ticker} (${timeRange}):`, error);
    throw error;
  }
}

/**
 * Transform API response to chart-ready format
 * Optimized for client-side processing with minimal overhead
 */
export function transformToChartData(data: AssetPriceHistory): ChartDataPoint[] {
  if (!data || !data.series || data.series.length === 0) {
    return [];
  }

  // Pre-allocate array for better performance
  const chartData: ChartDataPoint[] = new Array(data.series.length);

  // Single pass transformation - convert timestamps to milliseconds
  // Milliseconds are timezone-agnostic and efficient for chart libraries
  for (let i = 0; i < data.series.length; i++) {
    const point = data.series[i];
    chartData[i] = {
      x: new Date(point.timestamp).getTime(),
      y: point.price,
      value: point.value,
    };
  }

  return chartData;
}

/**
 * Invalidate cache for a specific ticker (all time ranges)
 * Useful when position data changes
 */
export function invalidateChartCache(ticker: string): void {
  chartDataCache.invalidate(ticker);
  console.log(`🗑️ [ChartData] Invalidated cache for ${ticker}`);
}

/**
 * Clear all chart data cache
 * Useful for logout or major data refresh
 */
export function clearChartCache(): void {
  chartDataCache.clear();
  console.log(`🗑️ [ChartData] Cleared all chart data cache`);
}

/**
 * Get cache statistics (for debugging)
 */
export function getChartCacheStats() {
  return chartDataCache.getStats();
}

