import React, { useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Platform,
  TouchableOpacity,
  PanResponder,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const TAB_BAR_POSITION_KEY = '@tab_bar_position';
const SNAP_THRESHOLD = 50; // Distance from edge to trigger snap

export default function CustomTabBar({
  state,
  descriptors,
  navigation,
}: CustomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 12);
  const screenWidth = Dimensions.get('window').width;
  
  // Calculate snap positions (left and right)
  const leftPosition = 16;
  const rightPosition = screenWidth - 16; // Will be adjusted by tab bar width
  
  // Measure container width (will be updated after first render)
  const containerWidth = useRef(200); // Initial estimate
  
  // Position state (0 = left, 1 = right)
  const positionIndex = useRef(0);
  const translateX = useRef(new Animated.Value(leftPosition)).current;

  // Load saved position on mount
  useEffect(() => {
    const loadPosition = async () => {
      try {
        const savedPosition = await AsyncStorage.getItem(TAB_BAR_POSITION_KEY);
        if (savedPosition !== null) {
          const index = parseInt(savedPosition, 10);
          positionIndex.current = index;
          // Calculate actual right position after we know container width
          const rightPos = screenWidth - containerWidth.current - 16;
          translateX.setValue(index === 0 ? leftPosition : rightPos);
        }
      } catch (error) {
        console.error('Failed to load tab bar position:', error);
      }
    };
    loadPosition();
  }, []);

  // Save position preference
  const savePosition = useCallback(async (index: number) => {
    try {
      await AsyncStorage.setItem(TAB_BAR_POSITION_KEY, index.toString());
    } catch (error) {
      console.error('Failed to save tab bar position:', error);
    }
  }, []);

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

  // Track drag state
  const dragStartX = useRef(0);
  const isDragging = useRef(false);
  
  // PanResponder for dragging - use useMemo to ensure fresh closures
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt, gestureState) => {
          // Only start if horizontal movement is significant
          return Math.abs(gestureState.dx) > 10;
        },
        onMoveShouldSetPanResponder: (evt, gestureState) => {
          // Start dragging if horizontal movement exceeds threshold
          return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        },
        onPanResponderGrant: (evt) => {
          // Store starting position
          translateX.stopAnimation((value) => {
            dragStartX.current = value;
          });
          isDragging.current = true;
          console.log('🔄 Drag started');
        },
        onPanResponderMove: (evt, gestureState) => {
          if (isDragging.current) {
            // Calculate new position
            const newX = dragStartX.current + gestureState.dx;
            
            // Constrain to screen bounds
            const minX = 0;
            const width = containerWidth.current || 200; // Fallback if not measured yet
            const maxX = screenWidth - width;
            translateX.setValue(Math.max(minX, Math.min(maxX, newX)));
          }
        },
        onPanResponderRelease: (evt, gestureState) => {
          isDragging.current = false;
          let currentX = 0;
          translateX.stopAnimation((value) => {
            currentX = value;
          });
          
          const width = containerWidth.current || 200; // Fallback if not measured yet
          const centerX = screenWidth / 2;
          
          // Determine which side to snap to based on current position
          let targetIndex: number;
          let targetX: number;
          
          // Check if we're closer to left or right side
          if (currentX < centerX) {
            targetIndex = 0;
            targetX = leftPosition;
          } else {
            targetIndex = 1;
            // Right position: screen width - container width - right margin
            const rightMargin = 16;
            targetX = screenWidth - width - rightMargin;
            console.log('📐 Right snap calculation:', {
              screenWidth,
              containerWidth: width,
              rightMargin,
              targetX,
              currentX,
              centerX,
            });
          }
          
          // Animate to target position
          Animated.spring(translateX, {
            toValue: targetX,
            useNativeDriver: true,
            tension: 90,
            friction: 20,
          }).start();
          
          // Update position index and save
          positionIndex.current = targetIndex;
          savePosition(targetIndex);
          console.log('✅ Drag ended, snapped to:', targetIndex === 0 ? 'left' : 'right', 'at x:', targetX, 'from x:', currentX);
        },
      }),
    [screenWidth, leftPosition, savePosition]
  );

  // Animated style for the container
  const animatedStyle = {
    transform: [{ translateX }],
  };

  // Measure container width on layout
  const handleLayout = useCallback((event: any) => {
    const { width } = event.nativeEvent.layout;
    containerWidth.current = width;
    console.log('📏 Container width measured:', width, 'screenWidth:', screenWidth);
    
    // Update position if we're on the right side
    if (positionIndex.current === 1) {
      const rightPos = screenWidth - width - 16;
      translateX.setValue(rightPos);
      console.log('📍 Setting right position:', rightPos);
    }
  }, [screenWidth]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: Math.max(bottomPadding, 16),
          left: 0, // Start from left edge, use translateX for positioning
        },
        animatedStyle,
      ]}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      {/* Drag handle area - invisible but captures drag gestures */}
      <View style={styles.dragHandle} />
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
    </Animated.View>
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
  dragHandle: {
    position: 'absolute',
    top: -20, // Extend beyond container
    left: -20,
    right: -20,
    bottom: -20,
    zIndex: 0,
    backgroundColor: 'transparent',
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
  tabButtonPressed: {
    opacity: 0.7,
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

