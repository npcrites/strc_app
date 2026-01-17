import React, { useRef } from 'react';
import { TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getColors } from '../constants/colors';

export interface ExportButtonProps {
  onPress: () => void;
}

export default function ExportButton({ onPress }: ExportButtonProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const styles = createStyles(colors);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.exportButtonContainer,
        {
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={styles.touchableArea}
      >
        <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const createStyles = (colors: ReturnType<typeof getColors>) => {
  const isDark = (colors as any).glassShadowGlow !== undefined;
  return StyleSheet.create({
    exportButtonContainer: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: isDark 
        ? ((colors as any).glassBackground || 'rgba(255, 255, 255, 0.7)') 
        : 'rgba(255, 255, 255, 0.95)', // 0.7 opacity in light mode
      // Soft shadow with orange glow in dark mode (subtle glow)
      shadowColor: (colors as any).glassShadowGlow || '#000',
      shadowOffset: {
        width: 0,
        height: 8,
      },
      shadowOpacity: isDark ? ((colors as any).glassShadowGlow ? 0.04 : 0.12) : 0.12, // Subtle glow matching TimeRangeSelector
      shadowRadius: 8, // Reduced for subtle glow
      elevation: 4, // Reduced for subtle glow
      // Glass-like border (only in dark mode)
      borderWidth: isDark ? 1 : 0,
      borderColor: (colors as any).glassBorder || 'rgba(255, 255, 255, 0.3)',
      overflow: 'hidden', // Ensure border is visible
    },
    touchableArea: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
};

