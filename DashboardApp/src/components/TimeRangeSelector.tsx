import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { getColors } from '../constants/colors';

export type TimeRange = '1W' | '1M' | '3M' | '1Y' | 'ALL';

export interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const TIME_RANGES: TimeRange[] = ['1W', '1M', '3M', '1Y', 'ALL'];

export default function TimeRangeSelector({
  value,
  onChange,
}: TimeRangeSelectorProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const styles = createStyles(colors, isDark);

  return (
    <View style={styles.outerContainer}>
      <View style={styles.timeRangeContainer}>
        <View style={styles.timeRangeButtons}>
          {TIME_RANGES.map((range) => (
            <TouchableOpacity
              key={range}
              style={[
                styles.timeRangeButton,
                value === range && styles.timeRangeButtonActive,
              ]}
              onPress={() => {
                if (value !== range) {
                  // Only trigger haptics when switching to a different timeframe
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                onChange(range);
              }}
            >
              <Text
                style={[
                  styles.timeRangeButtonText,
                  value === range && styles.timeRangeButtonTextActive,
                ]}
              >
                {range}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof getColors>, isDark: boolean) => StyleSheet.create({
  outerContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  timeRangeContainer: {
    backgroundColor: isDark ? ((colors as any).glassBackground || colors.backgroundWhite) : 'rgba(255, 255, 255, 0.95)', // Match chart component opacity in light mode
    borderRadius: 16,
    padding: 8,
    // Glass-like border (only in dark mode)
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? ((colors as any).glassBorder || 'rgba(70, 64, 56, 0.5)') : 'transparent', // Theme-aware border
    // Soft shadow with orange glow (only in dark mode)
    shadowColor: isDark ? ((colors as any).glassShadowGlow || '#CC6A1F') : '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: isDark ? 0.04 : 0.12, // Very subtle glow
    shadowRadius: 8, // Reduced further
    elevation: 4, // Reduced further
  },
  timeRangeButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  timeRangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    // No background for inactive buttons
  },
  timeRangeButtonActive: {
    backgroundColor: colors.textPrimary,
    // 3D shadow effect
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8, // Android shadow for 3D effect
  },
  timeRangeButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  timeRangeButtonTextActive: {
    color: colors.backgroundWhite,
    fontWeight: '600',
  },
});

