/**
 * Color constants matching the Lovable design
 * Supports both light and dark themes
 */

const lightColors = {
  // Primary colors
  orange: '#f7931a',
  orangeLight: '#FFE5DD',
  green: '#2DD4BF', // Match dark mode - Teal green for gains/positive
  greenLight: '#E8F5E9',
  greenDark: '#2E8B57', // Green for gains/increases
  red: '#D32F2F', // Match dark mode - Muted red for losses/negative
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
  
  // Border & Input colors (light mode - not used but for consistency)
  border: '#E0E0E0',
  input: '#E0E0E0',
  ring: '#f7931a',
  
  // Glass/Glassmorphism effects (light mode)
  glassBackground: 'rgba(255, 255, 255, 0.7)',
  glassBorder: 'rgba(255, 255, 255, 0.3)',
  glassShadowGlow: undefined, // No glow in light mode
};

const darkColors = {
  // Primary colors - warm orange accent
  orange: '#FF7A2E', // hsl(25, 95%, 53%) - Vibrant orange for charts/CTAs
  orangeLight: '#FFE5DD',
  green: '#2DD4BF', // hsl(152, 60%, 50%) - Teal green for success/positive
  greenLight: '#E8F5E9',
  greenDark: '#2E8B57',
  red: '#D32F2F', // hsl(0, 62%, 45%) - Muted red for errors/destructive
  redLight: '#FFEBEE',
  redDark: '#B71C1C',
  
  // Text colors - warm off-white
  textPrimary: '#F2EDE8', // hsl(30, 10%, 95%) - Warm off-white
  textSecondary: '#8B7D6B', // hsl(25, 8%, 55%) - Warm gray for secondary text
  textTertiary: '#6B5F52',
  
  // Background colors - warm dark grays
  background: '#141210', // hsl(20, 10%, 7%) - Very dark warm gray, almost black
  backgroundWhite: '#1C1A18', // hsl(20, 8%, 11%) - Card/Popover
  backgroundGrey: '#292622', // hsl(20, 8%, 16%) - Elevated surface color
  backgroundAccent: '#2E2B26', // hsl(20, 8%, 18%) - Interactive element backgrounds
  backgroundMuted: '#38352F', // hsl(20, 6%, 22%) - Subdued backgrounds
  
  // Card colors (dark variants)
  cardYellow: '#2A2418',
  cardYellowBorder: '#4A3D2A',
  
  // Chart colors - warm orange
  chartOrange: '#FF7A2E', // hsl(25, 95%, 53%) - Vibrant orange
  chartOrangeGradient: '#FFE5DD',
  
  // Asset colors
  assetBlack: '#F2EDE8',
  assetOrange: '#FF7A2E',
  assetGrey: '#8B7D6B',
  assetGreyLight: '#6B5F52',
  assetGreen: '#2DD4BF',
  
  // Border & Input colors
  border: '#332F2A', // hsl(20, 6%, 20%) - Subtle warm gray borders
  input: '#332F2A', // hsl(20, 6%, 20%) - Form input borders
  ring: '#D4B8A3', // hsl(25, 15%, 75%) - Focus ring color
  
  // Glass/Glassmorphism effects
  glassBackground: '#1C1A18', // hsl(20, 8%, 11%) - Card/Popover solid color
  glassBorder: 'rgba(70, 64, 56, 0.5)', // hsla(25, 6%, 28%, 0.5) - Subtle warm border
  glassShadowGlow: '#CC6A1F', // hsl(25, 80%, 40%) - Orange glow
};

// Default export for light theme (backward compatibility)
export const Colors = lightColors;

// Function to get colors based on theme
export const getColors = (isDark: boolean) => {
  return isDark ? darkColors : lightColors;
};

