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

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { isAuthenticated, loading, logout } = useAuth();
  const navigationRef = React.useRef<any>(null);

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
      },
    },
  };

  if (loading) {
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

