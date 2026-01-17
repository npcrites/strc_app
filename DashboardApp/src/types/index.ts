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
  granularity: 'daily' | 'weekly' | 'monthly';
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
    ticker: string;
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
  parent_ticker?: string;  // Parent company ticker (e.g., "MSTR" for "MSTR-A", undefined for standalone assets)
  shares: number;
  cost_basis: number;
  market_value?: number;
  asset_type?: string;
  average_cost_per_share?: number;
  current_price_per_share?: number;
  unrealized_gain_loss?: number;
  unrealized_gain_loss_percent?: number;
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

export interface MetricPoint {
  timestamp: string;
  value: number;
}

export interface ParentNAVHistory {
  parent_ticker: string;
  current_nav: number | null;
  granularity: string;
  series: MetricPoint[];
}

export interface Holdings {
  ticker: string;
  position_amount: number;
  shares: number;
  total_dividends: number;
  next_ex_date?: string | null;  // Next upcoming ex-dividend date (raw, ISO format)
  next_invest_by_date?: string | null;  // Last business day on or before ex_date (adjusted, ISO format)
  next_pay_date?: string | null;  // Payment date for next dividend (raw, ISO format)
  next_pay_date_adjusted?: string | null;  // Next business day on or after pay_date (adjusted, ISO format)
  next_payout_amount?: number | null;  // Payout amount for next dividend (based on shares_at_ex_date)
  daily_volume?: number | null;  // Daily volume from AssetMetrics cache
}

