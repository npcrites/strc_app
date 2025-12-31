import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, PanResponder, Animated, Easing } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import Svg, { Defs, Pattern, Circle, Rect as SvgRect, LinearGradient, Stop, Mask, ClipPath, Path, Line, G } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';

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
  config?: ChartConfig;
  testID?: string;
}

const screenWidth = Dimensions.get('window').width;

// ============================================================================
// INTERNAL MODULE A: useChartData()
// Handles all data processing: downsampling, min/max, spacing, snap points
// ============================================================================
function useChartData(
  data: { x: string | number; y: number }[],
  timeRange: TimeRange,
  width: number
) {
  // Downsample data for performance
  const downsampledData = useMemo(() => downsampleData(data, timeRange), [data, timeRange]);

  // Convert to chart format
  const chartData = useMemo(() => {
    return convertToChartData(downsampledData);
  }, [downsampledData]);

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

  // Calculate spacing between data points
  const spacing = useMemo(() => {
    return chartData.length > 1 ? width / (chartData.length - 1) : 0;
  }, [chartData.length, width]);

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
  const snapPoints = useMemo(() => {
    if (downsampledData.length === 0) return [];
    
    const intervalMs = getIntervalMs(timeRange);
    const snapPoints: { x: string | number; y: number; timestamp: number }[] = [];
    
    // Pre-compute all timestamps once
    const timestamps = new Array(downsampledData.length);
    for (let i = 0; i < downsampledData.length; i++) {
      const d = downsampledData[i];
      timestamps[i] = {
        ...d,
        timestamp: typeof d.x === 'string' ? new Date(d.x).getTime() : d.x,
      };
    }
    
    if (timestamps.length === 0) return [];
    
    // Find min/max more efficiently
    let minTime = timestamps[0].timestamp;
    let maxTime = timestamps[0].timestamp;
    for (let i = 1; i < timestamps.length; i++) {
      const ts = timestamps[i].timestamp;
      if (ts < minTime) minTime = ts;
      if (ts > maxTime) maxTime = ts;
    }
    
    // Find the first valid snap point (aligned to interval)
    const firstSnapTime = Math.ceil(minTime / intervalMs) * intervalMs;
    
    // Use binary search for better performance on large datasets
    const useBinarySearch = timestamps.length > 50;
    
    // Collect all snap points
    for (let snapTime = firstSnapTime; snapTime <= maxTime; snapTime += intervalMs) {
      let closestPoint: typeof timestamps[0];
      let minDiff: number;
      
      if (useBinarySearch) {
        // Binary search for closest point
        let left = 0;
        let right = timestamps.length - 1;
        let closestIdx = 0;
        
        while (left <= right) {
          const mid = Math.floor((left + right) / 2);
          const diff = Math.abs(timestamps[mid].timestamp - snapTime);
          
          if (diff < Math.abs(timestamps[closestIdx].timestamp - snapTime)) {
            closestIdx = mid;
          }
          
          if (timestamps[mid].timestamp < snapTime) {
            left = mid + 1;
          } else {
            right = mid - 1;
          }
        }
        
        closestPoint = timestamps[closestIdx];
        minDiff = Math.abs(closestPoint.timestamp - snapTime);
      } else {
        // Linear search for small datasets
        closestPoint = timestamps[0];
        minDiff = Math.abs(timestamps[0].timestamp - snapTime);
        
        for (const point of timestamps) {
          const diff = Math.abs(point.timestamp - snapTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestPoint = point;
          }
        }
      }
      
      // Only add if we haven't already added this point
      if (snapPoints.length === 0 || 
          snapPoints[snapPoints.length - 1].timestamp !== closestPoint.timestamp) {
        snapPoints.push({
          x: closestPoint.x,
          y: closestPoint.y,
          timestamp: closestPoint.timestamp,
        });
      }
    }
    
    return snapPoints;
  }, [downsampledData, timeRange, getIntervalMs]);

  // Pre-compute time bounds for faster lookups
  const timeBounds = useMemo(() => {
    if (downsampledData.length === 0) return { minTime: 0, maxTime: 0 };
    
    const timestamps = downsampledData.map(d => typeof d.x === 'string' ? new Date(d.x).getTime() : d.x);
    let minTime = timestamps[0];
    let maxTime = timestamps[0];
    
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] < minTime) minTime = timestamps[i];
      if (timestamps[i] > maxTime) maxTime = timestamps[i];
    }
    
    return { minTime, maxTime };
  }, [downsampledData]);

  return {
    chartData,
    downsampledData,
    minValue,
    maxValue,
    spacing,
    snapPoints: snapPoints,
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
  curved: boolean = true
) {
  // Track previous values for transition
  const prevChartDataRef = useRef<{ value: number }[]>(chartData);
  const prevMinValueRef = useRef<number>(minValue);
  const prevMaxValueRef = useRef<number>(maxValue);
  const prevTimeRangeRef = useRef<TimeRange>(timeRange);
  
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
  
  // Check if we need to animate (timeRange changed)
  useEffect(() => {
    const timeRangeChanged = prevTimeRangeRef.current !== timeRange;
    const dataChanged = prevChartDataRef.current !== chartData;
    
    // Always process timeRange changes, even if animation is in progress
    // This ensures animations fire when toggling rapidly between timeframes
    if (timeRangeChanged || dataChanged) {
      // Store previous values BEFORE updating refs (for animation interpolation)
      const oldChartData = [...prevChartDataRef.current]; // Deep copy to preserve old data
      const oldMinValue = prevMinValueRef.current;
      const oldMaxValue = prevMaxValueRef.current;
      
      // Always animate if timeRange changed (even if data looks similar)
      // This ensures animations fire when toggling between timeframes repeatedly
      // For data-only changes (no timeRange change), check if the change is significant
      // Small price updates during refreshes shouldn't trigger animations
      const dataIsDifferent = oldChartData.length > 0 && 
                             oldChartData.length === chartData.length && // Both have same length (60 points)
                             JSON.stringify(oldChartData) !== JSON.stringify(chartData); // But different values
      
      // Check if data change is significant (more than just minor price updates)
      // Calculate the percentage change in the overall range
      let isSignificantChange = false;
      if (dataChanged && !timeRangeChanged && oldChartData.length > 0 && chartData.length > 0) {
        const oldRange = prevMaxValueRef.current - prevMinValueRef.current;
        const newRange = maxValue - minValue;
        const rangeChange = Math.abs(newRange - oldRange) / (oldRange || 1);
        
        // Also check if individual points have changed significantly
        let significantPointChanges = 0;
        const changeThreshold = 0.02; // 2% change threshold
        for (let i = 0; i < Math.min(oldChartData.length, chartData.length); i++) {
          const oldVal = oldChartData[i]?.value ?? 0;
          const newVal = chartData[i]?.value ?? 0;
          const change = Math.abs(newVal - oldVal) / (oldVal || 1);
          if (change > changeThreshold) {
            significantPointChanges++;
          }
        }
        
        // Consider it significant if range changed by >5% or if >10% of points changed significantly
        isSignificantChange = rangeChange > 0.05 || (significantPointChanges / chartData.length) > 0.1;
      }
      
      // Always animate on timeRange change - this ensures it always fires
      // even when toggling rapidly between the same two timeframes
      // For data refreshes, only animate if the change is significant
      const shouldAnimate = timeRangeChanged || (dataChanged && dataIsDifferent && isSignificantChange);
      
      if (shouldAnimate) {
        // Store old values for animation interpolation
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
        Animated.timing(transitionAnim, {
          toValue: 1,
          duration: 200, // Faster animation for snappier timeframe switching
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
        // Set animation to final state immediately so chart shows new data
        transitionAnim.setValue(1);
        // Clear old animation data to prevent stale interpolation
        oldChartDataForAnimation.current = [];
        // IMPORTANT: Still update the refs so next change has correct "old" data
        // This ensures smooth updates during refreshes without animation
        prevChartDataRef.current = chartData;
        prevMinValueRef.current = minValue;
        prevMaxValueRef.current = maxValue;
        prevTimeRangeRef.current = timeRange;
        return; // Early return - no animation needed
      }
      
      // Update refs to new values AFTER setting up animation
      prevChartDataRef.current = chartData;
      prevMinValueRef.current = minValue;
      prevMaxValueRef.current = maxValue;
      prevTimeRangeRef.current = timeRange;
    }
  }, [chartData, minValue, maxValue, timeRange, transitionAnim]);
  
  // Generate interpolated paths with smooth interpolation
  const getInterpolatedPaths = useCallback((): { linePath: string; areaPath: string } => {
    const currentValue = Math.min(1, Math.max(0, (transitionAnim as any)._value ?? 1)); // Clamp to [0, 1]
    
    // Store current value for external access (used by ChartOverlay to detect completion)
    (getInterpolatedPaths as any)._lastAnimValue = currentValue;
    
    // If animation is complete or no old data stored, use current data
    if (currentValue >= 0.9999 || oldChartDataForAnimation.current.length === 0) {
      // Ensure we return the exact final state
      return generateChartPath(chartData, width, height, minValue, maxValue, curved);
    }
    
    // Use stored old values for interpolation (not the refs which have been updated)
    const oldChartData = oldChartDataForAnimation.current;
    const oldMinValue = oldMinValueForAnimation.current;
    const oldMaxValue = oldMaxValueForAnimation.current;
    
    // Normalize old and new data to same length for smooth interpolation
    const normalized = normalizeData(oldChartData, chartData);
    const normalizedOld = normalized.old;
    const normalizedNew = normalized.new;
    
    // Use linear interpolation - the easing is already applied by Animated.timing
    // Double-easing (here + in Animated.timing) can cause overshoot
    // Linear interpolation ensures smooth, predictable transitions
    const easedValue = currentValue;
    
    // Interpolate min/max values using stored old values with eased interpolation
    const interpolatedMin = oldMinValue + (minValue - oldMinValue) * easedValue;
    const interpolatedMax = oldMaxValue + (maxValue - oldMaxValue) * easedValue;
    
    // Interpolate data points with eased interpolation for smoother transitions
    const interpolatedData: { value: number }[] = [];
    for (let i = 0; i < normalizedNew.length; i++) {
      const oldValue = normalizedOld[i]?.value ?? (normalizedOld.length > 0 ? normalizedOld[normalizedOld.length - 1]?.value : 0) ?? 0;
      const newValue = normalizedNew[i]?.value ?? 0;
      const interpolatedValue = oldValue + (newValue - oldValue) * easedValue;
      interpolatedData.push({ value: interpolatedValue });
    }
    
    // Generate path from interpolated data
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
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  // Native-driven animated values for drag feedback (no React re-renders)
  const dragXAnimated = useRef(new Animated.Value(0)).current;
  const dotYAnimated = useRef(new Animated.Value(0)).current;
  
  // React state for drag lifecycle (not for visual updates)
  const [isDragging, setIsDragging] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  
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
  
  const HOLD_DELAY_MS = 250;
  const MOVEMENT_THRESHOLD = 5;
  
  // Update refs when data changes
  useEffect(() => {
    chartDataRef.current = chartData;
    minValueRef.current = minValue;
    maxValueRef.current = maxValue;
    spacingRef.current = spacing;
  }, [chartData, minValue, maxValue, spacing]);
  
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
  const findNearestSnapPoint = useCallback((x: number): { x: number; index: number } | null => {
    if (snapPoints.length === 0) return null;
    if (timeBounds.maxTime === timeBounds.minTime) return { x, index: 0 };
    
    const ratio = x / screenWidth;
    const targetTime = timeBounds.minTime + ratio * (timeBounds.maxTime - timeBounds.minTime);
    
    // Binary search for nearest snap point
    let left = 0;
    let right = snapPoints.length - 1;
    let nearestIndex = 0;
    let nearestSnap = snapPoints[0];
    let minDiff = Math.abs(snapPoints[0].timestamp - targetTime);
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const diff = Math.abs(snapPoints[mid].timestamp - targetTime);
      
      if (diff < minDiff) {
        minDiff = diff;
        nearestSnap = snapPoints[mid];
        nearestIndex = mid;
      }
      
      if (snapPoints[mid].timestamp < targetTime) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    
    // Convert snap point timestamp back to x position
    const snapRatio = (nearestSnap.timestamp - timeBounds.minTime) / (timeBounds.maxTime - timeBounds.minTime);
    return { x: snapRatio * screenWidth, index: nearestIndex };
  }, [snapPoints, timeBounds]);
  
  // Fast lookup for tracing dot Y position (binary search, no React state)
  const calculateDotY = useCallback((x: number): number => {
    const chartData = chartDataRef.current;
    if (chartData.length === 0) return height / 2;
    
    const spacing = spacingRef.current;
    let left = 0;
    let right = chartData.length - 1;
    let closestIndex = 0;
    let minDistance = Math.abs(x - 0);
    
    // Binary search for closest point
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const pointX = mid * spacing;
      const distance = Math.abs(x - pointX);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = mid;
      }
      
      if (pointX < x) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    
    // Calculate Y using refs (no dependency on React state)
    const valueRange = maxValueRef.current - minValueRef.current || 1;
    const padding = valueRange * 0.1;
    const adjustedMin = minValueRef.current - padding;
    const adjustedMax = maxValueRef.current + padding;
    const adjustedRange = adjustedMax - adjustedMin || 1;
    
    return height - ((chartData[closestIndex].value - adjustedMin) / adjustedRange) * height;
  }, [height]);
  
  // PERFORMANCE: Update drag position - fully native-driven, zero React re-renders
  // Animated values update on native thread, fade effect uses Animated.Value listener
  const updateDragX = useCallback((x: number) => {
    const snapResult = findNearestSnapPoint(x);
    if (snapResult === null) return;
    
    const { x: snappedX, index: snappedIndex } = snapResult;
    
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
    const dotY = calculateDotY(snappedX);
    dotYAnimated.setValue(dotY);
  }, [findNearestSnapPoint, calculateDotY]);
  
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
        const finalX = snapResult !== null ? snapResult.x : constrainedX;
        dragXRef.current = finalX;
        // Don't set lastSnappedIndexRef here - let updateDragX handle it to ensure first haptic fires
        // Reset the initial haptic flag so we get haptic feedback on the first snap
        hasInitialHapticRef.current = false;
        
        dragXAnimated.setValue(finalX);
        const dotY = calculateDotY(finalX);
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
    const finalX = snapResult !== null ? snapResult.x : constrainedX;
    dragXRef.current = finalX;
    // Don't set lastSnappedIndexRef here - let updateDragX handle it to ensure first haptic fires
    // Reset the initial haptic flag so we get haptic feedback on the first snap
    hasInitialHapticRef.current = false;
    dragXAnimated.setValue(finalX);
    const dotY = calculateDotY(finalX);
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
    panResponder,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  };
}

// Downsample data for performance - extremely aggressive for large timeframes
// Coinbase/Stocks apps typically use 50-60 points max for smooth performance
// Export for testing
export const downsampleData = (data: { x: string | number; y: number }[], timeRange?: TimeRange): { x: string | number; y: number }[] => {
  // "Equalizer Hack" (Suggestion #1): Always return exactly TARGET_POINTS for smooth morphing
  // This ensures all timeframes have the same number of points, allowing smooth path interpolation
  const TARGET_POINTS = 60; // Constant points for all timeframes - enables smooth transitions
  
  if (data.length === 0) {
    return data;
  }
  
  if (data.length <= TARGET_POINTS) {
    // If we have fewer points than target, interpolate to reach exactly TARGET_POINTS
    if (data.length === TARGET_POINTS) {
      return data;
    }
    
    // Interpolate to reach exactly TARGET_POINTS
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

  // Downsample to exactly TARGET_POINTS
  const result: { x: string | number; y: number }[] = [];
  const step = data.length / TARGET_POINTS;
  
  // Always include first point
  result.push(data[0]);
  
  // Sample points evenly to reach exactly TARGET_POINTS
  for (let i = 1; i < TARGET_POINTS - 1; i++) {
    const index = Math.round(i * step);
    if (index < data.length) {
      result.push(data[index]);
    }
  }
  
  // Always include last point
  if (data.length > 1) {
    result.push(data[data.length - 1]);
  }
  
  // Ensure we have exactly TARGET_POINTS (in case of rounding errors)
  if (result.length !== TARGET_POINTS) {
    // Trim or pad to exact length
    if (result.length > TARGET_POINTS) {
      return result.slice(0, TARGET_POINTS);
    } else {
      // Pad with last point if needed
      while (result.length < TARGET_POINTS) {
        result.push(result[result.length - 1]);
      }
    }
  }
  
  return result;
};

// Convert data to format expected by react-native-gifted-charts
// Export for testing
export const convertToChartData = (data: { x: string | number; y: number }[]) => {
  if (!data || data.length === 0) {
    return [];
  }
  // react-native-gifted-charts expects data in format: { value: number, label?: string }
  const converted = data.map((point) => ({
    value: point.y,
    // Don't include label if empty - might cause issues
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
}: {
  width: number;
  height: number;
  dragXAnimated: Animated.Value;
  fadeMode: 'none' | 'future' | 'past';
  fadeIntensity: number;
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
        fill={Colors.background}
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
}) => {
  if (chartData.length === 0) return null;
  
  const {
    lineColor = Colors.chartOrange,
    lineThickness = 3,
    gradientStartColor = Colors.chartOrange + '4D',
    gradientEndColor = Colors.background + '00',
    gradientStartOpacity = 0.3,
    gradientEndOpacity = 0,
    patternColor = Colors.chartOrange,
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

function Chart({ 
  data, 
  height = 200, 
  width = screenWidth,
  patternType = 'dots', 
  onDragStart, 
  onDragEnd, 
  timeRange = '1Y',
  config = {},
  testID
}: ChartProps) {
  // Merge default config with provided config
  const defaultConfig: ChartConfig = {
    lineColor: Colors.chartOrange,
    lineThickness: 3,
    gradientStartColor: Colors.chartOrange + '4D',
    gradientEndColor: Colors.background + '00',
    gradientStartOpacity: 0.3,
    gradientEndOpacity: 0,
    patternColor: Colors.chartOrange,
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
  
  // ============================================================================
  // Use extracted hooks for data processing and drag interaction
  // ============================================================================
  const chartDataModule = useChartData(data, timeRange, width);
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
    finalConfig.curved ?? true
  );
  const {
    getInterpolatedPaths,
    gradientOpacity,
    dotsOpacity,
  } = transitionModule;
  
  const dragModule = useChartDrag({
    width,
    height,
    chartData,
    minValue,
    maxValue,
    spacing,
    snapPoints,
    timeBounds,
    onDragStart,
    onDragEnd,
  });
  
  const {
    isDragging,
    dragXAnimated,
    dotYAnimated,
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
                fill={Colors.assetGreyLight}
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
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.chartOrange }} />
          </Animated.View>
        </>
      )}
    </View>
  );
}

// Memoize with custom comparison - only re-render when data/props actually change
// This prevents re-renders from drag state changes
export default React.memo(Chart, (prevProps, nextProps) => {
  // Only re-render if data, height, patternType, or timeRange changes
  // Ignore callback changes (onDragStart/onDragEnd) as they don't affect rendering
  if (prevProps.data.length !== nextProps.data.length) return false;
  if (prevProps.height !== nextProps.height) return false;
  if (prevProps.patternType !== nextProps.patternType) return false;
  if (prevProps.timeRange !== nextProps.timeRange) return false;
  
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

const styles = StyleSheet.create({
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
    color: Colors.textSecondary,
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
  // verticalLine style removed - now using SVG Line component with dotted pattern and gradient fade
});
