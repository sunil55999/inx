import apiClient from '../config/api';
import { Merchant, Listing, MerchantBalance, Payout } from '../types';

export interface UpdateMerchantProfileData {
  displayName?: string;
  bio?: string;
  profileImage?: string;
}

export interface CreatePayoutData {
  amount: number;
  currency: string;
  walletAddress: string;
}

export const merchantService = {
  // Get merchant storefront
  async getStorefront(username: string): Promise<{ merchant: Merchant; listings: Listing[] }> {
    const response = await apiClient.get(`/api/store/${username}`);
    return response.data;
  },

  // Get merchant profile
  async getProfile(): Promise<Merchant> {
    const response = await apiClient.get('/api/merchant/profile');
    return response.data;
  },

  // Update merchant profile
  async updateProfile(data: UpdateMerchantProfileData): Promise<Merchant> {
    const response = await apiClient.patch('/api/merchant/profile', data);
    return response.data;
  },

  // Search merchants
  async searchMerchants(query: string): Promise<Merchant[]> {
    const response = await apiClient.get('/api/merchants/search', {
      params: { q: query },
    });
    return response.data;
  },

  // Get merchant balance
  async getBalance(): Promise<MerchantBalance[]> {
    const response = await apiClient.get('/api/merchant/balance');
    return response.data;
  },

  // Create payout request
  async createPayout(data: CreatePayoutData): Promise<Payout> {
    const response = await apiClient.post('/api/payouts', data);
    return response.data;
  },

  // Get payouts
  async getPayouts(): Promise<Payout[]> {
    const response = await apiClient.get('/api/payouts');
    return response.data;
  },

  // Get payout by ID
  async getPayout(id: string): Promise<Payout> {
    const response = await apiClient.get(`/api/payouts/${id}`);
    return response.data;
  },
};
