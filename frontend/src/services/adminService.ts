import apiClient from '../config/api';
import { Dispute, Payout, PlatformMetrics, Order } from '../types';

export interface PlatformStatistics {
  totalRevenue: number;
  totalOrders: number;
  totalSubscriptions: number;
  totalDisputes: number;
  totalPayouts: number;
  revenueByMonth: Array<{ month: string; revenue: number }>;
}

export const adminService = {
  // Get disputes for review
  async getDisputes(): Promise<Dispute[]> {
    const response = await apiClient.get('/api/admin/disputes');
    return response.data;
  },

  // Get pending payouts
  async getPendingPayouts(): Promise<Payout[]> {
    const response = await apiClient.get('/api/admin/payouts');
    return response.data;
  },

  // Get platform metrics
  async getMetrics(): Promise<PlatformMetrics> {
    const response = await apiClient.get('/api/admin/metrics');
    return response.data;
  },

  // Get platform statistics
  async getStatistics(): Promise<PlatformStatistics> {
    const response = await apiClient.get('/api/admin/statistics');
    return response.data;
  },

  // Get recent orders
  async getRecentOrders(limit?: number): Promise<Order[]> {
    const response = await apiClient.get('/api/admin/orders/recent', {
      params: { limit },
    });
    return response.data;
  },

  // Get audit log
  async getAuditLog(limit?: number): Promise<any[]> {
    const response = await apiClient.get('/api/admin/audit-log', {
      params: { limit },
    });
    return response.data;
  },

  // Suspend merchant
  async suspendMerchant(merchantId: string, reason: string): Promise<void> {
    await apiClient.post(`/api/admin/merchants/${merchantId}/suspend`, { reason });
  },

  // Unsuspend merchant
  async unsuspendMerchant(merchantId: string): Promise<void> {
    await apiClient.post(`/api/admin/merchants/${merchantId}/unsuspend`);
  },
};
