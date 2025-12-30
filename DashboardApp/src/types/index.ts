/**
 * TypeScript type definitions
 */

export interface User {
  id: number;
  email: string;
  full_name?: string;
  is_active: boolean;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface DashboardSnapshot {
  as_of: string;
  total: {
    current: number;
    start: number;
    delta: {
      absolute: number;
      percent: number;
    };
  };
  performance: {
    series: Array<{ timestamp: string; value: number }>;
    position_series?: Array<{ timestamp: string; value: number }>;
    cash_series?: Array<{ timestamp: string; value: number }>;
    delta: {
      absolute: number;
      percent: number;
    };
    max: number;
    min: number;
  };
  allocation: Array<{
    asset_type: string;
    value: number;
    percent: number;
  }>;
  activity: Array<{
    timestamp: string;
    activity_type: string;
    position_id?: number;
    asset_type?: string;
    quantity: number;
    value: number;
    dividend_amount: number;
    ex_date?: string;
    ticker?: string;
  }>;
}

export interface Position {
  id: number;
  ticker: string;
  name?: string;
  shares: number;
  cost_basis: number;
  market_value?: number;
  asset_type?: string;
}

export enum ActivityType {
  BUY = 'BUY',
  SELL = 'SELL',
  DIVIDEND = 'DIVIDEND',
  UPCOMING_DIVIDEND = 'UPCOMING_DIVIDEND',
}

export interface ActivityItem {
  timestamp: string;
  activity_type: ActivityType | string; // Allow string for backend compatibility
  position_id?: number;
  asset_type?: string;
  quantity: number;
  value: number;
  dividend_amount: number;
  ex_date?: string;
  ticker?: string;
}

