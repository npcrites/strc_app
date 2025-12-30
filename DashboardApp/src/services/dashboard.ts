/**
 * Dashboard API service - specific endpoints for dashboard data
 */
import { api } from './api';
import { DashboardSnapshot } from '../types';

export interface DashboardParams {
  time_range?: '1M' | '3M' | '1Y' | 'ALL';
}

export const dashboardApi = {
  /**
   * Get dashboard snapshot
   */
  async getSnapshot(token: string, params?: DashboardParams): Promise<DashboardSnapshot> {
    const timeRange = params?.time_range || '1M';
    return api.get<DashboardSnapshot>(`/dashboard/snapshot?time_range=${timeRange}`, token);
  },
};

