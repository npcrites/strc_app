import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import BottomTabs from './src/navigation/BottomTabs';
import LoginScreen from './src/screens/LoginScreen';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const { isAuthenticated, loading, logout } = useAuth();

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

  if (loading) {
    return null; // Or a loading screen
  }

  return (
    <NavigationContainer>
      <Stack.Navigator 
        screenOptions={{ 
          headerShown: false,
          animation: 'fade', // Fade transition for all screens
        }}
      >
        {isAuthenticated ? (
          <Stack.Screen 
            name="Main" 
            component={BottomTabs}
            options={{
              animation: 'fade',
            }}
          />
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
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}

