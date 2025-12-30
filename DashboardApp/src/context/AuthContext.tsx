/**
 * Authentication context for managing user auth state
 */
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';
import { User, LoginResponse } from '../types';

interface AuthContextType {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('auth_token');
      if (storedToken) {
        setToken(storedToken);
        // Load user info
        try {
          const userData = await api.get<User>('/users/me', storedToken);
          setUser(userData);
        } catch (error) {
          // Token might be invalid, clear it
          await AsyncStorage.removeItem('auth_token');
          setToken(null);
        }
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${api.baseUrl}/users/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          username: email,
          password: password,
        }),
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data: LoginResponse = await response.json();
      const accessToken = data.access_token;

      await AsyncStorage.setItem('auth_token', accessToken);
      setToken(accessToken);

      // Load user info
      const userData = await api.get<User>('/users/me', accessToken);
      setUser(userData);

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  };

  const logout = async (): Promise<void> => {
    await AsyncStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  };

  const value: AuthContextType = {
    token,
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

