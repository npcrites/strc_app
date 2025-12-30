import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/context/AuthContext';
import BottomTabs from './src/navigation/BottomTabs';

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <BottomTabs />
      </NavigationContainer>
    </AuthProvider>
  );
}

