import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, PanResponder, Animated, Easing } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import Svg, { Defs, Pattern, Circle, Rect as SvgRect, LinearGradient, Stop, Mask, ClipPath, Path, Line, G } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { getColors } from '../constants/colors';
import { TradingHoursMode, isMarketHours } from '../utils/marketHours';

// Create animated SVG components for path animations
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(SvgRect);

type TimeRange = '1W' | '1M' | '3M' | '1Y' | 'ALL';
type PatternType = 'diagonal' | 'dots' | 'crosshatch' | 'horizontal' | 'vertical' | 'none';

export interface ChartConfig {
  // Visual styling
  lineColor?: string;
  lineThickness?: number;
  gradientStartColor?: string;
  gradientEndColor?: string;
  gradientStartOpacity?: number;
  gradientEndOpacity?: number;
  patternColor?: string;
  patternOpacity?: number;
  patternSize?: number;
  
  // Chart behavior
  curved?: boolean;
  showDots?: boolean;
  enableDrag?: boolean;
  
  // Fade effect configuration (for drag interaction)
  fadeMode?: 'none' | 'future' | 'past'; // 'future' = fade right side, 'past' = fade left side
  fadeIntensity?: number; // 0-1, opacity of faded region (default 0.5)
  
  // Performance
  maxDataPoints?: number;
  throttleMs?: number;
}

export interface ChartProps {
  data: { x: string | number; y: number }[];
  height?: number;
  width?: number;
  patternType?: PatternType;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  timeRange?: TimeRange;
  tradingHoursMode?: TradingHoursMode;
  config?: ChartConfig;
  testID?: string;
}

const screenWidth = Dimensions.get('window').width;

// Helper function to check if a date is a trading day (weekday) in Eastern Time
// Also excludes common market holidays
function isTradingDayInET(timestamp: number): boolean {
  // Use Intl.DateTimeFormat to get the day of week and date in Eastern Time
  const date = new Date(timestamp);
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  });
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });
  
  const weekday = weekdayFormatter.format(date);
  const dateStr = dateFormatter.format(date);
  
  // Check if weekday (Monday-Friday)
  // formatter returns: 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
  if (weekday === 'Sat' || weekday === 'Sun') {
    return false;
  }
  
  // Check for common market holidays (fixed dates)
  // Format: "M/D/YYYY" (e.g., "1/1/2024")
  const [month, day, year] = dateStr.split('/').map(Number);
  
  // New Year's Day (Jan 1)
  if (month === 1 && day === 1) {
    return false;
  }
  
  // Independence Day (July 4)
  if (month === 7 && day === 4) {
    return false;
  }
  
  // Juneteenth (June 19)
  if (month === 6 && day === 19) {
    return false;
  }
  
  // Christmas (Dec 25)
  if (month === 12 && day === 25) {
    return false;
  }
  
  // Note: Other holidays like MLK Day, Presidents' Day, Memorial Day, Labor Day, Thanksgiving
  // are variable dates and would require more complex logic. For now, we handle the fixed holidays.
  // The backend should ideally filter these, but we add client-side filtering as a safeguard.
  
  return true;
}

// ============================================================================
// INTERNAL MODULE A: useChartData()
// Handles all data processing: downsampling, min/max, spacing, snap points
// ============================================================================
function useChartData(
  data: { x: string | number; y: number }[],
  timeRange: TimeRange,
  width: number,
  tradingHoursMode?: TradingHoursMode
) {
  // Debug: Log raw data received by Chart component
  if (__DEV__ && data && data.length > 0) {
    const firstPoint = data[0];
    const lastPoint = data[data.length - 1];
    const firstX = typeof firstPoint.x === 'string' ? new Date(firstPoint.x).getTime() : firstPoint.x;
    const lastX = typeof lastPoint.x === 'string' ? new Date(lastPoint.x).getTime() : lastPoint.x;
    console.log('[Chart] useChartData received data (first and last points):', {
      firstPoint: {
        x: firstPoint.x,
        xType: typeof firstPoint.x,
        xAsMs: firstX,
        xAsDate: new Date(firstX).toISOString(),
        xAsEST: new Date(firstX).toLocaleString('en-US', { timeZone: 'America/New_York' }),
        y: firstPoint.y,
      },
      lastPoint: {
        x: lastPoint.x,
        xType: typeof lastPoint.x,
        xAsMs: lastX,
        xAsDate: new Date(lastX).toISOString(),
        xAsEST: new Date(lastX).toLocaleString('en-US', { timeZone: 'America/New_York' }),
        y: lastPoint.y,
      },
      totalPoints: data.length,
    });
  }
  
  // Filter input data FIRST to ensure snap points use correct timeRange data
  // This prevents old data (from different timeRange) from affecting snap points
  const filteredInputData = useMemo(() => {
    let filtered = data;
    
    // First filter by timeRange
    if (timeRange !== 'ALL') {
      const now = Date.now();
      let expectedStartTime: number;
      switch (timeRange) {
        case '1W':
          expectedStartTime = now - (7 * 24 * 60 * 60 * 1000);
          break;
        case '1M':
          expectedStartTime = now - (30 * 24 * 60 * 60 * 1000);
          break;
        case '3M':
          expectedStartTime = now - (90 * 24 * 60 * 60 * 1000);
          break;
        case '1Y':
          expectedStartTime = now - (365 * 24 * 60 * 60 * 1000);
          break;
        default:
          break;
      }
      
      filtered = filtered.filter(point => {
        const timestamp = typeof point.x === 'string' ? new Date(point.x).getTime() : point.x;
        return timestamp >= expectedStartTime;
      });
    }
    
    // For Market Hours mode, also filter out non-trading days
    // This ensures no data from weekends or holidays (like Jan 1st) appears
    // Market closes at 4:00 PM ET and opens at 9:30 AM ET on trading days only
    if (tradingHoursMode === 'market') {
      filtered = filtered.filter(point => {
        const timestamp = typeof point.x === 'string' ? new Date(point.x).getTime() : point.x;
        // Only include data from trading days (weekdays in ET)
        return isTradingDayInET(timestamp);
      });
    }
    
    return filtered;
  }, [data, timeRange, tradingHoursMode]);
  
  // Downsample data for performance
  // Use filtered data to ensure snap points use correct timeRange
  // For 1M and 3M market/extended hours, skip downsampling to preserve intervals from backend
  const downsampledData = useMemo(() => {
    // For 1M, 3M, and 1Y market/extended hours, skip daily normalization to preserve intervals from backend
    if ((timeRange === '1M' || timeRange === '3M' || timeRange === '1Y') && (tradingHoursMode === 'market' || tradingHoursMode === 'extended')) {
      // Just return filtered data without normalization - backend already provides correct intervals
      return filteredInputData;
    }
    return downsampleData(filteredInputData, timeRange, tradingHoursMode);
  }, [filteredInputData, timeRange, tradingHoursMode]);

  // Normalize x-axis spacing for even visual distribution (but keep original timestamps for tooltips)
  // This gives us: even spacing on x-axis + original timestamps for accuracy
  // Use full downsampledData for visual chart (allows animation)
  // For 1W market hours mode, compress x-axis to only show trading days (no gaps)
  const normalizedData = useMemo(() => {
    if (downsampledData.length <= 1) {
      // Return with originalTimestamp property for consistency
      return downsampledData.map(point => {
        const timestamp = typeof point.x === 'string' ? new Date(point.x).getTime() : point.x;
        return {
          x: timestamp,
          y: point.y,
          originalTimestamp: timestamp,
        };
      });
    }
    
    // Convert all x values to numbers (timestamps)
    const dataWithNumericX = downsampledData.map(point => {
      const timestamp = typeof point.x === 'string' ? new Date(point.x).getTime() : point.x;
      return {
        x: timestamp,
        y: point.y,
        originalTimestamp: timestamp, // Keep original
      };
    });
    
    // For 1W market hours mode, compress x-axis to only show trading days
    if (timeRange === '1W' && tradingHoursMode === 'market') {
      // Group data points by trading day (ET date)
      const dayMap = new Map<string, typeof dataWithNumericX>();
      
      for (const point of dataWithNumericX) {
        const date = new Date(point.originalTimestamp);
        // Get ET date string (YYYY-MM-DD format)
        const etDateStr = date.toLocaleDateString('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        
        // Convert to YYYY-MM-DD format for consistent sorting
        const [month, day, year] = etDateStr.split('/');
        const normalizedDateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        
        if (!dayMap.has(normalizedDateStr)) {
          dayMap.set(normalizedDateStr, []);
        }
        dayMap.get(normalizedDateStr)!.push(point);
      }
      
      // Sort days and create compressed x-axis
      const sortedDays = Array.from(dayMap.keys()).sort();
      const compressedData: { x: number; y: number; originalTimestamp: number }[] = [];
      
      // Calculate spacing: evenly distribute across all trading days
      const totalTradingDays = sortedDays.length;
      
      if (totalTradingDays === 0) {
        return dataWithNumericX;
      }
      
      sortedDays.forEach((dayStr, dayIndex) => {
        const dayPoints = dayMap.get(dayStr)!;
        // Sort points within the day by timestamp
        dayPoints.sort((a, b) => a.originalTimestamp - b.originalTimestamp);
        
        dayPoints.forEach((point, pointIndex) => {
          // Calculate compressed x position: day index + normalized position within day
          // This creates a continuous x-axis with no gaps between trading days
          const normalizedPositionInDay = dayPoints.length > 1 
            ? pointIndex / (dayPoints.length - 1)
            : 0;
          const compressedX = dayIndex + normalizedPositionInDay;
          
          compressedData.push({
            x: compressedX, // Compressed position for visual display
            y: point.y,
            originalTimestamp: point.originalTimestamp, // Keep original timestamp for tooltips
          });
        });
      });
      
      // Normalize compressed x to fit chart width (0 to totalTradingDays - 1)
      const minCompressedX = 0;
      const maxCompressedX = totalTradingDays - 1;
      const compressedRange = maxCompressedX - minCompressedX;
      
      if (compressedRange > 0) {
        // Scale to use full range but keep relative spacing
        return compressedData.map(point => ({
          x: point.x, // Already in compressed space (0 to totalTradingDays - 1)
          y: point.y,
          originalTimestamp: point.originalTimestamp,
        }));
      }
      
      return compressedData;
    }
    
    // For other modes, use existing normalization logic
    // Find min and max timestamps
    const timestamps = dataWithNumericX.map(p => p.x);
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const timeSpan = maxTime - minTime;
    
    if (timeSpan === 0) {
      return dataWithNumericX;
    }
    
    // Create evenly spaced x-positions (for visual consistency)
    // But preserve original timestamps for each point
    const normalizedData: { x: number; y: number; originalTimestamp: number }[] = [];
    for (let i = 0; i < dataWithNumericX.length; i++) {
      // Calculate evenly spaced x-position
      const normalizedX = minTime + (timeSpan * i / (dataWithNumericX.length - 1));
      
      // Use original timestamp for this point (for tooltips/snapping)
      const originalTimestamp = dataWithNumericX[i].originalTimestamp;
      
      normalizedData.push({
        x: normalizedX, // Evenly spaced for x-axis positioning
        y: dataWithNumericX[i].y, // Original value
        originalTimestamp: originalTimestamp, // Original timestamp for display
      });
    }
    
    return normalizedData;
  }, [downsampledData, timeRange, tradingHoursMode]);

  // Convert to chart format (using normalized x-positions for even spacing)
  const chartData = useMemo(() => {
    return convertToChartData(normalizedData);
  }, [normalizedData]);

  // Calculate min/max for the chart
  const minValue = useMemo(() => {
    if (downsampledData.length === 0) return 0;
    const values = downsampledData.map(d => d.y);
    return Math.min(...values);
  }, [downsampledData]);

  const maxValue = useMemo(() => {
    if (downsampledData.length === 0) return 0;
    const values = downsampledData.map(d => d.y);
    return Math.max(...values);
  }, [downsampledData]);


  // Get the interval in milliseconds based on time range
  const getIntervalMs = useCallback((range: TimeRange): number => {
    switch (range) {
      case '1W':
        return 30 * 60 * 1000; // 30 minutes
      case '1M':
        return 60 * 60 * 1000; // 1 hour
      case '3M':
        return 3 * 60 * 60 * 1000; // 3 hours
      case '1Y':
      case 'ALL':
        return 24 * 60 * 60 * 1000; // 1 day
      default:
        return 60 * 60 * 1000; // Default to 1 hour
    }
  }, []);

  // Pre-compute snap points for drag interaction
  // Use normalized x-positions for even spacing, but original timestamps for display
  // CRITICAL: snapPoints are computed from normalizedData and are NEVER affected by animations.
  // Animations only create temporary interpolated data for visual paths - snapPoints remain unchanged.
  // IMPORTANT: Data is already filtered before normalization, so all snap points have correct timestamps.
  const snapPoints = useMemo(() => {
    if (normalizedData.length === 0 || downsampledData.length === 0) {
      console.warn('[Chart] Missing data for snap points');
      return [];
    }
    
    // Create snap points from normalized data
    // Data is already filtered to current timeRange, so all timestamps are correct
    const snapPoints: { x: number; y: number; timestamp: number }[] = [];
    
    for (let i = 0; i < normalizedData.length; i++) {
      const normalizedPoint = normalizedData[i];
      
      snapPoints.push({
        x: normalizedPoint.x, // Normalized x-position (evenly spaced)
        y: normalizedPoint.y,
        timestamp: normalizedPoint.originalTimestamp, // Original timestamp (already filtered to current timeRange)
      });
    }
    
    // Validation: Log data point counts for debugging
    const uniqueTimestamps = new Set(snapPoints.map(sp => sp.timestamp));
    const firstTimestamp = snapPoints.length > 0 ? new Date(snapPoints[0].timestamp) : null;
    const lastTimestamp = snapPoints.length > 0 ? new Date(snapPoints[snapPoints.length - 1].timestamp) : null;
    const now = Date.now();
    
    console.log('[Chart] Data point counts:', {
      original: data.length,
      filtered: filteredInputData.length,
      downsampled: downsampledData.length,
      normalized: normalizedData.length,
      chartData: chartData.length,
      timeRange,
    });
    
    console.log('[Chart] Created snap points:', {
      count: snapPoints.length,
      uniqueTimestamps: uniqueTimestamps.size,
      timeRange,
      firstTimestamp: firstTimestamp?.toISOString(),
      lastTimestamp: lastTimestamp?.toISOString(),
      firstTimestampDaysAgo: firstTimestamp ? Math.round((now - firstTimestamp.getTime()) / (24 * 60 * 60 * 1000)) : null,
      lastTimestampDaysAgo: lastTimestamp ? Math.round((now - lastTimestamp.getTime()) / (24 * 60 * 60 * 1000)) : null,
      firstFew: snapPoints.slice(0, 3).map((sp, idx) => ({ 
        index: idx, 
        timestamp: new Date(sp.timestamp).toISOString(),
        y: sp.y,
        daysAgo: Math.round((now - sp.timestamp) / (24 * 60 * 60 * 1000)),
      })),
    });
    
    return snapPoints;
  }, [normalizedData, downsampledData, data.length, filteredInputData.length, timeRange, chartData.length]);

  // Pre-compute time bounds for faster lookups (use normalized x-positions for spacing calculations)
  const timeBounds = useMemo(() => {
    if (normalizedData.length === 0) return { minTime: 0, maxTime: 0 };
    
    // Use normalized x-positions (which are evenly spaced) for calculating positions
    const timestamps = normalizedData.map(d => d.x);
    let minTime = timestamps[0];
    let maxTime = timestamps[0];
    
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] < minTime) minTime = timestamps[i];
      if (timestamps[i] > maxTime) maxTime = timestamps[i];
    }
    
    return { minTime, maxTime };
  }, [normalizedData]);

  // Calculate spacing between data points based on actual timestamps
  // This is an average spacing for rendering purposes (chart library may handle actual spacing)
  const spacing = useMemo(() => {
    if (chartData.length <= 1 || timeBounds.maxTime === timeBounds.minTime) {
      return 0;
    }
    // Average spacing based on time range
    return width / (chartData.length - 1);
  }, [chartData.length, width, timeBounds]);

  return {
    chartData,
    downsampledData,
    minValue,
    maxValue,
    spacing,
    snapPoints,
    timeBounds,
  };
}

// ============================================================================
// INTERNAL MODULE: useChartTransition()
// Handles smooth animated transitions between timeframes
// ============================================================================
function useChartTransition(
  chartData: { value: number }[],
  minValue: number,
  maxValue: number,
  width: number,
  height: number,
  timeRange: TimeRange,
  tradingHoursMode?: TradingHoursMode,
  curved: boolean = true
) {
  // Track previous values for transition
  const prevChartDataRef = useRef<{ value: number }[]>(chartData);
  const prevMinValueRef = useRef<number>(minValue);
  const prevMaxValueRef = useRef<number>(maxValue);
  const prevTimeRangeRef = useRef<TimeRange>(timeRange);
  const prevTradingHoursModeRef = useRef<TradingHoursMode | undefined>(tradingHoursMode);
  
  // Animation value for transition (0 = old data, 1 = new data)
  const transitionAnim = useRef(new Animated.Value(1)).current; // Start at 1 (new data visible)
  const isAnimatingRef = useRef(false);
  
  // Normalize data arrays to same length for smooth interpolation
  // Uses linear interpolation between points for smoother transitions (suggestion #2)
  const normalizeData = useCallback((
    oldData: { value: number }[],
    newData: { value: number }[]
  ): { old: { value: number }[]; new: { value: number }[] } => {
    if (oldData.length === 0 || newData.length === 0) {
      return { old: oldData, new: newData };
    }
    
    // Use the longer array's length as target for smoother interpolation
    const targetLength = Math.max(oldData.length, newData.length);
    
    // Helper function to linearly interpolate between data points
    const interpolateValue = (data: { value: number }[], index: number): number => {
      if (data.length === 0) return 0;
      if (data.length === 1) return data[0].value;
      if (index <= 0) return data[0].value;
      if (index >= data.length - 1) return data[data.length - 1].value;
      
      // Linear interpolation between two points
      const lowerIndex = Math.floor(index);
      const upperIndex = Math.ceil(index);
      const fraction = index - lowerIndex;
      
      return data[lowerIndex].value + (data[upperIndex].value - data[lowerIndex].value) * fraction;
    };
    
    // Interpolate old data to target length with linear interpolation
    const normalizedOld: { value: number }[] = [];
    for (let i = 0; i < targetLength; i++) {
      const ratio = oldData.length > 1 ? (i / (targetLength - 1)) * (oldData.length - 1) : 0;
      const interpolatedValue = interpolateValue(oldData, ratio);
      normalizedOld.push({ value: interpolatedValue });
    }
    
    // Interpolate new data to target length with linear interpolation
    const normalizedNew: { value: number }[] = [];
    for (let i = 0; i < targetLength; i++) {
      const ratio = newData.length > 1 ? (i / (targetLength - 1)) * (newData.length - 1) : 0;
      const interpolatedValue = interpolateValue(newData, ratio);
      normalizedNew.push({ value: interpolatedValue });
    }
    
    return { old: normalizedOld, new: normalizedNew };
  }, []);
  
  // Store old values for interpolation (separate from refs that track current)
  const oldChartDataForAnimation = useRef<{ value: number }[]>([]);
  const oldMinValueForAnimation = useRef<number>(0);
  const oldMaxValueForAnimation = useRef<number>(0);
  // Track if we're waiting for new data after a timeRange/mode change
  const pendingAnimationRef = useRef<{ timeRange: TimeRange; tradingHoursMode?: TradingHoursMode } | null>(null);
  
  // Check if we need to animate (timeRange or tradingHoursMode changed)
  useEffect(() => {
    const timeRangeChanged = prevTimeRangeRef.current !== timeRange;
    const tradingHoursModeChanged = prevTradingHoursModeRef.current !== tradingHoursMode;
    const dataChanged = prevChartDataRef.current !== chartData;
    
    // Always process timeRange or tradingHoursMode changes, even if animation is in progress
    // This ensures animations fire when toggling rapidly between timeframes or modes
    if (timeRangeChanged || tradingHoursModeChanged || dataChanged) {
      // If timeRange or tradingHoursMode changed but data hasn't changed yet (still loading),
      // prepare for animation by storing current data and marking as pending
      if ((timeRangeChanged || tradingHoursModeChanged) && !dataChanged && chartData.length > 0) {
        // Store current data as "old" data for when new data arrives
        // This ensures smooth animation when new data comes in
        oldChartDataForAnimation.current = [...prevChartDataRef.current];
        oldMinValueForAnimation.current = prevMinValueRef.current;
        oldMaxValueForAnimation.current = prevMaxValueRef.current;
        
        // Mark that we have a pending animation waiting for new data
        pendingAnimationRef.current = { timeRange, tradingHoursMode };
        
        // Update refs to track the change
        prevTimeRangeRef.current = timeRange;
        prevTradingHoursModeRef.current = tradingHoursMode;
        // Don't update chartData ref yet - wait for new data
        return; // Exit early, animation will trigger when new data arrives
      }
      
      // If we have a pending animation and new data has arrived, trigger the animation
      const hasPendingAnimation = pendingAnimationRef.current !== null;
      if (hasPendingAnimation && dataChanged) {
        // Clear pending flag - we're about to animate
        pendingAnimationRef.current = null;
      }
      // Store previous values BEFORE updating refs (for animation interpolation)
      const oldChartData = [...prevChartDataRef.current]; // Deep copy to preserve old data
      const oldMinValue = prevMinValueRef.current;
      const oldMaxValue = prevMaxValueRef.current;
      
      // For data-only changes (no timeRange change), be very conservative about animations
      // Only animate if the data structure changed (different length) or if it's a major change
      // Small price updates during auto-refreshes should NOT trigger animations
      let isSignificantChange = false;
      if (dataChanged && !timeRangeChanged && oldChartData.length > 0 && chartData.length > 0) {
        // If data length changed, it's a structural change - animate
        if (oldChartData.length !== chartData.length) {
          isSignificantChange = true;
        } else {
          // Same length - check if it's a major change
          const oldRange = prevMaxValueRef.current - prevMinValueRef.current;
          const newRange = maxValue - minValue;
          const rangeChange = Math.abs(newRange - oldRange) / (oldRange || 1);
          
          // Check if individual points have changed significantly
          let significantPointChanges = 0;
          const changeThreshold = 0.05; // 5% change threshold (more conservative)
          for (let i = 0; i < Math.min(oldChartData.length, chartData.length); i++) {
            const oldVal = oldChartData[i]?.value ?? 0;
            const newVal = chartData[i]?.value ?? 0;
            const change = Math.abs(newVal - oldVal) / (oldVal || 1);
            if (change > changeThreshold) {
              significantPointChanges++;
            }
          }
          
          // Only consider it significant if:
          // 1. Range changed by >10% (was 5%), OR
          // 2. >20% of points changed significantly (was 10%)
          // This prevents animations on minor price updates during auto-refresh
          isSignificantChange = rangeChange > 0.10 || (significantPointChanges / chartData.length) > 0.20;
        }
      }
      
      // ONLY animate on timeRange change, tradingHoursMode change, OR if data structure changed significantly
      // For auto-refreshes with same timeframe and mode, skip animation to prevent reset
      // This prevents the graph from resetting when data is refreshed but timeframe/mode is unchanged
      // IMPORTANT: If we have a pending animation (timeRange/mode changed, waiting for data), animate when data arrives
      const shouldAnimate = 
        hasPendingAnimation || // We have a pending animation waiting for new data
        timeRangeChanged || // timeRange changed (will animate with current/new data)
        tradingHoursModeChanged || // tradingHoursMode changed (will animate with current/new data)
        (dataChanged && isSignificantChange); // Significant data change (auto-refresh)
      
      if (shouldAnimate) {
        // Store old values for animation interpolation
        // CRITICAL: We create DEEP COPIES of the data for animation.
        // The original chartData, snapPoints, and all source data remain completely unchanged.
        // Animation only affects visual display (SVG paths), never the underlying data.
        // IMPORTANT: Store the CURRENT displayed state (from animation if animating, or current if not)
        // This prevents flashing when interrupting an animation mid-way
        const currentAnimValue = (transitionAnim as any)._value ?? 1;
        let currentDisplayedData = oldChartData;
        let currentDisplayedMin = oldMinValue;
        let currentDisplayedMax = oldMaxValue;
        
        // If we're interrupting an animation, use the interpolated state as the "old" state
        // This prevents flashing when toggling rapidly between timeframes
        if (isAnimatingRef.current && oldChartDataForAnimation.current.length > 0 && currentAnimValue < 1 && currentAnimValue > 0) {
          // We're interrupting an animation - use the current interpolated state
          const normalized = normalizeData(oldChartDataForAnimation.current, prevChartDataRef.current);
          const normalizedOld = normalized.old;
          const normalizedNew = normalized.new;
          
          // Interpolate to current animation value
          const interpolatedData: { value: number }[] = [];
          for (let i = 0; i < normalizedNew.length; i++) {
            const oldVal = normalizedOld[i]?.value ?? 0;
            const newVal = normalizedNew[i]?.value ?? 0;
            interpolatedData.push({ value: oldVal + (newVal - oldVal) * currentAnimValue });
          }
          currentDisplayedData = interpolatedData;
          currentDisplayedMin = oldMinValueForAnimation.current + (prevMinValueRef.current - oldMinValueForAnimation.current) * currentAnimValue;
          currentDisplayedMax = oldMaxValueForAnimation.current + (prevMaxValueRef.current - oldMaxValueForAnimation.current) * currentAnimValue;
        } else if (oldChartData.length === 0 && oldChartDataForAnimation.current.length > 0) {
          // Fallback: if oldChartData is empty but we have animation data, use that
          // This handles edge cases when toggling rapidly
          currentDisplayedData = oldChartDataForAnimation.current;
          currentDisplayedMin = oldMinValueForAnimation.current;
          currentDisplayedMax = oldMaxValueForAnimation.current;
        } else if (oldChartData.length === 0 && chartData.length > 0) {
          // If we have no old data but have new data, use new data as both old and new
          // This ensures animation still runs (even if it's a no-op visually)
          currentDisplayedData = chartData;
          currentDisplayedMin = minValue;
          currentDisplayedMax = maxValue;
        }
        
        // Store the current displayed state as the "old" state for new animation
        oldChartDataForAnimation.current = currentDisplayedData;
        oldMinValueForAnimation.current = currentDisplayedMin;
        oldMaxValueForAnimation.current = currentDisplayedMax;
        
        // Stop any existing animation and start new one immediately (no delay)
        // Removing requestAnimationFrame delay prevents flashing during rapid toggles
        transitionAnim.stopAnimation();
        isAnimatingRef.current = true;
        
        // Reset animation to 0 (show current displayed data)
        transitionAnim.setValue(0);
        
        // Animate to 1 (show new data) with smooth easing (no bounce, no overshoot)
        // Using ease-in-out for predictable animation that never overshoots
        // IMPORTANT: Animation duration is longer for timeframe/mode changes to make transitions more noticeable
        Animated.timing(transitionAnim, {
          toValue: 1,
          duration: timeRangeChanged || tradingHoursModeChanged ? 400 : 200, // Longer animation for timeframe/mode changes, shorter for data updates
          useNativeDriver: false, // Path strings can't use native driver
          easing: Easing.inOut(Easing.ease), // Smooth ease-in-out - guaranteed no overshoot
        }).start((finished) => {
          if (finished) {
            // Ensure final value is exactly 1 (no floating point errors or overshoot)
            transitionAnim.setValue(1);
            isAnimatingRef.current = false;
            // Don't clear old data immediately - let the path update loop handle the final state
            // This prevents a hiccup when switching from animated to static paths
            // The old data will be cleared on the next timeRange change
          }
        });
      } else {
        // No animation needed - update data smoothly without resetting
        // This happens during auto-refreshes when only prices change slightly
        // Set animation to final state immediately so chart shows new data
        transitionAnim.setValue(1);
        // Clear old animation data to prevent stale interpolation
        oldChartDataForAnimation.current = [];
        // IMPORTANT: Still update the refs so next change has correct "old" data
        // This ensures smooth updates during refreshes without animation or reset
        prevChartDataRef.current = chartData;
        prevMinValueRef.current = minValue;
        prevMaxValueRef.current = maxValue;
        prevTimeRangeRef.current = timeRange;
        prevTradingHoursModeRef.current = tradingHoursMode;
        return; // Early return - no animation needed, chart updates silently
      }
      
      // Update refs to new values AFTER setting up animation
      prevChartDataRef.current = chartData;
      prevMinValueRef.current = minValue;
      prevMaxValueRef.current = maxValue;
      prevTimeRangeRef.current = timeRange;
      prevTradingHoursModeRef.current = tradingHoursMode;
    }
  }, [chartData, minValue, maxValue, timeRange, tradingHoursMode, transitionAnim]);
  
  // Generate interpolated paths with smooth interpolation
  // CRITICAL: This function ONLY creates temporary interpolated data for visual display.
  // It NEVER modifies the original chartData, snapPoints, or any source data.
  // All interpolation is done in-memory for path generation only.
  const getInterpolatedPaths = useCallback((): { linePath: string; areaPath: string } => {
    const currentValue = Math.min(1, Math.max(0, (transitionAnim as any)._value ?? 1)); // Clamp to [0, 1]
    
    // Store current value for external access (used by ChartOverlay to detect completion)
    (getInterpolatedPaths as any)._lastAnimValue = currentValue;
    
    // If animation is complete or no old data stored, use current data
    if (currentValue >= 0.9999 || oldChartDataForAnimation.current.length === 0) {
      // Ensure we return the exact final state using original data (no interpolation)
      return generateChartPath(chartData, width, height, minValue, maxValue, curved);
    }
    
    // Use stored old values for interpolation (not the refs which have been updated)
    // These are deep copies stored specifically for animation - original data is never touched
    const oldChartData = oldChartDataForAnimation.current;
    const oldMinValue = oldMinValueForAnimation.current;
    const oldMaxValue = oldMaxValueForAnimation.current;
    
    // Normalize old and new data to same length for smooth interpolation
    // This creates temporary normalized arrays for interpolation only
    const normalized = normalizeData(oldChartData, chartData);
    const normalizedOld = normalized.old;
    const normalizedNew = normalized.new;
    
    // Use linear interpolation - the easing is already applied by Animated.timing
    // Double-easing (here + in Animated.timing) can cause overshoot
    // Linear interpolation ensures smooth, predictable transitions
    const easedValue = currentValue;
    
    // Interpolate min/max values using stored old values with eased interpolation
    // These are temporary values for path generation only
    const interpolatedMin = oldMinValue + (minValue - oldMinValue) * easedValue;
    const interpolatedMax = oldMaxValue + (maxValue - oldMaxValue) * easedValue;
    
    // Interpolate data points with eased interpolation for smoother transitions
    // IMPORTANT: This creates a temporary array ONLY for path generation
    // The original chartData, snapPoints, and all source data remain completely unchanged
    const interpolatedData: { value: number }[] = [];
    for (let i = 0; i < normalizedNew.length; i++) {
      const oldValue = normalizedOld[i]?.value ?? (normalizedOld.length > 0 ? normalizedOld[normalizedOld.length - 1]?.value : 0) ?? 0;
      const newValue = normalizedNew[i]?.value ?? 0;
      const interpolatedValue = oldValue + (newValue - oldValue) * easedValue;
      interpolatedData.push({ value: interpolatedValue });
    }
    
    // Generate path from interpolated data
    // The interpolatedData array is temporary and only used for this path generation
    // After this function returns, it can be garbage collected - original data is untouched
    return generateChartPath(interpolatedData, width, height, interpolatedMin, interpolatedMax, curved);
  }, [chartData, minValue, maxValue, width, height, curved, transitionAnim, normalizeData]);
  
  // Opacity animation for gradient and dots (keep visible during transitions)
  // Start at 1 (fully visible) to prevent disappearing during transitions
  const gradientOpacity = useMemo(() => {
    return transitionAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1], // Keep fully visible during transitions
    });
  }, [transitionAnim]);
  
  const dotsOpacity = useMemo(() => {
    return transitionAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1], // Keep fully visible during transitions
    });
  }, [transitionAnim]);
  
  return {
    transitionAnim,
    getInterpolatedPaths,
    gradientOpacity,
    dotsOpacity,
    isAnimating: isAnimatingRef.current,
  };
}

// Helper function to get current animation value (for use in ChartOverlay)
const getCurrentAnimationValue = (transitionAnim: Animated.Value): number => {
  return (transitionAnim as any)._value ?? 1;
};

// ============================================================================
// INTERNAL MODULE B: useChartDrag()
// Handles drag interaction: hold logic, pan responder, animated values, lifecycle
// ============================================================================
function useChartDrag({
  width,
  height,
  chartData,
  minValue,
  maxValue,
  spacing,
  snapPoints,
  timeBounds,
  curved,
  onDragStart,
  onDragEnd,
}: {
  width: number;
  height: number;
  chartData: { value: number }[];
  minValue: number;
  maxValue: number;
  spacing: number;
  snapPoints: { x: string | number; y: number; timestamp: number }[];
  timeBounds: { minTime: number; maxTime: number };
  curved: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  // Native-driven animated values for drag feedback (no React re-renders)
  const dragXAnimated = useRef(new Animated.Value(0)).current;
  const dotYAnimated = useRef(new Animated.Value(0)).current;
  
  // React state for drag lifecycle (not for visual updates)
  const [isDragging, setIsDragging] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [currentDragData, setCurrentDragData] = useState<{ value: number; timestamp: number } | null>(null);
  
  // Refs for drag state and data lookup
  const isDraggingRef = useRef(false);
  const dragXRef = useRef<number | null>(null);
  const lastSnappedIndexRef = useRef<number | null>(null); // Track last snapped index for haptic feedback (more reliable than pixel position)
  const hasInitialHapticRef = useRef(false); // Track if we've fired the initial haptic when entering drag mode
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTouchingRef = useRef(false);
  const initialTouchPositionRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef(false);
  const initialTouchXRef = useRef<number | null>(null);
  
  // Refs for fast data lookup during drag
  const chartDataRef = useRef<{ value: number }[]>([]);
  const minValueRef = useRef(0);
  const maxValueRef = useRef(0);
  const spacingRef = useRef(0);
  const snapPointsRef = useRef<{ x: string | number; y: number; timestamp: number }[]>([]);
  const curvedRef = useRef(false);
  
  const HOLD_DELAY_MS = 250;
  const MOVEMENT_THRESHOLD = 5;
  
  // Update refs when data changes
  useEffect(() => {
    chartDataRef.current = chartData;
    minValueRef.current = minValue;
    maxValueRef.current = maxValue;
    spacingRef.current = spacing;
    snapPointsRef.current = snapPoints;
    curvedRef.current = curved;
  }, [chartData, minValue, maxValue, spacing, snapPoints, curved]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);
  
  // Find nearest snap point to a given x position
  // Returns both the x position and the index for haptic tracking
  // IMPORTANT: Use snapPointsRef.current to ensure we always use the latest filtered snap points
  // This prevents using stale snap points when data changes (e.g., timeframe switch)
  const findNearestSnapPoint = useCallback((x: number): { x: number; index: number } | null => {
    const currentSnapPoints = snapPointsRef.current;
    if (currentSnapPoints.length === 0) {
      console.warn('[Chart] findNearestSnapPoint: No snap points available');
      return null;
    }
    if (currentSnapPoints.length === 1) return { x: 0, index: 0 };
    
    // Clamp x to chart bounds
    const clampedX = Math.max(0, Math.min(x, width));
    
    // Since snap points are evenly spaced (normalized x-positions), we can calculate directly
    const { minTime, maxTime } = timeBounds;
    const timeRange = maxTime - minTime;
    const calculatedSpacing = timeRange > 0 ? width / (currentSnapPoints.length - 1) : 0;
    
    // Calculate which snap point index this X position is closest to
    const targetIndex = Math.round(clampedX / calculatedSpacing);
    const clampedIndex = Math.max(0, Math.min(targetIndex, currentSnapPoints.length - 1));
    
    // Calculate the actual X position for this snap point (using normalized x)
    const snappedX = clampedIndex * calculatedSpacing;
    
    // Debug logging (only in dev mode, throttled to avoid spam)
    if (__DEV__) {
      const logKey = `snap_${currentSnapPoints.length}_${clampedIndex}`;
      if (!(findNearestSnapPoint as any).loggedIndices) {
        (findNearestSnapPoint as any).loggedIndices = new Set();
      }
      if (!(findNearestSnapPoint as any).loggedIndices.has(logKey)) {
        (findNearestSnapPoint as any).loggedIndices.add(logKey);
        const snapPoint = currentSnapPoints[clampedIndex];
        console.log('[Chart] findNearestSnapPoint:', {
          snapPointsCount: currentSnapPoints.length,
          width,
          calculatedSpacing,
          x,
          clampedX,
          targetIndex,
          clampedIndex,
          snappedX,
          originalTimestamp: snapPoint ? new Date(snapPoint.timestamp).toISOString() : 'N/A',
        });
      }
    }
    
    return { x: snappedX, index: clampedIndex };
  }, [width, timeBounds]); // Remove snapPoints from deps since we use ref
  
  // Calculate Y position along the curve at a given X position
  // For curved lines, we need to interpolate along the Bezier curve, not just use data point value
  const calculateDotY = useCallback((x: number, curved: boolean): number => {
    const chartData = chartDataRef.current;
    if (chartData.length === 0) return height / 2;
    
    const width = spacingRef.current * (chartData.length - 1) || 1;
    const valueRange = maxValueRef.current - minValueRef.current || 1;
    const padding = valueRange * 0.1;
    const adjustedMin = minValueRef.current - padding;
    const adjustedMax = maxValueRef.current + padding;
    const adjustedRange = adjustedMax - adjustedMin || 1;
    const spacing = spacingRef.current;
    
    // Calculate which segment this X falls into
    const segmentIndex = Math.floor(x / spacing);
    const clampedIndex = Math.max(0, Math.min(segmentIndex, chartData.length - 2));
    
    // Calculate points for this segment (same as generateChartPath)
    const i = clampedIndex;
    const currentValue = chartData[i].value;
    const nextValue = chartData[i + 1].value;
    
    const currentY = height - ((currentValue - adjustedMin) / adjustedRange) * height;
    const nextY = height - ((nextValue - adjustedMin) / adjustedRange) * height;
    
    const currentX = i * spacing;
    const nextX = (i + 1) * spacing;
    
    if (!curved || chartData.length <= 2) {
      // Straight line interpolation
      const t = (x - currentX) / (nextX - currentX);
      return currentY + (nextY - currentY) * t;
    }
    
    // Bezier curve interpolation (matches generateChartPath algorithm)
    const t = (x - currentX) / (nextX - currentX);
    
    // Calculate control points (same as generateChartPath)
    let cp1x: number, cp1y: number, cp2x: number, cp2y: number;
    
    if (i === 0) {
      // First segment
      cp1x = currentX + (nextX - currentX) / 3;
      cp1y = currentY;
      cp2x = currentX + 2 * (nextX - currentX) / 3;
      cp2y = nextY;
    } else if (i === chartData.length - 2) {
      // Last segment
      const prevValue = chartData[i - 1].value;
      const prevY = height - ((prevValue - adjustedMin) / adjustedRange) * height;
      const prevX = (i - 1) * spacing;
      
      cp1x = currentX + (nextX - currentX) / 3;
      cp1y = currentY + (nextY - prevY) / 3;
      cp2x = currentX + 2 * (nextX - currentX) / 3;
      cp2y = nextY;
    } else {
      // Middle segments
      const prevValue = chartData[i - 1].value;
      const prevY = height - ((prevValue - adjustedMin) / adjustedRange) * height;
      const nextNextValue = chartData[i + 2].value;
      const nextNextY = height - ((nextNextValue - adjustedMin) / adjustedRange) * height;
      
      cp1x = currentX + (nextX - currentX) / 3;
      cp1y = currentY + (nextY - prevY) / 3;
      cp2x = currentX + 2 * (nextX - currentX) / 3;
      cp2y = nextY + (nextY - nextNextY) / 3;
    }
    
    // Cubic Bezier interpolation: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    
    const y = mt3 * currentY + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * nextY;
    return y;
  }, [height]);
  
  // PERFORMANCE: Update drag position - fully native-driven, zero React re-renders
  // Animated values update on native thread, fade effect uses Animated.Value listener
  const updateDragX = useCallback((x: number) => {
    const snapResult = findNearestSnapPoint(x);
    if (snapResult === null) return;
    
    const { x: snappedX, index: snappedIndex } = snapResult;
    
    // Get the snap point for tooltip and dot position
    // Use snapPointsRef.current to ensure we get the latest filtered snap points
    const snapPoint = snapPointsRef.current[snappedIndex];
    if (!snapPoint) return;
    
    // Update current drag data for tooltip
    setCurrentDragData({
      value: snapPoint.y,
      timestamp: snapPoint.timestamp,
    });
    
    // Haptic feedback when snapping to a new point (tick)
    // Use selectionAsync() for continuous scrubbing - iOS handles throttling automatically
    // This is the appropriate haptic type for slider/scrubber interactions on iOS
    // Fires on every snap point change, including the first one
    // Check for index change OR if this is the first haptic after entering drag mode
    const indexChanged = lastSnappedIndexRef.current !== snappedIndex;
    const isFirstHaptic = !hasInitialHapticRef.current;
    
    if (indexChanged || isFirstHaptic) {
      Haptics.selectionAsync();
      hasInitialHapticRef.current = true;
    }
    lastSnappedIndexRef.current = snappedIndex;
    
    dragXRef.current = snappedX;
    
    // Update native-driven animated values immediately (no re-render)
    // FadeOverlay component listens to dragXAnimated and updates gradient stop position
    dragXAnimated.setValue(snappedX);
    // Calculate dot Y along the curve at this X position
    const dotY = calculateDotY(snappedX, curvedRef.current);
    dotYAnimated.setValue(dotY);
  }, [findNearestSnapPoint, calculateDotY, snapPoints]);
  
  const findNearestSnapPointRef = useRef(findNearestSnapPoint);
  findNearestSnapPointRef.current = findNearestSnapPoint;
  
  // Pre-generate vertical line path (static, moved via transform)
  const verticalLinePath = useMemo(() => {
    const startY = height * 0.1;
    const endY = height * 0.9;
    const dotRadius = 1.5;
    const dotSpacing = 6;
    let pathData = '';
    
    for (let y = startY; y <= endY; y += dotSpacing) {
      pathData += `M 0 ${y} m -${dotRadius},0 a ${dotRadius},${dotRadius} 0 1,0 ${dotRadius * 2},0 a ${dotRadius},${dotRadius} 0 1,0 -${dotRadius * 2},0 `;
    }
    
    return pathData;
  }, [height]);
  
  // PanResponder for drag interaction
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isDraggingRef.current,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: () => isDraggingRef.current,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: (evt) => {
        const { locationX } = evt.nativeEvent;
        const constrainedX = Math.max(0, Math.min(width, locationX));
        const snapResult = findNearestSnapPointRef.current(constrainedX);
        if (snapResult === null) return;
        
        const { x: finalX, index: snappedIndex } = snapResult;
        // Use snapPointsRef.current to ensure we get the latest filtered snap points
        const snapPoint = snapPointsRef.current[snappedIndex];
        if (!snapPoint) return;
        
        // Update current drag data for tooltip
        setCurrentDragData({
          value: snapPoint.y,
          timestamp: snapPoint.timestamp,
        });
        
        dragXRef.current = finalX;
        // Don't set lastSnappedIndexRef here - let updateDragX handle it to ensure first haptic fires
        // Reset the initial haptic flag so we get haptic feedback on the first snap
        hasInitialHapticRef.current = false;
        
        dragXAnimated.setValue(finalX);
        const dotY = calculateDotY(finalX, curvedRef.current);
        dotYAnimated.setValue(dotY);
      },
      onPanResponderMove: (evt) => {
        if (!isDraggingRef.current) return;
        const { locationX } = evt.nativeEvent;
        const constrainedX = Math.max(0, Math.min(width, locationX));
        updateDragX(constrainedX);
      },
      onPanResponderRelease: () => {
        const wasDragging = isDraggingRef.current;
        
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        dragXRef.current = null;
        lastSnappedIndexRef.current = null; // Reset snap tracking
        hasInitialHapticRef.current = false; // Reset initial haptic flag
        setCurrentDragData(null); // Clear tooltip data
        setIsDragging(false);
        setIsHolding(false);
        isDraggingRef.current = false;
        
        if (wasDragging) {
          // Haptic feedback when exiting slider mode - Medium intensity
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onDragEnd?.();
        }
      },
      onPanResponderTerminate: () => {
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
          if (isHolding) {
            setIsHolding(false);
          }
        }
        dragXRef.current = null;
        lastSnappedIndexRef.current = null; // Reset snap tracking
        hasInitialHapticRef.current = false; // Reset initial haptic flag
        const wasDragging = isDraggingRef.current;
        setIsDragging(false);
        setIsHolding(false);
        isDraggingRef.current = false;
        if (wasDragging) {
          // Haptic feedback when exiting slider mode (terminated) - Medium intensity
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onDragEnd?.();
        }
      },
      onPanResponderTerminationRequest: () => !isDraggingRef.current,
      onShouldBlockNativeResponder: () => isDraggingRef.current,
    })
  ).current;
  
  // Handle touch events for hold timer
  const handleTouchStart = useCallback((evt: any) => {
    isTouchingRef.current = true;
    hasMovedRef.current = false;
    const { locationX, locationY } = evt.nativeEvent;
    initialTouchPositionRef.current = { x: locationX, y: locationY };
    initialTouchXRef.current = locationX;
    const constrainedX = Math.max(0, Math.min(width, locationX));
    const snapResult = findNearestSnapPointRef.current(constrainedX);
    if (snapResult === null) return;
    
    const { x: finalX, index: snappedIndex } = snapResult;
    // Use snapPointsRef.current to ensure we get the latest filtered snap points
    const snapPoint = snapPointsRef.current[snappedIndex];
    if (!snapPoint) return;
    
    // Update current drag data for tooltip
    setCurrentDragData({
      value: snapPoint.y,
      timestamp: snapPoint.timestamp,
    });
    
    dragXRef.current = finalX;
    // Don't set lastSnappedIndexRef here - let updateDragX handle it to ensure first haptic fires
    // Reset the initial haptic flag so we get haptic feedback on the first snap
    hasInitialHapticRef.current = false;
    dragXAnimated.setValue(finalX);
    const dotY = calculateDotY(finalX, curvedRef.current);
    dotYAnimated.setValue(dotY);
    setIsHolding(true);
    
    holdTimerRef.current = setTimeout(() => {
      if (isTouchingRef.current && !isDraggingRef.current && !hasMovedRef.current) {
        setIsDragging(true);
        isDraggingRef.current = true;
        setIsHolding(false);
        // Haptic feedback when entering slider mode - Medium intensity
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onDragStart?.();
      } else {
        setIsHolding(false);
      }
    }, HOLD_DELAY_MS);
  }, [width, findNearestSnapPoint, calculateDotY, onDragStart]);
  
  const handleTouchMove = useCallback((evt: any) => {
    if (isHolding && initialTouchPositionRef.current) {
      const { locationX, locationY } = evt.nativeEvent;
      const dx = Math.abs(locationX - initialTouchPositionRef.current.x);
      const dy = Math.abs(locationY - initialTouchPositionRef.current.y);
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > MOVEMENT_THRESHOLD) {
        hasMovedRef.current = true;
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        setIsHolding(false);
      }
    }
  }, [isHolding]);
  
  const handleTouchEnd = useCallback(() => {
    isTouchingRef.current = false;
    hasMovedRef.current = false;
    initialTouchPositionRef.current = null;
    
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    
    const wasDragging = isDraggingRef.current;
    dragXRef.current = null;
        lastSnappedIndexRef.current = null; // Reset snap tracking
    setIsDragging(false);
    setIsHolding(false);
    isDraggingRef.current = false;
    initialTouchXRef.current = null;
    
    if (wasDragging) {
          // Haptic feedback when exiting slider mode - Medium intensity
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onDragEnd?.();
    }
  }, [onDragEnd]);
  
  const handleTouchCancel = useCallback(() => {
    isTouchingRef.current = false;
    hasMovedRef.current = false;
    initialTouchPositionRef.current = null;
    
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    
    const wasDragging = isDraggingRef.current;
    dragXRef.current = null;
        lastSnappedIndexRef.current = null; // Reset snap tracking
    setIsDragging(false);
    setIsHolding(false);
    isDraggingRef.current = false;
    initialTouchXRef.current = null;
    
    if (wasDragging) {
      // Haptic feedback when exiting slider mode (canceled) - Medium intensity
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onDragEnd?.();
    }
  }, [onDragEnd]);
  
  return {
    isDragging,
    isHolding,
    dragXAnimated,
    dotYAnimated,
    verticalLinePath,
    currentDragData,
    panResponder,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  };
}

// Normalize daily data: same number of points per day for historical days,
// proportional points for current day based on elapsed time
function normalizeDailyData(
  data: { x: string | number; y: number }[],
  timeRange: TimeRange,
  tradingHoursMode?: TradingHoursMode
): { x: string | number; y: number }[] | null {
  // Skip normalization for 1M, 3M, and 1Y market/extended hours - backend already provides correct intervals
  // We want to preserve these exact timestamps for the tooltip
  if ((timeRange === '1M' || timeRange === '3M' || timeRange === '1Y') && (tradingHoursMode === 'market' || tradingHoursMode === 'extended')) {
    return null; // Skip - preserve intervals from backend
  }
  
  // Only apply daily normalization for shorter timeframes that would have intraday data
  // For longer timeframes, the backend already aggregates to daily buckets
  if (timeRange !== '1W' && timeRange !== '1M') {
    return null; // Not a daily chart, return null to skip normalization
  }

  if (data.length === 0) {
    return null;
  }

  // Convert all x values to timestamps
  const dataWithTimestamps = data.map(point => ({
    x: typeof point.x === 'string' ? new Date(point.x).getTime() : point.x,
    y: point.y,
  }));

  // Group data points by day (using UTC day boundaries for consistency)
  const pointsByDay = new Map<string, typeof dataWithTimestamps>();
  
  for (const point of dataWithTimestamps) {
    const date = new Date(point.x);
    // Use UTC date string as key (YYYY-MM-DD)
    const dayKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    
    if (!pointsByDay.has(dayKey)) {
      pointsByDay.set(dayKey, []);
    }
    pointsByDay.get(dayKey)!.push(point);
  }

  // Get current day in UTC
  const now = new Date();
  const currentDayKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

  // Determine normalized points per day
  // For a full trading day, we want a consistent number of points
  // Let's use 60 points per day as the target (same as TARGET_POINTS in downsampleData)
  const TARGET_POINTS_PER_DAY = 60;

  const normalizedData: { x: string | number; y: number }[] = [];
  const sortedDays = Array.from(pointsByDay.keys()).sort();

  for (const dayKey of sortedDays) {
    const dayPoints = pointsByDay.get(dayKey)!;
    
    if (dayKey === currentDayKey) {
      // Current day: normalize proportionally based on how much of the day has passed
      // Calculate what portion of the day has elapsed
      const dayStart = new Date(dayKey + 'T00:00:00Z').getTime();
      const dayEnd = new Date(dayKey + 'T23:59:59Z').getTime();
      const dayDuration = dayEnd - dayStart;
      const elapsed = now.getTime() - dayStart;
      
      // Calculate proportional target points (at least 1, at most TARGET_POINTS_PER_DAY)
      const proportionalTarget = Math.max(
        1,
        Math.min(
          TARGET_POINTS_PER_DAY,
          Math.round((elapsed / dayDuration) * TARGET_POINTS_PER_DAY)
        )
      );

      // Normalize current day to proportional target
      if (dayPoints.length <= proportionalTarget) {
        // If we have fewer or equal points than target, use all points
        normalizedData.push(...dayPoints.map(p => ({ x: p.x, y: p.y })));
      } else {
        // Downsample to proportional target
        const step = dayPoints.length / proportionalTarget;
        for (let i = 0; i < proportionalTarget; i++) {
          const index = Math.round(i * step);
          const clampedIndex = Math.min(index, dayPoints.length - 1);
          normalizedData.push({
            x: dayPoints[clampedIndex].x,
            y: dayPoints[clampedIndex].y,
          });
        }
      }
    } else {
      // Historical day: normalize to full TARGET_POINTS_PER_DAY
      if (dayPoints.length <= TARGET_POINTS_PER_DAY) {
        // If we have fewer points, interpolate to reach TARGET_POINTS_PER_DAY
        for (let i = 0; i < TARGET_POINTS_PER_DAY; i++) {
          const ratio = dayPoints.length > 1 ? (i / (TARGET_POINTS_PER_DAY - 1)) * (dayPoints.length - 1) : 0;
          const lowerIndex = Math.floor(ratio);
          const upperIndex = Math.min(Math.ceil(ratio), dayPoints.length - 1);
          const fraction = ratio - lowerIndex;
          
          const lowerPoint = dayPoints[lowerIndex];
          const upperPoint = dayPoints[upperIndex];
          
          // Interpolate y value
          const interpolatedY = lowerPoint.y + (upperPoint.y - lowerPoint.y) * fraction;
          
          // For x, use the timestamp at the normalized position within the day
          const dayStart = new Date(dayKey + 'T00:00:00Z').getTime();
          const dayEnd = new Date(dayKey + 'T23:59:59Z').getTime();
          const dayDuration = dayEnd - dayStart;
          const normalizedX = dayStart + (dayDuration * i / (TARGET_POINTS_PER_DAY - 1));
          
          normalizedData.push({
            x: normalizedX,
            y: interpolatedY,
          });
        }
      } else {
        // Downsample to TARGET_POINTS_PER_DAY
        const step = dayPoints.length / TARGET_POINTS_PER_DAY;
        for (let i = 0; i < TARGET_POINTS_PER_DAY; i++) {
          const index = Math.round(i * step);
          const clampedIndex = Math.min(index, dayPoints.length - 1);
          normalizedData.push({
            x: dayPoints[clampedIndex].x,
            y: dayPoints[clampedIndex].y,
          });
        }
      }
    }
  }

  // Sort by timestamp to ensure correct order
  normalizedData.sort((a, b) => {
    const aTime = typeof a.x === 'string' ? new Date(a.x).getTime() : a.x;
    const bTime = typeof b.x === 'string' ? new Date(b.x).getTime() : b.x;
    return aTime - bTime;
  });

  return normalizedData;
}

// Downsample data for performance - extremely aggressive for large timeframes
// Coinbase/Stocks apps typically use 50-60 points max for smooth performance
// Export for testing
export const downsampleData = (data: { x: string | number; y: number }[], timeRange?: TimeRange, tradingHoursMode?: TradingHoursMode): { x: string | number; y: number }[] => {
  // "Equalizer Hack" (Suggestion #1): Always return exactly TARGET_POINTS for smooth morphing
  // This ensures all timeframes have the same number of points, allowing smooth path interpolation
  const TARGET_POINTS = 60; // Constant points for all timeframes - enables smooth transitions
  
  if (data.length === 0) {
    return data;
  }

  // Apply daily normalization first for daily charts (1W, 1M)
  // This ensures same number of points per day for historical days,
  // and proportional points for current day
  if (timeRange) {
    const dailyNormalized = normalizeDailyData(data, timeRange, tradingHoursMode);
    if (dailyNormalized !== null) {
      // Daily normalization was applied, use that result
      // For 1W charts, we allow more points (200) to show daily detail
      // For 1M charts, we use the standard TARGET_POINTS (60)
      const maxPointsForRange = timeRange === '1W' ? 200 : TARGET_POINTS;
      const dataToProcess = dailyNormalized;
      
      // If the normalized daily data exceeds the max for this range, apply additional downsampling
      if (dataToProcess.length > maxPointsForRange) {
        // For daily charts, we want to preserve the per-day structure
        // So we'll downsample proportionally across all days
        const step = dataToProcess.length / maxPointsForRange;
        const result: { x: string | number; y: number }[] = [];
        
        // Always include first point
        result.push(dataToProcess[0]);
        
        // Sample points evenly
        for (let i = 1; i < maxPointsForRange - 1; i++) {
          const index = Math.round(i * step);
          if (index < dataToProcess.length) {
            result.push(dataToProcess[index]);
          }
        }
        
        // Always include last point
        if (dataToProcess.length > 1) {
          result.push(dataToProcess[dataToProcess.length - 1]);
        }
        
        return result;
      }
      
      // If normalized data is within target, return it as-is
      return dataToProcess;
    }
  }
  
  if (data.length <= TARGET_POINTS) {
    // For short timeframes (1W), don't interpolate - show actual data points for spiky appearance
    // Coinbase shows raw price movements on short timeframes, not smoothed interpolations
    if (timeRange === '1W') {
      return data; // Return raw data for 1W to show actual price movements
    }
    
    // If we have fewer points than target, interpolate to reach exactly TARGET_POINTS
    if (data.length === TARGET_POINTS) {
      return data;
    }
    
    // Interpolate to reach exactly TARGET_POINTS (for longer timeframes)
    const result: { x: string | number; y: number }[] = [];
    for (let i = 0; i < TARGET_POINTS; i++) {
      const ratio = data.length > 1 ? (i / (TARGET_POINTS - 1)) * (data.length - 1) : 0;
      const lowerIndex = Math.floor(ratio);
      const upperIndex = Math.min(Math.ceil(ratio), data.length - 1);
      const fraction = ratio - lowerIndex;
      
      // Linear interpolation for both x and y
      const lowerPoint = data[lowerIndex];
      const upperPoint = data[upperIndex];
      
      let interpolatedX: string | number;
      let interpolatedY: number;
      
      if (typeof lowerPoint.x === 'number' && typeof upperPoint.x === 'number') {
        interpolatedX = lowerPoint.x + (upperPoint.x - lowerPoint.x) * fraction;
      } else {
        // For string dates, use the closer point
        interpolatedX = fraction < 0.5 ? lowerPoint.x : upperPoint.x;
      }
      
      interpolatedY = lowerPoint.y + (upperPoint.y - lowerPoint.y) * fraction;
      
      result.push({ x: interpolatedX, y: interpolatedY });
    }
    return result;
  }

  // For short timeframes (1W), allow more data points to show price movements
  // Coinbase shows more granular data on short timeframes for spiky appearance
  const maxPoints = timeRange === '1W' ? 200 : TARGET_POINTS; // More points for 1W
  
  // Downsample to maxPoints (but keep more for 1W)
  const result: { x: string | number; y: number }[] = [];
  const step = data.length / maxPoints;
  
  // Always include first point
  result.push(data[0]);
  
  // Sample points evenly to reach maxPoints
  for (let i = 1; i < maxPoints - 1; i++) {
    const index = Math.round(i * step);
    if (index < data.length) {
      result.push(data[index]);
    }
  }
  
  // Always include last point
  if (data.length > 1) {
    result.push(data[data.length - 1]);
  }
  
  // Ensure we have exactly maxPoints (in case of rounding errors)
  if (result.length !== maxPoints) {
    // Trim or pad to exact length
    if (result.length > maxPoints) {
      return result.slice(0, maxPoints);
    } else {
      // Pad with last point if needed
      while (result.length < maxPoints) {
        result.push(result[result.length - 1]);
      }
    }
  }
  
  return result;
};

// Normalize timestamps to be evenly spaced for consistent visual representation
// This follows Coinbase's approach: evenly spaced x-axis regardless of actual snapshot times
function normalizeTimestamps(data: { x: string | number; y: number }[]): { x: string | number; y: number }[] {
  if (data.length <= 1) return data;
  
  // Convert all x values to numbers (timestamps)
  const dataWithNumericX = data.map(point => ({
    x: typeof point.x === 'string' ? new Date(point.x).getTime() : point.x,
    y: point.y,
  })) as { x: number; y: number }[];
  
  // Find min and max timestamps
  const timestamps = dataWithNumericX.map(p => p.x);
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const timeRange = maxTime - minTime;
  
  // If all timestamps are the same, return as-is
  if (timeRange === 0) return data;
  
  // Create evenly spaced timestamps from min to max
  const normalizedData: { x: number; y: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    // Calculate evenly spaced timestamp
    const normalizedTimestamp = minTime + (timeRange * i / (data.length - 1));
    
    // Find the two surrounding data points for interpolation
    let lowerIndex = 0;
    let upperIndex = dataWithNumericX.length - 1;
    
    // Find the point just before and after the normalized timestamp
    for (let j = 0; j < dataWithNumericX.length - 1; j++) {
      if (dataWithNumericX[j].x <= normalizedTimestamp && dataWithNumericX[j + 1].x >= normalizedTimestamp) {
        lowerIndex = j;
        upperIndex = j + 1;
        break;
      }
    }
    
    // If normalized timestamp is before first point, use first point
    if (normalizedTimestamp <= dataWithNumericX[0].x) {
      normalizedData.push({
        x: normalizedTimestamp,
        y: dataWithNumericX[0].y,
      });
    }
    // If normalized timestamp is after last point, use last point
    else if (normalizedTimestamp >= dataWithNumericX[dataWithNumericX.length - 1].x) {
      normalizedData.push({
        x: normalizedTimestamp,
        y: dataWithNumericX[dataWithNumericX.length - 1].y,
      });
    }
    // Interpolate between surrounding points
    else {
      const lowerPoint = dataWithNumericX[lowerIndex];
      const upperPoint = dataWithNumericX[upperIndex];
      const timeDiff = upperPoint.x - lowerPoint.x;
      const fraction = timeDiff > 0 ? (normalizedTimestamp - lowerPoint.x) / timeDiff : 0;
      const interpolatedY = lowerPoint.y + (upperPoint.y - lowerPoint.y) * fraction;
      
      normalizedData.push({
        x: normalizedTimestamp,
        y: interpolatedY,
      });
    }
  }
  
  return normalizedData;
}

// Convert data to format expected by react-native-gifted-charts
// Export for testing
// Accepts both regular data points and normalized data points (with originalTimestamp)
export const convertToChartData = (data: { x: string | number; y: number; originalTimestamp?: number }[]) => {
  if (!data || data.length === 0) {
    return [];
  }
  
  // react-native-gifted-charts expects data in format: { value: number, label?: string }
  // We only need the y value for rendering
  const converted = data.map((point) => ({
    value: point.y,
  }));
  return converted;
};

// Generate smooth cubic Bezier path (matches react-native-gifted-charts curve algorithm)
// This creates a path that matches the chart line exactly
// Exported for testing
export const generateChartPath = (
  data: { value: number }[],
  width: number,
  height: number,
  minValue: number,
  maxValue: number,
  curved: boolean = true
): { linePath: string; areaPath: string } => {
  if (data.length === 0) return { linePath: '', areaPath: '' };
  
  const valueRange = maxValue - minValue || 1;
  const padding = valueRange * 0.1; // 10% padding
  const adjustedMin = minValue - padding;
  const adjustedMax = maxValue + padding;
  const adjustedRange = adjustedMax - adjustedMin || 1;
  
  const spacing = data.length > 1 ? width / (data.length - 1) : 0;
  
  // Calculate all points first
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    const x = i * spacing;
    const y = height - ((data[i].value - adjustedMin) / adjustedRange) * height;
    points.push({ x, y });
  }
  
  let linePath = '';
  let areaPath = '';
  
  // Start at first point
  linePath += `M ${points[0].x} ${points[0].y}`;
  areaPath += `M ${points[0].x} ${points[0].y}`;
  
  if (curved && data.length > 2) {
    // Use cubic Bezier curves for smooth lines (similar to react-native-gifted-charts)
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      if (i === 0) {
        // First segment: use current point and next point
        const cp1x = current.x + (next.x - current.x) / 3;
        const cp1y = current.y;
        const cp2x = current.x + 2 * (next.x - current.x) / 3;
        const cp2y = next.y;
        linePath += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${next.x} ${next.y}`;
        areaPath += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${next.x} ${next.y}`;
      } else if (i === points.length - 2) {
        // Last segment: smooth curve to end
        const prev = points[i - 1];
        const cp1x = current.x + (next.x - current.x) / 3;
        const cp1y = current.y;
        const cp2x = current.x + 2 * (next.x - current.x) / 3;
        const cp2y = next.y;
        linePath += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${next.x} ${next.y}`;
        areaPath += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${next.x} ${next.y}`;
      } else {
        // Middle segments: smooth curves using neighboring points
        const prev = points[i - 1];
        const afterNext = points[i + 2];
        
        // Control points for smooth cubic Bezier
        const cp1x = current.x + (next.x - prev.x) / 6;
        const cp1y = current.y + (next.y - prev.y) / 6;
        const cp2x = next.x - (afterNext.x - current.x) / 6;
        const cp2y = next.y - (afterNext.y - current.y) / 6;
        
        linePath += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${next.x} ${next.y}`;
        areaPath += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${next.x} ${next.y}`;
      }
    }
  } else {
    // Straight lines
    for (let i = 1; i < points.length; i++) {
      linePath += ` L ${points[i].x} ${points[i].y}`;
      areaPath += ` L ${points[i].x} ${points[i].y}`;
    }
  }
  
  // Close area path to bottom to create fill area
  areaPath += ` L ${width} ${height} L 0 ${height} Z`;
  
  return { linePath, areaPath };
};

// Tooltip component for drag interaction
const DragTooltip = React.memo(({
  dragXAnimated,
  dotYAnimated,
  height,
  value,
  timestamp,
  tradingHoursMode,
  colors,
}: {
  dragXAnimated: Animated.Value;
  dotYAnimated: Animated.Value;
  height: number;
  value: number;
  timestamp: number;
  tradingHoursMode?: TradingHoursMode;
  colors: ReturnType<typeof getColors>;
}) => {
  const [tooltipY, setTooltipY] = useState(0);
  const [tooltipX, setTooltipX] = useState(0);
  
  useEffect(() => {
    const dragXListener = dragXAnimated.addListener(({ value: x }) => {
      setTooltipX(x);
    });
    const dotYListener = dotYAnimated.addListener(({ value: y }) => {
      // Position tooltip above dot if dot is in lower half, below if in upper half
      const tooltipOffset = y < height / 2 ? 50 : -80;
      setTooltipY(y + tooltipOffset);
    });
    
    return () => {
      dragXAnimated.removeListener(dragXListener);
      dotYAnimated.removeListener(dotYListener);
    };
  }, [dragXAnimated, dotYAnimated, height]);
  
  return (
    <View
      style={{
        position: 'absolute',
        top: tooltipY,
        left: tooltipX - 60, // Center tooltip on drag line
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      <View style={{
        backgroundColor: colors.backgroundGrey,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        minWidth: 120,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
      }}>
        <Text style={{
          fontSize: 16,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: 4,
        }}>
          {new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(value)}
        </Text>
        <Text style={{
          fontSize: 12,
          color: colors.textSecondary,
        }}>
          {(() => {
            // Use JavaScript's built-in timezone conversion
            // The timestamp should be in UTC milliseconds
            let date = new Date(timestamp);
            
            // Format as "Mon 9:30 AM" or "Jan 15, 9:30 AM" in user's device timezone
            // Don't specify timeZone - let JavaScript use the system's local timezone
            // This ensures we always show the time in the user's actual timezone
            const formatter = new Intl.DateTimeFormat('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              // Omit timeZone to use system's local timezone automatically
            });
            
            let timeString = formatter.format(date);
            
            // Debug: Log timestamp conversion (only in dev mode, throttled)
            if (__DEV__) {
              const logKey = `ts_${Math.floor(timestamp / 60000)}`; // Log once per minute
              if (!(DragTooltip as any).loggedTimestamps) {
                (DragTooltip as any).loggedTimestamps = new Set();
              }
              if (!(DragTooltip as any).loggedTimestamps.has(logKey)) {
                (DragTooltip as any).loggedTimestamps.add(logKey);
                const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                const utcStr = date.toISOString();
                const now = Date.now();
                const timeDiff = timestamp - now;
                const hoursDiff = timeDiff / (1000 * 60 * 60);
                console.log('[Chart] Timestamp conversion:', {
                  timestamp,
                  utc: utcStr,
                  systemTimezone: systemTz,
                  localDisplay: timeString,
                  currentTime: new Date(now).toISOString(),
                  timeDifferenceHours: hoursDiff.toFixed(2),
                  note: hoursDiff > 4 ? 'WARNING: Timestamp is more than 4 hours ahead of current time - backend may be sending incorrect timestamps' : 'OK',
                });
              }
            }
            
            // Add indicator for extended hours mode
            if (tradingHoursMode === 'extended') {
              const isMarketHoursTime = isMarketHours(timestamp);
              if (!isMarketHoursTime) {
                timeString += ' (After Hours)';
              }
            }
            
            return timeString;
          })()}
        </Text>
      </View>
    </View>
  );
});

// PERFORMANCE: Fade overlay using SVG mask with animated gradient stop
// This component uses Animated.Value listener to update gradient stop position
// without triggering React re-renders. The gradient mask creates the fade effect
// by transitioning from fully opaque (left) to reduced opacity (right).
const FadeOverlay = React.memo(({
  width,
  height,
  dragXAnimated,
  fadeMode,
  fadeIntensity,
  colors,
}: {
  width: number;
  height: number;
  dragXAnimated: Animated.Value;
  fadeMode: 'none' | 'future' | 'past';
  fadeIntensity: number;
  colors: ReturnType<typeof getColors>;
}) => {
  const [gradientStopPercent, setGradientStopPercent] = useState<number>(0);
  const listenerRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (fadeMode === 'none') {
      setGradientStopPercent(0);
      return;
    }
    
    // Initialize with current value immediately when component mounts
    // This ensures the fade is positioned correctly when entering swipe mode
    // Access _value directly to get current position without waiting for listener
    const currentValue = (dragXAnimated as any)._value ?? 0;
    const initialPercent = (currentValue / width) * 100;
    setGradientStopPercent(Math.max(0, Math.min(100, initialPercent)));
    
    // PERFORMANCE: Use Animated.Value listener to update gradient stop position
    // This runs on the native thread and only updates React state when needed
    // The listener callback is throttled by the Animated system itself
    listenerRef.current = dragXAnimated.addListener(({ value }) => {
      const percent = (value / width) * 100;
      setGradientStopPercent(Math.max(0, Math.min(100, percent)));
    });
    
    return () => {
      if (listenerRef.current) {
        dragXAnimated.removeListener(listenerRef.current);
      }
    };
  }, [dragXAnimated, width, fadeMode]);
  
  if (fadeMode === 'none') return null;
  
  // Determine gradient direction based on fade mode
  const isFutureFade = fadeMode === 'future';
  const gradientX1 = isFutureFade ? '0%' : '100%';
  const gradientX2 = isFutureFade ? '100%' : '0%';
  
  // Calculate gradient stops - transition happens at dragX position
  const stop1Offset = isFutureFade ? `${gradientStopPercent}%` : `${100 - gradientStopPercent}%`;
  const stop2Offset = isFutureFade ? `${gradientStopPercent}%` : `${100 - gradientStopPercent}%`;
  
  return (
    <Svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        pointerEvents: 'none',
        zIndex: 5, // Above chart content, below vertical line
      }}
      width={width}
      height={height}
    >
      <Defs>
        {/* PERFORMANCE: Gradient mask - position animated via listener, not React re-renders */}
        {/* This creates a smooth transition from fully opaque to reduced opacity */}
        <LinearGradient id="fadeMaskGradient" x1={gradientX1} y1="0%" x2={gradientX2} y2="0%">
          <Stop offset={stop1Offset} stopColor="white" stopOpacity="0" />
          <Stop offset={stop2Offset} stopColor="white" stopOpacity="1" />
        </LinearGradient>
        <Mask id="fadeMask">
          <SvgRect width={width} height={height} fill="url(#fadeMaskGradient)" />
        </Mask>
      </Defs>
      {/* PERFORMANCE: Apply mask to a semi-transparent overlay */}
      {/* The mask controls which parts are visible, creating the fade effect */}
      {/* Mask gradient: left side transparent (0), right side opaque (1) */}
      {/* Overlay: background color overlay that fades the right side of the chart */}
      <SvgRect
        width={width}
        height={height}
        fill={colors.background}
        fillOpacity={1 - fadeIntensity} // Overlay opacity: 0.5 means 50% fade when fadeIntensity=0.5
        mask="url(#fadeMask)"
      />
    </Svg>
  );
});

// Custom chart overlay with line, gradient fill, and dots pattern
// Uses the same path for line, fill, and clipPath - ensures perfect matching
// Memoized to prevent re-renders when only dragX changes
const ChartOverlay = React.memo(({ 
  width, 
  height, 
  chartData, 
  minValue, 
  maxValue, 
  patternType,
  dragX,
  config = {},
  getInterpolatedPaths,
  gradientOpacity,
  dotsOpacity,
  colors,
}: { 
  width: number; 
  height: number; 
  chartData: { value: number }[]; 
  minValue: number; 
  maxValue: number; 
  patternType: PatternType;
  dragX?: number | null; // X position of drag point - everything to the right will be 50% opacity
  config?: ChartConfig;
  getInterpolatedPaths?: () => { linePath: string; areaPath: string };
  gradientOpacity?: Animated.AnimatedInterpolation<number>;
  dotsOpacity?: Animated.AnimatedInterpolation<number>;
  colors: ReturnType<typeof getColors>;
}) => {
  if (chartData.length === 0) return null;
  
  const {
    lineColor = colors.chartOrange,
    lineThickness = 3,
    gradientStartColor = colors.chartOrange + '4D',
    gradientEndColor = colors.background + '00',
    gradientStartOpacity = 0.3,
    gradientEndOpacity = 0,
    patternColor = colors.chartOrange,
    patternOpacity = 0.15,
    patternSize = 8, // Smaller spacing for more dots
    curved = true,
  } = config;
  
  // Use interpolated paths if provided (for transitions), otherwise generate normally
  const [animatedPaths, setAnimatedPaths] = useState<{ linePath: string; areaPath: string } | null>(null);
  
  // Set up optimized path updates during transitions
  // Use requestAnimationFrame to continuously update paths during animation
  useEffect(() => {
    if (getInterpolatedPaths) {
      // Get initial paths
      setAnimatedPaths(getInterpolatedPaths());
      
      let animationFrame: number | null = null;
      let isRunning = true;
      
      const updatePaths = () => {
        if (!isRunning) return;
        
        // Get paths (this reads the current animation value internally)
        const paths = getInterpolatedPaths();
        const currentValue = (getInterpolatedPaths as any)._lastAnimValue ?? 1;
        
        // Always update paths to reflect current animation state
        setAnimatedPaths(paths);
        
        // Stop loop when animation completes (value >= 1)
        // Use a tighter threshold to ensure smooth transition to final state
        if (currentValue >= 0.999) {
          isRunning = false;
          // Set final paths one more time to ensure smooth transition
          // At this point currentValue is very close to 1, so paths will be final state
          const finalPaths = getInterpolatedPaths();
          setAnimatedPaths(finalPaths);
          return;
        }
        
        // Continue updating during animation (runs at 60fps)
        animationFrame = requestAnimationFrame(updatePaths);
      };
      
      // Start update loop immediately
      animationFrame = requestAnimationFrame(updatePaths);
      
      return () => {
        isRunning = false;
        if (animationFrame !== null) {
          cancelAnimationFrame(animationFrame);
        }
      };
    } else {
      // No animation - use static paths
      setAnimatedPaths(null);
    }
  }, [getInterpolatedPaths]);
  
  // Memoize path generation - use animated paths if available, otherwise generate normally
  const { linePath, areaPath } = useMemo(() => {
    if (animatedPaths) {
      return animatedPaths;
    }
    return generateChartPath(chartData, width, height, minValue, maxValue, curved);
  }, [animatedPaths, chartData, width, height, minValue, maxValue, curved]);
  
  // Memoize pattern - doesn't change with dragX
  const dotsPattern = useMemo(() => {
    if (patternType !== 'dots') return null;
    return (
      <Pattern id="dotsPattern" patternUnits="userSpaceOnUse" width={patternSize} height={patternSize}>
        <Circle cx={patternSize / 2} cy={patternSize / 2} r={patternSize / 6} fill={patternColor} fillOpacity={patternOpacity} />
      </Pattern>
    );
  }, [patternType, patternSize, patternColor, patternOpacity]);
  
  // Memoize static gradients and masks - these don't change
  const staticDefs = useMemo(() => (
    <>
      {dotsPattern}
      {/* Gradient fill matching chart's gradient */}
      <LinearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <Stop offset="0%" stopColor={gradientStartColor} stopOpacity={gradientStartOpacity} />
        <Stop offset="100%" stopColor={gradientEndColor} stopOpacity={gradientEndOpacity} />
      </LinearGradient>
      {/* Gradient mask for dots - simplified to 4 stops for better performance */}
      <LinearGradient id="dotsFadeMask" x1="0%" y1="0%" x2="0%" y2="100%">
        <Stop offset="0%" stopColor="white" stopOpacity="1" />
        <Stop offset="33%" stopColor="white" stopOpacity="0.5" />
        <Stop offset="66%" stopColor="white" stopOpacity="0.2" />
        <Stop offset="100%" stopColor="white" stopOpacity="0" />
      </LinearGradient>
      {/* Mask that applies the fade gradient to dots */}
      <Mask id="dotsFadeMaskApplied">
        <SvgRect width={width} height={height} fill="url(#dotsFadeMask)" />
      </Mask>
      {/* ClipPath for dots - uses the same area path as the fill */}
      <ClipPath id="areaClip">
        <Path d={areaPath} />
      </ClipPath>
    </>
  ), [dotsPattern, gradientStartColor, gradientEndColor, gradientStartOpacity, gradientEndOpacity, width, height, areaPath]);
  
  // Memoize the chart content that doesn't change
  const chartContent = useMemo(() => (
    <>
      {/* Chart line */}
      <Path 
        d={linePath} 
        stroke={lineColor}
        strokeWidth={lineThickness}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Gradient fill - with animated opacity during transitions */}
      {gradientOpacity ? (
        <AnimatedPath
          d={areaPath}
          fill="url(#areaGradient)"
          opacity={gradientOpacity}
        />
      ) : (
        <Path 
          d={areaPath} 
          fill="url(#areaGradient)"
        />
      )}
      {/* Dots pattern - hide during drag for better performance, with animated opacity during transitions */}
      {patternType === 'dots' && dragX === null && (
        dotsOpacity ? (
          <AnimatedRect
            width={width}
            height={height}
            fill="url(#dotsPattern)"
            clipPath="url(#areaClip)"
            mask="url(#dotsFadeMaskApplied)"
            opacity={dotsOpacity}
          />
        ) : (
          <SvgRect
            width={width}
            height={height}
            fill="url(#dotsPattern)"
            clipPath="url(#areaClip)"
            mask="url(#dotsFadeMaskApplied)"
          />
        )
      )}
    </>
  ), [linePath, areaPath, lineColor, lineThickness, patternType, width, height, dragX, gradientOpacity, dotsOpacity]);
  
  // PERFORMANCE: ChartOverlay renders static chart elements only
  // Fade effect is handled separately by FadeOverlay component
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
      <Defs>
        {staticDefs}
      </Defs>
      {chartContent}
    </Svg>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - ChartOverlay is now static (no dragX dependency)
  // Opacity overlay is handled separately via native Animated.View
  if (prevProps.width !== nextProps.width) return false;
  if (prevProps.height !== nextProps.height) return false;
  if (prevProps.chartData !== nextProps.chartData) return false;
  if (prevProps.minValue !== nextProps.minValue) return false;
  if (prevProps.maxValue !== nextProps.maxValue) return false;
  if (prevProps.patternType !== nextProps.patternType) return false;
  if (prevProps.config !== nextProps.config) return false;
  
  // dragX prop is ignored - overlay is handled separately
  return true; // Props are equal, skip re-render
});

// Define createStyles before Chart function so it's available
const createStyles = (colors: ReturnType<typeof getColors>) => StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'stretch',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible', // Allow chart to extend beyond container
  },
  chartWrapper: {
    width: screenWidth, // Use screen width
    height: '100%',
    position: 'relative',
    overflow: 'visible', // Allow chart to extend
  },
  chartContainer: {
    width: screenWidth, // Use screen width
    height: '100%',
    position: 'relative',
    overflow: 'visible', // Allow chart to extend
    paddingHorizontal: 0, // No padding - extend to edges
  },
  chartOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 1, // Behind the chart line
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  verticalLineContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    pointerEvents: 'none',
    zIndex: 10,
  },
});

function Chart({ 
  data, 
  height = 200, 
  width = screenWidth,
  patternType = 'dots', 
  onDragStart, 
  onDragEnd, 
  timeRange = '1Y',
  tradingHoursMode = 'market',
  config = {},
  testID
}: ChartProps) {
  const { isDark } = useTheme();
  
  // Merge default config with provided config
  const defaultConfig: ChartConfig = {
    lineColor: getColors(isDark).chartOrange,
    lineThickness: 3,
    gradientStartColor: getColors(isDark).chartOrange + '4D',
    gradientEndColor: getColors(isDark).background + '00',
    gradientStartOpacity: 0.3,
    gradientEndOpacity: 0,
    patternColor: getColors(isDark).chartOrange,
    patternOpacity: 0.15,
    patternSize: 8,
    curved: true,
    showDots: true,
    enableDrag: true,
    fadeMode: 'future', // Default: fade right side (future data)
    fadeIntensity: 0.5, // Default: 50% opacity for faded region
    throttleMs: 16,
  };
  
  const finalConfig = { ...defaultConfig, ...config };
  const styles = createStyles(getColors(isDark));
  
  // ============================================================================
  // Use extracted hooks for data processing and drag interaction
  // ============================================================================
  const chartDataModule = useChartData(data, timeRange, width, tradingHoursMode);
  const {
    chartData,
    minValue,
    maxValue,
    spacing,
    snapPoints,
    timeBounds,
  } = chartDataModule;
  
  // Set up chart transition animations
  const transitionModule = useChartTransition(
    chartData,
    minValue,
    maxValue,
    width,
    height,
    timeRange,
    tradingHoursMode,
    finalConfig.curved ?? true
  );
  const {
    getInterpolatedPaths,
    gradientOpacity,
    dotsOpacity,
  } = transitionModule;
  
  const curved = finalConfig.curved ?? true;
  
  // CRITICAL: snapPoints, chartData, and all source data are passed to dragModule unchanged.
  // Animations only affect visual display (SVG paths via getInterpolatedPaths).
  // All drag interactions use the original, unmodified data - timestamps and values are always accurate.
  const dragModule = useChartDrag({
    width,
    height,
    chartData,
    minValue,
    maxValue,
    spacing,
    snapPoints,
    timeBounds,
    curved,
    onDragStart,
    onDragEnd,
  });
  
  const {
    isDragging,
    dragXAnimated,
    dotYAnimated,
    currentDragData,
    verticalLinePath,
    panResponder,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  } = dragModule;
  
  const chartContainerRef = useRef<View>(null);

  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>No data available</Text>
      </View>
    );
  }

  if (chartData.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>No chart data available</Text>
      </View>
    );
  }

  return (
    <View 
      style={[styles.container, { height }]}
      ref={chartContainerRef}
      collapsable={false}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      {...panResponder.panHandlers}
    >
      <View style={styles.chartWrapper} testID={testID}>
        {/* Custom chart overlay with gradient fill and dots - uses same path for both */}
        {/* PERFORMANCE: ChartOverlay is now static - no dragX dependency */}
        <View style={styles.chartOverlayContainer} pointerEvents="none" testID={testID ? `${testID}-overlay` : undefined}>
          <ChartOverlay 
            width={width} 
            height={height} 
            chartData={chartData} 
            minValue={minValue} 
            maxValue={maxValue} 
            patternType={patternType}
            dragX={null} // Opacity is handled separately via native overlay
            config={finalConfig}
            getInterpolatedPaths={getInterpolatedPaths}
            gradientOpacity={gradientOpacity}
            dotsOpacity={dotsOpacity}
            colors={getColors(isDark)}
          />
        </View>
        
        {/* LineChart is now hidden - we render everything ourselves for perfect path matching */}
        <View style={[styles.chartContainer, { height }]} collapsable={false} testID={testID ? `${testID}-container` : undefined}>
          <LineChart
            data={chartData}
            width={width}
            height={height}
            thickness={0} // Hide the line - we render it ourselves
            color="transparent" // Hide the line
            areaChart={false}
            hideYAxisText={true}
            hideRules
            hideDataPoints
            curved
            animateOnDataChange={false}
            animationDuration={0}
            spacing={chartData.length > 1 ? width / (chartData.length - 1) : 0}
            initialSpacing={0}
            endSpacing={0}
            xAxisThickness={0}
            xAxisColor="transparent"
            yAxisColor="transparent"
            yAxisThickness={0}
            yAxisLabelWidth={0}
          />
        </View>
        
        {/* PERFORMANCE: SVG mask-based fade effect - zero React re-renders during drag */}
        {/* Uses geometry-based technique: animated gradient stop position in SVG mask */}
        {/* The mask gradient position is driven by Animated.Value listener, not React state */}
        {isDragging && (
          <FadeOverlay
            width={width}
            height={height}
            dragXAnimated={dragXAnimated}
            fadeMode={finalConfig.fadeMode || 'future'}
            fadeIntensity={finalConfig.fadeIntensity ?? 0.5}
            colors={getColors(isDark)}
          />
        )}
      </View>
      {/* PERFORMANCE: Interactive vertical line and dot - native-driven animations */}
      {/* Uses Animated.View with transform instead of SVG updates to avoid re-renders */}
      {isDragging && (
        <>
          {/* Vertical line - moved horizontally via transform */}
          <Animated.View 
            style={[
              styles.verticalLineContainer, 
              { 
                height,
                transform: [
                  { translateX: dragXAnimated }
                ]
              }
            ]} 
            pointerEvents="none" 
            collapsable={false}
          >
            <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
              {/* Dotted vertical line - path is static, moved via transform */}
              <Path
                d={verticalLinePath}
                fill={getColors(isDark).assetGreyLight}
              />
            </Svg>
          </Animated.View>
          
          {/* Tracing dot - separate Animated.View for Y position (react-native-svg doesn't support Animated props) */}
          {/* zIndex: 15 ensures it appears above the vertical line (zIndex: 10) */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                width: 8,
                height: 8,
                zIndex: 15, // Above vertical line (zIndex: 10)
                transform: [
                  { translateX: Animated.subtract(dragXAnimated, 4) }, // Center the dot
                  { translateY: Animated.subtract(dotYAnimated, 4) }
                ],
                pointerEvents: 'none',
              }
            ]}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: getColors(isDark).chartOrange }} />
          </Animated.View>
          
          {/* Tooltip showing price and timestamp */}
          {currentDragData && (
            <DragTooltip
              dragXAnimated={dragXAnimated}
              dotYAnimated={dotYAnimated}
              height={height}
              value={currentDragData.value}
              timestamp={currentDragData.timestamp}
              tradingHoursMode={tradingHoursMode}
              colors={getColors(isDark)}
            />
          )}
        </>
      )}
    </View>
  );
}

// Memoize with custom comparison - only re-render when data/props actually change
// This prevents re-renders from drag state changes
export default React.memo(Chart, (prevProps, nextProps) => {
  // Only re-render if data, height, patternType, timeRange, or tradingHoursMode changes
  // Ignore callback changes (onDragStart/onDragEnd) as they don't affect rendering
  if (prevProps.data.length !== nextProps.data.length) return false;
  if (prevProps.height !== nextProps.height) return false;
  if (prevProps.patternType !== nextProps.patternType) return false;
  if (prevProps.timeRange !== nextProps.timeRange) return false;
  if (prevProps.tradingHoursMode !== nextProps.tradingHoursMode) return false;
  
  // Deep compare data arrays (only first/last/middle to avoid full scan)
  if (prevProps.data.length > 0 && nextProps.data.length > 0) {
    const prevFirst = prevProps.data[0];
    const nextFirst = nextProps.data[0];
    const prevLast = prevProps.data[prevProps.data.length - 1];
    const nextLast = nextProps.data[nextProps.data.length - 1];
    
    if (prevFirst.x !== nextFirst.x || prevFirst.y !== nextFirst.y ||
        prevLast.x !== nextLast.x || prevLast.y !== nextLast.y) {
      return false;
    }
  }
  
  return true; // Props are equal, skip re-render
});
