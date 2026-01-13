import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getColors } from '../constants/colors';
import Chart from './Chart';
import { TradingHoursMode } from '../utils/marketHours';

type TimeRange = '1W' | '1M' | '3M' | '1Y' | 'ALL';

export interface AssetChartProps {
  data: { x: string | number; y: number }[];
  timeRange: TimeRange;
  tradingHoursMode: TradingHoursMode;
  isPositive: boolean;
  height?: number;
}

const screenWidth = Dimensions.get('window').width;
// Card has marginHorizontal: 20 on each side, so chart width = screenWidth - 40
const CARD_MARGIN = 20;
const chartWidth = screenWidth - (CARD_MARGIN * 2);

export default function AssetChart({
  data,
  timeRange,
  tradingHoursMode,
  isPositive,
  height = 250,
}: AssetChartProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const styles = createStyles(colors);

  if (data.length === 0) {
    return (
      <View style={styles.chartContainer}>
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataText}>No price history available</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.chartContainer}>
      <Chart
        data={data}
        height={height}
        width={chartWidth}
        timeRange={timeRange}
        tradingHoursMode={tradingHoursMode}
        config={{
          lineColor: isPositive ? colors.orange : colors.textSecondary,
          gradientStartColor: isPositive ? colors.orange : colors.textSecondary,
          gradientEndColor: isPositive ? colors.orange : colors.textSecondary,
          gradientStartOpacity: 0.3,
          gradientEndOpacity: 0,
          curved: timeRange !== '1W', // Straight lines for 1W (spiky), curves for longer timeframes
          showDots: false,
          enableDrag: true,
          fadeIntensity: 0.75, // Increased fade intensity for more pronounced effect
        }}
      />
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof getColors>) => StyleSheet.create({
  chartContainer: {
    paddingBottom: 20,
    minHeight: 250,
    overflow: 'hidden',
  },
  noDataContainer: {
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});

