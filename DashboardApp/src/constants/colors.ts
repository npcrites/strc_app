/**
 * Color constants matching the Lovable design
 * Supports both light and dark themes
 */

const lightColors = {
  // Primary colors
  orange: '#f7931a',
  orangeLight: '#FFE5DD',
  green: '#4CAF50',
  greenLight: '#E8F5E9',
  greenDark: '#2E8B57', // Green for gains/increases
  red: '#F44336',
  redLight: '#FFEBEE',
  redDark: '#D20A2E', // Red for losses/decreases
  
  // Text colors
  textPrimary: '#000000',
  textSecondary: '#666666',
  textTertiary: '#999999',
  
  // Background colors
  background: '#FAFAFA',
  backgroundWhite: '#FFFFFF',
  backgroundGrey: '#F5F5F5',
  
  // Card colors
  cardYellow: '#FFF9E6',
  cardYellowBorder: '#FFE082',
  
  // Chart colors
  chartOrange: '#f7931a',
  chartOrangeGradient: '#FFE5DD',
  
  // Asset colors (for allocation)
  assetBlack: '#000000',
  assetOrange: '#f7931a',
  assetGrey: '#666666',
  assetGreyLight: '#CCCCCC',
  assetGreen: '#4CAF50',
};

const darkColors = {
  // Primary colors (same in dark mode)
  orange: '#f7931a',
  orangeLight: '#FFE5DD',
  green: '#4CAF50',
  greenLight: '#E8F5E9',
  greenDark: '#2E8B57',
  red: '#F44336',
  redLight: '#FFEBEE',
  redDark: '#D20A2E',
  
  // Text colors (inverted for dark mode)
  textPrimary: '#FFFFFF',
  textSecondary: '#CCCCCC',
  textTertiary: '#999999',
  
  // Background colors (dark variants)
  background: '#121212',
  backgroundWhite: '#1E1E1E',
  backgroundGrey: '#2A2A2A',
  
  // Card colors (dark variants)
  cardYellow: '#2A2418',
  cardYellowBorder: '#4A3D2A',
  
  // Chart colors (same)
  chartOrange: '#f7931a',
  chartOrangeGradient: '#FFE5DD',
  
  // Asset colors (same)
  assetBlack: '#FFFFFF',
  assetOrange: '#f7931a',
  assetGrey: '#999999',
  assetGreyLight: '#666666',
  assetGreen: '#4CAF50',
};

// Default export for light theme (backward compatibility)
export const Colors = lightColors;

// Function to get colors based on theme
export const getColors = (isDark: boolean) => {
  return isDark ? darkColors : lightColors;
};

