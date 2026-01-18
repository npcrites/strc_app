import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { formatCurrency } from '../utils/formatters';
import { getColors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';
import { Position, Holdings } from '../types';

type RootStackParamList = {
  HoldingsDetail: { ticker: string };
};

type HoldingsDetailRouteProp = RouteProp<RootStackParamList, 'HoldingsDetail'>;
type HoldingsDetailNavigationProp = NativeStackNavigationProp<RootStackParamList, 'HoldingsDetail'>;

export default function HoldingsDetailScreen() {
  const { token } = useAuth();
  const { isDark } = useTheme();
  const navigation = useNavigation<HoldingsDetailNavigationProp>();
  const route = useRoute<HoldingsDetailRouteProp>();
  const insets = useSafeAreaInsets();
  const colors = getColors(isDark);
  const styles = createStyles(colors, isDark);

  const { ticker } = route.params;
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch holdings data
        const holdingsResponse = await api.get<Holdings>(
          `/assets/${ticker}/holdings`,
          token
        );
        setHoldings(holdingsResponse);

        // Fetch position data
        try {
          const positionsResponse = await api.get<{ positions: Position[] }>(
            '/positions/',
            token
          );
          const userPosition = positionsResponse.positions?.find(
            (p: Position) => p.ticker.toUpperCase() === ticker.toUpperCase()
          );
          if (userPosition) {
            setPosition(userPosition);
          }
        } catch (posErr) {
          // Position data is optional, don't fail if it's not available
          console.warn('Could not fetch position data:', posErr);
        }
      } catch (err: any) {
        console.error('Error fetching holdings:', err);
        setError(err.message || 'Failed to load holdings');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, ticker]);

  const handleClose = () => {
    navigation.goBack();
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <BackButton onPress={handleClose} />
          <Text style={styles.title}>My Holdings • {ticker}</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.orange} />
        </View>
      </View>
    );
  }

  if (error || !holdings) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <BackButton onPress={handleClose} />
          <Text style={styles.title}>My Holdings • {ticker}</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || 'No holdings data available'}</Text>
        </View>
      </View>
    );
  }

  const hasPosition = holdings.shares > 0;
  const unrealizedGainLoss = position?.unrealized_gain_loss;
  const unrealizedGainLossPercent = position?.unrealized_gain_loss_percent;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton onPress={handleClose} />
        <Text style={styles.title}>My Holdings • {ticker}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Current Holdings Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Current Holdings</Text>
          
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Shares Held</Text>
              <Text style={styles.summaryValue}>
                {hasPosition ? holdings.shares.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '0'}
              </Text>
            </View>
            
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Market Value</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(holdings.position_amount || 0)}
              </Text>
            </View>
          </View>

          {position && (
            <>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Cost Basis</Text>
                  <Text style={styles.summaryValue}>
                    {formatCurrency(position.cost_basis)}
                  </Text>
                </View>
                
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Avg Cost/Share</Text>
                  <Text style={styles.summaryValue}>
                    {position.average_cost_per_share 
                      ? formatCurrency(position.average_cost_per_share)
                      : 'N/A'}
                  </Text>
                </View>
              </View>

              {position.current_price_per_share && (
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Current Price</Text>
                    <Text style={styles.summaryValue}>
                      {formatCurrency(position.current_price_per_share)}
                    </Text>
                  </View>
                  
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Unrealized P&L</Text>
                    <Text style={[
                      styles.summaryValue,
                      unrealizedGainLoss !== undefined && unrealizedGainLoss >= 0
                        ? styles.positiveValue
                        : styles.negativeValue
                    ]}>
                      {unrealizedGainLoss !== undefined 
                        ? `${unrealizedGainLoss >= 0 ? '+' : ''}${formatCurrency(unrealizedGainLoss)}`
                        : 'N/A'}
                    </Text>
                    {unrealizedGainLossPercent !== undefined && (
                      <Text style={[
                        styles.summaryPercent,
                        unrealizedGainLossPercent >= 0
                          ? styles.positiveValue
                          : styles.negativeValue
                      ]}>
                        {unrealizedGainLossPercent >= 0 ? '+' : ''}{unrealizedGainLossPercent.toFixed(2)}%
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* Dividends Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Dividends</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Dividends Earned</Text>
              <Text style={[styles.summaryValue, styles.positiveValue]}>
                {formatCurrency(holdings.total_dividends || 0)}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof getColors>, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: isDark 
      ? ((colors as any).glassBackground || 'rgba(255, 255, 255, 0.7)')
      : 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: isDark ? 1 : 0,
    borderColor: (colors as any).glassBorder || 'rgba(255, 255, 255, 0.3)',
    shadowColor: (colors as any).glassShadowGlow || '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDark ? ((colors as any).glassShadowGlow ? 0.04 : 0.12) : 0.12,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
  },
  summaryPercent: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginTop: 2,
  },
  positiveValue: {
    color: colors.green,
  },
  negativeValue: {
    color: colors.red,
  },
});

