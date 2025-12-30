/**
 * API service - fetch wrapper for backend communication
 */
import Constants from 'expo-constants';

const API_BASE_URL = __DEV__
  ? (Constants.expoConfig?.extra?.apiUrl || 'http://localhost:8000/api')
  : 'https://api.strctracker.com/api';

export interface ApiError {
  detail: string;
}

class ApiService {
  public readonly baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  async get<T>(endpoint: string, token: string | null = null): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({ 
        detail: response.statusText 
      }));
      throw new Error(error.detail || `API Error: ${response.statusText}`);
    }

    return await response.json();
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
      const error: ApiError = await response.json().catch(() => ({ 
        detail: response.statusText 
      }));
      throw new Error(error.detail || `API Error: ${response.statusText}`);
    }

    return await response.json();
  }
}

export const api = new ApiService();

