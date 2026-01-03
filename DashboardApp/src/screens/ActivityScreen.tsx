import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { dashboardApi } from '../services/dashboard';
import { DashboardSnapshot, ActivityItem, ActivityType } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { Colors } from '../constants/colors';

export default function ActivityScreen() {
  const { token, loading: authLoading, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      return;
    }
    
    // If no token, set loading to false and show error
    if (!token) {
      setLoading(false);
      setError('Please log in to view your activity');
      return;
    }
    
    // Load dashboard when token is available
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authLoading]);

  const loadDashboard = async () => {
    if (!token) {
      setLoading(false);
      setError('Authentication required');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      console.log('Loading activity with time range: ALL');
      const snapshot = await dashboardApi.getSnapshot(token, {
        time_range: 'ALL',
      });
      console.log('Activity loaded successfully');
      setData(snapshot);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load activity';
      console.error('Activity load error:', err);
      setError(errorMessage);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // Separate upcoming and recent activities
  const upcomingDividends = data?.activity.filter(
    (item) => item.activity_type === ActivityType.UPCOMING_DIVIDEND
  ) || [];
  
  const recentActivities = data?.activity.filter(
    (item) => item.activity_type !== ActivityType.UPCOMING_DIVIDEND
  ) || [];

  // Sort upcoming by pay date (ascending)
  upcomingDividends.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Sort recent by timestamp (descending)
  recentActivities.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const getActivityIcon = (type: ActivityType) => {
    switch (type) {
      case ActivityType.DIVIDEND:
      case ActivityType.UPCOMING_DIVIDEND:
        return '$';
      case ActivityType.BUY:
        return '↑';
      case ActivityType.SELL:
        return '↓';
      default:
        return '•';
    }
  };

  const getActivityIconColor = (type: ActivityType) => {
    switch (type) {
      case ActivityType.DIVIDEND:
      case ActivityType.UPCOMING_DIVIDEND:
        return Colors.orange;
      case ActivityType.BUY:
        return Colors.green;
      case ActivityType.SELL:
        return Colors.red;
      default:
        return Colors.textSecondary;
    }
  };

  const getActivityDescription = (item: ActivityItem) => {
    switch (item.activity_type) {
      case ActivityType.DIVIDEND:
        return `Dividend ${item.ticker || ''}`;
      case ActivityType.UPCOMING_DIVIDEND:
        return 'Upcoming dividend';
      case ActivityType.BUY:
        return `Bought ${item.ticker || ''}`;
      case ActivityType.SELL:
        return `Sold ${item.ticker || ''}`;
      default:
        return 'Activity';
    }
  };

  const formatExDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Show loading spinner while auth is loading or activity is loading (initial load only)
  if (authLoading || (loading && !data)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.orange} />
        <Text style={styles.loadingText}>Loading activity...</Text>
      </View>
    );
  }

  // Show error if no token or other error
  if (error && !data) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        {token && (
          <TouchableOpacity onPress={loadDashboard} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.backgroundWhite} />
      <ScrollView 
        style={styles.container} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 80 }}
      >
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 20 }]}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Activity</Text>
            <TouchableOpacity onPress={logout} style={styles.logoutButton}>
              <Text style={styles.logoutButtonText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

      {/* UPCOMING Section */}
      {upcomingDividends.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>UPCOMING</Text>
          {upcomingDividends.map((item, index) => (
            <View key={index} style={styles.upcomingCard}>
              <View style={styles.upcomingCardLeft}>
                <View
                  style={[
                    styles.upcomingIcon,
                    { backgroundColor: Colors.cardYellow },
                  ]}
                >
                  <Text style={styles.upcomingIconText}>⏰</Text>
                </View>
                <View style={styles.upcomingCardContent}>
                  <View style={styles.upcomingCardHeader}>
                    <Text style={styles.upcomingTicker}>
                      {item.ticker || 'N/A'}
                    </Text>
                    {item.ex_date && (
                      <View style={styles.exDateTag}>
                        <Text style={styles.exDateTagText}>
                          Ex: {formatExDate(item.ex_date)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.upcomingDescription}>
                    {getActivityDescription(item)}
                  </Text>
                </View>
              </View>
              <View style={styles.upcomingCardRight}>
                <Text style={styles.upcomingAmount}>
                  {formatCurrency(item.dividend_amount)}
                </Text>
                <Text style={styles.upcomingDate}>
                  {formatDate(item.timestamp)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* RECENT Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>RECENT</Text>
        {recentActivities.length === 0 ? (
          <Text style={styles.emptyText}>No recent activity</Text>
        ) : (
          recentActivities.map((item, index) => (
            <View key={index} style={styles.recentItem}>
              <View
                style={[
                  styles.recentIcon,
                  { backgroundColor: getActivityIconColor(item.activity_type) + '20' },
                ]}
              >
                <Text
                  style={[
                    styles.recentIconText,
                    { color: getActivityIconColor(item.activity_type) },
                  ]}
                >
                  {getActivityIcon(item.activity_type)}
                </Text>
              </View>
              <View style={styles.recentContent}>
                <Text style={styles.recentTicker}>
                  {item.ticker || 'N/A'}
                </Text>
                <Text style={styles.recentDescription}>
                  {getActivityDescription(item)}
                </Text>
              </View>
              <View style={styles.recentRight}>
                {item.activity_type === ActivityType.DIVIDEND ? (
                  <Text style={styles.recentAmountPositive}>
                    +{formatCurrency(item.dividend_amount)}
                  </Text>
                ) : (
                  <Text style={styles.recentAmount}>
                    {formatCurrency(item.value || 0)}
                  </Text>
                )}
                <Text style={styles.recentDate}>
                  {formatDate(item.timestamp)}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.orange,
    borderRadius: 8,
  },
  retryButtonText: {
    color: Colors.backgroundWhite,
    fontWeight: '600',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Colors.backgroundGrey,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  upcomingCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.cardYellow,
    borderWidth: 1,
    borderColor: Colors.cardYellowBorder,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  upcomingCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  upcomingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  upcomingIconText: {
    fontSize: 20,
    color: Colors.textPrimary,
  },
  upcomingCardContent: {
    flex: 1,
  },
  upcomingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  upcomingTicker: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginRight: 8,
  },
  exDateTag: {
    backgroundColor: Colors.cardYellowBorder,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  exDateTagText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  upcomingDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  upcomingCardRight: {
    alignItems: 'flex-end',
  },
  upcomingAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  upcomingDate: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.backgroundGrey,
  },
  recentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recentIconText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  recentContent: {
    flex: 1,
  },
  recentTicker: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  recentDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  recentRight: {
    alignItems: 'flex-end',
  },
  recentAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  recentAmountPositive: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.green,
    marginBottom: 4,
  },
  recentDate: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: 16,
    color: Colors.red,
    textAlign: 'center',
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
