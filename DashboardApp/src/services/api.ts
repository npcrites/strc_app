/**
 * API service - fetch wrapper for backend communication
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_BASE_URL = __DEV__
  ? (Constants.expoConfig?.extra?.apiUrl || 'http://localhost:8000/api')
  : 'https://api.strctracker.com/api';

const API_BASE_URL_DEVICE = __DEV__
  ? (Constants.expoConfig?.extra?.apiUrlDevice || 'http://192.168.1.155:8000/api')
  : 'https://api.strctracker.com/api';

export interface ApiError {
  detail: string;
}

class ApiService {
  public readonly baseUrl: string;

  constructor() {
    // Use device URL if running on a physical device, otherwise use localhost
    // Constants.isDevice is true for physical devices, false for simulators
    // For Expo Go on physical devices, we need to use the network IP
    if (__DEV__) {
      // Check if we're on a physical device
      // Constants.isDevice is true for physical devices, false for simulators
      // For Expo Go, Constants.isDevice should be true on physical devices
      const isPhysicalDevice = Constants.isDevice === true;
      
      // Fallback: If we're on iOS/Android (not web), assume it's a physical device
      // This helps when Constants.isDevice doesn't work correctly
      const isMobilePlatform = Platform.OS === 'ios' || Platform.OS === 'android';
      const useDeviceUrl = isPhysicalDevice || (isMobilePlatform && __DEV__);
      
      console.log('🔍 Device detection:', {
        isDevice: Constants.isDevice,
        platform: Platform.OS,
        __DEV__: __DEV__,
        isMobilePlatform: isMobilePlatform,
        useDeviceUrl: useDeviceUrl,
        apiUrl: Constants.expoConfig?.extra?.apiUrl,
        apiUrlDevice: Constants.expoConfig?.extra?.apiUrlDevice,
      });
      
      if (useDeviceUrl) {
        this.baseUrl = API_BASE_URL_DEVICE;
        console.log('📱 Using device API URL:', this.baseUrl);
        console.log('   Reason: isDevice=' + isPhysicalDevice + ', isMobilePlatform=' + isMobilePlatform);
      } else {
        this.baseUrl = API_BASE_URL;
        console.log('💻 Using localhost API URL:', this.baseUrl);
      }
      
      console.log('✅ API Service initialized with baseUrl:', this.baseUrl);
      
      // Test the URL immediately (async, won't block)
      if (__DEV__) {
        console.log('🧪 Testing API URL connectivity...');
        const healthUrl = `${this.baseUrl.replace('/api', '')}/health`;
        
        // Create an AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        fetch(healthUrl, { 
          signal: controller.signal,
          method: 'GET',
        })
          .then(res => {
            clearTimeout(timeoutId);
            if (res.ok) {
              return res.json();
            }
            throw new Error(`Health check failed: ${res.status} ${res.statusText}`);
          })
          .then(data => {
            console.log('✅ Backend health check successful:', data);
            // Also test login endpoint (OPTIONS preflight)
            console.log('🧪 Testing login endpoint preflight...');
            const preflightController = new AbortController();
            const preflightTimeout = setTimeout(() => preflightController.abort(), 5000);
            return fetch(`${this.baseUrl}/users/login`, {
              method: 'OPTIONS',
              signal: preflightController.signal,
            }).then(res => {
              clearTimeout(preflightTimeout);
              console.log('✅ Login endpoint preflight status:', res.status);
              return res;
            }).catch(err => {
              clearTimeout(preflightTimeout);
              if (err.name === 'AbortError') {
                console.warn('⚠️ Login endpoint preflight timed out (may be normal)');
              } else {
                console.warn('⚠️ Login endpoint preflight test failed (may be normal):', err.message);
              }
            });
          })
          .catch(err => {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
              console.error('❌ Backend health check timed out after 5 seconds');
              console.error('   This usually means the device cannot reach the server');
              console.error('   Tried URL:', healthUrl);
              console.error('   Check:');
              console.error('   1. Both devices are on the same WiFi network');
              console.error('   2. Server is running: cd backend && ./start_server.sh');
              console.error('   3. Firewall allows connections on port 8000');
              console.error('   4. IP address is correct (current: 192.168.1.152)');
            } else {
              console.error('❌ Backend health check failed:', err.message);
              console.error('   Tried URL:', healthUrl);
              console.error('   Make sure backend is running: cd backend && python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000');
            }
          });
      }
    } else {
      // Production
      this.baseUrl = 'https://api.strctracker.com/api';
      console.log('🚀 Production - Using API URL:', this.baseUrl);
    }
  }

  async get<T>(endpoint: string, token: string | null = null): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}${endpoint}`;
    console.log(`API GET: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      console.log(`API Response status: ${response.status}`);

      if (!response.ok) {
        // Handle 401 Unauthorized - token expired or invalid
        if (response.status === 401) {
          console.error('❌ Authentication failed (401) - token may have expired');
          // Clear token from storage if it exists
          if (token) {
            try {
              const AsyncStorage = require('@react-native-async-storage/async-storage').default;
              await AsyncStorage.removeItem('auth_token');
              console.log('🗑️ Cleared expired token from storage');
              // Trigger global 401 handler for fade transition
              if ((global as any).handle401Error) {
                (global as any).handle401Error();
              }
            } catch (storageError) {
              console.error('Error clearing token:', storageError);
            }
          }
          // Throw a specific error that can be caught by components
          const error = new Error('AUTHENTICATION_EXPIRED');
          (error as any).status = 401;
          throw error;
        }
        
        const error: ApiError = await response.json().catch(() => ({ 
          detail: response.statusText 
        }));
        console.error(`API Error: ${error.detail || response.statusText}`);
        throw new Error(error.detail || `API Error: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API fetch error:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error: Failed to fetch data');
    }
  }

  async post<T>(endpoint: string, data: any, token: string | null = null): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      // Handle 401 Unauthorized
      if (response.status === 401 && token) {
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.removeItem('auth_token');
          if ((global as any).handle401Error) {
            (global as any).handle401Error();
          }
        } catch (storageError) {
          console.error('Error clearing token:', storageError);
        }
        const error = new Error('AUTHENTICATION_EXPIRED');
        (error as any).status = 401;
        throw error;
      }
      
      const error: ApiError = await response.json().catch(() => ({ 
        detail: response.statusText 
      }));
      throw new Error(error.detail || `API Error: ${response.statusText}`);
    }

    return await response.json();
  }

  async put<T>(endpoint: string, data: any, token: string | null = null): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      // Handle 401 Unauthorized
      if (response.status === 401 && token) {
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.removeItem('auth_token');
          if ((global as any).handle401Error) {
            (global as any).handle401Error();
          }
        } catch (storageError) {
          console.error('Error clearing token:', storageError);
        }
        const error = new Error('AUTHENTICATION_EXPIRED');
        (error as any).status = 401;
        throw error;
      }
      
      const error: ApiError = await response.json().catch(() => ({ 
        detail: response.statusText 
      }));
      throw new Error(error.detail || `API Error: ${response.statusText}`);
    }

    return await response.json();
  }

  async delete<T>(endpoint: string, token: string | null = null): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      // Handle 401 Unauthorized
      if (response.status === 401 && token) {
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.removeItem('auth_token');
          if ((global as any).handle401Error) {
            (global as any).handle401Error();
          }
        } catch (storageError) {
          console.error('Error clearing token:', storageError);
        }
        const error = new Error('AUTHENTICATION_EXPIRED');
        (error as any).status = 401;
        throw error;
      }
      
      const error: ApiError = await response.json().catch(() => ({ 
        detail: response.statusText 
      }));
      throw new Error(error.detail || `API Error: ${response.statusText}`);
    }

    return await response.json();
  }
}

export const api = new ApiService();

