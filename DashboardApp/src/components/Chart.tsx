import React, { useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, PanResponder } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import Svg, { Defs, Pattern, Circle, Rect as SvgRect } from 'react-native-svg';
import { Colors } from '../constants/colors';

type TimeRange = '1W' | '1M' | '3M' | '1Y' | 'ALL';

interface ChartProps {
  data: { x: string | number; y: number }[];
  height?: number;
  patternType?: 'diagonal' | 'dots' | 'crosshatch' | 'horizontal' | 'vertical' | 'none';
  onDragStart?: () => void;
  onDragEnd?: () => void;
  timeRange?: TimeRange;
}

const screenWidth = Dimensions.get('window').width;

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

// Create pattern overlay component - only covers the gradient area
const PatternOverlay = ({ width, height, patternType, isDragging }: { width: number; height: number; patternType: string; isDragging: boolean }) => {
  if (patternType === 'none' || isDragging) return null;

  const createPattern = () => {
    switch (patternType) {
      case 'dots':
        return (
          <Pattern id="dotsPattern" patternUnits="userSpaceOnUse" width="8" height="8">
            <Circle cx="4" cy="4" r="1.5" fill={Colors.chartOrange} fillOpacity="0.2" />
          </Pattern>
        );
      case 'diagonal':
        return (
          <Pattern id="diagonalPattern" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <SvgRect width="4" height="8" fill={Colors.chartOrange} fillOpacity="0.08" />
          </Pattern>
        );
      case 'crosshatch':
        return (
          <Pattern id="crosshatchPattern" patternUnits="userSpaceOnUse" width="8" height="8">
            <SvgRect width="8" height="1" fill={Colors.chartOrange} fillOpacity="0.08" />
            <SvgRect x="0" y="0" width="1" height="8" fill={Colors.chartOrange} fillOpacity="0.08" />
          </Pattern>
        );
      case 'horizontal':
        return (
          <Pattern id="horizontalPattern" patternUnits="userSpaceOnUse" width="8" height="4">
            <SvgRect width="8" height="1" fill={Colors.chartOrange} fillOpacity="0.1" />
          </Pattern>
        );
      case 'vertical':
        return (
          <Pattern id="verticalPattern" patternUnits="userSpaceOnUse" width="4" height="8">
            <SvgRect width="1" height="8" fill={Colors.chartOrange} fillOpacity="0.1" />
          </Pattern>
        );
      default:
        return null;
    }
  };

  const patternId = patternType === 'dots' ? 'dotsPattern' : 
                   patternType === 'diagonal' ? 'diagonalPattern' :
                   patternType === 'crosshatch' ? 'crosshatchPattern' :
                   patternType === 'horizontal' ? 'horizontalPattern' : 'verticalPattern';

  // Pattern should only cover the gradient area (not the entire chart)
  // Use a mask or clipPath to limit it to the area under the line
  // For now, we'll use lower opacity and position it correctly
  // Pattern should be very subtle - only visible in gradient area
  // Reduce opacity significantly so chart line is clearly visible
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={height} opacity={0.1}>
      <Defs>
        {createPattern()}
      </Defs>
      <SvgRect 
        width={width} 
        height={height} 
        fill={`url(#${patternId})`} 
      />
    </Svg>
  );
};

function Chart({ data, height = 200, patternType = 'dots', onDragStart, onDragEnd, timeRange = '1Y' }: ChartProps) {
  const [dragX, setDragX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const chartContainerRef = useRef<View>(null);
  const isDraggingRef = useRef(false);
  const dragXRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const THROTTLE_MS = 16; // ~60fps

  // Downsample data for performance on large datasets - much more aggressive
  const downsampledData = useMemo(() => downsampleData(data, timeRange), [data, timeRange]);

  // Convert to chart format
  const chartData = useMemo(() => {
    const converted = convertToChartData(downsampledData);
    // Debug: Log to verify data is being converted
    console.log('Chart data check:', {
      downsampledLength: downsampledData.length,
      convertedLength: converted.length,
      firstPoint: converted[0],
      lastPoint: converted[converted.length - 1],
      height,
      width: screenWidth + 40
    });
    return converted;
  }, [downsampledData, height]);

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

  const valueRange = maxValue - minValue;
  const padding = valueRange * 0.1; // 10% padding

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

  // Filter data points to only those that match the interval - optimized for performance
  const getSnapPoints = useMemo(() => {
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

  // Find the nearest snap point to a given x position - optimized with binary search
  const findNearestSnapPoint = useCallback((x: number): number | null => {
    if (getSnapPoints.length === 0 || downsampledData.length === 0) return null;
    
    if (timeBounds.maxTime === timeBounds.minTime) return x;
    
    const ratio = x / screenWidth;
    const targetTime = timeBounds.minTime + ratio * (timeBounds.maxTime - timeBounds.minTime);
    
    // Binary search for nearest snap point (much faster than linear search)
    let left = 0;
    let right = getSnapPoints.length - 1;
    let nearestSnap = getSnapPoints[0];
    let minDiff = Math.abs(getSnapPoints[0].timestamp - targetTime);
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const diff = Math.abs(getSnapPoints[mid].timestamp - targetTime);
      
      if (diff < minDiff) {
        minDiff = diff;
        nearestSnap = getSnapPoints[mid];
      }
      
      if (getSnapPoints[mid].timestamp < targetTime) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    
    // Convert snap point timestamp back to x position
    const snapRatio = (nearestSnap.timestamp - timeBounds.minTime) / (timeBounds.maxTime - timeBounds.minTime);
    return snapRatio * screenWidth;
  }, [getSnapPoints, timeBounds]);

  // Throttled update function using requestAnimationFrame
  const updateDragX = useCallback((x: number) => {
    // Snap to nearest snap point
    const snappedX = findNearestSnapPoint(x);
    if (snappedX === null) return;
    
    dragXRef.current = snappedX;
    const now = Date.now();
    
    if (now - lastUpdateTimeRef.current >= THROTTLE_MS) {
      setDragX(snappedX);
      lastUpdateTimeRef.current = now;
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    } else if (!animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(() => {
        if (dragXRef.current !== null) {
          setDragX(dragXRef.current);
          lastUpdateTimeRef.current = Date.now();
        }
        animationFrameRef.current = null;
      });
    }
  }, [findNearestSnapPoint]);

  // Store the snap function in a ref so panResponder can access it
  const findNearestSnapPointRef = useRef(findNearestSnapPoint);
  findNearestSnapPointRef.current = findNearestSnapPoint;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX } = evt.nativeEvent;
        const constrainedX = Math.max(0, Math.min(screenWidth, locationX));
        // Snap to nearest snap point on initial touch
        const snappedX = findNearestSnapPointRef.current(constrainedX);
        const finalX = snappedX !== null ? snappedX : constrainedX;
        dragXRef.current = finalX;
        setDragX(finalX);
        setIsDragging(true);
        isDraggingRef.current = true;
        lastUpdateTimeRef.current = Date.now();
        onDragStart?.();
      },
      onPanResponderMove: (evt, gestureState) => {
        const { locationX } = evt.nativeEvent;
        // Constrain to chart bounds
        const constrainedX = Math.max(0, Math.min(screenWidth, locationX));
        updateDragX(constrainedX);
      },
      onPanResponderRelease: () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        dragXRef.current = null;
        setDragX(null);
        setIsDragging(false);
        isDraggingRef.current = false;
        onDragEnd?.();
      },
      onPanResponderTerminate: () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        dragXRef.current = null;
        setDragX(null);
        setIsDragging(false);
        isDraggingRef.current = false;
        onDragEnd?.();
      },
      onPanResponderTerminationRequest: () => {
        // Never allow parent ScrollView to take over the gesture
        return false;
      },
      onShouldBlockNativeResponder: () => {
        // Always block native responder to prevent ScrollView from scrolling
        return true;
      },
    })
  ).current;

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

  // Debug: Log chart rendering
  console.log('Rendering chart with', chartData.length, 'points, width:', screenWidth + 40, 'height:', height);

  return (
    <View 
      style={[styles.container, { height }]}
      ref={chartContainerRef}
      collapsable={false}
      onTouchStart={(evt) => {
        // Immediately disable scrolling when touch starts
        onDragStart?.();
      }}
      onTouchEnd={() => {
        onDragEnd?.();
      }}
      onTouchCancel={() => {
        onDragEnd?.();
      }}
      {...panResponder.panHandlers}
    >
      <View style={styles.chartWrapper}>
        {/* Pattern overlay - render behind chart with very low opacity */}
        {patternType !== 'none' && !isDragging && (
          <View style={styles.patternOverlayContainer} pointerEvents="none">
            <PatternOverlay width={screenWidth} height={height} patternType={patternType} isDragging={isDragging} />
          </View>
        )}
        <View style={[styles.chartContainer, { height }]} collapsable={false}>
          <LineChart
            data={chartData}
            width={screenWidth} // Full screen width to extend to edges
            height={height}
            thickness={3}
            color={Colors.chartOrange}
            areaChart
            startFillColor={Colors.chartOrange + '4D'}
            endFillColor={Colors.background + '00'}
            startOpacity={0.3}
            endOpacity={0}
            hideYAxisText={true} // Hide y-axis text to allow chart to extend to edges
            hideRules
            hideDataPoints
            curved
            animateOnDataChange={false}
            animationDuration={0}
            spacing={chartData.length > 1 ? screenWidth / (chartData.length - 1) : 0}
            initialSpacing={0} // Start at left edge
            endSpacing={0} // End at right edge
            xAxisThickness={0} // Hide x-axis line
            xAxisColor="transparent" // Hide x-axis
            yAxisColor="transparent" // Hide y-axis lines to allow chart to extend to edges
            yAxisThickness={0}
            yAxisLabelWidth={0}
          />
        </View>
      </View>
      {/* Interactive vertical line - appears on drag */}
      {isDragging && dragX !== null && (
        <View style={[styles.verticalLineContainer, { height }]} pointerEvents="none" collapsable={false}>
          <View style={[styles.verticalLine, { left: dragX }]} collapsable={false} />
        </View>
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
  patternOverlayContainer: {
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
  verticalLine: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: Colors.chartOrange,
  },
});
