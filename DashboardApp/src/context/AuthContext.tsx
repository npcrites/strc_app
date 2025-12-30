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
          setUser(null);
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
      console.log('🔐 Attempting login for:', email);
      console.log('🌐 API Base URL:', api.baseUrl);
      console.log('🔗 Full login URL:', `${api.baseUrl}/users/login`);
      
      let response: Response;
      try {
        const loginUrl = `${api.baseUrl}/users/login`;
        console.log('🌐 Making login request to:', loginUrl);
        console.log('📋 Request details:', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: { username: email, password: '***' },
        });
        
        const body = new URLSearchParams({
          username: email,
          password: password,
        });
        const bodyString = body.toString();
        console.log('📦 Request body (URLSearchParams):', bodyString);
        
        // Try fetch with explicit timeout and error handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        try {
          response = await fetch(loginUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: bodyString, // Use string directly instead of URLSearchParams object
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
            throw new Error('Request timeout: Server did not respond within 10 seconds');
          }
          throw fetchErr;
        }
        
        console.log('✅ Fetch completed');
        console.log('📊 Response status:', response.status);
        console.log('📊 Response statusText:', response.statusText);
        console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));
        
        // Check if response is ok before trying to parse
        if (!response.ok) {
          const responseText = await response.text();
          console.error('❌ Response not OK. Status:', response.status);
          console.error('❌ Response text:', responseText);
          
          let errorMessage = 'Login failed';
          try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.detail || errorData.message || response.statusText;
          } catch (parseError) {
            errorMessage = responseText || response.statusText || 'Login failed';
          }
          throw new Error(errorMessage);
        }
      } catch (fetchError) {
        console.error('❌ Fetch network error:', fetchError);
        console.error('Error type:', typeof fetchError);
        console.error('Error name:', fetchError instanceof Error ? fetchError.name : 'N/A');
        console.error('Error message:', fetchError instanceof Error ? fetchError.message : String(fetchError));
        
        // If it's already an Error we threw (from response parsing), re-throw it
        if (fetchError instanceof Error && fetchError.message.includes('Login failed')) {
          throw fetchError;
        }
        
        // Network error - fetch failed completely
        if (fetchError instanceof TypeError) {
          const errorMsg = `Network error: Could not connect to server at ${api.baseUrl}. 
          
Troubleshooting:
1. Health check passed? Check console for health check result
2. Backend running? curl http://192.168.1.107:8000/health
3. Same WiFi? Both devices must be on same network
4. Firewall? Check macOS firewall settings

If health check passed but login fails, this might be a CORS or request format issue.`;
          throw new Error(errorMsg);
        }
        throw new Error('Network error: ' + String(fetchError));
      }

      // Response is already checked above, so parse JSON
      const data: LoginResponse = await response.json();
      console.log('Login successful, got token');
      const accessToken = data.access_token;

      await AsyncStorage.setItem('auth_token', accessToken);
      setToken(accessToken);

      // Load user info
      try {
        const userData = await api.get<User>('/users/me', accessToken);
        setUser(userData);
        console.log('User data loaded:', userData);
      } catch (userError) {
        console.error('Error loading user data:', userError);
        // Don't fail login if user data can't be loaded
      }

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      console.error('Error type:', typeof error);
      // Safely log error details
      try {
        const errorStr = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
        console.error('Error details:', errorStr);
      } catch (stringifyError) {
        console.error('Error (could not stringify):', error);
      }
      
      let errorMessage = 'Unknown error';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        // Try to extract message from error object
        const err = error as any;
        // Try multiple ways to get the error message
        if (err.message && typeof err.message === 'string') {
          errorMessage = err.message;
        } else if (err.detail && typeof err.detail === 'string') {
          errorMessage = err.detail;
        } else if (err.error && typeof err.error === 'string') {
          errorMessage = err.error;
        } else {
          // Try to stringify, but handle circular references
          try {
            const stringified = JSON.stringify(error, null, 2);
            if (stringified && !stringified.includes('[object Object]')) {
              errorMessage = stringified;
            } else {
              errorMessage = 'Network error: Could not connect to server';
            }
          } catch {
            errorMessage = 'Network error: Could not connect to server';
          }
        }
      }
      
      // Clean up the error message
      if (errorMessage.includes('[object Object]')) {
        errorMessage = 'Network error: Could not connect to server. Please check your connection and ensure the backend is running.';
      }
      
      // Ensure errorMessage is always a string
      const finalErrorMessage = String(errorMessage).trim() || 'Login failed. Please try again.';
      
      console.error('Final error message:', finalErrorMessage);
      
      return { 
        success: false, 
        error: finalErrorMessage
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

