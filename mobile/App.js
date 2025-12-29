/**
 * React Native entrypoint
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthProvider } from './src/context/AuthContext';
import Dashboard from './src/screens/Dashboard';
import PositionDetail from './src/screens/PositionDetail';
import AddPosition from './src/screens/AddPosition';

const Stack = createStackNavigator();

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Dashboard"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#6200ee',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        >
          <Stack.Screen 
            name="Dashboard" 
            component={Dashboard}
            options={{ title: 'STRC Tracker' }}
          />
          <Stack.Screen 
            name="PositionDetail" 
            component={PositionDetail}
            options={{ title: 'Position Details' }}
          />
          <Stack.Screen 
            name="AddPosition" 
            component={AddPosition}
            options={{ title: 'Add Position' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </AuthProvider>
  );
}


