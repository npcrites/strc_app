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
import BackButton from '../components/BackButton';
import LottieAnimation from '../components/LottieAnimation';
import AIIcon from '../components/AIIcon';
import { hasMSTRParent, hasASTTParent } from '../utils/assetUtils';
import Svg, { Path, Circle, Rect, G, Defs, LinearGradient, Stop, ClipPath } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

type RootStackParamList = {
  Transaction: { ticker: string; mode: 'buy' | 'sell'; currentPrice?: number };
  ReviewOrder: {
    ticker: string;
    mode: 'buy' | 'sell';
    amount: number;
    sharesAmount: number;
    currentPrice: number;
    orderType: 'smart' | 'one-time' | 'recurring' | 'custom';
  };
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

const SkeletonLoadingState = ({ styles }: { styles: ReturnType<typeof createStyles> }) => {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <ScrollView
      style={styles.assetListContainer}
      contentContainerStyle={styles.assetListContent}
      showsVerticalScrollIndicator={false}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <View key={`asset-skeleton-${index}`} style={styles.assetOption}>
          <View style={styles.assetOptionLeft}>
            <Animated.View style={[styles.skeletonBase, styles.skeletonIcon, { opacity: pulse }]} />
            <View style={styles.assetOptionTextContainer}>
              <Animated.View style={[styles.skeletonBase, styles.skeletonLinePrimary, { opacity: pulse }]} />
              <Animated.View style={[styles.skeletonBase, styles.skeletonLineSecondary, { opacity: pulse }]} />
            </View>
          </View>
          <View style={styles.assetOptionRight}>
            <Animated.View style={[styles.skeletonBase, styles.skeletonLinePrice, { opacity: pulse }]} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
};

export default function TransactionScreen() {
  const { token } = useAuth();
  const { isDark } = useTheme();
  const navigation = useNavigation<TransactionNavigationProp>();
  const route = useRoute<TransactionRouteProp>();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('window').height;
  const modalHeight = useMemo(() => screenHeight, [screenHeight]); // Full screen height
  const assetModalHeight = useMemo(() => screenHeight * 0.78, [screenHeight]);
  
  const { ticker, mode, currentPrice } = route.params;
  
  const [amount, setAmount] = useState<string>('0');
  const [hasDecimal, setHasDecimal] = useState<boolean>(false);
  const [inputMode, setInputMode] = useState<'usd' | 'shares'>('usd');
  const [orderType, setOrderType] = useState<'smart' | 'one-time' | 'recurring' | 'custom'>('smart');
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
  const [hasLinkedAccount, setHasLinkedAccount] = useState<boolean | null>(null);
  const [checkingBankAccount, setCheckingBankAccount] = useState(false);
  const reviewOrderTranslateX = useRef(new Animated.Value(-1000)).current;
  const hasShownReviewButton = useRef(false);
  const orderTypeModalTranslateY = useRef(new Animated.Value(screenHeight)).current;
  const orderTypeModalOpacity = useRef(new Animated.Value(0)).current;
  const assetSelectionModalTranslateY = useRef(new Animated.Value(screenHeight)).current;
  const assetSelectionModalOpacity = useRef(new Animated.Value(0)).current;
  // cartIconRotation removed - LottieAnimation handles its own animation
  // calendarIconRotation removed - LottieAnimation handles its own animation
  // limitIconRotation removed - LottieAnimation handles its own animation
  
  // Initialize modal position when modalHeight is calculated
  useEffect(() => {
    orderTypeModalTranslateY.setValue(modalHeight); // Start from bottom
    assetSelectionModalTranslateY.setValue(assetModalHeight);
  }, [modalHeight, assetModalHeight, orderTypeModalTranslateY, assetSelectionModalTranslateY]);
  
  const colors = getColors(isDark);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    if (mode === 'buy') {
      setOrderType('smart');
    }
  }, [mode]);
  
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
  
  // Check if user has linked bank account (for buy orders)
  useEffect(() => {
    if (mode === 'buy' && token) {
      const checkBankAccount = async () => {
        try {
          setCheckingBankAccount(true);
          const response = await api.get<{ has_linked_account: boolean }>(
            '/plaid/has-linked-account',
            token
          );
          setHasLinkedAccount(response.has_linked_account);
        } catch (error) {
          console.error('Error checking bank account:', error);
          setHasLinkedAccount(false);
        } finally {
          setCheckingBankAccount(false);
        }
      };
      checkBankAccount();
    }
  }, [mode, token]);

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
      orderTypeModalTranslateY.setValue(modalHeight); // Ensure starting from bottom (off-screen below)
      const springAnim = createSnappySpringAnimation(orderTypeModalTranslateY, 0);
      const opacityAnim = Animated.timing(orderTypeModalOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      });
      Animated.parallel([springAnim, opacityAnim]).start(() => {
        setIsModalAnimating(false);
      });
      // Start spinning animations for icons (LottieAnimation handles its own animation)
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
      // Stop spinning animations (reset values) - LottieAnimation handles its own animation
    }
  }, [showOrderTypeModal, modalHeight, orderTypeModalTranslateY, orderTypeModalOpacity, shouldRenderModal]);

  // Asset selection modal animations
  useEffect(() => {
    if (showAssetSelectionModal) {
      // Open modal with snappy spring animation
      setShouldRenderAssetModal(true);
      setIsAssetModalAnimating(true);
      assetSelectionModalTranslateY.setValue(assetModalHeight); // Ensure starting from bottom
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
      const springAnim = createSnappySpringAnimation(assetSelectionModalTranslateY, assetModalHeight);
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
  }, [showAssetSelectionModal, assetModalHeight, assetSelectionModalTranslateY, assetSelectionModalOpacity, shouldRenderAssetModal]);

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
  
  const handleOrderTypeSelect = (type: 'smart' | 'one-time' | 'recurring' | 'custom') => {
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
            <View style={styles.orderTypeTextRow}>
              {orderType === 'smart' && <AIIcon size={14} />}
              <Text style={styles.orderTypeText}>
                {orderType === 'smart'
                  ? 'Smart Schedule'
                  : orderType === 'one-time'
                    ? 'One-time order'
                    : orderType === 'recurring'
                      ? 'Recurring order'
                      : 'Custom'}
              </Text>
            </View>
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
                      onPress={async () => {
                        // Check bank account for buy orders
                        if (mode === 'buy') {
                          if (hasLinkedAccount === false) {
                            // Navigate directly to bank linking screen
                            navigation.navigate('BankLinking' as any);
                            return;
                          } else if (hasLinkedAccount === null && checkingBankAccount) {
                            // Still checking, wait a moment
                            return;
                          }
                        }
                        
                        // Proceed to review order
                        navigation.navigate('ReviewOrder', {
                          ticker,
                          mode,
                          amount: usdAmount,
                          sharesAmount: sharesAmount,
                          currentPrice: price,
                          orderType,
                        });
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
                paddingTop: Math.max(insets.top, 20),
                paddingBottom: Math.max(insets.bottom, 20),
              },
            ]}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <BackButton onPress={() => setShowOrderTypeModal(false)} />
              </View>
              <Text style={styles.modalTitle}>Order Type</Text>
              <TouchableOpacity
                style={[
                  styles.orderTypeOption,
                  orderType === 'smart' && styles.orderTypeOptionSelected,
                ]}
                onPress={() => handleOrderTypeSelect('smart')}
                activeOpacity={0.7}
              >
                <View style={styles.orderTypeIconWrapper}>
                  <LottieAnimation 
                    source={require('../../assets/smart-icon.json')} 
                    size={60}
                    loop={true}
                    autoPlay={true}
                    speed={1}
                  />
                </View>
                <View style={styles.orderTypeTextContainer}>
                  <View style={styles.orderTypeOptionTitleRow}>
                    <AIIcon size={14} />
                    <Text
                      style={[
                        styles.orderTypeOptionText,
                        orderType === 'smart' && styles.orderTypeOptionTextSelected,
                      ]}
                    >
                      Smart Schedule
                    </Text>
                  </View>
                  <Text style={styles.orderTypeSubtext}>
                    Optimized scheduling that adjusts to market conditions
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
                  orderType === 'one-time' && styles.orderTypeOptionSelected,
                ]}
                onPress={() => handleOrderTypeSelect('one-time')}
                activeOpacity={0.7}
              >
                <View style={styles.orderTypeIconWrapper}>
                  <LottieAnimation 
                    source={require('../../assets/cart-icon.json')} 
                    size={60}
                    loop={true}
                    autoPlay={true}
                    speed={1}
                  />
                </View>
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
                <View style={styles.orderTypeIconWrapper}>
                  <LottieAnimation 
                    source={require('../../assets/calendar-icon.json')} 
                    size={60}
                    loop={true}
                    autoPlay={true}
                    speed={1}
                  />
                </View>
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
              
              <TouchableOpacity
                style={[
                  styles.orderTypeOption,
                  orderType === 'custom' && styles.orderTypeOptionSelected,
                ]}
                onPress={() => handleOrderTypeSelect('custom')}
                activeOpacity={0.7}
              >
                <View style={styles.orderTypeIconWrapper}>
                  <LottieAnimation 
                    source={require('../../assets/custom-icon.json')} 
                    size={60}
                    loop={true}
                    autoPlay={true}
                    speed={1}
                  />
                </View>
                <View style={styles.orderTypeTextContainer}>
                  <Text
                    style={[
                      styles.orderTypeOptionText,
                      orderType === 'custom' && styles.orderTypeOptionTextSelected,
                    ]}
                  >
                    Custom
                  </Text>
                  <Text style={styles.orderTypeSubtext}>
                    Set your own execution rules and conditions
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
                height: assetModalHeight,
                transform: [{ translateY: assetSelectionModalTranslateY }],
                paddingBottom: Math.max(insets.bottom, 20),
              },
            ]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Asset</Text>
              {assetsLoading ? (
                <SkeletonLoadingState styles={styles} />
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
  orderTypeTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    borderRadius: 999,
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 0,
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
  orderTypeIconWrapper: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  orderTypeTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  orderTypeOptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  skeletonBase: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
  },
  skeletonIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  skeletonLinePrimary: {
    height: 16,
    width: 140,
    borderRadius: 8,
    marginBottom: 6,
  },
  skeletonLineSecondary: {
    height: 12,
    width: 90,
    borderRadius: 6,
  },
  skeletonLinePrice: {
    height: 16,
    width: 72,
    borderRadius: 8,
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
