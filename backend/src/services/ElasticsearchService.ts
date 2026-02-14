import { elasticsearchClient } from '../config/elasticsearch';
import { Listing, SearchQuery, SearchResult } from '../types/models';
import logger from '../utils/logger';
import { cache } from '../config/redis';

/**
 * Elasticsearch Service
 * 
 * Handles indexing and searching of listings using Elasticsearch
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */
export class ElasticsearchService {
  private readonly indexName = 'listings';
  private readonly AUTOCOMPLETE_CACHE_TTL = 300; // 5 minutes cache for autocomplete
  private readonly POPULAR_SEARCHES_KEY = 'search:popular';
  private readonly POPULAR_SEARCHES_LIMIT = 100;

  /**
   * Index a single listing
   * 
   * @param listing - Listing to index
   * @param merchantUsername - Merchant username for search
   * @param merchantDisplayName - Merchant display name for search
   * @param channelName - Channel name for search
   * @param channelUsername - Channel username for search
   */
  async indexListing(
    listing: Listing,
    merchantUsername: string,
    merchantDisplayName: string | null,
    channelName: string,
    channelUsername: string | null
  ): Promise<void> {
    try {
      await elasticsearchClient.index({
        index: this.indexName,
        id: listing.id,
        document: {
          id: listing.id,
          merchant_id: listing.merchantId,
          merchant_username: merchantUsername,
          merchant_display_name: merchantDisplayName,
          channel_id: listing.channelId,
          channel_name: channelName,
          channel_username: channelUsername,
          description: listing.description,
          price: listing.price,
          currency: listing.currency,
          duration_days: listing.durationDays,
          signal_types: listing.signalTypes,
          status: listing.status,
          view_count: listing.viewCount,
          purchase_count: listing.purchaseCount,
          created_at: listing.createdAt,
          updated_at: listing.updatedAt,
        },
      });

      logger.debug('Listing indexed in Elasticsearch', { listingId: listing.id });
    } catch (error) {
      logger.error('Failed to index listing in Elasticsearch', { 
        error, 
        listingId: listing.id 
      });
      throw error;
    }
  }

  /**
   * Remove a listing from the index
   * 
   * @param listingId - ID of listing to remove
   */
  async removeListing(listingId: string): Promise<void> {
    try {
      await elasticsearchClient.delete({
        index: this.indexName,
        id: listingId,
      });

      logger.debug('Listing removed from Elasticsearch', { listingId });
    } catch (error: any) {
      // Ignore 404 errors (listing not found in index)
      if (error.meta?.statusCode === 404) {
        logger.debug('Listing not found in Elasticsearch index', { listingId });
        return;
      }

      logger.error('Failed to remove listing from Elasticsearch', { 
        error, 
        listingId 
      });
      throw error;
    }
  }

  /**
   * Update a listing in the index
   * 
   * @param listing - Updated listing data
   * @param merchantUsername - Merchant username
   * @param merchantDisplayName - Merchant display name
   * @param channelName - Channel name
   * @param channelUsername - Channel username
   */
  async updateListing(
    listing: Listing,
    merchantUsername: string,
    merchantDisplayName: string | null,
    channelName: string,
    channelUsername: string | null
  ): Promise<void> {
    try {
      await elasticsearchClient.update({
        index: this.indexName,
        id: listing.id,
        doc: {
          merchant_username: merchantUsername,
          merchant_display_name: merchantDisplayName,
          channel_name: channelName,
          channel_username: channelUsername,
          description: listing.description,
          price: listing.price,
          currency: listing.currency,
          duration_days: listing.durationDays,
          signal_types: listing.signalTypes,
          status: listing.status,
          view_count: listing.viewCount,
          purchase_count: listing.purchaseCount,
          updated_at: listing.updatedAt,
        },
      });

      logger.debug('Listing updated in Elasticsearch', { listingId: listing.id });
    } catch (error: any) {
      // If document doesn't exist, index it
      if (error.meta?.statusCode === 404) {
        logger.debug('Listing not found in index, creating new document', { 
          listingId: listing.id 
        });
        await this.indexListing(
          listing,
          merchantUsername,
          merchantDisplayName,
          channelName,
          channelUsername
        );
        return;
      }

      logger.error('Failed to update listing in Elasticsearch', { 
        error, 
        listingId: listing.id 
      });
      throw error;
    }
  }

  /**
   * Search listings with full-text search and filters
   * 
   * Supports:
   * - Full-text search across channel names, descriptions, and merchant usernames
   * - Filtering by merchant, price range, currency, signal types
   * - Sorting by price, popularity, or date
   * - Fuzzy matching with edit distance ≤ 2
   * 
   * Requirements: 9.1, 9.2, 9.4, 9.5
   * 
   * @param query - Search query with filters
   * @returns Search results with pagination
   */
  async search(query: SearchQuery): Promise<SearchResult<Listing>> {
    try {
      const must: any[] = [];
      const filter: any[] = [];

      // Only search active listings
      filter.push({
        term: { status: 'active' },
      });

      // Full-text search with fuzzy matching
      if (query.text) {
        must.push({
          multi_match: {
            query: query.text,
            fields: [
              'channel_name^3',           // Boost channel name matches
              'channel_username^2',       // Boost channel username matches
              'merchant_username^2',      // Boost merchant username matches
              'merchant_display_name^2',  // Boost merchant display name matches
              'description',              // Regular weight for description
            ],
            type: 'best_fields',
            fuzziness: 'AUTO',            // Auto fuzzy matching (edit distance ≤ 2)
            prefix_length: 1,             // Require at least 1 character to match exactly
            operator: 'or',
          },
        });
      }

      // Filter by merchant
      if (query.merchantId) {
        filter.push({
          term: { merchant_id: query.merchantId },
        });
      }

      // Filter by price range
      if (query.minPrice !== undefined || query.maxPrice !== undefined) {
        const priceRange: any = {};
        if (query.minPrice !== undefined) {
          priceRange.gte = query.minPrice;
        }
        if (query.maxPrice !== undefined) {
          priceRange.lte = query.maxPrice;
        }
        filter.push({
          range: { price: priceRange },
        });
      }

      // Filter by currency
      if (query.currency) {
        filter.push({
          term: { currency: query.currency },
        });
      }

      // Filter by signal types
      if (query.signalTypes && query.signalTypes.length > 0) {
        filter.push({
          terms: { signal_types: query.signalTypes },
        });
      }

      // Build sort criteria
      const sort: any[] = [];
      switch (query.sortBy) {
        case 'price_asc':
          sort.push({ price: 'asc' });
          break;
        case 'price_desc':
          sort.push({ price: 'desc' });
          break;
        case 'popularity':
          sort.push({ purchase_count: 'desc' });
          break;
        case 'newest':
        default:
          sort.push({ created_at: 'desc' });
          break;
      }

      // Add relevance score as secondary sort for text searches
      if (query.text) {
        sort.push('_score');
      }

      // Execute search
      const response = await elasticsearchClient.search({
        index: this.indexName,
        query: {
          bool: {
            must: must.length > 0 ? must : undefined,
            filter: filter.length > 0 ? filter : undefined,
          },
        },
        sort,
        from: query.offset,
        size: query.limit,
      });

      // Extract results
      const items = response.hits.hits.map((hit: any) => {
        const source = hit._source;
        return {
          id: source.id,
          merchantId: source.merchant_id,
          channelId: source.channel_id,
          description: source.description,
          price: source.price,
          currency: source.currency,
          durationDays: source.duration_days,
          signalTypes: source.signal_types,
          status: source.status,
          viewCount: source.view_count,
          purchaseCount: source.purchase_count,
          createdAt: new Date(source.created_at),
          updatedAt: new Date(source.updated_at),
        } as Listing;
      });

      const total = typeof response.hits.total === 'number' 
        ? response.hits.total 
        : response.hits.total?.value || 0;

      return {
        items,
        total,
        hasMore: query.offset + items.length < total,
        limit: query.limit,
        offset: query.offset,
      };
    } catch (error) {
      logger.error('Elasticsearch search failed', { error, query });
      throw error;
    }
  }

  /**
   * Get autocomplete suggestions
   * 
   * Returns channel names and merchant usernames that match the prefix.
   * Includes caching for popular suggestions to improve performance.
   * 
   * Requirements: 9.3
   * 
   * @param prefix - Search prefix
   * @param limit - Maximum number of suggestions
   * @returns Array of suggestion strings
   */
  async autocomplete(prefix: string, limit: number = 10): Promise<string[]> {
    try {
      // Normalize prefix for caching
      const normalizedPrefix = prefix.toLowerCase().trim();
      const cacheKey = `autocomplete:${normalizedPrefix}:${limit}`;

      // Check cache first
      const cached = await cache.get<string[]>(cacheKey);
      if (cached) {
        logger.debug('Using cached autocomplete suggestions', { 
          prefix: normalizedPrefix,
          count: cached.length 
        });
        return cached;
      }

      // Fetch from Elasticsearch
      const response = await elasticsearchClient.search({
        index: this.indexName,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: prefix,
                  fields: [
                    'channel_name',
                    'channel_username',
                    'merchant_username',
                    'merchant_display_name',
                  ],
                  type: 'phrase_prefix',
                },
              },
            ],
            filter: [
              {
                term: { status: 'active' },
              },
            ],
          },
        },
        size: limit * 2, // Get more results to deduplicate
        _source: [
          'channel_name',
          'channel_username',
          'merchant_username',
          'merchant_display_name',
        ],
      });

      // Extract unique suggestions from listings
      const suggestions = new Set<string>();
      
      response.hits.hits.forEach((hit: any) => {
        const source = hit._source;
        
        // Add channel name if it matches
        if (source.channel_name && 
            source.channel_name.toLowerCase().startsWith(normalizedPrefix)) {
          suggestions.add(source.channel_name);
        }
        
        // Add channel username if it matches
        if (source.channel_username && 
            source.channel_username.toLowerCase().startsWith(normalizedPrefix)) {
          suggestions.add(source.channel_username);
        }
        
        // Add merchant username if it matches
        if (source.merchant_username && 
            source.merchant_username.toLowerCase().startsWith(normalizedPrefix)) {
          suggestions.add(source.merchant_username);
        }
        
        // Add merchant display name if it matches
        if (source.merchant_display_name && 
            source.merchant_display_name.toLowerCase().startsWith(normalizedPrefix)) {
          suggestions.add(source.merchant_display_name);
        }
      });

      // Get popular searches that match the prefix
      const popularSearches = await this.getPopularSearches(normalizedPrefix);
      popularSearches.forEach(search => suggestions.add(search));

      // Convert to array and limit
      const result = Array.from(suggestions).slice(0, limit);

      // Cache the results
      await cache.set(cacheKey, result, this.AUTOCOMPLETE_CACHE_TTL);

      logger.debug('Autocomplete suggestions generated', { 
        prefix: normalizedPrefix,
        count: result.length,
        cached: false
      });

      return result;
    } catch (error) {
      logger.error('Autocomplete search failed', { error, prefix });
      throw error;
    }
  }

  /**
   * Track a search query for popular searches
   * 
   * Requirements: 9.3
   * 
   * @param query - Search query to track
   */
  async trackSearch(query: string): Promise<void> {
    try {
      if (!query || query.trim().length < 2) {
        return; // Don't track very short queries
      }

      const normalizedQuery = query.toLowerCase().trim();
      
      // Increment the score for this search term in Redis sorted set
      await cache.get(this.POPULAR_SEARCHES_KEY); // Ensure connection
      const { redisClient } = await import('../config/redis');
      await redisClient.zincrby(this.POPULAR_SEARCHES_KEY, 1, normalizedQuery);

      // Keep only top N popular searches
      await redisClient.zremrangebyrank(
        this.POPULAR_SEARCHES_KEY, 
        0, 
        -(this.POPULAR_SEARCHES_LIMIT + 1)
      );

      logger.debug('Search query tracked', { query: normalizedQuery });
    } catch (error) {
      // Don't fail the search if tracking fails
      logger.error('Failed to track search query', { error, query });
    }
  }

  /**
   * Get popular searches that match a prefix
   * 
   * Requirements: 9.3
   * 
   * @param prefix - Search prefix to match
   * @returns Array of popular search terms matching the prefix
   */
  private async getPopularSearches(prefix: string): Promise<string[]> {
    try {
      const { redisClient } = await import('../config/redis');
      
      // Get top popular searches (sorted by score, descending)
      const popularSearches = await redisClient.zrevrange(
        this.POPULAR_SEARCHES_KEY,
        0,
        20 // Get top 20 popular searches
      );

      // Filter by prefix match
      return popularSearches.filter(search => 
        search.toLowerCase().startsWith(prefix.toLowerCase())
      );
    } catch (error) {
      logger.error('Failed to get popular searches', { error, prefix });
      return [];
    }
  }

  /**
   * Clear autocomplete cache
   * 
   * Should be called when listings are updated to ensure fresh suggestions
   * 
   * Requirements: 9.3
   */
  async clearAutocompleteCache(): Promise<void> {
    try {
      await cache.flushPattern('autocomplete:*');
      logger.info('Autocomplete cache cleared');
    } catch (error) {
      logger.error('Failed to clear autocomplete cache', { error });
    }
  }

  /**
   * Bulk index multiple listings
   * 
   * Used for initial indexing or reindexing
   * 
   * @param listings - Array of listings with related data
   */
  async bulkIndex(
    listings: Array<{
      listing: Listing;
      merchantUsername: string;
      merchantDisplayName: string | null;
      channelName: string;
      channelUsername: string | null;
    }>
  ): Promise<void> {
    try {
      if (listings.length === 0) {
        return;
      }

      const operations = listings.flatMap(({ listing, merchantUsername, merchantDisplayName, channelName, channelUsername }) => [
        { index: { _index: this.indexName, _id: listing.id } },
        {
          id: listing.id,
          merchant_id: listing.merchantId,
          merchant_username: merchantUsername,
          merchant_display_name: merchantDisplayName,
          channel_id: listing.channelId,
          channel_name: channelName,
          channel_username: channelUsername,
          description: listing.description,
          price: listing.price,
          currency: listing.currency,
          duration_days: listing.durationDays,
          signal_types: listing.signalTypes,
          status: listing.status,
          view_count: listing.viewCount,
          purchase_count: listing.purchaseCount,
          created_at: listing.createdAt,
          updated_at: listing.updatedAt,
        },
      ]);

      const response = await elasticsearchClient.bulk({
        operations,
        refresh: true,
      });

      if (response.errors) {
        const erroredDocuments = response.items.filter((item: any) => item.index?.error);
        logger.error('Bulk indexing had errors', { 
          errorCount: erroredDocuments.length,
          errors: erroredDocuments 
        });
      } else {
        logger.info('Bulk indexing completed successfully', { 
          count: listings.length 
        });
      }
    } catch (error) {
      logger.error('Bulk indexing failed', { error, count: listings.length });
      throw error;
    }
  }

  /**
   * Reindex all listings from database
   * 
   * This should be called when setting up Elasticsearch for the first time
   * or when the index needs to be rebuilt
   */
  async reindexAll(
    getListingsWithRelations: () => Promise<Array<{
      listing: Listing;
      merchantUsername: string;
      merchantDisplayName: string | null;
      channelName: string;
      channelUsername: string | null;
    }>>
  ): Promise<void> {
    try {
      logger.info('Starting full reindex of listings...');
      
      const listings = await getListingsWithRelations();
      
      if (listings.length === 0) {
        logger.info('No listings to index');
        return;
      }

      // Index in batches of 100
      const batchSize = 100;
      for (let i = 0; i < listings.length; i += batchSize) {
        const batch = listings.slice(i, i + batchSize);
        await this.bulkIndex(batch);
        logger.info(`Indexed batch ${Math.floor(i / batchSize) + 1}`, {
          processed: Math.min(i + batchSize, listings.length),
          total: listings.length,
        });
      }

      logger.info('Full reindex completed', { total: listings.length });
    } catch (error) {
      logger.error('Reindex failed', { error });
      throw error;
    }
  }
}

export default new ElasticsearchService();
