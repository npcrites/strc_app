import React, { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
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
const MARGIN = 16;

export default function CustomTabBar({
  state,
  descriptors,
  navigation,
}: CustomTabBarProps) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  
  // === STATE (single source of truth) ===
  const [positionIndex, setPositionIndex] = useState<number>(0); // 0 = left, 1 = right
  const [containerWidth, setContainerWidth] = useState<number>(200);
  const [isLayoutMeasured, setIsLayoutMeasured] = useState<boolean>(false);
  
  // === REFS (transient only) ===
  const translateX = useRef(new Animated.Value(MARGIN)).current;
  const isAnimating = useRef(false);
  const dragStartX = useRef(0);
  const isDragging = useRef(false);
  const latestMeasuredWidth = useRef<number>(200); // Track most recent measured width
  const skipNextEffect = useRef(false); // Skip useEffect after drag completes

  // Load saved position on mount
  useEffect(() => {
    const loadPosition = async () => {
      try {
        const savedPosition = await AsyncStorage.getItem(TAB_BAR_POSITION_KEY);
        if (savedPosition !== null) {
          const index = parseInt(savedPosition, 10);
          setPositionIndex(index);
          console.log('📍 Loaded saved position from storage:', index === 0 ? 'left' : 'right');
        }
      } catch (error) {
        console.error('Failed to load tab bar position:', error);
      }
    };
    loadPosition();
  }, []);

  // Calculate target X based on positionIndex and containerWidth
  const getTargetX = useCallback((): number => {
    if (positionIndex === 0) {
      console.log('📍 getTargetX: LEFT =', MARGIN);
      return MARGIN;
    } else {
      const rightX = screenWidth - containerWidth - MARGIN;
      console.log('📍 getTargetX: RIGHT =', rightX, '(', screenWidth, '-', containerWidth, '-', MARGIN, ')');
      return rightX;
    }
  }, [positionIndex, screenWidth, containerWidth]);

  // Helper to calculate target X for a given index (used in release handler)
  const calculateTargetX = useCallback((index: number, width: number): number => {
    if (index === 0) {
      return MARGIN;
    } else {
      return screenWidth - width - MARGIN;
    }
  }, [screenWidth]);

  // Animation effect: watches positionIndex, animates when it changes
  useEffect(() => {
    // CRITICAL: Check skipNextEffect FIRST, before any other checks
    // This must be the absolute first check to prevent any interference
    if (skipNextEffect.current) {
      console.log('⏳ BLOCKED: useEffect skipped - drag just completed, using direct animation');
      return; // Exit immediately, don't do anything
    }

    if (!isLayoutMeasured) {
      console.log('⏳ Skipping animation - layout not measured yet');
      return;
    }

    // Don't animate if we're currently dragging (user is in control)
    if (isDragging.current) {
      console.log('⏳ Skipping animation - user is dragging');
      return;
    }

    // Don't animate if we're already animating (prevent double animations)
    if (isAnimating.current) {
      console.log('⏳ Skipping animation - already animating');
      return;
    }

    const targetX = getTargetX();
    
    // Stop any ongoing animation first
    translateX.stopAnimation();
    
    console.log('🎬 Starting animation to:', positionIndex === 0 ? 'left' : 'right', 'targetX:', targetX);

    isAnimating.current = true;
    Animated.spring(translateX, {
      toValue: targetX,
      useNativeDriver: true,
      tension: 100, // Increased for snappier animation
      friction: 15, // Reduced for faster animation
    }).start(() => {
      isAnimating.current = false;
      // Ensure final position is exactly correct
      const finalX = getTargetX();
      translateX.setValue(finalX);
      console.log('✅ Animation complete, final position:', finalX);
    });
  }, [positionIndex, isLayoutMeasured, getTargetX, translateX]);

  // Save position to storage
  const savePosition = useCallback(async (index: number) => {
    try {
      await AsyncStorage.setItem(TAB_BAR_POSITION_KEY, index.toString());
      console.log('💾 Saved position to storage:', index === 0 ? 'left' : 'right');
    } catch (error) {
      console.error('Failed to save tab bar position:', error);
    }
  }, []);

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

  // PanResponder for dragging
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt, gestureState) => {
          return Math.abs(gestureState.dx) > 10;
        },
        onMoveShouldSetPanResponder: (evt, gestureState) => {
          return (
            Math.abs(gestureState.dx) > 10 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
          );
        },
        onPanResponderGrant: () => {
          translateX.stopAnimation((value) => {
            dragStartX.current = value;
          });
          isDragging.current = true;
          isAnimating.current = false;
          console.log('🔄 Drag started from x:', dragStartX.current);
        },
        onPanResponderMove: (evt, gestureState) => {
          if (isDragging.current) {
            const newX = dragStartX.current + gestureState.dx;
            const minX = 0;
            const maxX = screenWidth - containerWidth;
            const constrainedX = Math.max(minX, Math.min(maxX, newX));
            translateX.setValue(constrainedX);
          }
        },
        onPanResponderRelease: () => {
          // Get current position and stop any animation
          let currentX = 0;
          translateX.stopAnimation((value) => {
            currentX = value;
          });
          
          // Use the most recently measured width (always up-to-date)
          const widthToUse = latestMeasuredWidth.current || containerWidth;
          
          // Calculate which side to snap to
          const screenCenterX = screenWidth / 2;
          const tabBarCenterX = currentX + widthToUse / 2;
          
          console.log('🎯 Release decision:', {
            tabBarCenterX,
            screenCenterX,
            'tabBarCenterX < screenCenterX': tabBarCenterX < screenCenterX,
            currentX,
            containerWidth,
            latestMeasuredWidth: latestMeasuredWidth.current,
            widthToUse,
            screenWidth,
          });

          const newIndex = tabBarCenterX < screenCenterX ? 0 : 1;
          
          // Calculate target X using helper function with most recent width
          const targetX = calculateTargetX(newIndex, widthToUse);
          
          // Verify the calculation
          const expectedRightEdge = screenWidth - MARGIN;
          const actualRightEdge = targetX + widthToUse;
          const isCorrect = newIndex === 0 || Math.abs(actualRightEdge - expectedRightEdge) < 1;

          console.log('📌 Snapping to:', newIndex === 0 ? 'LEFT' : 'RIGHT', {
            targetX,
            screenWidth,
            containerWidth,
            widthToUse,
            MARGIN,
            calculation: newIndex === 0 
              ? `LEFT: ${MARGIN}`
              : `RIGHT: ${screenWidth} - ${widthToUse} - ${MARGIN} = ${targetX}`,
            'Right edge will be at': newIndex === 1 ? `${actualRightEdge} (should be ${expectedRightEdge}, diff: ${Math.abs(actualRightEdge - expectedRightEdge)})` : 'N/A',
            'Calculation correct': isCorrect,
          });
          
          if (!isCorrect && newIndex === 1) {
            console.error('❌ RIGHT SIDE CALCULATION ERROR!', {
              screenWidth,
              widthToUse,
              MARGIN,
              targetX,
              actualRightEdge,
              expectedRightEdge,
            });
          }

          // Mark dragging as false BEFORE starting animation
          isDragging.current = false;
          
          // CRITICAL: Set flag to skip useEffect BEFORE any state updates
          // This must happen before setPositionIndex is called
          skipNextEffect.current = true;
          console.log('🚫 Set skipNextEffect = true to block useEffect');

          // Update state IMMEDIATELY (before animation) so positionIndex is correct
          // But skipNextEffect will prevent useEffect from running
          console.log('🔄 Updating state to:', newIndex === 0 ? 'LEFT' : 'RIGHT', 'BEFORE animation');
          setPositionIndex(newIndex);
          savePosition(newIndex);

          // Start animation immediately (don't wait for useEffect)
          isAnimating.current = true;
          Animated.spring(translateX, {
            toValue: targetX,
            useNativeDriver: true,
            tension: 100,
            friction: 15,
          }).start(() => {
            isAnimating.current = false;
            
            // Get current animated value
            let finalX = targetX;
            translateX.stopAnimation((value) => {
              finalX = value;
            });
            
            // Verify final position is correct
            const expectedX = targetX;
            const isPositionCorrect = Math.abs(finalX - expectedX) < 1;
            
            // Ensure final position is exactly correct
            translateX.setValue(targetX);
            console.log('✅ Snap animation complete', {
              finalPosition: targetX,
              animatedValue: finalX,
              isPositionCorrect,
              side: newIndex === 0 ? 'LEFT' : 'RIGHT',
              'skipNextEffect still': skipNextEffect.current,
            });
            
            if (!isPositionCorrect) {
              console.error('❌ Position mismatch after animation!', {
                expected: targetX,
                actual: finalX,
                diff: Math.abs(finalX - expectedX),
              });
            }
            
            // Keep skipNextEffect true for a bit longer to ensure useEffect doesn't run
            // Reset it after React has fully processed the state update
            setTimeout(() => {
              skipNextEffect.current = false;
              console.log('🔄 Reset skipNextEffect flag (after', 100, 'ms)');
            }, 100);
          });
        },
      }),
    [screenWidth, containerWidth, translateX, savePosition, calculateTargetX]
  );

  // Measure container width on layout
  const handleLayout = useCallback((event: any) => {
    const { width } = event.nativeEvent.layout;
    
    // Always update the ref with the latest measured width
    latestMeasuredWidth.current = width;

    if (!isLayoutMeasured) {
      // First measurement
      console.log('📏 First layout measurement:', width);
      setContainerWidth(width);
      setIsLayoutMeasured(true);
      
      // Set initial animated value based on positionIndex
      const initialX = positionIndex === 0 ? MARGIN : screenWidth - width - MARGIN;
      translateX.setValue(initialX);
      console.log('📍 Set initial position:', positionIndex === 0 ? 'LEFT' : 'RIGHT', 'x:', initialX);
      return;
    }

    // Subsequent measurements (e.g., rotation)
    const widthDiff = Math.abs(containerWidth - width);
    if (widthDiff > 5 && !isDragging.current && !isAnimating.current) {
      console.log('📏 Width changed:', containerWidth, '→', width);
      setContainerWidth(width);
      // The animation effect will re-run and adjust position
    }
  }, [isLayoutMeasured, containerWidth, positionIndex, screenWidth, translateX]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: Math.max(insets.bottom, 12) + 16,
          left: 0,
        },
        {
          transform: [{ translateX }],
        },
      ]}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
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
                  isFocused
                    ? styles.tabButtonActive
                    : styles.tabButtonInactive,
                ]}
              >
                <Text
                  style={[
                    styles.tabIcon,
                    isFocused
                      ? styles.tabIconActive
                      : styles.tabIconInactive,
                  ]}
                >
                  {tab?.icon || '•'}
                </Text>
                <Text
                  style={[
                    styles.tabLabel,
                    isFocused
                      ? styles.tabLabelActive
                      : styles.tabLabelInactive,
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
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  dragHandle: {
    position: 'absolute',
    top: -20,
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
    backgroundColor: Colors.backgroundGrey,
  },
  tabButtonInactive: {
    backgroundColor: Colors.backgroundWhite,
  },
  tabIcon: {
    fontSize: 20,
  },
  tabIconActive: {
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
    color: '#007AFF',
  },
  tabLabelInactive: {
    color: Colors.textPrimary,
  },
});