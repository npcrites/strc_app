import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getColors } from '../constants/colors';
import { formatCurrency } from '../utils/formatters';
import BackButton from '../components/BackButton';
import MSTRSymbol from '../components/MSTRSymbol';
import ASSTSymbol from '../components/ASSTSymbol';
import { hasMSTRParent, hasASTTParent } from '../utils/assetUtils';

type RootStackParamList = {
  ReviewOrder: {
    ticker: string;
    mode: 'buy' | 'sell';
    amount: number;
    sharesAmount: number;
    currentPrice: number;
    orderType: 'smart' | 'one-time' | 'recurring' | 'custom';
  };
};

type ReviewOrderRouteProp = RouteProp<RootStackParamList, 'ReviewOrder'>;
type ReviewOrderNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ReviewOrder'>;

const orderTypeLabelMap: Record<RootStackParamList['ReviewOrder']['orderType'], string> = {
  smart: 'Smart Schedule',
  'one-time': 'One-time order',
  recurring: 'Recurring order',
  custom: 'Custom',
};

const availabilityLabelMap: Record<RootStackParamList['ReviewOrder']['orderType'], string> = {
  smart: 'Optimized cadence',
  'one-time': 'Instantly',
  recurring: 'Scheduled',
  custom: 'Custom rules',
};

export default function ReviewOrderScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<ReviewOrderNavigationProp>();
  const insets = useSafeAreaInsets();
  const route = useRoute<ReviewOrderRouteProp>();
  const { ticker, mode, amount, sharesAmount, currentPrice, orderType } = route.params;

  const titleAction = mode === 'buy' ? 'Buy' : 'Sell';
  const formattedPrice = currentPrice ? formatCurrency(currentPrice) : '—';
  const formattedAmount = formatCurrency(amount);
  const formattedShares = sharesAmount > 0 ? sharesAmount.toFixed(8) : '0';

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 24) + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.assetIcon}>
            {hasMSTRParent(ticker) ? (
              <MSTRSymbol size={44} color={colors.orange} />
            ) : hasASTTParent(ticker) ? (
              <ASSTSymbol size={44} />
            ) : (
              <Text style={styles.assetIconText}>{ticker.charAt(0)}</Text>
            )}
          </View>
          <Text style={styles.heroTitle}>
            {titleAction} {formattedAmount} of {ticker}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>{ticker} price {formattedPrice}</Text>
            <Ionicons name="information-circle" size={16} color={colors.textSecondary} />
          </View>
        </View>

        <View style={styles.glassCard}>
          <Text style={styles.cardTitle}>Order details</Text>
          <View style={styles.summaryRows}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Order type</Text>
              <Text style={styles.summaryValue}>{orderTypeLabelMap[orderType]}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Receive</Text>
              <Text style={styles.summaryValue}>
                {formattedShares} {ticker}
              </Text>
            </View>
            <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Shares Available</Text>
              <View style={styles.summaryValueRow}>
                <Ionicons name="flash" size={16} color={colors.green} />
                <Text style={[styles.summaryValue, styles.summaryValuePositive]}>
                  {availabilityLabelMap[orderType]}
                </Text>
              </View>
            </View>
          </View>
        </View>



      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.totalRow}>
          <View>
            <View style={styles.totalLabelRow}>
              <Text style={styles.totalLabel}>{formattedAmount} total</Text>
              <Ionicons name="information-circle" size={14} color={colors.textSecondary} />
            </View>
            <Text style={styles.totalSubtext}>incl. 1.00% spread + $0.39 fee</Text>
          </View>
          <View style={styles.accountPill}>
            <Ionicons name="shield-checkmark" size={14} color={colors.orange} />
            <Text style={styles.accountPillText}>*** 3665</Text>
            <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
          </View>
        </View>
        <TouchableOpacity style={styles.placeOrderButton} activeOpacity={0.8}>
          <Text style={styles.placeOrderText}>Place order</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof getColors>, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 24,
  },
  assetIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  assetIconText: {
    fontSize: 32,
    fontFamily: 'ChakraPetch-Bold',
    color: colors.orange,
  },
  heroTitle: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priceLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
  },
  glassCard: {
    backgroundColor: isDark ? ((colors as any).glassBackground || colors.backgroundWhite) : 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? ((colors as any).glassBorder || 'rgba(70, 64, 56, 0.5)') : 'transparent',
    shadowColor: (colors as any).glassShadowGlow || '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: isDark ? ((colors as any).glassShadowGlow ? 0.04 : 0.12) : 0.12,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  summaryRows: {},
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  summaryLabel: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
  },
  summaryValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryValuePositive: {
    color: colors.green,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
    backgroundColor: colors.background,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
  },
  totalSubtext: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
    marginTop: 4,
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: isDark ? colors.backgroundGrey : colors.border,
  },
  accountPillText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
  },
  placeOrderButton: {
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.orange,
  },
  placeOrderText: {
    fontSize: 17,
    fontFamily: 'Inter-Bold',
    color: colors.backgroundWhite,
  },
});
