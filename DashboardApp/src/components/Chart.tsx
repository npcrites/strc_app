import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { VictoryLine, VictoryChart, VictoryAxis, VictoryArea } from 'victory-native';
import { Colors } from '../constants/colors';

interface ChartProps {
  data: { x: string | number; y: number }[];
  height?: number;
}

const screenWidth = Dimensions.get('window').width;

export default function Chart({ data, height = 200 }: ChartProps) {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.emptyText}>No data available</Text>
      </View>
    );
  }

  // Format x-axis labels (dates)
  const formatXAxis = (tick: string | number) => {
    if (typeof tick === 'string') {
      const date = new Date(tick);
      if (isNaN(date.getTime())) return String(tick);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return String(tick);
  };

  // Format y-axis labels (currency)
  const formatYAxis = (tick: number) => {
    if (tick >= 1000) {
      return `$${(tick / 1000).toFixed(0)}k`;
    }
    return `$${tick.toFixed(0)}`;
  };

  return (
    <View style={[styles.container, { height }]}>
      <VictoryChart
        width={screenWidth - 40}
        height={height}
        padding={{ left: 50, right: 20, top: 20, bottom: 40 }}
      >
        {/* Gradient area under the line */}
        <VictoryArea
          data={data}
          style={{
            data: {
              fill: Colors.chartOrangeGradient,
              fillOpacity: 0.3,
            },
          }}
        />
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
            axis: { stroke: Colors.textTertiary },
            tickLabels: {
              fill: Colors.textSecondary,
              fontSize: 12,
            },
            grid: { stroke: 'transparent' },
          }}
          tickFormat={formatXAxis}
        />
        {/* Y-axis */}
        <VictoryAxis
          dependentAxis
          style={{
            axis: { stroke: 'transparent' },
            tickLabels: {
              fill: Colors.textTertiary,
              fontSize: 12,
            },
            grid: { stroke: Colors.backgroundGrey },
          }}
          tickFormat={formatYAxis}
        />
      </VictoryChart>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
