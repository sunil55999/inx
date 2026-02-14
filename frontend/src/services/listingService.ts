import apiClient from '../config/api';
import { Listing, SignalType } from '../types';

export interface ListingFilters {
  merchantId?: string;
  signalType?: SignalType;
  minPrice?: number;
  maxPrice?: number;
  isActive?: boolean;
  search?: string;
}

export interface CreateListingData {
  channelId: string;
  channelName: string;
  channelUsername: string;
  title: string;
  description: string;
  signalType: SignalType;
  priceUsd: number;
  durationDays: number;
}

export const listingService = {
  // Get all listings with filters
  async getListings(filters?: ListingFilters): Promise<Listing[]> {
    const response = await apiClient.get('/api/listings', { params: filters });
    return response.data;
  },

  // Get single listing
  async getListing(id: string): Promise<Listing> {
    const response = await apiClient.get(`/api/listings/${id}`);
    return response.data;
  },

  // Create listing (merchant only)
  async createListing(data: CreateListingData): Promise<Listing> {
    const response = await apiClient.post('/api/listings', data);
    return response.data;
  },

  // Update listing (merchant only)
  async updateListing(id: string, data: Partial<CreateListingData>): Promise<Listing> {
    const response = await apiClient.patch(`/api/listings/${id}`, data);
    return response.data;
  },

  // Delete listing (merchant only)
  async deleteListing(id: string): Promise<void> {
    await apiClient.delete(`/api/listings/${id}`);
  },

  // Get merchant's listings
  async getMerchantListings(): Promise<Listing[]> {
    const response = await apiClient.get('/api/listings', {
      params: { merchantOwned: true },
    });
    return response.data;
  },
};
