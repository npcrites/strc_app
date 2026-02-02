import React, { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Font from 'expo-font';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider } from './src/context/ThemeContext';
import BottomTabs from './src/navigation/BottomTabs';
import LoginScreen from './src/screens/LoginScreen';
import AssetDetailScreen from './src/screens/AssetDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PayoutsDetailScreen from './src/screens/PayoutsDetailScreen';
import HoldingsDetailScreen from './src/screens/HoldingsDetailScreen';
import TransactionScreen from './src/screens/TransactionScreen';
import ReviewOrderScreen from './src/screens/ReviewOrderScreen';
import BankLinkingScreen from './src/screens/BankLinkingScreen';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { isAuthenticated, loading, logout, token } = useAuth();
  const navigationRef = React.useRef<any>(null);
  const [hasLinkedAccount, setHasLinkedAccount] = useState<boolean | null>(null);
  const [checkingLinkedAccount, setCheckingLinkedAccount] = useState(true);

  // Listen for 401 errors globally
  useEffect(() => {
    const handle401Error = () => {
      // Small delay to allow fade animation
      setTimeout(() => {
        logout();
      }, 300);
    };

    // Store handler globally so API service can call it
    (global as any).handle401Error = handle401Error;

    return () => {
      delete (global as any).handle401Error;
    };
  }, [logout]);

  // Check if user has linked bank account and navigate if needed
  useEffect(() => {
    if (!isAuthenticated || !token || !navigationRef.current) {
      setHasLinkedAccount(null);
      setCheckingLinkedAccount(false);
      return;
    }

    const checkLinkedAccount = async () => {
      try {
        setCheckingLinkedAccount(true);
        const { api } = await import('./src/services/api');
        const response = await api.get<{ has_linked_account: boolean }>(
          '/plaid/has-linked-account',
          token
        );
        setHasLinkedAccount(response.has_linked_account);
        
        // Navigate to BankLinking if no account linked
        // Only navigate if we're authenticated and navigator is ready
        if (!response.has_linked_account && navigationRef.current) {
          // Small delay to ensure Main screen is mounted
          setTimeout(() => {
            try {
              const currentRoute = navigationRef.current?.getCurrentRoute();
              // Only navigate if we're on Main screen (not already on BankLinking)
              if (currentRoute?.name === 'Main') {
                navigationRef.current?.navigate('BankLinking');
              }
            } catch (error) {
              console.warn('Navigation error:', error);
            }
          }, 1000);
        }
      } catch (error: any) {
        console.error('Error checking linked account:', error);
        // If check fails (404 or other), assume no linked account (user can still proceed)
        // Don't navigate on error - let user use the app
        setHasLinkedAccount(false);
      } finally {
        setCheckingLinkedAccount(false);
      }
    };

    checkLinkedAccount();
  }, [isAuthenticated, token]);

  // Handle deep links for asset sharing
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleDeepLink = (url: string) => {
      // Parse deep link: strctracker://asset/{ticker}
      const match = url.match(/strctracker:\/\/asset\/([^\/\?]+)/);
      if (match && match[1] && navigationRef.current) {
        const ticker = match[1];
        // Navigate to AssetDetail screen
        navigationRef.current.navigate('AssetDetail', { ticker });
      }
    };

    // Handle initial URL (app opened via deep link)
    if (Linking && Linking.getInitialURL) {
      Linking.getInitialURL()
        .then((url) => {
          if (url) {
            handleDeepLink(url);
          }
        })
        .catch((error) => {
          console.warn('Error getting initial URL:', error);
        });
    }

    // Listen for deep links while app is running
    let subscription: any = null;
    if (Linking && Linking.addEventListener) {
      subscription = Linking.addEventListener('url', (event) => {
        handleDeepLink(event.url);
      });
    }

    return () => {
      if (subscription && subscription.remove) {
        subscription.remove();
      }
    };
  }, [isAuthenticated]);

  // Configure deep linking
  const linking = {
    prefixes: ['strctracker://'],
    config: {
      screens: {
        Main: {
          screens: {
            Home: 'home',
            Activity: 'activity',
          },
        },
        AssetDetail: {
          path: 'asset/:ticker',
          parse: {
            ticker: (ticker: string) => ticker,
          },
        },
        PayoutsDetail: {
          path: 'payouts/:ticker',
          parse: {
            ticker: (ticker: string) => ticker,
          },
        },
        Settings: 'settings',
        BankLinking: 'plaid/callback',
      },
    },
  };

  if (loading || checkingLinkedAccount) {
    return null; // Or a loading screen
  }

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator 
        screenOptions={{ 
          headerShown: false,
          headerBackVisible: false,
          headerBackTitleVisible: false,
          headerLeft: () => null,
          header: () => null,
          animation: 'fade', // Fade transition for all screens
        }}
      >
        {isAuthenticated ? (
          <>
            <Stack.Screen 
              name="Main" 
              component={BottomTabs}
              options={{
                animation: 'fade',
              }}
            />
            <Stack.Screen 
              name="AssetDetail" 
              component={AssetDetailScreen}
              options={{
                headerShown: false,
                headerBackVisible: false,
                headerBackTitleVisible: false,
                headerLeft: () => null,
                header: () => null,
                animation: 'slide_from_right',
                gestureEnabled: true,
              }}
            />
            <Stack.Screen 
              name="PayoutsDetail" 
              component={PayoutsDetailScreen}
              options={{
                headerShown: false,
                headerBackVisible: false,
                headerBackTitleVisible: false,
                headerLeft: () => null,
                header: () => null,
                animation: 'slide_from_right',
                gestureEnabled: true,
              }}
            />
            <Stack.Screen 
              name="HoldingsDetail" 
              component={HoldingsDetailScreen}
              options={{
                headerShown: false,
                headerBackVisible: false,
                headerBackTitleVisible: false,
                headerLeft: () => null,
                header: () => null,
                animation: 'slide_from_right',
                gestureEnabled: true,
              }}
            />
            <Stack.Screen 
              name="Settings" 
              component={SettingsScreen}
              options={{
                headerShown: false,
                headerBackVisible: false,
                headerBackTitleVisible: false,
                headerLeft: () => null,
                header: () => null,
                animation: 'slide_from_right',
                gestureEnabled: true,
              }}
            />
            <Stack.Screen 
              name="Transaction" 
              component={TransactionScreen}
              options={{
                headerShown: false,
                headerBackVisible: false,
                headerBackTitleVisible: false,
                headerLeft: () => null,
                header: () => null,
                animation: 'slide_from_bottom',
                animationDuration: 200,
                gestureEnabled: true,
                transitionSpec: {
                  open: {
                    animation: 'spring',
                    config: {
                      stiffness: 500,
                      damping: 35,
                      mass: 0.5,
                    },
                  },
                  close: {
                    animation: 'spring',
                    config: {
                      stiffness: 500,
                      damping: 35,
                      mass: 0.5,
                    },
                  },
                },
              }}
            />
            <Stack.Screen 
              name="ReviewOrder" 
              component={ReviewOrderScreen}
              options={{
                headerShown: false,
                headerBackVisible: false,
                headerBackTitleVisible: false,
                headerLeft: () => null,
                header: () => null,
                animation: 'slide_from_right',
                gestureEnabled: true,
              }}
            />
            <Stack.Screen 
              name="BankLinking" 
              component={BankLinkingScreen}
              options={{
                headerShown: false,
                headerBackVisible: false,
                headerBackTitleVisible: false,
                headerLeft: () => null,
                header: () => null,
                animation: 'slide_from_bottom',
                gestureEnabled: true,
              }}
            />
          </>
        ) : (
          <Stack.Screen 
            name="Login" 
            component={LoginScreen}
            options={{
              animation: 'fade',
            }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          'ChakraPetch': require('./src/assets/fonts/ChakraPetch-Regular.ttf'),
          'ChakraPetch-Bold': require('./src/assets/fonts/ChakraPetch-Bold.ttf'),
          'Inter': require('./src/assets/fonts/Inter-Regular.ttf'),
          'Inter-Medium': require('./src/assets/fonts/Inter-Medium.ttf'),
          'Inter-SemiBold': require('./src/assets/fonts/Inter-SemiBold.ttf'),
          'Inter-Bold': require('./src/assets/fonts/Inter-Bold.ttf'),
        });
        setFontsLoaded(true);
      } catch (error) {
        console.warn('Error loading fonts:', error);
        // Continue even if fonts fail to load - will use system fonts
        setFontsLoaded(true);
      }
    }
    loadFonts();
  }, []);

  if (!fontsLoaded) {
    return null; // Or a loading screen
  }

  return (
    <ThemeProvider>
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
    </ThemeProvider>
  );
}
