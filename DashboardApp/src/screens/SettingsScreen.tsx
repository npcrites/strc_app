import React, { useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getColors } from '../constants/colors';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { logout, user } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const Colors = getColors(isDark);

  const handleLogout = async () => {
    await logout();
  };

  // Ensure header is never shown (prevents default back arrow from appearing)
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
      headerBackVisible: false,
      headerLeft: () => null,
      header: () => null,
    });
  }, [navigation]);

  const styles = createStyles(Colors);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        {/* Settings Options */}
        <View style={styles.settingsSection}>
          {/* Dark Mode Toggle */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Dark Mode</Text>
              <Text style={styles.settingDescription}>
                Switch between light and dark theme
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: getColors(isDark).backgroundGrey, true: getColors(isDark).orange }}
              thumbColor={getColors(isDark).backgroundWhite}
              ios_backgroundColor={getColors(isDark).backgroundGrey}
            />
          </View>

          {/* User Info */}
          {user && (
            <View style={styles.userSection}>
              <Text style={styles.userSectionTitle}>Account</Text>
              <View style={styles.userInfoRow}>
                <Text style={styles.userInfoLabel}>Email:</Text>
                <Text style={styles.userInfoValue}>{user.email}</Text>
              </View>
            </View>
          )}

          {/* Logout Button */}
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// Note: Styles will be updated dynamically based on theme
// For now, using static styles - in a full implementation, 
// styles would be generated based on the current theme
const createStyles = (colors: ReturnType<typeof getColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    paddingVertical: 8,
    paddingLeft: 0,
    paddingRight: 4,
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 24,
    color: colors.orange,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  settingsSection: {
    paddingHorizontal: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.backgroundGrey,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  userSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.backgroundGrey,
  },
  userSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  userInfoRow: {
    flexDirection: 'row',
    paddingVertical: 12,
  },
  userInfoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginRight: 8,
  },
  userInfoValue: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  logoutButton: {
    marginTop: 32,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: colors.backgroundGrey,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.red,
  },
});

