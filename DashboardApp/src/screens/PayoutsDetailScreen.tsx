import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { formatCurrency, formatDateShort, formatDate } from '../utils/formatters';
import { getColors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import BackButton from '../components/BackButton';
import MSTRSymbol from '../components/MSTRSymbol';
import ASSTSymbol from '../components/ASSTSymbol';
import { hasMSTRParent, hasASTTParent } from '../utils/assetUtils';
import { Holdings } from '../types';

type RootStackParamList = {
  PayoutsDetail: { ticker: string };
};

type PayoutsDetailRouteProp = RouteProp<RootStackParamList, 'PayoutsDetail'>;
type PayoutsDetailNavigationProp = NativeStackNavigationProp<RootStackParamList, 'PayoutsDetail'>;

interface PayoutItem {
  pay_date: string;
  pay_date_adjusted?: string | null;
  amount: number;
  ex_date?: string | null;
  invest_by_date?: string | null;
  status: string;
}

interface PayoutsResponse {
  ticker: string;
  next_payment?: PayoutItem | null;
  past_payouts: PayoutItem[];
}

export default function PayoutsDetailScreen() {
  const { token } = useAuth();
  const { isDark } = useTheme();
  const navigation = useNavigation<PayoutsDetailNavigationProp>();
  const route = useRoute<PayoutsDetailRouteProp>();
  const insets = useSafeAreaInsets();
  const { ticker } = route.params;

  const [payouts, setPayouts] = useState<PayoutsResponse | null>(null);
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const colors = getColors(isDark);
  const styles = createStyles(colors, isDark);

  useEffect(() => {
    fetchPayouts();
    fetchHoldings();
  }, [ticker]);

  const fetchPayouts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<PayoutsResponse>(`/assets/${ticker}/payouts`, token);
      setPayouts(response);
    } catch (err: any) {
      console.error('Error fetching payouts:', err);
      if (err.message === 'AUTHENTICATION_EXPIRED') {
        // Auth error is handled globally, just set a user-friendly error message
        setError('Session expired. Please log in again.');
      } else {
        setError(err.message || 'Failed to load payouts');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchHoldings = async () => {
    try {
      const response = await api.get<Holdings>(`/assets/${ticker}/holdings`, token);
      setHoldings(response);
    } catch (err: any) {
      console.error('Error fetching holdings:', err);
      // Don't set error - holdings fetch failure shouldn't block the screen
    }
  };

  const handleClose = () => {
    navigation.goBack();
  };

  const getDisplayDate = (payout: PayoutItem) => {
    return payout.pay_date_adjusted || payout.pay_date;
  };

  const formatDateForDisplay = (dateStr: string) => {
    return formatDate(dateStr);
  };

  const formatMonthYear = (dateStr: string): string => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  const groupPayoutsByMonth = (payouts: PayoutItem[]): Map<string, PayoutItem[]> => {
    const grouped = new Map<string, PayoutItem[]>();
    
    payouts.forEach((payout) => {
      const dateStr = getDisplayDate(payout);
      const monthYear = formatMonthYear(dateStr);
      
      if (!grouped.has(monthYear)) {
        grouped.set(monthYear, []);
      }
      grouped.get(monthYear)!.push(payout);
    });
    
    return grouped;
  };

  // Calculate totals
  const totalDividendsEarned = payouts?.past_payouts.reduce((sum, payout) => sum + payout.amount, 0) || 0;
  const payoutCount = payouts?.past_payouts.length || 0;

  // Determine payout frequency from stored dividend_frequency or fallback to ticker-based logic
  const getPayoutFrequency = (): string => {
    // Use stored dividend_frequency if available
    if (holdings?.dividend_frequency) {
      const freq = holdings.dividend_frequency.toLowerCase();
      if (freq === 'monthly') {
        return 'Monthly Dividend Payment';
      } else if (freq === 'quarterly') {
        return 'Quarterly Dividend Payment';
      } else if (freq === 'semi-annually') {
        return 'Semi-Annual Dividend Payment';
      } else if (freq === 'annually') {
        return 'Annual Dividend Payment';
      }
    }
    
    // Fallback to ticker-based logic for backwards compatibility
    const tickerUpper = ticker.toUpperCase();
    if (['STRC', 'SATA', 'STRF'].includes(tickerUpper)) {
      return 'Monthly Dividend Payment';
    }
    // Default to quarterly for other assets
    return 'Quarterly Dividend Payment';
  };

  // Check if we should show pending (between ex-date and pay-date)
  const shouldShowPending = (() => {
    if (!payouts?.next_payment) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day
    
    const nextPayment = payouts.next_payment;
    const exDate = nextPayment.ex_date ? new Date(nextPayment.ex_date) : null;
    const payDate = nextPayment.pay_date_adjusted 
      ? new Date(nextPayment.pay_date_adjusted)
      : nextPayment.pay_date 
        ? new Date(nextPayment.pay_date)
        : null;
    
    if (!exDate || !payDate) return false;
    
    exDate.setHours(0, 0, 0, 0);
    payDate.setHours(0, 0, 0, 0);
    
    // Show pending if today is >= ex_date and < pay_date
    return today >= exDate && today < payDate;
  })();

  const pendingAmount = shouldShowPending ? (payouts?.next_payment?.amount || 0) : 0;

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.header}>
          <BackButton onPress={handleClose} />
          <Text style={styles.title}>My Payouts • {ticker}</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.orange} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.header}>
          <BackButton onPress={handleClose} />
          <Text style={styles.title}>My Payouts • {ticker}</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchPayouts} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={styles.header}>
        <BackButton onPress={handleClose} />
        <Text style={styles.title}>My Payouts • {ticker}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Upcoming Payout */}
        {payouts?.next_payment && (
          <>
            <Text style={[styles.monthHeader, styles.firstMonthHeader]}>
              {formatMonthYear(getDisplayDate(payouts.next_payment))}
            </Text>
            <View style={styles.nextPaymentRow}>
              {/* Invest By Card */}
              {payouts.next_payment.invest_by_date && (
                <>
                  <View style={styles.payoutCard}>
                    <View style={styles.payoutIconContainer}>
                      <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                    </View>
                    <Text style={styles.payoutLabel}>Invest By</Text>
                    <Text style={styles.payoutDate}>
                      {formatDateShort(payouts.next_payment.invest_by_date!)}
                    </Text>
                  </View>
                  
                  {/* Divider */}
                  <View style={styles.payoutDividerContainer}>
                    <View style={styles.payoutDivider} />
                  </View>
                </>
              )}

              {/* Payday Card */}
              <View style={styles.payoutCard}>
                <View style={[styles.payoutIconContainer, styles.payoutIconContainerGreen]}>
                  <Text style={styles.payoutIconDollar}>$</Text>
                </View>
                <Text style={styles.payoutLabel}>Payday</Text>
                <Text style={styles.payoutDate}>
                  {payouts.next_payment.amount > 0
                    ? `${formatCurrency(payouts.next_payment.amount)} • ${formatDateShort(getDisplayDate(payouts.next_payment))}`
                    : formatDateShort(getDisplayDate(payouts.next_payment))
                  }
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Past Payouts Section */}
        {payouts?.past_payouts && payouts.past_payouts.length > 0 && (
          <>
            {Array.from(groupPayoutsByMonth(payouts.past_payouts).entries())
              .sort(([, monthPayoutsA], [, monthPayoutsB]) => {
                // Sort by date descending (newest first) using the first payout's date in each group
                const dateA = new Date(getDisplayDate(monthPayoutsA[0]));
                const dateB = new Date(getDisplayDate(monthPayoutsB[0]));
                return dateB.getTime() - dateA.getTime();
              })
              .map(([monthYear, monthPayouts]) => (
                <View key={monthYear}>
                  <Text style={styles.monthHeader}>{monthYear}</Text>
                  {monthPayouts.map((payout, index) => (
                    <TouchableOpacity 
                      key={index} 
                      style={styles.pastPayoutRow}
                      activeOpacity={0.7}
                    >
                      <View style={styles.pastPayoutLeft}>
                        {hasMSTRParent(ticker) ? (
                          <MSTRSymbol size={40} color={colors.orange} style={styles.assetSymbol} />
                        ) : hasASTTParent(ticker) ? (
                          <ASSTSymbol size={40} style={styles.assetSymbol} />
                        ) : (
                          <View style={[styles.assetPlaceholder, { backgroundColor: colors.backgroundGrey }]} />
                        )}
                        <View style={styles.pastPayoutTextContainer}>
                          <Text style={styles.pastPayoutAsset}>{ticker}</Text>
                          <Text style={styles.pastPayoutFrequency}>
                            {getPayoutFrequency()}
                          </Text>
                          <Text style={styles.pastPayoutDate}>
                            {formatDateForDisplay(getDisplayDate(payout))}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.pastPayoutRight}>
                        <Text style={styles.pastPayoutAmount}>
                          +{formatCurrency(payout.amount)}
                        </Text>
                        <Ionicons 
                          name="chevron-forward" 
                          size={16} 
                          color={colors.textSecondary} 
                          style={{ marginLeft: 8 }}
                        />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
          </>
        )}

        {/* Empty State */}
        {(!payouts?.next_payment && (!payouts?.past_payouts || payouts.past_payouts.length === 0)) && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No payouts available</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
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
      width: 40, // Match BackButton width for centering
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 40,
    },
    totalCard: {
      backgroundColor: isDark 
        ? ((colors as any).glassBackground || 'rgba(255, 255, 255, 0.7)') 
        : 'rgba(255, 255, 255, 0.95)',
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      position: 'relative',
      // Soft shadow with orange glow in dark mode (subtle glow)
      shadowColor: (colors as any).glassShadowGlow || '#000',
      shadowOffset: {
        width: 0,
        height: 8,
      },
      shadowOpacity: isDark ? ((colors as any).glassShadowGlow ? 0.04 : 0.12) : 0.12, // Subtle glow matching BackButton
      shadowRadius: 8, // Reduced for subtle glow
      elevation: 4, // Reduced for subtle glow
      // Glass-like border (only in dark mode)
      borderWidth: isDark ? 1 : 0,
      borderColor: (colors as any).glassBorder || 'rgba(255, 255, 255, 0.3)',
      overflow: 'hidden', // Ensure border is visible
    },
    totalCardLeft: {
      flex: 1,
    },
    totalLabel: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    totalAmount: {
      fontSize: 24,
      fontWeight: 'bold',
      fontFamily: 'ChakraPetch-Bold',
      color: colors.textPrimary,
    },
    totalCardRight: {
      alignItems: 'flex-end',
    },
    pendingLabel: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    pendingAmount: {
      fontSize: 18,
      fontWeight: 'bold',
      fontFamily: 'ChakraPetch-Bold',
      color: colors.orange,
    },
    nextPaymentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    payoutCard: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    payoutDividerContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 16,
    },
    payoutDivider: {
      width: 40,
      height: 1,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)', // Lighter grey divider
    },
    payoutIconContainer: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? colors.backgroundGrey : colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    payoutIconContainerGreen: {
      backgroundColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(45, 212, 191, 0.15)', // colors.green with opacity
    },
    payoutIconDollar: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.green, // Match gain/loss green color
    },
    payoutLabel: {
      fontSize: 13,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
      marginBottom: 6,
    },
    payoutDate: {
      fontSize: 14,
      fontWeight: '600',
      fontFamily: 'Inter-SemiBold',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    monthHeader: {
      fontSize: 22,
      fontWeight: 'bold',
      fontFamily: 'ChakraPetch-Bold',
      color: colors.textPrimary,
      marginTop: 24,
      marginBottom: 16,
    },
    firstMonthHeader: {
      marginTop: 0,
    },
    pastPayoutRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
    },
    pastPayoutLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    assetSymbol: {
      marginRight: 12,
    },
    assetPlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 12,
    },
    pastPayoutTextContainer: {
      flex: 1,
      justifyContent: 'center',
    },
    pastPayoutAsset: {
      fontSize: 16,
      fontFamily: 'Inter-Medium',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    pastPayoutFrequency: {
      fontSize: 15,
      fontFamily: 'Inter-Medium',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    pastPayoutDate: {
      fontSize: 15,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
    },
    pastPayoutRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    pastPayoutAmount: {
      fontSize: 15,
      fontFamily: 'ChakraPetch-Bold',
      color: colors.green,
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
      paddingHorizontal: 20,
    },
    errorText: {
      fontSize: 16,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
      marginBottom: 16,
      textAlign: 'center',
    },
    retryButton: {
      paddingHorizontal: 24,
      paddingVertical: 12,
      backgroundColor: colors.orange,
      borderRadius: 8,
    },
    retryButtonText: {
      fontSize: 16,
      fontFamily: 'Inter-SemiBold',
      color: colors.backgroundWhite,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyText: {
      fontSize: 16,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
    },
  });
}

