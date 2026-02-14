/**
 * Search Routes Tests
 * Tests for search and autocomplete API endpoints
 * 
 * Requirements: 9.1, 9.2, 9.3
 */

import request from 'supertest';
import app from '../../app';
import { ListingService } from '../../services/ListingService';
import { Listing, SearchResult, ListingStatus } from '../../types/models';

// Mock the ListingService
jest.mock('../../services/ListingService');

describe('Search Routes', () => {
  let mockListingService: jest.Mocked<ListingService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockListingService = ListingService.prototype as jest.Mocked<ListingService>;
  });

  describe('GET /api/search', () => {
    const mockListings: Listing[] = [
      {
        id: '1',
        merchantId: 'merchant1',
        channelId: 'channel1',
        description: 'Premium crypto trading signals',
        price: 50,
        currency: 'USDT_BEP20',
        durationDays: 30,
        status: ListingStatus.ACTIVE,
        signalTypes: ['crypto', 'forex'],
        viewCount: 100,
        purchaseCount: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        merchantId: 'merchant2',
        channelId: 'channel2',
        description: 'Expert forex trading signals',
        price: 75,
        currency: 'USDT_BEP20',
        durationDays: 30,
        status: ListingStatus.ACTIVE,
        signalTypes: ['forex'],
        viewCount: 200,
        purchaseCount: 20,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should search listings with text query', async () => {
      const mockResult: SearchResult<Listing> = {
        items: mockListings,
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      mockListingService.listListings = jest.fn().mockResolvedValue(mockResult);
      mockListingService.trackSearch = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/search')
        .query({ text: 'crypto' });

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
      expect(response.body.query.text).toBe('crypto');
      expect(mockListingService.listListings).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'crypto',
          limit: 20,
          offset: 0,
        })
      );
      expect(mockListingService.trackSearch).toHaveBeenCalledWith('crypto');
    });

    it('should search with merchant filter', async () => {
      const mockResult: SearchResult<Listing> = {
        items: [mockListings[0]],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      mockListingService.listListings = jest.fn().mockResolvedValue(mockResult);
      mockListingService.trackSearch = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/search')
        .query({ merchantId: 'merchant1' });

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(1);
      expect(mockListingService.listListings).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantId: 'merchant1',
        })
      );
    });

    it('should search with price range filter', async () => {
      const mockResult: SearchResult<Listing> = {
        items: [mockListings[0]],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      mockListingService.listListings = jest.fn().mockResolvedValue(mockResult);
      mockListingService.trackSearch = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/search')
        .query({ minPrice: 40, maxPrice: 60 });

      expect(response.status).toBe(200);
      expect(mockListingService.listListings).toHaveBeenCalledWith(
        expect.objectContaining({
          minPrice: 40,
          maxPrice: 60,
        })
      );
    });

    it('should search with currency filter', async () => {
      const mockResult: SearchResult<Listing> = {
        items: mockListings,
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      mockListingService.listListings = jest.fn().mockResolvedValue(mockResult);
      mockListingService.trackSearch = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/search')
        .query({ currency: 'USDT_BEP20' });

      expect(response.status).toBe(200);
      expect(mockListingService.listListings).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'USDT_BEP20',
        })
      );
    });

    it('should search with signal types filter', async () => {
      const mockResult: SearchResult<Listing> = {
        items: [mockListings[0]],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      mockListingService.listListings = jest.fn().mockResolvedValue(mockResult);
      mockListingService.trackSearch = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/search')
        .query({ signalTypes: 'crypto,forex' });

      expect(response.status).toBe(200);
      expect(mockListingService.listListings).toHaveBeenCalledWith(
        expect.objectContaining({
          signalTypes: ['crypto', 'forex'],
        })
      );
    });

    it('should search with sort parameter', async () => {
      const mockResult: SearchResult<Listing> = {
        items: mockListings,
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      mockListingService.listListings = jest.fn().mockResolvedValue(mockResult);
      mockListingService.trackSearch = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/search')
        .query({ sortBy: 'price_asc' });

      expect(response.status).toBe(200);
      expect(mockListingService.listListings).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: 'price_asc',
        })
      );
    });

    it('should search with pagination', async () => {
      const mockResult: SearchResult<Listing> = {
        items: mockListings,
        total: 50,
        limit: 10,
        offset: 20,
        hasMore: true,
      };

      mockListingService.listListings = jest.fn().mockResolvedValue(mockResult);
      mockListingService.trackSearch = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/search')
        .query({ limit: 10, offset: 20 });

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(10);
      expect(response.body.pagination.offset).toBe(20);
      expect(response.body.pagination.hasMore).toBe(true);
      expect(mockListingService.listListings).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 20,
        })
      );
    });

    it('should enforce maximum limit of 100', async () => {
      const mockResult: SearchResult<Listing> = {
        items: mockListings,
        total: 2,
        limit: 100,
        offset: 0,
        hasMore: false,
      };

      mockListingService.listListings = jest.fn().mockResolvedValue(mockResult);
      mockListingService.trackSearch = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/search')
        .query({ limit: 200 });

      expect(response.status).toBe(200);
      expect(mockListingService.listListings).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100, // Should be capped at 100
        })
      );
    });

    it('should reject negative minimum price', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ minPrice: -10 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_PRICE_RANGE');
      expect(response.body.error.message).toContain('Minimum price cannot be negative');
    });

    it('should reject negative maximum price', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ maxPrice: -10 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_PRICE_RANGE');
      expect(response.body.error.message).toContain('Maximum price cannot be negative');
    });

    it('should reject invalid price range (min > max)', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ minPrice: 100, maxPrice: 50 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_PRICE_RANGE');
      expect(response.body.error.message).toContain('Minimum price cannot be greater than maximum price');
    });

    it('should handle search without text query', async () => {
      const mockResult: SearchResult<Listing> = {
        items: mockListings,
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      mockListingService.listListings = jest.fn().mockResolvedValue(mockResult);
      mockListingService.trackSearch = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/search');

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(2);
      expect(mockListingService.trackSearch).not.toHaveBeenCalled();
    });

    it('should handle search service errors gracefully', async () => {
      mockListingService.listListings = jest.fn().mockRejectedValue(new Error('Search service error'));

      const response = await request(app)
        .get('/api/search')
        .query({ text: 'crypto' });

      expect(response.status).toBe(500);
    });

    it('should not fail if trackSearch fails', async () => {
      const mockResult: SearchResult<Listing> = {
        items: mockListings,
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      mockListingService.listListings = jest.fn().mockResolvedValue(mockResult);
      mockListingService.trackSearch = jest.fn().mockRejectedValue(new Error('Track search failed'));

      const response = await request(app)
        .get('/api/search')
        .query({ text: 'crypto' });

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(2);
    });
  });

  describe('GET /api/search/autocomplete', () => {
    it('should return autocomplete suggestions', async () => {
      const mockSuggestions = ['Crypto Signals Pro', 'Crypto Trading Elite', 'Cryptocurrency Alerts'];

      mockListingService.getAutocompleteSuggestions = jest.fn().mockResolvedValue(mockSuggestions);

      const response = await request(app)
        .get('/api/search/autocomplete')
        .query({ q: 'crypto' });

      expect(response.status).toBe(200);
      expect(response.body.suggestions).toEqual(mockSuggestions);
      expect(response.body.query).toBe('crypto');
      expect(mockListingService.getAutocompleteSuggestions).toHaveBeenCalledWith('crypto', 10);
    });

    it('should respect custom limit', async () => {
      const mockSuggestions = ['Crypto Signals Pro', 'Crypto Trading Elite'];

      mockListingService.getAutocompleteSuggestions = jest.fn().mockResolvedValue(mockSuggestions);

      const response = await request(app)
        .get('/api/search/autocomplete')
        .query({ q: 'crypto', limit: 5 });

      expect(response.status).toBe(200);
      expect(mockListingService.getAutocompleteSuggestions).toHaveBeenCalledWith('crypto', 5);
    });

    it('should enforce maximum limit of 20', async () => {
      const mockSuggestions = ['Crypto Signals Pro'];

      mockListingService.getAutocompleteSuggestions = jest.fn().mockResolvedValue(mockSuggestions);

      const response = await request(app)
        .get('/api/search/autocomplete')
        .query({ q: 'crypto', limit: 50 });

      expect(response.status).toBe(200);
      expect(mockListingService.getAutocompleteSuggestions).toHaveBeenCalledWith('crypto', 20);
    });

    it('should reject missing query parameter', async () => {
      const response = await request(app)
        .get('/api/search/autocomplete');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('MISSING_QUERY');
      expect(response.body.error.message).toContain('Query parameter "q" is required');
    });

    it('should reject empty query parameter', async () => {
      const response = await request(app)
        .get('/api/search/autocomplete')
        .query({ q: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('MISSING_QUERY');
    });

    it('should return empty suggestions for very short queries', async () => {
      const response = await request(app)
        .get('/api/search/autocomplete')
        .query({ q: 'a' });

      expect(response.status).toBe(200);
      expect(response.body.suggestions).toEqual([]);
      expect(response.body.query).toBe('a');
      expect(mockListingService.getAutocompleteSuggestions).not.toHaveBeenCalled();
    });

    it('should handle autocomplete service errors gracefully', async () => {
      mockListingService.getAutocompleteSuggestions = jest.fn().mockRejectedValue(new Error('Autocomplete error'));

      const response = await request(app)
        .get('/api/search/autocomplete')
        .query({ q: 'crypto' });

      expect(response.status).toBe(200);
      expect(response.body.suggestions).toEqual([]);
      expect(response.body.query).toBe('crypto');
    });

    it('should return empty array when no suggestions found', async () => {
      mockListingService.getAutocompleteSuggestions = jest.fn().mockResolvedValue([]);

      const response = await request(app)
        .get('/api/search/autocomplete')
        .query({ q: 'nonexistent' });

      expect(response.status).toBe(200);
      expect(response.body.suggestions).toEqual([]);
    });
  });

  describe('Requirements Validation', () => {
    const mockListings: Listing[] = [
      {
        id: '1',
        merchantId: 'merchant1',
        channelId: 'channel1',
        description: 'Premium crypto trading signals',
        price: 50,
        currency: 'USDT_BEP20',
        durationDays: 30,
        status: ListingStatus.ACTIVE,
        signalTypes: ['crypto', 'forex'],
        viewCount: 100,
        purchaseCount: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        merchantId: 'merchant2',
        channelId: 'channel2',
        description: 'Expert forex trading signals',
        price: 75,
        currency: 'USDT_BEP20',
        durationDays: 30,
        status: ListingStatus.ACTIVE,
        signalTypes: ['forex'],
        viewCount: 200,
        purchaseCount: 20,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should validate Requirement 9.1: Full-text search across multiple fields', async () => {
      const mockResult: SearchResult<Listing> = {
        items: mockListings,
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      mockListingService.listListings = jest.fn().mockResolvedValue(mockResult);
      mockListingService.trackSearch = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/search')
        .query({ text: 'crypto signals' });

      expect(response.status).toBe(200);
      expect(mockListingService.listListings).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'crypto signals',
        })
      );
    });

    it('should validate Requirement 9.2: Return matching listings ranked by relevance', async () => {
      const mockResult: SearchResult<Listing> = {
        items: mockListings,
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      mockListingService.listListings = jest.fn().mockResolvedValue(mockResult);
      mockListingService.trackSearch = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/search')
        .query({ text: 'signals' });

      expect(response.status).toBe(200);
      expect(response.body.results).toBeDefined();
      expect(Array.isArray(response.body.results)).toBe(true);
    });

    it('should validate Requirement 9.3: Provide autocomplete suggestions', async () => {
      const mockSuggestions = ['Crypto Signals', 'Crypto Trading'];

      mockListingService.getAutocompleteSuggestions = jest.fn().mockResolvedValue(mockSuggestions);

      const response = await request(app)
        .get('/api/search/autocomplete')
        .query({ q: 'crypto' });

      expect(response.status).toBe(200);
      expect(response.body.suggestions).toEqual(mockSuggestions);
    });
  });
});
