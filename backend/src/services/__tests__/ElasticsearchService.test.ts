/**
 * Elasticsearch Service Tests
 * 
 * Tests for search functionality including:
 * - Multi-field matching
 * - Filter application
 * - Relevance scoring and ranking
 * - Fuzzy matching
 * - Autocomplete
 * 
 * Requirements: 9.1, 9.2, 9.4, 9.5
 */

import { ElasticsearchService } from '../ElasticsearchService';
import { elasticsearchClient } from '../../config/elasticsearch';
import { Listing, ListingStatus, SearchQuery } from '../../types/models';

// Mock the Elasticsearch client
jest.mock('../../config/elasticsearch', () => ({
  elasticsearchClient: {
    index: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    search: jest.fn(),
    bulk: jest.fn(),
  },
}));

// Mock the Redis cache
jest.mock('../../config/redis', () => ({
  cache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    flushPattern: jest.fn().mockResolvedValue(undefined),
  },
  redisClient: {
    zincrby: jest.fn().mockResolvedValue(1),
    zremrangebyrank: jest.fn().mockResolvedValue(0),
    zrevrange: jest.fn().mockResolvedValue([]),
  },
}));

describe('ElasticsearchService', () => {
  let service: ElasticsearchService;

  beforeEach(() => {
    service = new ElasticsearchService();
    jest.clearAllMocks();
  });

  describe('indexListing', () => {
    it('should index a listing with all required fields', async () => {
      const listing: Listing = {
        id: 'listing-1',
        merchantId: 'merchant-1',
        channelId: 'channel-1',
        description: 'Test listing',
        price: 100,
        currency: 'USDT_BEP20' as const,
        durationDays: 30,
        signalTypes: ['crypto', 'forex'],
        status: ListingStatus.ACTIVE,
        viewCount: 0,
        purchaseCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (elasticsearchClient.index as jest.Mock).mockResolvedValue({});

      await service.indexListing(
        listing,
        'merchant_user',
        'Merchant Name',
        'Test Channel',
        'test_channel'
      );

      expect(elasticsearchClient.index).toHaveBeenCalledWith({
        index: 'listings',
        id: listing.id,
        document: expect.objectContaining({
          id: listing.id,
          merchant_id: listing.merchantId,
          merchant_username: 'merchant_user',
          merchant_display_name: 'Merchant Name',
          channel_id: listing.channelId,
          channel_name: 'Test Channel',
          channel_username: 'test_channel',
          description: listing.description,
          price: listing.price,
          currency: listing.currency,
          duration_days: listing.durationDays,
          signal_types: listing.signalTypes,
          status: listing.status,
        }),
      });
    });
  });

  describe('removeListing', () => {
    it('should remove a listing from the index', async () => {
      (elasticsearchClient.delete as jest.Mock).mockResolvedValue({});

      await service.removeListing('listing-1');

      expect(elasticsearchClient.delete).toHaveBeenCalledWith({
        index: 'listings',
        id: 'listing-1',
      });
    });

    it('should handle 404 errors gracefully', async () => {
      (elasticsearchClient.delete as jest.Mock).mockRejectedValue({
        meta: { statusCode: 404 },
      });

      await expect(service.removeListing('listing-1')).resolves.not.toThrow();
    });
  });

  describe('search - Multi-field matching', () => {
    it('should search across channel names, descriptions, and merchant usernames', async () => {
      const query: SearchQuery = {
        text: 'crypto signals',
        limit: 20,
        offset: 0,
      };

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [],
          total: { value: 0 },
        },
      });

      await service.search(query);

      expect(elasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'listings',
          query: expect.objectContaining({
            bool: expect.objectContaining({
              must: expect.arrayContaining([
                expect.objectContaining({
                  multi_match: expect.objectContaining({
                    query: 'crypto signals',
                    fields: expect.arrayContaining([
                      'channel_name^3',
                      'channel_username^2',
                      'merchant_username^2',
                      'merchant_display_name^2',
                      'description',
                    ]),
                  }),
                }),
              ]),
            }),
          }),
        })
      );
    });

    it('should apply fuzzy matching with edit distance ≤ 2', async () => {
      const query: SearchQuery = {
        text: 'cryto', // Typo: should match "crypto"
        limit: 20,
        offset: 0,
      };

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [],
          total: { value: 0 },
        },
      });

      await service.search(query);

      expect(elasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              must: expect.arrayContaining([
                expect.objectContaining({
                  multi_match: expect.objectContaining({
                    fuzziness: 'AUTO', // AUTO provides edit distance ≤ 2
                  }),
                }),
              ]),
            }),
          }),
        })
      );
    });
  });

  describe('search - Filter application', () => {
    it('should filter by merchant ID', async () => {
      const query: SearchQuery = {
        merchantId: 'merchant-1',
        limit: 20,
        offset: 0,
      };

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [],
          total: { value: 0 },
        },
      });

      await service.search(query);

      expect(elasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                { term: { merchant_id: 'merchant-1' } },
              ]),
            }),
          }),
        })
      );
    });

    it('should filter by price range', async () => {
      const query: SearchQuery = {
        minPrice: 50,
        maxPrice: 200,
        limit: 20,
        offset: 0,
      };

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [],
          total: { value: 0 },
        },
      });

      await service.search(query);

      expect(elasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                {
                  range: {
                    price: {
                      gte: 50,
                      lte: 200,
                    },
                  },
                },
              ]),
            }),
          }),
        })
      );
    });

    it('should filter by currency', async () => {
      const query: SearchQuery = {
        currency: 'BTC',
        limit: 20,
        offset: 0,
      };

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [],
          total: { value: 0 },
        },
      });

      await service.search(query);

      expect(elasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                { term: { currency: 'BTC' } },
              ]),
            }),
          }),
        })
      );
    });

    it('should filter by signal types', async () => {
      const query: SearchQuery = {
        signalTypes: ['crypto', 'forex'],
        limit: 20,
        offset: 0,
      };

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [],
          total: { value: 0 },
        },
      });

      await service.search(query);

      expect(elasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                { terms: { signal_types: ['crypto', 'forex'] } },
              ]),
            }),
          }),
        })
      );
    });

    it('should only return active listings', async () => {
      const query: SearchQuery = {
        limit: 20,
        offset: 0,
      };

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [],
          total: { value: 0 },
        },
      });

      await service.search(query);

      expect(elasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                { term: { status: 'active' } },
              ]),
            }),
          }),
        })
      );
    });
  });

  describe('search - Sorting and ranking', () => {
    it('should sort by price ascending', async () => {
      const query: SearchQuery = {
        sortBy: 'price_asc',
        limit: 20,
        offset: 0,
      };

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [],
          total: { value: 0 },
        },
      });

      await service.search(query);

      expect(elasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: expect.arrayContaining([{ price: 'asc' }]),
        })
      );
    });

    it('should sort by price descending', async () => {
      const query: SearchQuery = {
        sortBy: 'price_desc',
        limit: 20,
        offset: 0,
      };

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [],
          total: { value: 0 },
        },
      });

      await service.search(query);

      expect(elasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: expect.arrayContaining([{ price: 'desc' }]),
        })
      );
    });

    it('should sort by popularity (purchase count)', async () => {
      const query: SearchQuery = {
        sortBy: 'popularity',
        limit: 20,
        offset: 0,
      };

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [],
          total: { value: 0 },
        },
      });

      await service.search(query);

      expect(elasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: expect.arrayContaining([{ purchase_count: 'desc' }]),
        })
      );
    });

    it('should sort by newest first by default', async () => {
      const query: SearchQuery = {
        limit: 20,
        offset: 0,
      };

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [],
          total: { value: 0 },
        },
      });

      await service.search(query);

      expect(elasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: expect.arrayContaining([{ created_at: 'desc' }]),
        })
      );
    });

    it('should include relevance score for text searches', async () => {
      const query: SearchQuery = {
        text: 'crypto',
        limit: 20,
        offset: 0,
      };

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [],
          total: { value: 0 },
        },
      });

      await service.search(query);

      expect(elasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: expect.arrayContaining(['_score']),
        })
      );
    });
  });

  describe('search - Result parsing', () => {
    it('should parse search results correctly', async () => {
      const mockHits = [
        {
          _source: {
            id: 'listing-1',
            merchant_id: 'merchant-1',
            channel_id: 'channel-1',
            description: 'Test listing',
            price: 100,
            currency: 'USDT_BEP20',
            duration_days: 30,
            signal_types: ['crypto'],
            status: 'active',
            view_count: 10,
            purchase_count: 5,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
      ];

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: mockHits,
          total: { value: 1 },
        },
      });

      const result = await service.search({
        limit: 20,
        offset: 0,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: 'listing-1',
        merchantId: 'merchant-1',
        channelId: 'channel-1',
        description: 'Test listing',
        price: 100,
        currency: 'USDT_BEP20',
        durationDays: 30,
        signalTypes: ['crypto'],
        status: 'active',
        viewCount: 10,
        purchaseCount: 5,
      });
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should handle pagination correctly', async () => {
      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: Array(20).fill({
            _source: {
              id: 'listing-1',
              merchant_id: 'merchant-1',
              channel_id: 'channel-1',
              description: 'Test',
              price: 100,
              currency: 'USDT_BEP20',
              duration_days: 30,
              signal_types: [],
              status: 'active',
              view_count: 0,
              purchase_count: 0,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            },
          }),
          total: { value: 50 },
        },
      });

      const result = await service.search({
        limit: 20,
        offset: 0,
      });

      expect(result.items).toHaveLength(20);
      expect(result.total).toBe(50);
      expect(result.hasMore).toBe(true);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });
  });

  describe('autocomplete', () => {
    it('should return autocomplete suggestions', async () => {
      const mockHits = [
        {
          _source: {
            channel_name: 'Crypto Signals Pro',
            channel_username: 'crypto_signals',
            merchant_username: 'crypto_trader',
            merchant_display_name: 'Crypto Trader',
          },
        },
      ];

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: mockHits,
        },
      });

      const suggestions = await service.autocomplete('crypto', 10);

      expect(suggestions).toContain('Crypto Signals Pro');
      expect(suggestions).toContain('crypto_signals');
      expect(suggestions).toContain('crypto_trader');
      expect(suggestions).toContain('Crypto Trader');
    });

    it('should deduplicate suggestions', async () => {
      const mockHits = [
        {
          _source: {
            channel_name: 'Crypto Signals',
            channel_username: 'crypto_signals',
            merchant_username: 'trader1',
            merchant_display_name: null,
          },
        },
        {
          _source: {
            channel_name: 'Crypto Signals', // Duplicate
            channel_username: 'crypto_signals_2',
            merchant_username: 'trader2',
            merchant_display_name: null,
          },
        },
      ];

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: mockHits,
        },
      });

      const suggestions = await service.autocomplete('crypto', 10);

      // Should only include "Crypto Signals" once
      const cryptoSignalsCount = suggestions.filter(s => s === 'Crypto Signals').length;
      expect(cryptoSignalsCount).toBe(1);
    });

    it('should limit suggestions to specified count', async () => {
      const mockHits = Array(20).fill({
        _source: {
          channel_name: 'Channel',
          channel_username: null,
          merchant_username: null,
          merchant_display_name: null,
        },
      }).map((hit, i) => ({
        _source: {
          ...hit._source,
          channel_name: `Channel ${i}`,
        },
      }));

      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: mockHits,
        },
      });

      const suggestions = await service.autocomplete('channel', 5);

      expect(suggestions.length).toBeLessThanOrEqual(5);
    });

    it('should only match active listings', async () => {
      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [],
        },
      });

      await service.autocomplete('test', 10);

      expect(elasticsearchClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                { term: { status: 'active' } },
              ]),
            }),
          }),
        })
      );
    });

    it('should use cached suggestions when available', async () => {
      const { cache } = require('../../config/redis');
      const cachedSuggestions = ['Cached Crypto', 'Cached Bitcoin'];
      
      (cache.get as jest.Mock).mockResolvedValueOnce(cachedSuggestions);

      const suggestions = await service.autocomplete('crypto', 10);

      expect(suggestions).toEqual(cachedSuggestions);
      expect(elasticsearchClient.search).not.toHaveBeenCalled();
    });

    it('should cache suggestions after fetching from Elasticsearch', async () => {
      const { cache } = require('../../config/redis');
      
      (cache.get as jest.Mock).mockResolvedValueOnce(null);
      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [
            {
              _source: {
                channel_name: 'Crypto Signals',
                channel_username: null,
                merchant_username: null,
                merchant_display_name: null,
              },
            },
          ],
        },
      });

      await service.autocomplete('crypto', 10);

      expect(cache.set).toHaveBeenCalledWith(
        'autocomplete:crypto:10',
        expect.arrayContaining(['Crypto Signals']),
        300 // 5 minutes TTL
      );
    });

    it('should include popular searches in suggestions', async () => {
      const { cache, redisClient } = require('../../config/redis');
      
      (cache.get as jest.Mock).mockResolvedValueOnce(null);
      (redisClient.zrevrange as jest.Mock).mockResolvedValueOnce(['crypto trading', 'crypto signals']);
      (elasticsearchClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [],
        },
      });

      const suggestions = await service.autocomplete('crypto', 10);

      expect(suggestions).toContain('crypto trading');
      expect(suggestions).toContain('crypto signals');
    });
  });

  describe('bulkIndex', () => {
    it('should bulk index multiple listings', async () => {
      const listings = [
        {
          listing: {
            id: 'listing-1',
            merchantId: 'merchant-1',
            channelId: 'channel-1',
            description: 'Test 1',
            price: 100,
            currency: 'USDT_BEP20' as const,
            durationDays: 30,
            signalTypes: [],
            status: ListingStatus.ACTIVE,
            viewCount: 0,
            purchaseCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          merchantUsername: 'merchant1',
          merchantDisplayName: 'Merchant 1',
          channelName: 'Channel 1',
          channelUsername: 'channel1',
        },
        {
          listing: {
            id: 'listing-2',
            merchantId: 'merchant-2',
            channelId: 'channel-2',
            description: 'Test 2',
            price: 200,
            currency: 'BTC' as const,
            durationDays: 60,
            signalTypes: [],
            status: ListingStatus.ACTIVE,
            viewCount: 0,
            purchaseCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          merchantUsername: 'merchant2',
          merchantDisplayName: 'Merchant 2',
          channelName: 'Channel 2',
          channelUsername: 'channel2',
        },
      ];

      (elasticsearchClient.bulk as jest.Mock).mockResolvedValue({
        errors: false,
        items: [],
      });

      await service.bulkIndex(listings);

      expect(elasticsearchClient.bulk).toHaveBeenCalledWith({
        operations: expect.arrayContaining([
          { index: { _index: 'listings', _id: 'listing-1' } },
          expect.objectContaining({ id: 'listing-1' }),
          { index: { _index: 'listings', _id: 'listing-2' } },
          expect.objectContaining({ id: 'listing-2' }),
        ]),
        refresh: true,
      });
    });

    it('should handle empty array', async () => {
      await service.bulkIndex([]);

      expect(elasticsearchClient.bulk).not.toHaveBeenCalled();
    });
  });

  describe('trackSearch', () => {
    it('should track search queries in Redis sorted set', async () => {
      const { redisClient } = require('../../config/redis');

      await service.trackSearch('crypto signals');

      expect(redisClient.zincrby).toHaveBeenCalledWith(
        'search:popular',
        1,
        'crypto signals'
      );
    });

    it('should normalize search queries before tracking', async () => {
      const { redisClient } = require('../../config/redis');

      await service.trackSearch('  CRYPTO SIGNALS  ');

      expect(redisClient.zincrby).toHaveBeenCalledWith(
        'search:popular',
        1,
        'crypto signals'
      );
    });

    it('should not track very short queries', async () => {
      const { redisClient } = require('../../config/redis');

      await service.trackSearch('a');

      expect(redisClient.zincrby).not.toHaveBeenCalled();
    });

    it('should limit popular searches to top 100', async () => {
      const { redisClient } = require('../../config/redis');

      await service.trackSearch('crypto signals');

      expect(redisClient.zremrangebyrank).toHaveBeenCalledWith(
        'search:popular',
        0,
        -101
      );
    });
  });

  describe('clearAutocompleteCache', () => {
    it('should clear all autocomplete cache entries', async () => {
      const { cache } = require('../../config/redis');

      await service.clearAutocompleteCache();

      expect(cache.flushPattern).toHaveBeenCalledWith('autocomplete:*');
    });
  });
});
