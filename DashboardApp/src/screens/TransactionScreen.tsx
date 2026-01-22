import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Platform,
  Easing,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { dashboardApi } from '../services/dashboard';
import { fetchAssetPriceHistory } from '../services/chartData';
import { formatCurrency } from '../utils/formatters';
import { getColors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { Holdings, Position } from '../types';
import MSTRSymbol from '../components/MSTRSymbol';
import ASSTSymbol from '../components/ASSTSymbol';
import { hasMSTRParent, hasASTTParent } from '../utils/assetUtils';
import Svg, { Path, Circle, Rect, G, Defs, LinearGradient, Stop, ClipPath } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

type RootStackParamList = {
  Transaction: { ticker: string; mode: 'buy' | 'sell'; currentPrice?: number };
};

type TransactionRouteProp = RouteProp<RootStackParamList, 'Transaction'>;
type TransactionNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Transaction'>;

// KeypadKey component with radial flash animation
interface KeypadKeyProps {
  label?: string;
  icon?: React.ReactNode;
  onPress: () => void;
  style?: any;
  textStyle?: any;
  colors: ReturnType<typeof getColors>;
  enableHoldToRepeat?: boolean; // Enable hold-to-repeat functionality
  repeatDelay?: number; // Delay before starting repeat (ms)
  repeatInterval?: number; // Interval between repeats (ms)
}

function KeypadKey({ 
  label, 
  icon, 
  onPress, 
  style, 
  textStyle, 
  colors,
  enableHoldToRepeat = false,
  repeatDelay = 500,
  repeatInterval = 100,
}: KeypadKeyProps) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [tapPosition, setTapPosition] = useState({ x: 0, y: 0 });
  const repeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initialDelayRef = useRef<NodeJS.Timeout | null>(null);
  const hasHandledPressRef = useRef(false);

  const handlePressIn = (event: any) => {
    const { locationX, locationY } = event.nativeEvent;
    setTapPosition({ x: locationX, y: locationY });
    
    // Reset animations
    scaleAnim.setValue(0);
    opacityAnim.setValue(1);
    
    // Animate scale and opacity
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 3,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // If hold-to-repeat is enabled, handle press here and prevent onPress from firing
    if (enableHoldToRepeat) {
      hasHandledPressRef.current = true;
      // Trigger initial press
      onPress();

      // Start repeating after initial delay
      initialDelayRef.current = setTimeout(() => {
        // Start repeating at specified interval
        repeatTimerRef.current = setInterval(() => {
          onPress();
        }, repeatInterval);
      }, repeatDelay);
    } else {
      hasHandledPressRef.current = false;
    }
  };

  const handlePressOut = () => {
    // Clear any pending timers
    if (initialDelayRef.current) {
      clearTimeout(initialDelayRef.current);
      initialDelayRef.current = null;
    }
    if (repeatTimerRef.current) {
      clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
    // Reset the flag after a short delay to allow onPress to fire if needed
    if (enableHoldToRepeat) {
      setTimeout(() => {
        hasHandledPressRef.current = false;
      }, 50);
    }
  };

  const handlePress = () => {
    // Only fire onPress if we haven't already handled it in onPressIn (for hold-to-repeat)
    if (!hasHandledPressRef.current) {
      onPress();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (initialDelayRef.current) {
        clearTimeout(initialDelayRef.current);
      }
      if (repeatTimerRef.current) {
        clearInterval(repeatTimerRef.current);
      }
    };
  }, []);

  return (
    <TouchableOpacity
      style={[style, { overflow: 'hidden' }]}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      {icon || <Text style={textStyle}>{label}</Text>}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.orange,
            left: tapPosition.x - 20,
            top: tapPosition.y - 20,
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
        pointerEvents="none"
      />
    </TouchableOpacity>
  );
}

// Cart Icon Component (for one-time order)
interface CartIconProps {
  size?: number;
  isDark?: boolean;
}

function CartIcon({ size = 24, isDark = false }: CartIconProps) {
  const aspectRatio = 184 / 184;
  const width = size * aspectRatio;
  
  if (isDark) {
    // Dark mode cart icon
    return (
      <Svg width={width} height={size} viewBox="0 0 184 184">
        <Defs>
          <LinearGradient id="cartDarkGrad0" x1="63.0998" y1="113.902" x2="83.4449" y2="120.898">
            <Stop offset="0" stopColor="#FFC19E" />
            <Stop offset="1" stopColor="#FF7B2F" />
          </LinearGradient>
          <LinearGradient id="cartDarkGrad1" x1="99.8135" y1="113.902" x2="120.159" y2="120.898">
            <Stop offset="0" stopColor="#FFC19E" />
            <Stop offset="1" stopColor="#FF7A2E" />
          </LinearGradient>
          <LinearGradient id="cartDarkGrad2" x1="120.528" y1="49.5734" x2="147.896" y2="59.9262">
            <Stop offset="0" stopColor="#FFC19E" />
            <Stop offset="1" stopColor="#FF8038" />
          </LinearGradient>
          <LinearGradient id="cartDarkGrad3" x1="86.0459" y1="61.1895" x2="143.832" y2="112.857">
            <Stop offset="0" stopColor="white" />
            <Stop offset="1" stopColor="white" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Circle cx="68.7088" cy="121.359" r="13.2577" fill="url(#cartDarkGrad0)" />
        <Circle cx="105.423" cy="121.359" r="13.2577" fill="url(#cartDarkGrad1)" />
        <Path
          fillRule="evenodd"
          d="M119.597 46.2194C120.671 43.8471 123.033 42.3228 125.637 42.3228H139.842C143.503 42.3228 146.471 45.2906 146.471 48.9516C146.471 52.6127 143.503 55.5805 139.842 55.5805H129.914L122.68 71.5705C121.171 74.906 117.244 76.3868 113.908 74.8779C110.573 73.3689 109.092 69.4416 110.601 66.106L119.597 46.2194Z"
          fill="url(#cartDarkGrad2)"
        />
        <Path
          d="M62.8911 61.4952H112.26C118.199 61.4952 122.62 61.4965 125.93 61.9767C129.233 62.4557 131.369 63.4038 132.792 65.2491C134.214 67.0944 134.587 69.401 134.21 72.7169C133.831 76.0408 132.707 80.3163 131.196 86.0597L126.365 104.416C125.425 107.986 124.727 110.638 123.931 112.657C123.138 114.669 122.26 116.021 120.978 117.009C119.696 117.997 118.165 118.502 116.018 118.757C113.863 119.013 111.121 119.014 107.429 119.014H67.7222C64.0307 119.014 61.2886 119.013 59.1333 118.757C56.9863 118.502 55.4549 117.997 54.1734 117.009C52.8918 116.021 52.0132 114.669 51.2202 112.657C50.4242 110.638 49.7252 107.986 48.7857 104.416L43.9556 86.0597C42.4442 80.3162 41.3192 76.0408 40.9409 72.7169C40.5636 69.401 40.9375 67.0944 42.3599 65.2491C43.7824 63.4038 45.9183 62.4557 49.2212 61.9767C52.5319 61.4966 56.9523 61.4952 62.8911 61.4952Z"
          fill="#FFC19E"
          fillOpacity="0.6"
          stroke="url(#cartDarkGrad3)"
          strokeWidth="0.611895"
        />
      </Svg>
    );
  }
  
  // Light mode cart icon
  return (
    <Svg width={width} height={size} viewBox="0 0 184 184">
      <Defs>
        <LinearGradient id="cartLightGrad0" x1="63.0998" y1="113.902" x2="83.4449" y2="120.898">
          <Stop offset="0" stopColor="#FFDAB1" />
          <Stop offset="1" stopColor="#F79422" />
        </LinearGradient>
        <LinearGradient id="cartLightGrad1" x1="99.8135" y1="113.902" x2="120.159" y2="120.898">
          <Stop offset="0" stopColor="#FFCC8F" />
          <Stop offset="1" stopColor="#F7931A" />
        </LinearGradient>
        <LinearGradient id="cartLightGrad2" x1="120.528" y1="49.5734" x2="147.896" y2="59.9262">
          <Stop offset="0" stopColor="#FFD9AF" />
          <Stop offset="1" stopColor="#F89E37" />
        </LinearGradient>
        <LinearGradient id="cartLightGrad3" x1="86.0459" y1="61.1895" x2="143.832" y2="112.857">
          <Stop offset="0" stopColor="white" />
          <Stop offset="1" stopColor="white" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Circle cx="68.7089" cy="121.359" r="13.2577" fill="url(#cartLightGrad0)" />
      <Circle cx="105.423" cy="121.359" r="13.2577" fill="url(#cartLightGrad1)" />
      <Path
        fillRule="evenodd"
        d="M119.597 46.2194C120.671 43.8471 123.033 42.3228 125.637 42.3228H139.842C143.503 42.3228 146.471 45.2906 146.471 48.9516C146.471 52.6127 143.503 55.5805 139.842 55.5805H129.914L122.68 71.5705C121.171 74.906 117.244 76.3868 113.908 74.8779C110.573 73.3689 109.092 69.4416 110.601 66.106L119.597 46.2194Z"
        fill="url(#cartLightGrad2)"
      />
      <Path
        d="M62.8911 61.4952H112.26C118.199 61.4952 122.62 61.4965 125.93 61.9767C129.233 62.4557 131.369 63.4038 132.792 65.2491C134.214 67.0944 134.587 69.401 134.209 72.7169C133.831 76.0408 132.707 80.3163 131.196 86.0597L126.365 104.416C125.425 107.986 124.727 110.638 123.931 112.657C123.138 114.669 122.26 116.021 120.978 117.009C119.696 117.997 118.165 118.502 116.018 118.757C113.863 119.013 111.121 119.014 107.429 119.014H67.7222C64.0307 119.014 61.2886 119.013 59.1333 118.757C56.9862 118.502 55.4549 117.997 54.1734 117.009C52.8918 116.021 52.0132 114.669 51.2202 112.657C50.4242 110.638 49.7252 107.986 48.7857 104.416L43.9556 86.0597C42.4442 80.3162 41.3192 76.0408 40.9409 72.7169C40.5636 69.401 40.9375 67.0944 42.3599 65.2491C43.7824 63.4038 45.9183 62.4557 49.2212 61.9767C52.5319 61.4966 56.9523 61.4952 62.8911 61.4952Z"
        fill="#FFD9AF"
        stroke="url(#cartLightGrad3)"
        strokeWidth="0.611895"
      />
    </Svg>
  );
}

// Calendar Icon Component (for recurring order)
interface CalendarIconProps {
  size?: number;
  isDark?: boolean;
}

function CalendarIcon({ size = 24, isDark = false }: CalendarIconProps) {
  const aspectRatio = 147 / 147;
  const width = size * aspectRatio;
  
  if (isDark) {
    // Dark mode calendar icon
    return (
      <Svg width={width} height={size} viewBox="0 0 147 147">
        <Defs>
          <LinearGradient id="calDarkGrad0" x1="16.5854" y1="62.457" x2="45.4882" y2="90.4133">
            <Stop offset="0" stopColor="#FFBA93" />
            <Stop offset="1" stopColor="#FF7A2E" />
          </LinearGradient>
          <LinearGradient id="calDarkGrad1" x1="38.6211" y1="25.6463" x2="59.4165" y2="49.4665">
            <Stop offset="0" stopColor="white" />
            <Stop offset="0.765625" stopColor="white" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="calDarkGrad2" x1="85.1897" y1="25.6463" x2="105.985" y2="49.4665">
            <Stop offset="0" stopColor="white" />
            <Stop offset="0.765625" stopColor="white" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="calDarkGrad3" x1="21.6569" y1="61.7606" x2="61.9266" y2="147.864">
            <Stop offset="0" stopColor="white" />
            <Stop offset="0.765625" stopColor="white" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="calDarkGrad4" x1="104.48" y1="72.2553" x2="95.9135" y2="110.193">
            <Stop offset="0" stopColor="white" stopOpacity="0" />
            <Stop offset="0.979167" stopColor="white" />
          </LinearGradient>
          <LinearGradient id="calDarkGrad5" x1="96.1664" y1="76.9666" x2="96.1664" y2="116.882">
            <Stop offset="0" stopColor="white" stopOpacity="0" />
            <Stop offset="1" stopColor="white" />
          </LinearGradient>
          <LinearGradient id="calDarkGrad6" x1="101.655" y1="96.4965" x2="95.5362" y2="128.315">
            <Stop offset="0" stopColor="white" stopOpacity="0" />
            <Stop offset="0.979167" stopColor="white" />
          </LinearGradient>
          <LinearGradient id="calDarkGrad7" x1="96.1664" y1="96.9245" x2="96.1664" y2="136.84">
            <Stop offset="0" stopColor="white" stopOpacity="0" />
            <Stop offset="1" stopColor="white" />
          </LinearGradient>
        </Defs>
        <Path
          d="M26.3138 57.8641C26.3138 52.0392 26.3138 49.1267 27.21 46.81C28.5618 43.3158 31.3242 40.5535 34.8184 39.2017C37.135 38.3054 40.0475 38.3054 45.8725 38.3054H99.8919C105.717 38.3054 108.629 38.3054 110.946 39.2017C114.44 40.5535 117.203 43.3158 118.554 46.81C119.451 49.1267 119.451 52.0392 119.451 57.8642V86.537H26.3138V57.8641Z"
          fill="url(#calDarkGrad0)"
        />
        <Rect x="39.925" y="24.0515" width="19.346" height="25.9986" rx="9.673" fill="#FFCFB4" stroke="url(#calDarkGrad1)" strokeWidth="0.611895" />
        <Rect x="86.4935" y="24.0515" width="19.346" height="25.9986" rx="9.673" fill="#FFCFB4" stroke="url(#calDarkGrad2)" strokeWidth="0.611895" />
        <Path
          d="M47.6019 57.3144H98.1624C101.893 57.3144 104.673 57.315 106.876 57.495C109.076 57.6748 110.674 58.0319 112.047 58.7314C114.493 59.9776 116.482 61.9662 117.728 64.412C118.427 65.7847 118.784 67.3833 118.964 69.5829C119.144 71.7862 119.145 74.5661 119.145 78.2968V91.6025C119.145 97.196 119.144 101.373 118.873 104.685C118.603 107.994 118.065 110.415 117.003 112.499C115.119 116.197 112.112 119.203 108.414 121.087C106.33 122.149 103.911 122.688 100.602 122.958C97.2892 123.229 93.1117 123.229 87.5179 123.229H58.2464C52.6528 123.229 48.476 123.229 45.1634 122.958C41.8543 122.688 39.4342 122.149 37.3499 121.087C33.6523 119.203 30.6461 116.197 28.762 112.499C27.7 110.415 27.1613 107.995 26.8909 104.685C26.6203 101.373 26.6194 97.196 26.6194 91.6025V78.2968C26.6194 74.5661 26.6201 71.7862 26.8001 69.5829C26.9798 67.3833 27.337 65.7847 28.0364 64.412C29.2827 61.9662 31.2713 59.9776 33.7171 58.7314C35.0898 58.0319 36.6884 57.6748 38.888 57.495C41.0913 57.315 43.8712 57.3144 47.6019 57.3144Z"
          fill="#FFCFB4"
          stroke="url(#calDarkGrad3)"
          strokeWidth="0.611895"
        />
        <Rect x="92.5953" y="77.2113" width="6.16312" height="39.4263" rx="3.08156" transform="rotate(90 92.5953 77.2113)" fill="url(#calDarkGrad4)" fillOpacity="0.9" stroke="url(#calDarkGrad5)" strokeWidth="0.489516" />
        <Rect x="92.5953" y="97.1693" width="6.16312" height="39.4263" rx="3.08156" transform="rotate(90 92.5953 97.1693)" fill="url(#calDarkGrad6)" fillOpacity="0.9" stroke="url(#calDarkGrad7)" strokeWidth="0.489516" />
      </Svg>
    );
  }
  
  // Light mode calendar icon
  return (
    <Svg width={width} height={size} viewBox="0 0 147 147">
      <Defs>
        <LinearGradient id="calLightGrad0" x1="17.5491" y1="60.7396" x2="46.4518" y2="88.696">
          <Stop offset="0" stopColor="#FFD6A4" />
          <Stop offset="1" stopColor="#F7931A" />
        </LinearGradient>
        <LinearGradient id="calLightGrad1" x1="39.5848" y1="23.929" x2="60.3802" y2="47.7492">
          <Stop offset="0" stopColor="white" />
          <Stop offset="0.765625" stopColor="white" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="calLightGrad2" x1="86.1534" y1="23.929" x2="106.949" y2="47.7492">
          <Stop offset="0" stopColor="white" />
          <Stop offset="0.765625" stopColor="white" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="calLightGrad3" x1="22.6206" y1="60.0433" x2="62.8903" y2="146.147">
          <Stop offset="0" stopColor="white" />
          <Stop offset="0.765625" stopColor="white" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="calLightGrad4" x1="105.444" y1="70.538" x2="96.8771" y2="108.475">
          <Stop offset="0" stopColor="white" stopOpacity="0" />
          <Stop offset="0.979167" stopColor="white" />
        </LinearGradient>
        <LinearGradient id="calLightGrad5" x1="97.1301" y1="75.2492" x2="97.1301" y2="115.165">
          <Stop offset="0" stopColor="white" stopOpacity="0" />
          <Stop offset="1" stopColor="white" />
        </LinearGradient>
        <LinearGradient id="calLightGrad6" x1="102.619" y1="94.7792" x2="96.4998" y2="126.598">
          <Stop offset="0" stopColor="white" stopOpacity="0" />
          <Stop offset="0.979167" stopColor="white" />
        </LinearGradient>
        <LinearGradient id="calLightGrad7" x1="97.1301" y1="95.2072" x2="97.1301" y2="135.123">
          <Stop offset="0" stopColor="white" stopOpacity="0" />
          <Stop offset="1" stopColor="white" />
        </LinearGradient>
      </Defs>
      <Path
        d="M27.2775 56.1468C27.2775 50.3218 27.2775 47.4094 28.1737 45.0927C29.5255 41.5985 32.2879 38.8361 35.782 37.4843C38.0987 36.5881 41.0112 36.5881 46.8362 36.5881H100.856C106.681 36.5881 109.593 36.5881 111.91 37.4843C115.404 38.8361 118.166 41.5985 119.518 45.0927C120.414 47.4094 120.414 50.3218 120.414 56.1468V84.8197H27.2775V56.1468Z"
        fill="url(#calLightGrad0)"
      />
      <Rect x="40.8887" y="22.3342" width="19.346" height="25.9986" rx="9.673" fill="#F7CDA8" stroke="url(#calLightGrad1)" strokeWidth="0.611895" />
      <Rect x="87.4572" y="22.3342" width="19.346" height="25.9986" rx="9.673" fill="#F7D0AC" stroke="url(#calLightGrad2)" strokeWidth="0.611895" />
      <Path
        d="M48.5656 55.597H99.1261C102.857 55.597 105.637 55.5977 107.84 55.7777C110.04 55.9574 111.638 56.3146 113.011 57.014C115.457 58.2603 117.445 60.2489 118.692 62.6947C119.391 64.0674 119.748 65.666 119.928 67.8656C120.108 70.0689 120.109 72.8488 120.109 76.5795V89.8851C120.109 95.4787 120.108 99.6555 119.837 102.968C119.567 106.277 119.029 108.697 117.967 110.782C116.083 114.479 113.076 117.485 109.378 119.37C107.294 120.431 104.874 120.97 101.566 121.241C98.2529 121.511 94.0754 121.512 88.4816 121.512H59.2101C53.6165 121.512 49.4397 121.511 46.1271 121.241C42.818 120.97 40.3979 120.432 38.3136 119.37C34.6159 117.485 31.6098 114.479 29.7257 110.782C28.6637 108.697 28.125 106.277 27.8546 102.968C27.584 99.6555 27.5831 95.4787 27.5831 89.8851V76.5795C27.5831 72.8488 27.5838 70.0689 27.7638 67.8656C27.9435 65.666 28.3007 64.0674 29.0001 62.6947C30.2464 60.2489 32.235 58.2603 34.6808 57.014C36.0535 56.3146 37.6521 55.9574 39.8517 55.7777C42.055 55.5977 44.8349 55.597 48.5656 55.597Z"
        fill="#FFD6A5"
        stroke="url(#calLightGrad3)"
        strokeWidth="0.611895"
      />
      <Rect x="93.559" y="75.494" width="6.16312" height="39.4263" rx="3.08156" transform="rotate(90 93.559 75.494)" fill="url(#calLightGrad4)" fillOpacity="0.9" stroke="url(#calLightGrad5)" strokeWidth="0.489516" />
      <Rect x="93.559" y="95.4519" width="6.16312" height="39.4263" rx="3.08156" transform="rotate(90 93.559 95.4519)" fill="url(#calLightGrad6)" fillOpacity="0.9" stroke="url(#calLightGrad7)" strokeWidth="0.489516" />
    </Svg>
  );
}

// Reusable snappy spring animation for slide-up modals
export const createSnappySpringAnimation = (
  animatedValue: Animated.Value,
  toValue: number,
  callback?: () => void
): Animated.CompositeAnimation => {
  return Animated.spring(animatedValue, {
    toValue,
    tension: 500,
    friction: 40,
    useNativeDriver: true,
  });
};

export default function TransactionScreen() {
  const { token } = useAuth();
  const { isDark } = useTheme();
  const navigation = useNavigation<TransactionNavigationProp>();
  const route = useRoute<TransactionRouteProp>();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('window').height;
  const modalHeight = useMemo(() => screenHeight * 0.85, [screenHeight]); // 85% of screen height
  
  const { ticker, mode, currentPrice } = route.params;
  
  const [amount, setAmount] = useState<string>('0');
  const [hasDecimal, setHasDecimal] = useState<boolean>(false);
  const [inputMode, setInputMode] = useState<'usd' | 'shares'>('usd');
  const [orderType, setOrderType] = useState<'one-time' | 'recurring'>('one-time');
  const [showOrderTypeModal, setShowOrderTypeModal] = useState(false);
  const [isModalAnimating, setIsModalAnimating] = useState(false);
  const [shouldRenderModal, setShouldRenderModal] = useState(false);
  const [showAssetSelectionModal, setShowAssetSelectionModal] = useState(false);
  const [isAssetModalAnimating, setIsAssetModalAnimating] = useState(false);
  const [shouldRenderAssetModal, setShouldRenderAssetModal] = useState(false);
  const [availableAssets, setAvailableAssets] = useState<Position[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [loading, setLoading] = useState(true);
  const [cursorVisible, setCursorVisible] = useState(true);
  const reviewOrderTranslateX = useRef(new Animated.Value(-1000)).current;
  const hasShownReviewButton = useRef(false);
  const orderTypeModalTranslateY = useRef(new Animated.Value(screenHeight)).current;
  const orderTypeModalOpacity = useRef(new Animated.Value(0)).current;
  const assetSelectionModalTranslateY = useRef(new Animated.Value(screenHeight)).current;
  const assetSelectionModalOpacity = useRef(new Animated.Value(0)).current;
  
  // Initialize modal position when modalHeight is calculated
  useEffect(() => {
    orderTypeModalTranslateY.setValue(modalHeight);
    assetSelectionModalTranslateY.setValue(modalHeight);
  }, [modalHeight, orderTypeModalTranslateY, assetSelectionModalTranslateY]);
  
  const colors = getColors(isDark);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  
  // Get current price - use from params or position
  const price = currentPrice || position?.current_price_per_share || 0;
  
  // Calculate values based on input mode
  const numericAmount = useMemo(() => {
    return parseFloat(amount.replace(/,/g, '')) || 0;
  }, [amount]);
  
  // Calculate asset amount (shares) and USD amount based on input mode
  const sharesAmount = useMemo(() => {
    if (inputMode === 'shares') {
      return numericAmount;
    } else {
      // USD mode: calculate shares from USD
      if (!price || price === 0) return 0;
      return numericAmount / price;
    }
  }, [numericAmount, price, inputMode]);
  
  const usdAmount = useMemo(() => {
    if (inputMode === 'usd') {
      return numericAmount;
    } else {
      // Shares mode: calculate USD from shares
      if (!price || price === 0) return 0;
      return numericAmount * price;
    }
  }, [numericAmount, price, inputMode]);
  
  // Format asset amount display
  const formattedAssetAmount = useMemo(() => {
    if (sharesAmount === 0) return '0';
    if (sharesAmount < 0.01) return sharesAmount.toFixed(8);
    if (sharesAmount < 1) return sharesAmount.toFixed(4);
    return sharesAmount.toFixed(2);
  }, [sharesAmount]);
  
  // Format USD amount with commas, preserving all decimal places
  const formattedUsdAmount = useMemo(() => {
    // Format the amount string directly to preserve all decimal places
    const cleaned = amount.replace(/,/g, '');
    
    if (cleaned === '0' || cleaned === '') {
      return '0';
    }
    
    if (cleaned.includes('.')) {
      // Has decimal point - preserve all decimal places
      const parts = cleaned.split('.');
      const integerPart = parts[0] || '0';
      const decimalPart = parts[1] || '';
      
      // Add commas to integer part
      const integerNum = parseInt(integerPart || '0', 10);
      const formattedInteger = integerNum.toLocaleString('en-US');
      
      return formattedInteger + '.' + decimalPart;
    } else {
      // No decimal point - format as integer
      const num = parseFloat(cleaned) || 0;
      return num.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    }
  }, [amount]);
  
  // Format shares amount with commas, preserving all decimal places
  const formattedSharesAmount = useMemo(() => {
    // Format the amount string directly to preserve all decimal places
    const cleaned = amount.replace(/,/g, '');
    
    // Allow display of decimal point and leading zeros (e.g., ".0001")
    // Only return '0' if the cleaned string is actually '0' or empty
    if (cleaned === '0' || cleaned === '') {
      return '0';
    }
    
    // If the string starts with '.' or has a decimal point, preserve it even if numeric value is 0
    if (cleaned.includes('.')) {
      // Has decimal point - preserve all decimal places
      const parts = cleaned.split('.');
      const integerPart = parts[0] || '0';
      const decimalPart = parts[1] || '';
      
      // Add commas to integer part only if it's not empty
      let formattedInteger = '0';
      if (integerPart && integerPart !== '0') {
        const integerNum = parseInt(integerPart || '0', 10);
        formattedInteger = integerNum.toLocaleString('en-US');
      } else if (integerPart === '') {
        // If integer part is empty (e.g., ".0001"), show "0"
        formattedInteger = '0';
      }
      
      // If integer part is empty or '0' and we have decimal digits, show "0." + decimalPart
      // Otherwise show formattedInteger + '.' + decimalPart
      if ((integerPart === '' || integerPart === '0') && decimalPart) {
        return '0.' + decimalPart;
      }
      
      return formattedInteger + '.' + decimalPart;
    } else {
      // No decimal point - format as integer
      const num = parseFloat(cleaned) || 0;
      return num.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    }
  }, [amount]);
  
  // Main display value based on input mode
  const formattedAmount = inputMode === 'usd' ? formattedUsdAmount : formattedSharesAmount;
  
  // Cursor blinking animation
  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, []);
  
  // Review order button swipe-in/out animation
  useEffect(() => {
    const numericAmount = parseFloat(amount.replace(/,/g, '')) || 0;
    const hasAmount = numericAmount > 0;
    
    if (hasAmount && !hasShownReviewButton.current) {
      // Swipe in from left to right - fast with subtle bounce
      reviewOrderTranslateX.setValue(-1000);
      Animated.spring(reviewOrderTranslateX, {
        toValue: 0,
        tension: 1000,
        friction: 35,
        useNativeDriver: true,
      }).start();
      hasShownReviewButton.current = true;
    } else if (!hasAmount && hasShownReviewButton.current) {
      // Reverse animation: swipe out to the right when amount goes to 0
      Animated.spring(reviewOrderTranslateX, {
        toValue: 1000,
        tension: 700,
        friction: 35,
        useNativeDriver: true,
      }).start(() => {
        // Reset flag after animation completes
        hasShownReviewButton.current = false;
      });
    }
  }, [amount, reviewOrderTranslateX]);
  
  // Order type modal animations
  useEffect(() => {
    if (showOrderTypeModal) {
      // Open modal with snappy spring animation
      setShouldRenderModal(true);
      setIsModalAnimating(true);
      orderTypeModalTranslateY.setValue(modalHeight); // Ensure starting from bottom
      const springAnim = createSnappySpringAnimation(orderTypeModalTranslateY, 0);
      const opacityAnim = Animated.timing(orderTypeModalOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      });
      Animated.parallel([springAnim, opacityAnim]).start(() => {
        setIsModalAnimating(false);
      });
    } else if (shouldRenderModal) {
      // Close modal with snappy spring animation
      setIsModalAnimating(true);
      const springAnim = createSnappySpringAnimation(orderTypeModalTranslateY, modalHeight);
      const opacityAnim = Animated.timing(orderTypeModalOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      });
      Animated.parallel([springAnim, opacityAnim]).start(() => {
        setIsModalAnimating(false);
        setShouldRenderModal(false); // Hide modal after animation completes
      });
    }
  }, [showOrderTypeModal, modalHeight, orderTypeModalTranslateY, orderTypeModalOpacity, shouldRenderModal]);

  // Asset selection modal animations
  useEffect(() => {
    if (showAssetSelectionModal) {
      // Open modal with snappy spring animation
      setShouldRenderAssetModal(true);
      setIsAssetModalAnimating(true);
      assetSelectionModalTranslateY.setValue(modalHeight); // Ensure starting from bottom
      const springAnim = createSnappySpringAnimation(assetSelectionModalTranslateY, 0);
      const opacityAnim = Animated.timing(assetSelectionModalOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      });
      Animated.parallel([springAnim, opacityAnim]).start(() => {
        setIsAssetModalAnimating(false);
      });
    } else if (shouldRenderAssetModal) {
      // Close modal with snappy spring animation
      setIsAssetModalAnimating(true);
      const springAnim = createSnappySpringAnimation(assetSelectionModalTranslateY, modalHeight);
      const opacityAnim = Animated.timing(assetSelectionModalOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      });
      Animated.parallel([springAnim, opacityAnim]).start(() => {
        setIsAssetModalAnimating(false);
        setShouldRenderAssetModal(false); // Hide modal after animation completes
      });
    }
  }, [showAssetSelectionModal, modalHeight, assetSelectionModalTranslateY, assetSelectionModalOpacity, shouldRenderAssetModal]);

  // Fetch available assets when modal opens
  useEffect(() => {
    if (showAssetSelectionModal && !assetsLoading) {
      const fetchAssets = async () => {
        if (!token) {
          console.log('No token available for fetching assets');
          return;
        }
        try {
          setAssetsLoading(true);
          console.log(`Fetching assets for ${mode} mode...`);
          
          if (mode === 'buy') {
            // For buy mode, use dashboard allocation to show all assets user has
            // Fallback to positions if allocation is empty
            try {
              const snapshot = await dashboardApi.getSnapshot(token, { time_range: 'ALL' });
              console.log('Dashboard allocation:', snapshot.allocation);
              console.log('Allocation length:', snapshot.allocation?.length || 0);
              
              // Also fetch positions to get names and accurate prices
              const positionsResponse = await api.get<{ positions: Position[] }>('/positions/', token);
              const positions = positionsResponse.positions || [];
              console.log('Positions for enrichment:', positions);
              
              // Use allocation if available, otherwise fall back to positions
              let assetsToShow: Position[] = [];
              
              if (snapshot.allocation && snapshot.allocation.length > 0) {
                // Convert allocation items to Position-like objects
                const positionsFromAllocation: Position[] = snapshot.allocation.map((item: { ticker: string; value: number; percent: number }) => ({
                  id: 0, // No ID for allocation items
                  ticker: item.ticker,
                  name: undefined, // Will be enriched from positions
                  shares: 0,
                  cost_basis: 0,
                  market_value: item.value,
                  current_price_per_share: undefined, // Will be fetched from price history
                }));
                
                // Enrich with position data (names)
                const enrichedWithNames = positionsFromAllocation.map((allocItem) => {
                  const position = positions.find(p => p.ticker === allocItem.ticker);
                  return {
                    ...allocItem,
                    name: position?.name,
                  };
                });
                
                // Fetch current prices from price history endpoint for each asset
                const assetsWithPrices = await Promise.all(
                  enrichedWithNames.map(async (asset) => {
                    try {
                      const priceHistory = await fetchAssetPriceHistory(asset.ticker, '1M', token, 'market');
                      return {
                        ...asset,
                        current_price_per_share: priceHistory.current_price || undefined,
                      };
                    } catch (err) {
                      console.warn(`Failed to fetch price for ${asset.ticker}:`, err);
                      return asset;
                    }
                  })
                );
                
                assetsToShow = assetsWithPrices;
              } else {
                // Fallback: use positions if allocation is empty
                console.log('Allocation empty, using positions instead');
                
                // Fetch current prices from price history endpoint for each position
                const positionsWithPrices = await Promise.all(
                  positions.map(async (position) => {
                    try {
                      const priceHistory = await fetchAssetPriceHistory(position.ticker, '1M', token, 'market');
                      return {
                        ...position,
                        current_price_per_share: priceHistory.current_price || position.current_price_per_share,
                      };
                    } catch (err) {
                      console.warn(`Failed to fetch price for ${position.ticker}:`, err);
                      return position;
                    }
                  })
                );
                
                assetsToShow = positionsWithPrices;
              }
              
              console.log('Final assets to show:', assetsToShow);
              console.log('Number of assets:', assetsToShow.length);
              setAvailableAssets(assetsToShow);
            } catch (snapshotErr) {
              console.error('Error fetching snapshot, falling back to positions:', snapshotErr);
              // Fallback to positions if snapshot fails
              const positionsResponse = await api.get<{ positions: Position[] }>('/positions/', token);
              const positions = positionsResponse.positions || [];
              console.log('Fallback positions:', positions);
              setAvailableAssets(positions);
            }
          } else {
            // For sell mode, only show positions user actually owns
            const positionsResponse = await api.get<{ positions: Position[] }>('/positions/', token);
            console.log('Raw positions response:', JSON.stringify(positionsResponse, null, 2));
            
            // Handle different response structures
            let positions: Position[] = [];
            if (positionsResponse) {
              if (Array.isArray(positionsResponse)) {
                positions = positionsResponse;
              } else if (positionsResponse.positions && Array.isArray(positionsResponse.positions)) {
                positions = positionsResponse.positions;
              }
            }
            
            console.log('Parsed positions array:', positions);
            console.log('Number of positions:', positions.length);
            
            // Fetch current prices from price history endpoint for each position
            const positionsWithPrices = await Promise.all(
              positions.map(async (position) => {
                try {
                  const priceHistory = await fetchAssetPriceHistory(position.ticker, '1M', token, 'market');
                  return {
                    ...position,
                    current_price_per_share: priceHistory.current_price || position.current_price_per_share,
                  };
                } catch (err) {
                  console.warn(`Failed to fetch price for ${position.ticker}:`, err);
                  return position;
                }
              })
            );
            
            setAvailableAssets(positionsWithPrices);
            
            if (positions.length === 0) {
              console.warn('No positions found. User may not have any positions to sell.');
            }
          }
        } catch (err: any) {
          console.error('Error fetching available assets:', err);
          console.error('Error details:', err.message, err.response);
          setAvailableAssets([]);
        } finally {
          setAssetsLoading(false);
        }
      };
      fetchAssets();
    } else if (!showAssetSelectionModal) {
      // Clear assets when modal closes to ensure fresh fetch next time
      setAvailableAssets([]);
    }
  }, [showAssetSelectionModal, token, mode]);
  
  const handleOrderTypeSelect = (type: 'one-time' | 'recurring') => {
    setOrderType(type);
    setShowOrderTypeModal(false);
  };

  const handleAssetSelect = (selectedTicker: string, selectedPrice?: number) => {
    // Update route params to change the ticker
    navigation.setParams({
      ticker: selectedTicker,
      mode,
      currentPrice: selectedPrice,
    });
    setShowAssetSelectionModal(false);
    // Reset amount when changing asset
    setAmount('0');
    setHasDecimal(false);
  };
  
  // Fetch holdings and position data
  useEffect(() => {
    if (!token) return;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch holdings
        const holdingsResponse = await api.get<Holdings>(`/assets/${ticker}/holdings`, token);
        setHoldings(holdingsResponse);
        
        // Fetch positions to get current price if not provided
        const positionsResponse = await api.get<{ positions: Position[] }>('/positions/', token);
        const matchingPosition = positionsResponse.positions.find(
          pos => pos.ticker?.toUpperCase() === ticker.toUpperCase()
        );
        setPosition(matchingPosition || null);
      } catch (err: any) {
        console.error('Error fetching transaction data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [token, ticker]);
  
  const handleKeyPress = (key: string) => {
    if (key === 'backspace') {
      // Light haptic feedback for backspace
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      setAmount((prev) => {
        const cleaned = prev.replace(/,/g, '');
        if (cleaned.length <= 1) {
          setHasDecimal(false);
          return '0';
        }
        const newAmount = cleaned.slice(0, -1);
        if (!newAmount.includes('.')) {
          setHasDecimal(false);
        }
        return newAmount;
      });
    } else if (key === '.') {
      // Light haptic feedback for decimal point
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      setAmount((prev) => {
        const cleaned = prev.replace(/,/g, '');
        if (cleaned.includes('.')) return prev;
        setHasDecimal(true);
        return cleaned + '.';
      });
    } else {
      // Light haptic feedback for number key presses
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      setAmount((prev) => {
        const cleaned = prev.replace(/,/g, '');
        const newAmount = cleaned === '0' ? key : cleaned + key;
        
        // Check decimal place limits based on input mode
        if (newAmount.includes('.')) {
          const parts = newAmount.split('.');
          const decimalPart = parts[1] || '';
          
          if (inputMode === 'usd') {
            // USD: max 2 decimal places (hundredths of cents)
            if (decimalPart.length > 2) {
              return prev;
            }
          } else {
            // Shares: max 8 decimal places
            if (decimalPart.length > 8) {
              return prev;
            }
          }
        }
        
        // Limit number of digits to prevent text wrapping
        // Count only digits (not decimal point)
        const digitCount = newAmount.replace(/\./g, '').replace(/[^0-9]/g, '').length;
        const maxDigits = 7; // Allow up to 7 digits (e.g., 9,999,999)
        
        if (digitCount > maxDigits) {
          // If exceeding max digits, don't add the new digit
          return prev;
        }
        
        return newAmount;
      });
    }
  };
  
  const handleQuickAmount = (amount: number) => {
    if (inputMode === 'usd') {
      // Quick amount is in USD
      setAmount(amount.toString());
      setHasDecimal(false);
    } else {
      // Quick amount is in USD, convert to shares
      if (price && price > 0) {
        const shares = amount / price;
        // Round to 8 decimal places to avoid floating point precision issues
        const roundedShares = Math.round(shares * 100000000) / 100000000;
        // Format with up to 8 decimal places, removing trailing zeros
        const sharesStr = roundedShares.toString();
        const parts = sharesStr.split('.');
        let formattedShares = sharesStr;
        if (parts[1] && parts[1].length > 8) {
          // Truncate to exactly 8 decimal places
          formattedShares = parts[0] + '.' + parts[1].substring(0, 8);
        }
        // Remove trailing zeros
        formattedShares = formattedShares.replace(/\.?0+$/, '') || parts[0] || '0';
        setAmount(formattedShares);
        setHasDecimal(roundedShares % 1 !== 0);
      }
    }
  };
  
  const handleMaxAmount = () => {
    // For sell mode, set to maximum available
    if (inputMode === 'usd') {
      const maxAmount = holdings?.position_amount || position?.market_value || 0;
      setAmount(maxAmount.toString());
      setHasDecimal(maxAmount % 1 !== 0);
    } else {
      // Max shares mode: get max shares available
      // Try to get shares directly from holdings, otherwise calculate from market value
      let maxShares = holdings?.position_amount || 0;
      if (maxShares === 0 && position?.market_value && price && price > 0) {
        maxShares = position.market_value / price;
      }
      setAmount(maxShares.toString());
      setHasDecimal(maxShares % 1 !== 0);
    }
  };
  
  const availableAmount = mode === 'sell' 
    ? (holdings?.position_amount || position?.market_value || 0)
    : 10000; // Placeholder limit for buy
  
  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()} 
            style={styles.closeButton}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.orderTypeButton} 
            activeOpacity={0.7}
            onPress={() => setShowOrderTypeModal(true)}
          >
            <Text style={styles.orderTypeText}>
              {orderType === 'one-time' ? 'One-time order' : 'Recurring order'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Content Area - Above Keypad */}
      <View style={styles.contentArea}>
        {/* Amount Display */}
        <View style={styles.amountSection}>
          <View style={styles.amountContainer}>
            <Text style={styles.amountValue} numberOfLines={1} adjustsFontSizeToFit={true} minimumFontScale={0.7}>{formattedAmount}</Text>
            <View style={[styles.cursor, { opacity: cursorVisible ? 1 : 0 }]} />
            <View style={styles.amountCurrencyContainer}>
              <Text 
                style={styles.amountCurrency} 
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.5}
              >
                {inputMode === 'usd' ? ' USD' : ` ${ticker}`}
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            onPress={() => {
              // Switch modes and convert the amount
              if (inputMode === 'usd') {
                // Switching to shares mode: convert USD to shares
                // Use the current numericAmount (USD value) to calculate shares
                if (numericAmount === 0) {
                  // If amount is 0, reset to clean 0 without decimals
                  setAmount('0');
                  setHasDecimal(false);
                } else if (price && price > 0) {
                  const shares = numericAmount / price;
                  // Round to 8 decimal places to avoid floating point precision issues
                  const roundedShares = Math.round(shares * 100000000) / 100000000;
                  // Format with up to 8 decimal places, removing trailing zeros
                  const sharesStr = roundedShares.toString();
                  const parts = sharesStr.split('.');
                  let formattedShares = sharesStr;
                  if (parts[1] && parts[1].length > 8) {
                    // Truncate to exactly 8 decimal places
                    formattedShares = parts[0] + '.' + parts[1].substring(0, 8);
                  }
                  // Remove trailing zeros
                  formattedShares = formattedShares.replace(/\.?0+$/, '') || parts[0] || '0';
                  setAmount(formattedShares);
                  setHasDecimal(roundedShares % 1 !== 0);
                }
                setInputMode('shares');
              } else {
                // Switching to USD mode: convert shares to USD
                // Use the computed usdAmount instead of recalculating from formatted string
                // This preserves precision from the original USD value
                if (usdAmount === 0) {
                  // If amount is 0, reset to clean 0 without decimals
                  setAmount('0');
                  setHasDecimal(false);
                } else {
                  // Round to 2 decimal places for USD (hundredths of cents)
                  const roundedUsd = Math.round(usdAmount * 100) / 100;
                  // Format with up to 2 decimal places, removing trailing zeros
                  const usdStr = roundedUsd.toString();
                  const parts = usdStr.split('.');
                  let formattedUsd = usdStr;
                  if (parts[1] && parts[1].length > 2) {
                    // Truncate to exactly 2 decimal places
                    formattedUsd = parts[0] + '.' + parts[1].substring(0, 2);
                  }
                  // Remove trailing zeros only if there's a decimal point
                  if (formattedUsd.includes('.')) {
                    formattedUsd = formattedUsd.replace(/\.?0+$/, '') || parts[0] || '0';
                  }
                  setAmount(formattedUsd);
                  setHasDecimal(roundedUsd % 1 !== 0);
                }
                setInputMode('usd');
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.assetAmount}>
              ↓↑ {inputMode === 'usd' ? `${formattedAssetAmount} ${ticker}` : formatCurrency(usdAmount)}
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Spacer to push details down */}
        <View style={styles.spacer} />
        
        {/* Transaction Details - Positioned above quick amount buttons */}
        <View style={styles.detailsSection}>
        {mode === 'buy' ? (
          <>
            {/* Pay with section */}
            <TouchableOpacity style={styles.detailRow} activeOpacity={0.7}>
              <View style={styles.detailLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons name="business" size={20} color={colors.textPrimary} />
                </View>
                <View style={styles.detailTextContainer}>
                  <Text style={styles.detailLabel}>Pay with</Text>
                  <Text style={styles.detailValue}>Checking ***3665</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            
            {/* Vertical line connector */}
            <View style={styles.verticalLine} />
            
            {/* Buy section */}
            <TouchableOpacity 
              style={styles.detailRow} 
              activeOpacity={0.7}
              onPress={() => setShowAssetSelectionModal(true)}
            >
              <View style={styles.detailLeft}>
                <View style={[styles.iconContainer, styles.assetIconContainer]}>
                  {hasMSTRParent(ticker) ? (
                    <MSTRSymbol 
                      size={28} 
                      color={colors.orange} 
                    />
                  ) : hasASTTParent(ticker) ? (
                    <ASSTSymbol 
                      size={28}
                    />
                  ) : (
                    <Text style={styles.assetIconText}>{ticker.charAt(0)}</Text>
                  )}
                </View>
                <View style={styles.detailTextContainer}>
                  <Text style={styles.detailLabel}>Buy</Text>
                  <Text style={styles.detailValue}>{ticker}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Sell From section */}
            <TouchableOpacity 
              style={styles.detailRow} 
              activeOpacity={0.7}
              onPress={() => setShowAssetSelectionModal(true)}
            >
              <View style={styles.detailLeft}>
                <View style={[styles.iconContainer, styles.assetIconContainer]}>
                  {hasMSTRParent(ticker) ? (
                    <MSTRSymbol 
                      size={28} 
                      color={colors.orange} 
                    />
                  ) : hasASTTParent(ticker) ? (
                    <ASSTSymbol 
                      size={28}
                    />
                  ) : (
                    <Text style={styles.assetIconText}>{ticker.charAt(0)}</Text>
                  )}
                </View>
                <View style={styles.detailTextContainer}>
                  <Text style={styles.detailLabel}>Sell</Text>
                  <Text style={styles.detailValue}>{ticker}</Text>
                </View>
              </View>
              <View style={styles.detailRight}>
                <Text style={styles.detailAmount}>{formatCurrency(availableAmount)}</Text>
                <View style={styles.detailSubtextRow}>
                  <Text style={styles.detailSubtext}>Available</Text>
                  <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} style={styles.infoIcon} />
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
            
            {/* Vertical line connector */}
            <View style={styles.verticalLine} />
            
            {/* To section */}
            <TouchableOpacity style={styles.detailRow} activeOpacity={0.7}>
              <View style={styles.detailLeft}>
                <View style={[styles.iconContainer, styles.cashIconContainer]}>
                  <Text style={styles.cashIconText}>$</Text>
                </View>
                <View style={styles.detailTextContainer}>
                  <Text style={styles.detailLabel}>To</Text>
                  <Text style={styles.detailValue}>Cash (USD)</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </>
        )}
        </View>
        
        {/* Quick Amount Buttons or Review Order Button */}
        <View style={styles.actionButtonContainer}>
          {(() => {
            const numericAmount = parseFloat(amount.replace(/,/g, '')) || 0;
            const hasAmount = numericAmount > 0;
            
            return (
              <>
                {/* Quick Amount Buttons - Always rendered but hidden when review button shows */}
                <View 
                  style={[
                    styles.quickAmountButtonsRow,
                    hasAmount && { opacity: 0, pointerEvents: 'none' }
                  ]}
                >
                  {mode === 'buy' ? (
                    <>
                      <TouchableOpacity 
                        style={styles.quickAmountButton} 
                        onPress={() => handleQuickAmount(100)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.quickAmountButtonText}>$100</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.quickAmountButton} 
                        onPress={() => handleQuickAmount(500)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.quickAmountButtonText}>$500</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.quickAmountButton} 
                        onPress={() => handleQuickAmount(1000)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.quickAmountButtonText}>$1,000</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity 
                        style={styles.quickAmountButton} 
                        onPress={() => handleQuickAmount(100)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.quickAmountButtonText}>$100</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.quickAmountButton} 
                        onPress={() => handleQuickAmount(500)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.quickAmountButtonText}>$500</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.quickAmountButton} 
                        onPress={handleMaxAmount}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.quickAmountButtonText}>Max</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
                
                {/* Review Order Button - Overlays when amount is entered */}
                {hasAmount && (
                  <Animated.View
                    style={[
                      styles.reviewOrderButtonContainer,
                      {
                        transform: [{ translateX: reviewOrderTranslateX }],
                      },
                    ]}
                  >
                    <TouchableOpacity 
                      style={styles.reviewOrderButton} 
                      onPress={() => {
                        // TODO: Handle review order
                        console.log('Review order pressed');
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.reviewOrderButtonText}>Review order</Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </>
            );
          })()}
        </View>
      </View>
      
      {/* Numeric Keypad - Full Width at Bottom */}
      <View style={[styles.keypadContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.keypadRow}>
          {[1, 2, 3].map((num) => (
            <KeypadKey
              key={num}
              label={num.toString()}
              onPress={() => handleKeyPress(num.toString())}
              style={styles.keypadKey}
              textStyle={styles.keypadKeyText}
              colors={colors}
            />
          ))}
        </View>
        <View style={styles.keypadRow}>
          {[4, 5, 6].map((num) => (
            <KeypadKey
              key={num}
              label={num.toString()}
              onPress={() => handleKeyPress(num.toString())}
              style={styles.keypadKey}
              textStyle={styles.keypadKeyText}
              colors={colors}
            />
          ))}
        </View>
        <View style={styles.keypadRow}>
          {[7, 8, 9].map((num) => (
            <KeypadKey
              key={num}
              label={num.toString()}
              onPress={() => handleKeyPress(num.toString())}
              style={styles.keypadKey}
              textStyle={styles.keypadKeyText}
              colors={colors}
            />
          ))}
        </View>
        <View style={styles.keypadRow}>
          <KeypadKey
            label="."
            onPress={() => handleKeyPress('.')}
            style={styles.keypadKey}
            textStyle={styles.keypadKeyText}
            colors={colors}
          />
          <KeypadKey
            label="0"
            onPress={() => handleKeyPress('0')}
            style={styles.keypadKey}
            textStyle={styles.keypadKeyText}
            colors={colors}
          />
          <KeypadKey
            icon={<Ionicons name="backspace-outline" size={24} color={colors.textPrimary} />}
            onPress={() => handleKeyPress('backspace')}
            style={styles.keypadKey}
            textStyle={styles.keypadKeyText}
            colors={colors}
            enableHoldToRepeat={true}
            repeatDelay={500}
            repeatInterval={100}
          />
        </View>
      </View>
      
      {/* Order Type Modal */}
      {shouldRenderModal && (
        <>
          {/* Backdrop */}
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowOrderTypeModal(false)}
          >
            <Animated.View
              style={[
                styles.modalBackdropOverlay,
                { opacity: orderTypeModalOpacity },
              ]}
            />
          </TouchableOpacity>
          
          {/* Modal Sheet */}
          <Animated.View
            style={[
              styles.orderTypeModal,
              {
                height: modalHeight,
                transform: [{ translateY: orderTypeModalTranslateY }],
                paddingBottom: Math.max(insets.bottom, 20),
              },
            ]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Order Type</Text>
              <TouchableOpacity
                style={[
                  styles.orderTypeOption,
                  orderType === 'one-time' && styles.orderTypeOptionSelected,
                ]}
                onPress={() => handleOrderTypeSelect('one-time')}
                activeOpacity={0.7}
              >
                <CartIcon size={56} isDark={isDark} />
                <View style={styles.orderTypeTextContainer}>
                  <Text
                    style={[
                      styles.orderTypeOptionText,
                      orderType === 'one-time' && styles.orderTypeOptionTextSelected,
                    ]}
                  >
                    One-time order
                  </Text>
                  <Text style={styles.orderTypeSubtext}>
                    Order will be executed near instantaneously at the current price
                  </Text>
                </View>
                <Ionicons 
                  name="chevron-forward" 
                  size={20} 
                  color={colors.textSecondary} 
                />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.orderTypeOption,
                  orderType === 'recurring' && styles.orderTypeOptionSelected,
                ]}
                onPress={() => handleOrderTypeSelect('recurring')}
                activeOpacity={0.7}
              >
                <CalendarIcon size={56} isDark={isDark} />
                <View style={styles.orderTypeTextContainer}>
                  <Text
                    style={[
                      styles.orderTypeOptionText,
                      orderType === 'recurring' && styles.orderTypeOptionTextSelected,
                    ]}
                  >
                    Recurring order
                  </Text>
                  <Text style={styles.orderTypeSubtext}>
                    Schedule orders to execute at customizable points in time on a recurring basis
                  </Text>
                </View>
                <Ionicons 
                  name="chevron-forward" 
                  size={20} 
                  color={colors.textSecondary} 
                />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </>
      )}

      {/* Asset Selection Modal */}
      {shouldRenderAssetModal && (
        <>
          {/* Backdrop */}
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowAssetSelectionModal(false)}
          >
            <Animated.View
              style={[
                styles.modalBackdropOverlay,
                { opacity: assetSelectionModalOpacity },
              ]}
            />
          </TouchableOpacity>
          
          {/* Modal Sheet */}
          <Animated.View
            style={[
              styles.orderTypeModal,
              {
                height: modalHeight,
                transform: [{ translateY: assetSelectionModalTranslateY }],
                paddingBottom: Math.max(insets.bottom, 20),
              },
            ]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Asset</Text>
              {assetsLoading ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Loading assets...</Text>
                </View>
              ) : availableAssets.length > 0 ? (
                <ScrollView 
                  style={styles.assetListContainer}
                  showsVerticalScrollIndicator={true}
                  contentContainerStyle={styles.assetListContent}
                >
                  {availableAssets.map((asset) => (
                    <TouchableOpacity
                      key={asset.ticker}
                      style={[
                        styles.assetOption,
                        ticker === asset.ticker && styles.assetOptionSelected,
                      ]}
                      onPress={() => handleAssetSelect(asset.ticker, asset.current_price_per_share)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.assetOptionLeft}>
                        <View style={[styles.assetSelectionIconContainer, styles.assetIconContainer]}>
                          {hasMSTRParent(asset.ticker) ? (
                            <MSTRSymbol 
                              size={40} 
                              color={colors.orange} 
                            />
                          ) : hasASTTParent(asset.ticker) ? (
                            <ASSTSymbol 
                              size={40}
                            />
                          ) : (
                            <Text style={styles.assetIconText}>{asset.ticker.charAt(0)}</Text>
                          )}
                        </View>
                        <View style={styles.assetOptionTextContainer}>
                          <Text style={styles.assetOptionName}>
                            {asset.name || asset.ticker}
                          </Text>
                          <Text style={styles.assetOptionTicker}>{asset.ticker}</Text>
                        </View>
                      </View>
                      <View style={styles.assetOptionRight}>
                        <Text style={styles.assetOptionPrice}>
                          {asset.current_price_per_share 
                            ? formatCurrency(asset.current_price_per_share)
                            : '—'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>No assets available</Text>
                  <Text style={[styles.loadingText, { marginTop: 8, fontSize: 14 }]}>
                    {mode === 'buy' 
                      ? 'You need to have at least one position to buy more shares.'
                      : 'You don\'t have any positions to sell.'}
                  </Text>
                  <Text style={[styles.loadingText, { marginTop: 8, fontSize: 12, opacity: 0.7 }]}>
                    Debug: availableAssets.length = {availableAssets.length}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof getColors>, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  spacer: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  orderTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: isDark 
      ? ((colors as any).glassBackground || colors.backgroundWhite) 
      : 'rgba(255, 255, 255, 0.95)',
    // Liquid glass styling
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? ((colors as any).glassBorder || 'rgba(70, 64, 56, 0.5)') : 'transparent',
    gap: 8,
    marginTop: 4,
  },
  orderTypeText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
  },
  amountSection: {
    paddingHorizontal: 20,
    paddingTop: 100,
    paddingBottom: 2,
    alignItems: 'flex-start',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
    position: 'relative',
    flexShrink: 1,
    width: '100%',
  },
  amountValue: {
    fontSize: 72,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  amountCurrencyContainer: {
    flexShrink: 1,
    marginLeft: 8,
    minWidth: 0,
  },
  amountCurrency: {
    fontSize: 36,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
  },
  cursor: {
    width: 2,
    height: 72,
    backgroundColor: colors.orange,
    marginLeft: 4,
  },
  assetAmount: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: colors.orange,
  },
  detailsSection: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  verticalLine: {
    width: 1,
    height: 20,
    backgroundColor: colors.textSecondary,
    opacity: 0.3,
    marginLeft: 20, // Icon center: 20px (half of 40px icon width)
    marginVertical: -4,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.backgroundGrey,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  assetSelectionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginLeft: 0,
  },
  assetIconContainer: {
    backgroundColor: 'transparent',
  },
  assetIconText: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.orange,
  },
  cashIconContainer: {
    backgroundColor: colors.green + '20',
  },
  cashIconText: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'ChakraPetch-Bold',
    color: colors.green,
  },
  detailTextContainer: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
  },
  detailRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailAmount: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
    marginRight: 4,
  },
  detailSubtextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailSubtext: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
  },
  infoIcon: {
    marginLeft: 2,
  },
  actionButtonContainer: {
    position: 'relative',
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 4,
  },
  quickAmountButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  quickAmountButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: isDark 
      ? ((colors as any).glassBackground || colors.backgroundWhite) 
      : 'rgba(255, 255, 255, 0.95)',
    // Liquid glass styling
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? ((colors as any).glassBorder || 'rgba(70, 64, 56, 0.5)') : 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAmountButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
  },
  reviewOrderButtonContainer: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
  },
  reviewOrderButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewOrderButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: colors.backgroundWhite,
  },
  maxAmountButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: colors.backgroundGrey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maxAmountButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
  },
  keypadContainer: {
    width: '100%',
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: colors.background,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 4,
    gap: 8,
  },
  keypadKey: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: isDark 
      ? ((colors as any).glassBackground || colors.backgroundWhite) 
      : 'rgba(255, 255, 255, 0.95)',
    // Liquid glass styling
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? ((colors as any).glassBorder || 'rgba(70, 64, 56, 0.5)') : 'transparent',
  },
  keypadKeyText: {
    fontSize: 22,
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  modalBackdropOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  orderTypeModal: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 1001,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    maxHeight: '85%', // Ensure it never exceeds 85% regardless of screen size
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.textSecondary,
    opacity: 0.3,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: colors.textPrimary,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  orderTypeOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: isDark 
      ? ((colors as any).glassBackground || colors.backgroundWhite) 
      : 'rgba(255, 255, 255, 0.95)',
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? ((colors as any).glassBorder || 'rgba(70, 64, 56, 0.5)') : 'transparent',
  },
  orderTypeOptionSelected: {
    // No special styling for selected state
  },
  orderTypeTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  orderTypeOptionText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  orderTypeOptionTextSelected: {
    color: colors.orange,
  },
  orderTypeSubtext: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
    lineHeight: 18,
  },
  assetListContainer: {
    flex: 1,
  },
  assetListContent: {
    paddingBottom: 20,
  },
  assetOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  assetOptionSelected: {
    borderWidth: 0,
    borderColor: 'transparent',
  },
  assetOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 0,
  },
  assetOptionTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  assetOptionName: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  assetOptionTicker: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
  },
  assetOptionRight: {
    alignItems: 'flex-end',
  },
  assetOptionPrice: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: colors.textPrimary,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: colors.textSecondary,
  },
});

