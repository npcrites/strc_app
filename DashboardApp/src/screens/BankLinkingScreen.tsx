import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: screenHeight } = Dimensions.get('window');
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { getColors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

type RootStackParamList = {
  Main: undefined;
  BankLinking: undefined;
};

type BankLinkingNavigationProp = NativeStackNavigationProp<RootStackParamList, 'BankLinking'>;

export default function BankLinkingScreen() {
  const { token } = useAuth();
  const { isDark } = useTheme();
  const navigation = useNavigation<BankLinkingNavigationProp>();
  const insets = useSafeAreaInsets();
  const colors = getColors(isDark);
  
  const [loading, setLoading] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewReady, setWebViewReady] = useState(false);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);
  const slideUpAnim = useRef(new Animated.Value(screenHeight)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const fetchLinkToken = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.post<{ link_token: string; expiration?: string }>(
        '/plaid/link-token',
        {},
        token
      );
      
      console.log('✅ Link token received:', response.link_token ? 'Yes' : 'No');
      setLinkToken(response.link_token);
    } catch (err: any) {
      console.error('❌ Error fetching link token:', err);
      setError(err.message || 'Failed to initialize bank linking');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinkToken();
  }, []);

  // Show container immediately and animate slide-up (matching order type modal exactly)
  useEffect(() => {
    setShowWebView(true);
    // Explicitly set starting position (like order type modal does)
    slideUpAnim.setValue(screenHeight);
    // Set opacity to 1 immediately so header is visible from the start
    opacityAnim.setValue(1);
    // Use exact same spring animation as order type modal
    Animated.spring(slideUpAnim, {
      toValue: 0,
      tension: 500,
      friction: 40,
      useNativeDriver: true,
    }).start(() => {
      // Load WebView after animation completes (only if linkToken is ready)
      if (linkToken && !exchanging) {
        setWebViewReady(true);
      }
    });
  }, [slideUpAnim, opacityAnim]);

  // When linkToken becomes available, start loading WebView if container is already visible
  useEffect(() => {
    if (linkToken && webViewReady === false && !exchanging) {
      // Container is already visible, start loading WebView
      setWebViewReady(true);
    }
  }, [linkToken, webViewReady, exchanging]);

  // Handle Plaid callback from WebView
  const handlePlaidCallback = async (url: string) => {
    console.log('Plaid callback detected in WebView:', url);
    
    // Parse the URL
    const publicTokenMatch = url.match(/[?&]public_token=([^&]+)/);
    const errorMatch = url.match(/[?&]error=([^&]+)/);
    const cancelledMatch = url.match(/[?&]cancelled=true/);
    
    // Hide WebView immediately
    setShowWebView(false);
    
    if (cancelledMatch) {
      console.log('User cancelled Plaid Link');
      return;
    }
    
    if (errorMatch) {
      const errorMsg = decodeURIComponent(errorMatch[1]);
      console.error('Plaid Link error:', errorMsg);
      setError(errorMsg);
      return;
    }
    
    const publicToken = publicTokenMatch ? decodeURIComponent(publicTokenMatch[1]) : null;
    
    if (publicToken) {
      setExchanging(true);
      setError(null);
      
      console.log('✅ Public token received from Plaid');
      
      try {
        // Exchange public token for access token
        const response = await api.post<{ success: boolean; accounts: any[]; message?: string }>(
          '/plaid/exchange-token',
          { public_token: publicToken },
          token
        );
        
        if (response.success) {
          // Show success briefly, then navigate to main
          setTimeout(() => {
            // Navigate back - if we came from Transaction, go back; otherwise go to Main
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.replace('Main' as any);
            }
          }, 1500);
        } else {
          setError('Failed to link bank account');
          setExchanging(false);
        }
      } catch (err: any) {
        console.error('Error exchanging token:', err);
        setError(err.message || 'Failed to complete bank linking');
        setExchanging(false);
      }
    } else {
      console.warn('No public_token in callback URL');
    }
  };

  const handleSkip = () => {
    // User can skip for now, but will be prompted again when trying to trade
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Main' as any);
    }
  };

  const styles = createStyles(colors, insets);

  // Get the Plaid Link page URL with dark mode preference
  const linkPageUrl = linkToken 
    ? `${api.baseUrl}/plaid/link-page?link_token=${encodeURIComponent(linkToken)}&is_dark=${isDark ? 'true' : 'false'}`
    : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      {/* Always render container (starts off-screen, slides up when linkToken is ready) */}
      <Animated.View
        style={[
          styles.webViewContainer,
          {
            transform: [{ translateY: slideUpAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        <View style={styles.webViewHeader}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              // Navigate immediately for instant response
              setShowWebView(false);
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.replace('Main' as any);
              }
              // Animate slide-down and fade out quickly in background
              Animated.parallel([
                Animated.timing(slideUpAnim, {
                  toValue: screenHeight,
                  duration: 100,
                  useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                  toValue: 0,
                  duration: 100,
                  useNativeDriver: true,
                }),
              ]).start();
            }}
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.webViewHeaderText}>Link Bank Account</Text>
          <View style={styles.closeButtonPlaceholder} />
        </View>
        {linkPageUrl && webViewReady && !exchanging ? (
          <View style={{ flex: 1 }}>
            <WebView
              ref={webViewRef}
              source={{ uri: linkPageUrl }}
              style={styles.webView}
              cacheEnabled={true}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              onLoadStart={() => {
                setWebViewLoading(true);
              }}
              onLoadEnd={() => {
                // Delay hiding spinner to ensure Plaid's loader is covered
                setTimeout(() => {
                  setWebViewLoading(false);
                }, 500);
              }}
              onNavigationStateChange={(navState) => {
                // Check for Plaid callback in navigation state
                if (navState.url && navState.url.includes('strctracker://plaid/callback')) {
                  handlePlaidCallback(navState.url);
                }
              }}
              onShouldStartLoadWithRequest={(request) => {
                // Intercept navigation to deep links (iOS)
                if (request.url.includes('strctracker://plaid/callback')) {
                  handlePlaidCallback(request.url);
                  return false; // Prevent navigation
                }
                return true; // Allow normal navigation
              }}
            />
            {/* Show our spinner while WebView is loading (covers Plaid's loader) */}
            {webViewLoading && (
              <View style={styles.webViewLoadingOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color={colors.orange} />
              </View>
            )}
          </View>
        ) : (
          // Show loading state inside the container (for fetching token, exchanging, or waiting for WebView)
          <View style={styles.webViewLoading}>
            <ActivityIndicator size="large" color={colors.orange} />
            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={20} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof getColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: insets.top + 40,
      paddingBottom: insets.bottom + 20,
      justifyContent: 'center',
    },
    header: {
      marginBottom: 40,
      alignItems: 'center',
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.textPrimary,
      marginBottom: 12,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.errorBackground || '#FFE5E5',
      padding: 12,
      borderRadius: 8,
      marginBottom: 20,
    },
    errorText: {
      color: colors.error,
      marginLeft: 8,
      flex: 1,
      fontSize: 14,
    },
    loadingContainer: {
      alignItems: 'center',
      marginVertical: 40,
    },
    loadingText: {
      marginTop: 16,
      color: colors.textSecondary,
      fontSize: 14,
    },
    loadingSubtext: {
      marginTop: 8,
      color: colors.textSecondary,
      fontSize: 12,
      textAlign: 'center',
    },
    linkButton: {
      backgroundColor: colors.orange,
      borderRadius: 12,
      paddingVertical: 16,
      paddingHorizontal: 24,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      shadowColor: colors.orange,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    linkButtonText: {
      color: colors.backgroundWhite,
      fontSize: 18,
      fontWeight: '600',
      marginLeft: 8,
    },
    linkButtonDisabled: {
      opacity: 0.6,
    },
    retryButton: {
      backgroundColor: colors.backgroundGrey,
      borderRadius: 12,
      paddingVertical: 16,
      paddingHorizontal: 24,
      alignItems: 'center',
      marginBottom: 16,
    },
    retryButtonText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    skipButton: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    skipButtonText: {
      color: colors.textSecondary,
      fontSize: 16,
    },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.backgroundGrey,
      padding: 16,
      borderRadius: 8,
      marginTop: 32,
    },
    infoText: {
      flex: 1,
      marginLeft: 12,
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    webViewContainer: {
      flex: 1,
      backgroundColor: colors.background,
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    webViewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: insets.top,
      paddingBottom: 12,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.backgroundGrey,
    },
    webViewHeaderText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    closeButton: {
      padding: 8,
    },
    closeButtonPlaceholder: {
      width: 40,
    },
    webView: {
      flex: 1,
    },
    webViewLoading: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    webViewLoadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
      elevation: 9999, // For Android
    },
    webViewLoadingText: {
      marginTop: 12,
      color: colors.textSecondary,
      fontSize: 14,
    },
  });

