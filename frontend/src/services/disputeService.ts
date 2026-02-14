import apiClient from '../config/api';
import { Dispute } from '../types';

export interface CreateDisputeData {
  subscriptionId: string;
  reason: string;
  description: string;
}

export interface RespondToDisputeData {
  response: string;
}

export interface ResolveDisputeData {
  resolution: string;
  refundPercentage: number;
}

export const disputeService = {
  // Create dispute (buyer)
  async createDispute(data: CreateDisputeData): Promise<Dispute> {
    const response = await apiClient.post('/api/disputes', data);
    return response.data;
  },

  // Get dispute by ID
  async getDispute(id: string): Promise<Dispute> {
    const response = await apiClient.get(`/api/disputes/${id}`);
    return response.data;
  },

  // Get user's disputes
  async getDisputes(): Promise<Dispute[]> {
    const response = await apiClient.get('/api/disputes');
    return response.data;
  },

  // Respond to dispute (merchant)
  async respondToDispute(id: string, data: RespondToDisputeData): Promise<Dispute> {
    const response = await apiClient.post(`/api/disputes/${id}/respond`, data);
    return response.data;
  },

  // Resolve dispute (admin)
  async resolveDispute(id: string, data: ResolveDisputeData): Promise<Dispute> {
    const response = await apiClient.post(`/api/disputes/${id}/resolve`, data);
    return response.data;
  },
};
