import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

interface ASSTSymbolProps {
  size?: number;
  style?: ViewStyle;
}

/**
 * ASST Symbol Component
 * Renders the ASST symbol for assets with ASST as parent (e.g., SATA)
 * Uses different colors for light and dark modes
 */
export default function ASSTSymbol({ 
  size = 40, 
  style 
}: ASSTSymbolProps) {
  const { isDark } = useTheme();
  
  // Scale factor to fit the viewBox (966 x 966) into the desired size
  const scale = size / 966; // Use height as reference for scaling
  const scaledWidth = 966 * scale;
  const scaledHeight = 966 * scale;

  // Light mode: black, Dark mode: white
  const fillColor = isDark ? "white" : "black";

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Svg
        width={scaledWidth}
        height={scaledHeight}
        viewBox="0 0 966 966"
        style={styles.svg}
      >
        <Path
          d="M268 277C268 272.582 271.582 269 276 269H726.704C732.049 269 735.891 274.142 734.376 279.268L708.895 365.472C707.89 368.872 704.768 371.204 701.223 371.204H276C271.582 371.204 268 367.623 268 363.204V277Z"
          fill={fillColor}
        />
        <Path
          d="M268 448.557C268 444.139 271.582 440.557 276 440.557H672.32C677.553 440.557 681.377 445.499 680.064 450.565L657.526 537.499C656.611 541.028 653.427 543.492 649.782 543.492H276C271.582 543.492 268 539.91 268 535.492V448.557Z"
          fill="#FE9A02"
        />
        <Path
          d="M268 628.146C268 623.727 271.582 620.146 276 620.146H726.808C732.122 620.146 735.959 625.231 734.501 630.341L708.857 720.196C707.877 723.631 704.737 726 701.165 726H276C271.582 726 268 722.418 268 718V628.146Z"
          fill={fillColor}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    alignSelf: 'center',
  },
});

