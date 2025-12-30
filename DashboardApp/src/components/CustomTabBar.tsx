import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';

interface Tab {
  name: string;
  label: string;
  icon: string;
}

interface CustomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

const tabs: Tab[] = [
  { name: 'Home', label: 'Home', icon: '🏠' },
  { name: 'Activity', label: 'Activity', icon: '📊' },
];

export default function CustomTabBar({
  state,
  descriptors,
  navigation,
}: CustomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 12);

  // Memoize focused route to avoid unnecessary re-renders
  const focusedRoute = useMemo(
    () => state.routes[state.index],
    [state.routes, state.index]
  );

  const handlePress = useCallback(
    (route: any, isFocused: boolean) => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    },
    [navigation]
  );

  const handleLongPress = useCallback(
    (route: any) => {
      navigation.emit({
        type: 'tabLongPress',
        target: route.key,
      });
    },
    [navigation]
  );

  return (
    <View
      style={[
        styles.container,
        {
          bottom: Math.max(bottomPadding, 16),
          left: 16,
        },
      ]}
    >
      <View style={styles.tabBar}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const tab = tabs.find((t) => t.name === route.name);

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarTestID}
              onPress={() => handlePress(route, isFocused)}
              onLongPress={() => handleLongPress(route)}
              style={styles.tabButton}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.tabButtonInner,
                  isFocused ? styles.tabButtonActive : styles.tabButtonInactive,
                ]}
              >
                <Text
                  style={[
                    styles.tabIcon,
                    isFocused ? styles.tabIconActive : styles.tabIconInactive,
                  ]}
                >
                  {tab?.icon || '•'}
                </Text>
                <Text
                  style={[
                    styles.tabLabel,
                    isFocused ? styles.tabLabelActive : styles.tabLabelInactive,
                  ]}
                >
                  {tab?.label || route.name}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    backgroundColor: Colors.backgroundWhite,
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 8,
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    // Elevation for Android
    elevation: 8,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    minWidth: 90,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: Colors.backgroundGrey, // Light gray background for active
  },
  tabButtonInactive: {
    backgroundColor: Colors.backgroundWhite, // White background for inactive
  },
  tabIcon: {
    fontSize: 20,
  },
  tabIconActive: {
    // Blue color for active icon
    color: '#007AFF',
  },
  tabIconInactive: {
    color: Colors.textPrimary,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  tabLabelActive: {
    // Blue color for active label
    color: '#007AFF',
  },
  tabLabelInactive: {
    color: Colors.textPrimary,
  },
});

