/**
 * Client-side utilities for filtering and aggregating dashboard data by time range
 * This enables Coinbase-style instant time range switching without API calls
 */

import { DashboardSnapshot } from '../types';

type TimeRange = '1W' | '1M' | '3M' | '1Y' | 'ALL';

interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

/**
 * Get date range for a time range shorthand
 */
function getTimeRangeDates(range: TimeRange): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  
  switch (range) {
    case '1W':
      start.setDate(end.getDate() - 7);
      break;
    case '1M':
      start.setDate(end.getDate() - 30);
      break;
    case '3M':
      start.setDate(end.getDate() - 90);
      break;
    case '1Y':
      start.setFullYear(end.getFullYear() - 1);
      break;
    case 'ALL':
      start.setFullYear(end.getFullYear() - 1);
      break;
  }
  
  return { start, end };
}

/**
 * Filter time series data by time range
 */
function filterTimeSeries(
  series: TimeSeriesPoint[],
  range: TimeRange
): TimeSeriesPoint[] {
  if (range === 'ALL') {
    if (__DEV__) {
      console.log('[DashboardFilter] filterTimeSeries (ALL):', {
        inputLength: series.length,
        outputLength: series.length,
      });
    }
    return series;
  }
  
  const { start, end } = getTimeRangeDates(range);
  const startTime = start.getTime();
  const endTime = end.getTime();
  
  const filtered = series.filter(point => {
    const pointTime = new Date(point.timestamp).getTime();
    return pointTime >= startTime && pointTime <= endTime;
  });
  
  if (__DEV__) {
    console.log('[DashboardFilter] filterTimeSeries:', {
      range,
      inputLength: series.length,
      outputLength: filtered.length,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      firstPoint: series[0] ? new Date(series[0].timestamp).toISOString() : 'none',
      lastPoint: series[series.length - 1] ? new Date(series[series.length - 1].timestamp).toISOString() : 'none',
    });
  }
  
  return filtered;
}

/**
 * Downsample time series data based on time range
 * Different ranges need different granularities for optimal chart rendering
 */
function downsampleTimeSeries(
  series: TimeSeriesPoint[],
  range: TimeRange
): TimeSeriesPoint[] {
  if (series.length === 0) return series;
  
  // Determine max points based on range
  let maxPoints: number;
  switch (range) {
    case '1W':
      maxPoints = 200; // 30-min intervals for week
      break;
    case '1M':
      maxPoints = 300; // Hourly for month
      break;
    case '3M':
      maxPoints = 400; // 3-hour intervals for 3 months
      break;
    case '1Y':
    case 'ALL':
      maxPoints = 400; // Daily for year
      break;
    default:
      maxPoints = 400;
  }
  
  if (series.length <= maxPoints) {
    return series;
  }
  
  // Always include first and last points
  const downsampled: TimeSeriesPoint[] = [series[0]];
  const stride = Math.max(1, Math.floor(series.length / maxPoints));
  
  for (let i = stride; i < series.length - 1; i += stride) {
    downsampled.push(series[i]);
  }
  
  // Add last point if not already included
  if (downsampled[downsampled.length - 1] !== series[series.length - 1]) {
    downsampled.push(series[series.length - 1]);
  }
  
  return downsampled;
}

/**
 * Filter activity items by time range
 */
function filterActivity(
  activity: DashboardSnapshot['activity'],
  range: TimeRange
): DashboardSnapshot['activity'] {
  if (range === 'ALL') {
    return activity;
  }
  
  const { start, end } = getTimeRangeDates(range);
  const startTime = start.getTime();
  const endTime = end.getTime();
  
  return activity.filter(item => {
    const itemTime = new Date(item.timestamp).getTime();
    return itemTime >= startTime && itemTime <= endTime;
  });
}

/**
 * Calculate totals for a filtered time range
 * 
 * IMPORTANT: total.current always uses the backend's live value (from allData.total.current)
 * This ensures consistency across all time ranges since it represents the current portfolio value
 * calculated from live prices, not historical snapshot data.
 */
function calculateTotalsForRange(
  allData: DashboardSnapshot,
  range: TimeRange
): DashboardSnapshot['total'] {
  const filteredSeries = filterTimeSeries(allData.performance.series, range);
  
  if (filteredSeries.length === 0) {
    return allData.total;
  }
  
  // Use the backend's current total (calculated from live prices)
  // This ensures consistency across all time ranges
  const currentValue = allData.total.current;
  
  // Calculate start value from the filtered series
  const startValue = filteredSeries[0].value;
  
  // Calculate delta from current (live) value vs historical start
  const absolute = currentValue - startValue;
  const percent = startValue > 0 ? (absolute / startValue) * 100 : 0;
  
  return {
    current: currentValue, // Always use backend's live value
    start: startValue,
    delta: {
      absolute: Math.round(absolute * 100) / 100,
      percent: Math.round(percent * 100) / 100,
    },
  };
}

/**
 * Calculate performance metrics for a filtered time range
 */
function calculatePerformanceForRange(
  allData: DashboardSnapshot,
  range: TimeRange
): DashboardSnapshot['performance'] {
  const filteredSeries = filterTimeSeries(allData.performance.series, range);
  const downsampledSeries = downsampleTimeSeries(filteredSeries, range);
  
  const filteredPositionSeries = allData.performance.position_series
    ? filterTimeSeries(allData.performance.position_series, range)
    : undefined;
  const downsampledPositionSeries = filteredPositionSeries
    ? downsampleTimeSeries(filteredPositionSeries, range)
    : undefined;
  
  const filteredCashSeries = allData.performance.cash_series
    ? filterTimeSeries(allData.performance.cash_series, range)
    : undefined;
  const downsampledCashSeries = filteredCashSeries
    ? downsampleTimeSeries(filteredCashSeries, range)
    : undefined;
  
  if (downsampledSeries.length === 0) {
    return allData.performance;
  }
  
  const values = downsampledSeries.map(p => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const startValue = downsampledSeries[0].value;
  const endValue = downsampledSeries[downsampledSeries.length - 1].value;
  const absolute = endValue - startValue;
  const percent = startValue > 0 ? (absolute / startValue) * 100 : 0;
  
  return {
    series: downsampledSeries,
    position_series: downsampledPositionSeries,
    cash_series: downsampledCashSeries,
    delta: {
      absolute: Math.round(absolute * 100) / 100,
      percent: Math.round(percent * 100) / 100,
    },
    max: Math.round(max * 100) / 100,
    min: Math.round(min * 100) / 100,
  };
}

/**
 * Filter a complete dashboard snapshot by time range
 * This is the main function used to switch time ranges client-side
 */
export function filterDashboardByTimeRange(
  allData: DashboardSnapshot,
  range: TimeRange
): DashboardSnapshot {
  return {
    ...allData,
    total: calculateTotalsForRange(allData, range),
    performance: calculatePerformanceForRange(allData, range),
    activity: filterActivity(allData.activity, range),
  };
}

