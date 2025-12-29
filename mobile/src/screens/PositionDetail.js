/**
 * Position detail screen - shows detailed information about a position
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import DividendChart from '../components/DividendChart';
import { formatCurrency, formatPercentage } from '../utils/formatters';

export default function PositionDetail({ route, navigation }) {
  const { positionId } = route.params;
  const { token } = useAuth();
  const [position, setPosition] = useState(null);
  const [dividends, setDividends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPositionData();
  }, [positionId]);

  const loadPositionData = async () => {
    try {
      const [positionData, dividendsData] = await Promise.all([
        api.get(`/positions/${positionId}`, token),
        api.get(`/dividends?position_id=${positionId}`, token),
      ]);
      
      setPosition(positionData);
      setDividends(dividendsData.dividends || []);
    } catch (error) {
      console.error('Error loading position data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !position) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6200ee" />
      </View>
    );
  }

  const totalDividends = dividends.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
  const unrealizedGain = position.current_value - position.total_cost;
  const totalReturn = unrealizedGain + totalDividends;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.symbol}>{position.symbol}</Text>
        <Text style={styles.quantity}>{position.quantity} shares</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Position Value</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Cost Basis:</Text>
          <Text style={styles.value}>{formatCurrency(position.total_cost)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Current Value:</Text>
          <Text style={styles.value}>{formatCurrency(position.current_value)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Unrealized Gain/Loss:</Text>
          <Text style={[styles.value, unrealizedGain >= 0 ? styles.positive : styles.negative]}>
            {formatCurrency(unrealizedGain)}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dividends</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Total Dividends:</Text>
          <Text style={styles.value}>{formatCurrency(totalDividends)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Total Return:</Text>
          <Text style={[styles.value, totalReturn >= 0 ? styles.positive : styles.negative]}>
            {formatCurrency(totalReturn)}
          </Text>
        </View>
      </View>

      {dividends.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dividend History</Text>
          <DividendChart dividends={dividends} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 20,
    backgroundColor: '#6200ee',
  },
  symbol: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  quantity: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    color: '#666',
  },
  value: {
    fontSize: 16,
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


