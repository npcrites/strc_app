import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { VictoryLine, VictoryChart, VictoryAxis, VictoryArea, VictoryContainer } from 'victory-native';
import { Defs, LinearGradient, Stop, Pattern, Rect as SvgRect, Circle } from 'react-native-svg';
import { Colors } from '../constants/colors';

interface ChartProps {
  data: { x: string | number; y: number }[];
  height?: number;
  patternType?: 'diagonal' | 'dots' | 'crosshatch' | 'horizontal' | 'vertical' | 'none';
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
          width="6"
          height="6"
        >
          <Circle cx="3" cy="3" r="1" fill={Colors.chartOrange} fillOpacity="0.1" />
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
          <Stop offset="100%" stopColor={Colors.chartOrangeGradient} stopOpacity="0" />
        </LinearGradient>
        {patternType !== 'none' && createPattern(patternType)}
      </Defs>
      {props.children}
    </VictoryContainer>
  );
};

export default function Chart({ data, height = 200, patternType = 'dots' }: ChartProps) {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>No data available</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
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
        {/* Pattern overlay */}
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
        {/* Orange line */}
        <VictoryLine
          data={data}
          style={{
            data: {
              stroke: Colors.chartOrange,
              strokeWidth: 2,
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
