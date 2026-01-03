import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/colors';
import Constants from 'expo-constants';

export default function LoginScreen() {
  const { loginWithToken, demoLogin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const apiBaseUrl = __DEV__
    ? (Constants.expoConfig?.extra?.apiUrl || 'http://localhost:8000/api')
    : 'https://api.strctracker.com/api';

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    try {
      const result = await demoLogin();
      if (!result.success) {
        Alert.alert('Demo Login Failed', result.error || 'Failed to login');
      }
    } catch (error) {
      console.error('Demo login error:', error);
      Alert.alert('Error', 'Failed to login');
    } finally {
      setDemoLoading(false);
    }
  };

  const handleAlpacaLogin = async () => {
    try {
      setLoading(true);
      
      // Get the authorization URL from backend (as JSON)
      const authResponse = await fetch(`${apiBaseUrl}/users/auth/alpaca/authorize?env=paper&return_url=true`);
      
      if (!authResponse.ok) {
        throw new Error('Failed to get authorization URL');
      }
      
      const authData = await authResponse.json();
      const authUrl = authData.authorization_url;
      
      // Configure redirect URI for deep linking
      // The backend will redirect to this after OAuth completes
      const redirectUri = Platform.select({
        ios: 'strctracker://auth/callback',
        android: 'strctracker://auth/callback',
        default: 'strctracker://auth/callback',
      });
      
      console.log('Opening OAuth in-app browser:', authUrl);
      
      // Use openBrowserAsync instead of openAuthSessionAsync to avoid native banner
      // This opens a regular in-app browser without the "app wants to use" prompt
      const browserResult = await WebBrowser.openBrowserAsync(authUrl, {
        // iOS options
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        // Android options
        enableBarCollapsing: false,
        // Toolbar color (optional)
        toolbarColor: Colors.backgroundWhite,
        // Controls whether to show title bar
        showTitle: true,
      });
      
      console.log('OAuth browser result:', browserResult);
      
      // With openBrowserAsync, we don't get automatic redirect handling
      // The redirect will trigger the deep link handler below via Linking
      // So we just close the browser and wait for the deep link
      if (browserResult.type === 'opened') {
        console.log('OAuth browser opened successfully');
        // The deep link handler in useEffect will handle the callback
      } else if (browserResult.type === 'cancel') {
        console.log('User cancelled OAuth flow');
        // Don't show error for user cancellation
      } else {
        console.log('Browser closed or dismissed');
      }
    } catch (error) {
      console.error('Error opening OAuth URL:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to open Alpaca login page';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Handle deep link callback (when user returns from OAuth)
  useEffect(() => {
    const handleDeepLink = async (url: string) => {
      try {
        // Close the browser if it's still open
        await WebBrowser.dismissBrowser();
        
        // Parse the URL - format: strctracker://auth/callback?token=...&token_type=bearer
        const urlObj = new URL(url);
        const token = urlObj.searchParams.get('token');
        const tokenType = urlObj.searchParams.get('token_type');
        
        if (token && tokenType === 'bearer') {
          console.log('OAuth callback received, setting token');
          await loginWithToken(token);
        } else {
          Alert.alert('Error', 'Invalid callback: missing token');
        }
      } catch (error) {
        console.error('Error handling deep link:', error);
        Alert.alert('Error', 'Failed to complete authentication');
      }
    };

    // Listen for initial URL (app opened via deep link)
    Linking.getInitialURL().then((url) => {
      if (url && url.includes('auth/callback')) {
        handleDeepLink(url);
      }
    });

    // Listen for URL events (app already open)
    const subscription = Linking.addEventListener('url', (event) => {
      if (event.url && event.url.includes('auth/callback')) {
        handleDeepLink(event.url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [loginWithToken]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>STRC Tracker</Text>
        <Text style={styles.subtitle}>Sign in with Alpaca to view your dashboard</Text>

        <View style={styles.form}>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary, (loading || demoLoading) && styles.buttonDisabled]}
            onPress={handleDemoLogin}
            disabled={loading || demoLoading}
          >
            {demoLoading ? (
              <ActivityIndicator color={Colors.backgroundWhite} />
            ) : (
              <Text style={styles.buttonText}>Demo Login</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, (loading || demoLoading) && styles.buttonDisabled]}
            onPress={handleAlpacaLogin}
            disabled={loading || demoLoading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.orange} />
            ) : (
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Login with Alpaca</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>How it works:</Text>
          <Text style={styles.infoText}>1. Click "Login with Alpaca"</Text>
          <Text style={styles.infoText}>2. Authorize the app on Alpaca</Text>
          <Text style={styles.infoText}>3. You'll be redirected back to the app</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  form: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.textPrimary,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.backgroundGrey,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonPrimary: {
    backgroundColor: Colors.orange,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.orange,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.backgroundWhite,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: Colors.orange,
  },
  infoBox: {
    backgroundColor: Colors.backgroundGrey,
    borderRadius: 8,
    padding: 16,
    marginTop: 24,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
});

