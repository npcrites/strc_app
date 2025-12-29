/**
 * Dividend chart component - visualizes dividend history
 */
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { formatCurrency } from '../utils/formatters';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 80;
const CHART_HEIGHT = 200;

export default function DividendChart({ dividends }) {
  if (!dividends || dividends.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No dividend history</Text>
      </View>
    );
  }

  const amounts = dividends.map(d => parseFloat(d.amount || 0));
  const maxAmount = Math.max(...amounts, 1);
  const minAmount = Math.min(...amounts, 0);

  return (
    <View style={styles.container}>
      <View style={styles.chartContainer}>
        {dividends.map((dividend, index) => {
          const amount = parseFloat(dividend.amount || 0);
          const height = maxAmount > 0 ? (amount / maxAmount) * CHART_HEIGHT : 0;
          
          return (
            <View key={index} style={styles.barContainer}>
              <View style={styles.barWrapper}>
                <View style={[styles.bar, { height: Math.max(height, 4) }]} />
              </View>
              <Text style={styles.barLabel} numberOfLines={1}>
                {new Date(dividend.ex_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
              <Text style={styles.barValue}>{formatCurrency(amount)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT + 60,
    justifyContent: 'space-around',
  },
  barContainer: {
    alignItems: 'center',
    flex: 1,
  },
  barWrapper: {
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
    width: '80%',
  },
  bar: {
    backgroundColor: '#6200ee',
    width: '100%',
    borderRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  barValue: {
    fontSize: 10,
    color: '#333',
    marginTop: 2,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
});


