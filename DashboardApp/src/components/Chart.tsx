import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, PanResponder } from 'react-native';
import { VictoryLine, VictoryChart, VictoryAxis, VictoryArea, VictoryContainer } from 'victory-native';
import { Defs, LinearGradient, Stop, Pattern, Rect as SvgRect, Circle, Line } from 'react-native-svg';
import { Colors } from '../constants/colors';

interface ChartProps {
  data: { x: string | number; y: number }[];
  height?: number;
  patternType?: 'diagonal' | 'dots' | 'crosshatch' | 'horizontal' | 'vertical' | 'none';
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const screenWidth = Dimensions.get('window').width;

// Pattern type definitions
const createPattern = (type: string) => {
  switch (type) {
    case 'diagonal':
      return (
        <Pattern
          id="areaPattern"
          patternUnits="userSpaceOnUse"
          width="8"
          height="8"
          patternTransform="rotate(45)"
        >
          <SvgRect width="4" height="8" fill={Colors.chartOrange} fillOpacity="0.08" />
        </Pattern>
      );
    case 'dots':
      return (
        <Pattern
          id="areaPattern"
          patternUnits="userSpaceOnUse"
          width="8"
          height="8"
        >
          <Circle cx="4" cy="4" r="1.5" fill={Colors.chartOrange} fillOpacity="0.2" />
        </Pattern>
      );
    case 'crosshatch':
      return (
        <Pattern
          id="areaPattern"
          patternUnits="userSpaceOnUse"
          width="8"
          height="8"
        >
          <SvgRect width="8" height="1" fill={Colors.chartOrange} fillOpacity="0.08" />
          <SvgRect x="0" y="0" width="1" height="8" fill={Colors.chartOrange} fillOpacity="0.08" />
        </Pattern>
      );
    case 'horizontal':
      return (
        <Pattern
          id="areaPattern"
          patternUnits="userSpaceOnUse"
          width="8"
          height="4"
        >
          <SvgRect width="8" height="1" fill={Colors.chartOrange} fillOpacity="0.1" />
        </Pattern>
      );
    case 'vertical':
      return (
        <Pattern
          id="areaPattern"
          patternUnits="userSpaceOnUse"
          width="4"
          height="8"
        >
          <SvgRect width="1" height="8" fill={Colors.chartOrange} fillOpacity="0.1" />
        </Pattern>
      );
    default:
      return null;
  }
};

// Custom container that includes SVG gradient and pattern definitions
const GradientContainer = ({ patternType = 'diagonal', ...props }: any) => {
  return (
    <VictoryContainer {...props}>
      <Defs>
        <LinearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={Colors.chartOrange} stopOpacity="0.3" />
          <Stop offset="1%" stopColor={Colors.chartOrange} stopOpacity="0.29" />
          <Stop offset="2%" stopColor={Colors.chartOrange} stopOpacity="0.28" />
          <Stop offset="3%" stopColor={Colors.chartOrange} stopOpacity="0.27" />
          <Stop offset="4%" stopColor={Colors.chartOrange} stopOpacity="0.26" />
          <Stop offset="5%" stopColor={Colors.chartOrange} stopOpacity="0.25" />
          <Stop offset="7%" stopColor={Colors.chartOrange} stopOpacity="0.24" />
          <Stop offset="10%" stopColor={Colors.chartOrange} stopOpacity="0.22" />
          <Stop offset="15%" stopColor={Colors.chartOrange} stopOpacity="0.20" />
          <Stop offset="20%" stopColor={Colors.chartOrange} stopOpacity="0.18" />
          <Stop offset="25%" stopColor={Colors.chartOrange} stopOpacity="0.16" />
          <Stop offset="30%" stopColor={Colors.chartOrange} stopOpacity="0.14" />
          <Stop offset="35%" stopColor={Colors.chartOrange} stopOpacity="0.12" />
          <Stop offset="40%" stopColor={Colors.chartOrange} stopOpacity="0.1" />
          <Stop offset="45%" stopColor={Colors.chartOrange} stopOpacity="0.08" />
          <Stop offset="50%" stopColor={Colors.chartOrange} stopOpacity="0.06" />
          <Stop offset="60%" stopColor={Colors.chartOrangeGradient} stopOpacity="0.04" />
          <Stop offset="70%" stopColor={Colors.chartOrangeGradient} stopOpacity="0.03" />
          <Stop offset="80%" stopColor={Colors.chartOrangeGradient} stopOpacity="0.02" />
          <Stop offset="85%" stopColor={Colors.chartOrangeGradient} stopOpacity="0.015" />
          <Stop offset="90%" stopColor={Colors.background} stopOpacity="0.12" />
          <Stop offset="92%" stopColor={Colors.background} stopOpacity="0.08" />
          <Stop offset="94%" stopColor={Colors.background} stopOpacity="0.06" />
          <Stop offset="96%" stopColor={Colors.background} stopOpacity="0.04" />
          <Stop offset="97%" stopColor={Colors.background} stopOpacity="0.03" />
          <Stop offset="98%" stopColor={Colors.background} stopOpacity="0.02" />
          <Stop offset="99%" stopColor={Colors.background} stopOpacity="0.01" />
          <Stop offset="100%" stopColor={Colors.background} stopOpacity="0" />
        </LinearGradient>
        {/* Gradient to fade pattern dots to background color - starts at 25%, extended final fade */}
        <LinearGradient id="patternFadeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={Colors.background} stopOpacity="0" />
          <Stop offset="10%" stopColor={Colors.background} stopOpacity="0" />
          <Stop offset="20%" stopColor={Colors.background} stopOpacity="0" />
          <Stop offset="25%" stopColor={Colors.background} stopOpacity="0.01" />
          <Stop offset="30%" stopColor={Colors.background} stopOpacity="0.02" />
          <Stop offset="35%" stopColor={Colors.background} stopOpacity="0.03" />
          <Stop offset="40%" stopColor={Colors.background} stopOpacity="0.05" />
          <Stop offset="45%" stopColor={Colors.background} stopOpacity="0.07" />
          <Stop offset="50%" stopColor={Colors.background} stopOpacity="0.1" />
          <Stop offset="55%" stopColor={Colors.background} stopOpacity="0.13" />
          <Stop offset="60%" stopColor={Colors.background} stopOpacity="0.16" />
          <Stop offset="65%" stopColor={Colors.background} stopOpacity="0.2" />
          <Stop offset="70%" stopColor={Colors.background} stopOpacity="0.25" />
          <Stop offset="75%" stopColor={Colors.background} stopOpacity="0.32" />
          <Stop offset="80%" stopColor={Colors.background} stopOpacity="0.4" />
          <Stop offset="82%" stopColor={Colors.background} stopOpacity="0.45" />
          <Stop offset="84%" stopColor={Colors.background} stopOpacity="0.5" />
          <Stop offset="86%" stopColor={Colors.background} stopOpacity="0.55" />
          <Stop offset="88%" stopColor={Colors.background} stopOpacity="0.6" />
          <Stop offset="90%" stopColor={Colors.background} stopOpacity="0.65" />
          <Stop offset="91%" stopColor={Colors.background} stopOpacity="0.68" />
          <Stop offset="92%" stopColor={Colors.background} stopOpacity="0.71" />
          <Stop offset="93%" stopColor={Colors.background} stopOpacity="0.74" />
          <Stop offset="94%" stopColor={Colors.background} stopOpacity="0.77" />
          <Stop offset="95%" stopColor={Colors.background} stopOpacity="0.8" />
          <Stop offset="96%" stopColor={Colors.background} stopOpacity="0.83" />
          <Stop offset="97%" stopColor={Colors.background} stopOpacity="0.86" />
          <Stop offset="98%" stopColor={Colors.background} stopOpacity="0.9" />
          <Stop offset="99%" stopColor={Colors.background} stopOpacity="0.95" />
          <Stop offset="100%" stopColor={Colors.background} stopOpacity="1" />
        </LinearGradient>
        {patternType !== 'none' && createPattern(patternType)}
      </Defs>
      {props.children}
    </VictoryContainer>
  );
};

export default function Chart({ data, height = 200, patternType = 'dots', onDragStart, onDragEnd }: ChartProps) {
  const [dragX, setDragX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const chartContainerRef = useRef<View>(null);
  const isDraggingRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX } = evt.nativeEvent;
        setDragX(locationX);
        setIsDragging(true);
        isDraggingRef.current = true;
        onDragStart?.();
      },
      onPanResponderMove: (evt, gestureState) => {
        const { locationX } = evt.nativeEvent;
        // Constrain to chart bounds
        const constrainedX = Math.max(0, Math.min(screenWidth, locationX));
        setDragX(constrainedX);
      },
      onPanResponderRelease: () => {
        setDragX(null);
        setIsDragging(false);
        isDraggingRef.current = false;
        onDragEnd?.();
      },
      onPanResponderTerminate: () => {
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
      <VictoryChart
        width={screenWidth}
        height={height}
        padding={{ left: 0, right: 0, top: 20, bottom: 0 }}
        containerComponent={<GradientContainer patternType={patternType} />}
      >
        {/* Gradient area - smooth fade from top to bottom */}
        <VictoryArea
          data={data}
          style={{
            data: {
              fill: 'url(#areaGradient)',
            },
          }}
        />
        {/* Pattern overlay - dots fill area below line */}
        {patternType !== 'none' && (
          <VictoryArea
            data={data}
            style={{
              data: {
                fill: 'url(#areaPattern)',
                fillOpacity: 1,
              },
            }}
          />
        )}
        {/* Gradient overlay to fade pattern to background color - subtle fade like image */}
        {patternType !== 'none' && (
          <VictoryArea
            data={data}
            style={{
              data: {
                fill: 'url(#patternFadeGradient)',
              },
            }}
          />
        )}
        {/* Orange line */}
        <VictoryLine
          data={data}
          style={{
            data: {
              stroke: Colors.chartOrange,
              strokeWidth: 3,
            },
          }}
        />
        {/* X-axis */}
        <VictoryAxis
          style={{
            axis: { stroke: 'transparent' },
            tickLabels: {
              fill: 'transparent',
              fontSize: 0,
            },
            grid: { stroke: 'transparent' },
          }}
          tickFormat={() => ''}
        />
        {/* Y-axis */}
        <VictoryAxis
          dependentAxis
          style={{
            axis: { stroke: 'transparent' },
            tickLabels: {
              fill: 'transparent',
              fontSize: 0,
            },
            grid: { stroke: 'transparent' },
          }}
          tickFormat={() => ''}
        />
      </VictoryChart>
      {/* Interactive vertical line - appears on drag */}
      {isDragging && dragX !== null && (
        <View style={[styles.verticalLineContainer, { height }]} pointerEvents="none">
          <View style={[styles.verticalLine, { left: dragX }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'stretch',
    justifyContent: 'center',
    position: 'relative',
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
  },
  verticalLine: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: Colors.chartOrange,
    top: 20, // Match chart padding
  },
});
