/**
 * Position card component - displays position summary
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatCurrency, formatPercentage } from '../utils/formatters';

export default function PositionCard({ position, onPress }) {
  const unrealizedGain = position.current_value - position.total_cost;
  const gainPercentage = position.total_cost > 0
    ? (unrealizedGain / position.total_cost) * 100
    : 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.symbol}>{position.symbol}</Text>
        <Text style={styles.quantity}>{position.quantity} shares</Text>
      </View>
      
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.label}>Value:</Text>
          <Text style={styles.value}>{formatCurrency(position.current_value)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Cost:</Text>
          <Text style={styles.value}>{formatCurrency(position.total_cost)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Gain/Loss:</Text>
          <Text style={[
            styles.value,
            unrealizedGain >= 0 ? styles.positive : styles.negative
          ]}>
            {formatCurrency(unrealizedGain)} ({formatPercentage(gainPercentage)})
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  symbol: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  quantity: {
    fontSize: 14,
    color: '#666',
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    color: '#666',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  positive: {
    color: '#4caf50',
  },
  negative: {
    color: '#f44336',
  },
});


