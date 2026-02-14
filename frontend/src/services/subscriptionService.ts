import apiClient from '../config/api';
import { Subscription } from '../types';

export const subscriptionService = {
  // Get user's subscriptions
  async getSubscriptions(): Promise<Subscription[]> {
    const response = await apiClient.get('/api/subscriptions');
    return response.data;
  },

  // Get subscription by ID
  async getSubscription(id: string): Promise<Subscription> {
    const response = await apiClient.get(`/api/subscriptions/${id}`);
    return response.data;
  },

  // Renew subscription
  async renewSubscription(id: string, cryptoCurrency: string): Promise<{ orderId: string }> {
    const response = await apiClient.post(`/api/subscriptions/${id}/renew`, {
      cryptoCurrency,
    });
    return response.data;
  },
};
