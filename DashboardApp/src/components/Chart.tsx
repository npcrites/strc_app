import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, PanResponder, Animated } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import Svg, { Defs, Pattern, Circle, Rect as SvgRect, LinearGradient, Stop, Mask, ClipPath, Path, Line, G } from 'react-native-svg';
import { Colors } from '../constants/colors';

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
  
  // React state only for overlay position (throttled, low frequency)
  const [overlayX, setOverlayX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  
  // Refs for drag state and data lookup
  const isDraggingRef = useRef(false);
  const dragXRef = useRef<number | null>(null);
  const overlayUpdateFrameRef = useRef<number | null>(null);
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
  const findNearestSnapPoint = useCallback((x: number): number | null => {
    if (snapPoints.length === 0) return null;
    if (timeBounds.maxTime === timeBounds.minTime) return x;
    
    const ratio = x / screenWidth;
    const targetTime = timeBounds.minTime + ratio * (timeBounds.maxTime - timeBounds.minTime);
    
    // Binary search for nearest snap point
    let left = 0;
    let right = snapPoints.length - 1;
    let nearestSnap = snapPoints[0];
    let minDiff = Math.abs(snapPoints[0].timestamp - targetTime);
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const diff = Math.abs(snapPoints[mid].timestamp - targetTime);
      
      if (diff < minDiff) {
        minDiff = diff;
        nearestSnap = snapPoints[mid];
      }
      
      if (snapPoints[mid].timestamp < targetTime) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    
    // Convert snap point timestamp back to x position
    const snapRatio = (nearestSnap.timestamp - timeBounds.minTime) / (timeBounds.maxTime - timeBounds.minTime);
    return snapRatio * screenWidth;
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
    const snappedX = findNearestSnapPoint(x);
    if (snappedX === null) return;
    
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
        const snappedX = findNearestSnapPointRef.current(constrainedX);
        const finalX = snappedX !== null ? snappedX : constrainedX;
        dragXRef.current = finalX;
        
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
        setIsDragging(false);
        setIsHolding(false);
        isDraggingRef.current = false;
        
        if (wasDragging) {
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
        const wasDragging = isDraggingRef.current;
        setIsDragging(false);
        setIsHolding(false);
        isDraggingRef.current = false;
        if (wasDragging) {
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
    const snappedX = findNearestSnapPointRef.current(constrainedX);
    const finalX = snappedX !== null ? snappedX : constrainedX;
    dragXRef.current = finalX;
    dragXAnimated.setValue(finalX);
    const dotY = calculateDotY(finalX);
    dotYAnimated.setValue(dotY);
    setOverlayX(finalX);
    setIsHolding(true);
    
    holdTimerRef.current = setTimeout(() => {
      if (isTouchingRef.current && !isDraggingRef.current && !hasMovedRef.current) {
        setIsDragging(true);
        isDraggingRef.current = true;
        setIsHolding(false);
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
    setOverlayX(null);
    setIsDragging(false);
    setIsHolding(false);
    isDraggingRef.current = false;
    initialTouchXRef.current = null;
    
    if (overlayUpdateFrameRef.current) {
      cancelAnimationFrame(overlayUpdateFrameRef.current);
      overlayUpdateFrameRef.current = null;
    }
    
    if (wasDragging) {
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
    setOverlayX(null);
    setIsDragging(false);
    setIsHolding(false);
    isDraggingRef.current = false;
    initialTouchXRef.current = null;
    
    if (overlayUpdateFrameRef.current) {
      cancelAnimationFrame(overlayUpdateFrameRef.current);
      overlayUpdateFrameRef.current = null;
    }
    
    if (wasDragging) {
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
const downsampleData = (data: { x: string | number; y: number }[], timeRange?: TimeRange): { x: string | number; y: number }[] => {
  // Use different limits based on time range for optimal performance
  let maxPoints: number;
  switch (timeRange) {
    case '1W':
      maxPoints = 150; // More points for short timeframes
      break;
    case '1M':
      maxPoints = 100;
      break;
    case '3M':
      maxPoints = 60; // Very aggressive downsampling for large timeframes
      break;
    case '1Y':
    case 'ALL':
      maxPoints = 50; // Extremely aggressive for largest timeframes (like Coinbase)
      break;
    default:
      maxPoints = 100;
  }

  if (data.length <= maxPoints) {
    return data;
  }

  const result: { x: string | number; y: number }[] = [];
  const step = data.length / maxPoints;
  
  // Always include first point
  result.push(data[0]);
  
  // Sample points evenly - this is fast and preserves overall shape
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
  
  return result;
};

// Convert data to format expected by react-native-gifted-charts
const convertToChartData = (data: { x: string | number; y: number }[]) => {
  if (!data || data.length === 0) {
    console.log('convertToChartData: No data provided');
    return [];
  }
  // react-native-gifted-charts expects data in format: { value: number, label?: string }
  const converted = data.map((point) => ({
    value: point.y,
    // Don't include label if empty - might cause issues
  }));
  console.log('convertToChartData: Converted', data.length, 'points, sample:', converted.slice(0, 3));
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
  config = {}
}: { 
  width: number; 
  height: number; 
  chartData: { value: number }[]; 
  minValue: number; 
  maxValue: number; 
  patternType: PatternType;
  dragX?: number | null; // X position of drag point - everything to the right will be 50% opacity
  config?: ChartConfig;
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
  
  // Memoize path generation - paths don't change with dragX
  const { linePath, areaPath } = useMemo(
    () => generateChartPath(chartData, width, height, minValue, maxValue, curved),
    [chartData, width, height, minValue, maxValue, curved]
  );
  
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
      {/* Gradient fill */}
      <Path 
        d={areaPath} 
        fill="url(#areaGradient)"
      />
      {/* Dots pattern - hide during drag for better performance */}
      {patternType === 'dots' && dragX === null && (
        <SvgRect
          width={width}
          height={height}
          fill="url(#dotsPattern)"
          clipPath="url(#areaClip)"
          mask="url(#dotsFadeMaskApplied)"
        />
      )}
    </>
  ), [linePath, areaPath, lineColor, lineThickness, patternType, width, height, dragX]);
  
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
