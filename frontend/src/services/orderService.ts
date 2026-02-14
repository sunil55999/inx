import apiClient from '../config/api';
import { Order, CryptoCurrency } from '../types';

export interface CreateOrderData {
  listingId: string;
  cryptoCurrency: CryptoCurrency;
}

export const orderService = {
  // Create order
  async createOrder(data: CreateOrderData): Promise<Order> {
    const response = await apiClient.post('/api/orders', data);
    return response.data;
  },

  // Get order by ID
  async getOrder(id: string): Promise<Order> {
    const response = await apiClient.get(`/api/orders/${id}`);
    return response.data;
  },

  // Get user's orders
  async getOrders(): Promise<Order[]> {
    const response = await apiClient.get('/api/orders');
    return response.data;
  },
};
