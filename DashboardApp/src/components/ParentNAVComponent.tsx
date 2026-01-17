import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getColors } from '../constants/colors';
import Chart from './Chart';
import { api } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { ParentNAVHistory } from '../types';

type TimeRange = '1W' | '1M' | '3M' | '1Y' | 'ALL';

interface ParentNAVComponentProps {
  ticker: string;
  token: string;
  timeRange: TimeRange;
}

const screenWidth = Dimensions.get('window').width;
const CARD_MARGIN = 20;
const chartWidth = screenWidth - (CARD_MARGIN * 2);

export default function ParentNAVComponent({
  ticker,
  token,
  timeRange,
}: ParentNAVComponentProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const styles = createStyles(colors, isDark);
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ParentNAVHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNAV = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.get<ParentNAVHistory>(
          `/assets/${ticker}/parent-nav?time_range=${timeRange}`,
          token
        );
        setData(response);
      } catch (err: any) {
        console.error('Error fetching parent NAV:', err);
        setError(err.message || 'Failed to load NAV data');
      } finally {
        setLoading(false);
      }
    };

    fetchNAV();
  }, [ticker, token, timeRange]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.orange} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          {error || 'No NAV data available'}
        </Text>
      </View>
    );
  }

  // Transform data for chart (same format as price chart)
  const chartData = data.series.map(point => ({
    x: new Date(point.timestamp).getTime(),
    y: point.value,
  }));

  const currentNAV = data.current_nav || (data.series.length > 0 ? data.series[data.series.length - 1].value : 0);
  
  // Calculate if NAV is positive (for chart color)
  const isPositive = data.series.length > 1 
    ? data.series[data.series.length - 1].value >= data.series[0].value 
    : true;

  return (
    <View style={styles.container}>
      {/* Header with current NAV in top right */}
      <View style={styles.header}>
        <Text style={styles.label}>Parent NAV ({data.parent_ticker})</Text>
        <View style={styles.navValueContainer}>
          <Text style={styles.currencySymbol}>$</Text>
          <Text style={styles.navValue}>
            {formatCurrency(currentNAV).replace('$', '')}
          </Text>
        </View>
      </View>

      {/* Chart */}
      <View style={styles.chartContainer}>
        {chartData.length > 0 ? (
          <Chart
            data={chartData}
            height={200}
            width={chartWidth}
            timeRange={timeRange}
            lineColor={isPositive ? colors.green : colors.red}
            gradientStartColor={isPositive ? colors.green : colors.red}
            gradientEndColor={isPositive ? colors.green : colors.red}
            gradientStartOpacity={0.3}
            gradientEndOpacity={0.0}
            curved={true}
            showDots={false}
          />
        ) : (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>No NAV history available</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof getColors>, isDark: boolean) => StyleSheet.create({
  container: {
    backgroundColor: isDark ? ((colors as any).glassBackground || colors.backgroundWhite) : 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? ((colors as any).glassBorder || colors.border) : 'transparent',
    shadowColor: (colors as any).glassShadowGlow || '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDark ? ((colors as any).glassShadowGlow ? 0.04 : 0.12) : 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Inter-Bold',
    color: colors.textSecondary,
  },
  navValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
    marginRight: 4,
  },
  navValue: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
  },
  chartContainer: {
    height: 200,
  },
  noDataContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: colors.red,
    textAlign: 'center',
  },
});

