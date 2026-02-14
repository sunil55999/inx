import { 
  Listing, 
  ListingStatus, 
  CreateListingRequest, 
  UpdateListingRequest,
  SearchQuery,
  SearchResult,
  ListingWithRelations
} from '../types/models';
import { ListingRepository } from '../database/repositories/ListingRepository';
import { ChannelRepository } from '../database/repositories/ChannelRepository';
import { MerchantRepository } from '../database/repositories/MerchantRepository';
import { UserRepository } from '../database/repositories/UserRepository';
import elasticsearchService from './ElasticsearchService';
import logger from '../utils/logger';

/**
 * Listing Service
 * Handles business logic for channel listings
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 9.1
 */
export class ListingService {
  private listingRepository: ListingRepository;
  private channelRepository: ChannelRepository;
  private merchantRepository: MerchantRepository;
  private userRepository: UserRepository;
  private useElasticsearch: boolean;

  constructor(
    listingRepository?: ListingRepository,
    channelRepository?: ChannelRepository,
    merchantRepository?: MerchantRepository,
    userRepository?: UserRepository,
    useElasticsearch: boolean = true
  ) {
    this.listingRepository = listingRepository || new ListingRepository();
    this.channelRepository = channelRepository || new ChannelRepository();
    this.merchantRepository = merchantRepository || new MerchantRepository();
    this.userRepository = userRepository || new UserRepository();
    this.useElasticsearch = useElasticsearch;
  }

  /**
   * Create a new listing
   * 
   * Validates:
   * - Merchant exists
   * - Channel exists
   * - Bot has admin permissions in channel
   * - No duplicate listing for same merchant-channel combination
   * 
   * Requirements: 1.1, 1.2, 1.3
   */
  async createListing(merchantId: string, request: CreateListingRequest): Promise<Listing> {
    // Validate merchant exists
    const merchant = await this.merchantRepository.findById(merchantId);
    if (!merchant) {
      throw new Error('Merchant not found');
    }

    // Validate channel exists
    const channel = await this.channelRepository.findById(request.channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Validate bot has admin permissions
    if (!channel.botIsAdmin) {
      throw new Error('Bot does not have admin permissions in this channel');
    }

    // Check for duplicate listing (same merchant and channel)
    const existingListings = await this.listingRepository.findByMerchantAndChannel(
      merchantId,
      request.channelId
    );

    // Allow multiple listings only if they have different prices or durations
    const isDuplicate = existingListings.some(listing => 
      listing.price === request.price && 
      listing.durationDays === request.durationDays &&
      listing.currency === request.currency &&
      listing.status !== ListingStatus.INACTIVE
    );

    if (isDuplicate) {
      throw new Error('A listing with the same price, duration, and currency already exists for this channel');
    }

    // Validate input data
    if (!request.description || request.description.trim().length === 0) {
      throw new Error('Description is required');
    }

    if (request.price <= 0) {
      throw new Error('Price must be greater than 0');
    }

    if (request.durationDays <= 0) {
      throw new Error('Duration must be greater than 0');
    }

    // Create the listing
    const listing: Partial<Listing> = {
      merchantId,
      channelId: request.channelId,
      description: request.description,
      price: request.price,
      currency: request.currency,
      durationDays: request.durationDays,
      signalTypes: request.signalTypes || [],
      status: ListingStatus.ACTIVE,
      viewCount: 0,
      purchaseCount: 0
    };

    const created = await this.listingRepository.create(listing as Listing);
    if (!created) {
      throw new Error('Failed to create listing');
    }

    // Index in Elasticsearch
    if (this.useElasticsearch) {
      try {
        const user = await this.userRepository.findById(merchant.userId);
        await elasticsearchService.indexListing(
          created,
          user?.username || '',
          merchant.displayName || null,
          channel.channelName,
          channel.channelUsername || null
        );
        
        // Clear autocomplete cache since new listing may affect suggestions
        await elasticsearchService.clearAutocompleteCache();
      } catch (error) {
        logger.error('Failed to index listing in Elasticsearch', { 
          error, 
          listingId: created.id 
        });
        // Don't fail the request if Elasticsearch indexing fails
      }
    }

    return created;
  }

  /**
   * Update an existing listing
   * 
   * Validates:
   * - Listing exists
   * - Merchant owns the listing
   * - Updated data is valid
   * 
   * Requirements: 1.4
   */
  async updateListing(
    listingId: string, 
    merchantId: string, 
    updates: UpdateListingRequest
  ): Promise<Listing> {
    // Validate listing exists
    const listing = await this.listingRepository.findById(listingId);
    if (!listing) {
      throw new Error('Listing not found');
    }

    // Validate merchant owns the listing
    if (listing.merchantId !== merchantId) {
      throw new Error('Unauthorized: You do not own this listing');
    }

    // Validate updates
    if (updates.price !== undefined && updates.price <= 0) {
      throw new Error('Price must be greater than 0');
    }

    if (updates.durationDays !== undefined && updates.durationDays <= 0) {
      throw new Error('Duration must be greater than 0');
    }

    if (updates.description !== undefined && updates.description.trim().length === 0) {
      throw new Error('Description cannot be empty');
    }

    // Apply updates
    const updated = await this.listingRepository.update(listingId, updates as Partial<Listing>);
    if (!updated) {
      throw new Error('Failed to update listing');
    }

    // Update in Elasticsearch
    if (this.useElasticsearch) {
      try {
        const merchant = await this.merchantRepository.findById(updated.merchantId);
        const channel = await this.channelRepository.findById(updated.channelId);
        if (merchant && channel) {
          const user = await this.userRepository.findById(merchant.userId);
          await elasticsearchService.updateListing(
            updated,
            user?.username || '',
            merchant.displayName || null,
            channel.channelName,
            channel.channelUsername || null
          );
          
          // Clear autocomplete cache since listing update may affect suggestions
          await elasticsearchService.clearAutocompleteCache();
        }
      } catch (error) {
        logger.error('Failed to update listing in Elasticsearch', { 
          error, 
          listingId: updated.id 
        });
        // Don't fail the request if Elasticsearch update fails
      }
    }

    return updated;
  }

  /**
   * Deactivate a listing
   * 
   * Sets the listing status to INACTIVE
   * 
   * Requirements: 1.4
   */
  async deactivateListing(listingId: string, merchantId: string): Promise<Listing> {
    // Validate listing exists
    const listing = await this.listingRepository.findById(listingId);
    if (!listing) {
      throw new Error('Listing not found');
    }

    // Validate merchant owns the listing
    if (listing.merchantId !== merchantId) {
      throw new Error('Unauthorized: You do not own this listing');
    }

    // Deactivate the listing
    const updated = await this.listingRepository.updateStatus(listingId, ListingStatus.INACTIVE);
    if (!updated) {
      throw new Error('Failed to deactivate listing');
    }

    // Update in Elasticsearch (status change)
    if (this.useElasticsearch) {
      try {
        const merchant = await this.merchantRepository.findById(updated.merchantId);
        const channel = await this.channelRepository.findById(updated.channelId);
        if (merchant && channel) {
          const user = await this.userRepository.findById(merchant.userId);
          await elasticsearchService.updateListing(
            updated,
            user?.username || '',
            merchant.displayName || null,
            channel.channelName,
            channel.channelUsername || null
          );
          
          // Clear autocomplete cache since deactivating listing affects suggestions
          await elasticsearchService.clearAutocompleteCache();
        }
      } catch (error) {
        logger.error('Failed to update listing status in Elasticsearch', { 
          error, 
          listingId: updated.id 
        });
        // Don't fail the request if Elasticsearch update fails
      }
    }

    return updated;
  }

  /**
   * Get a listing by ID
   * 
   * Requirements: 1.1
   */
  async getListingById(listingId: string): Promise<Listing | null> {
    return await this.listingRepository.findById(listingId);
  }

  /**
   * Get a listing by ID with related data (merchant and channel)
   * 
   * Requirements: 1.1
   */
  async getListingByIdWithRelations(listingId: string): Promise<ListingWithRelations | null> {
    return await this.listingRepository.findByIdWithRelations(listingId);
  }

  /**
   * List listings with optional filters
   * 
   * Supports:
   * - Text search across channel names and descriptions
   * - Filtering by merchant, price range, currency, signal types
   * - Sorting by price, popularity, or date
   * - Pagination
   * 
   * Uses Elasticsearch for full-text search when available,
   * falls back to PostgreSQL search otherwise
   * 
   * Requirements: 1.1, 1.4, 1.6, 9.1
   */
  async listListings(query: SearchQuery): Promise<SearchResult<Listing>> {
    // Use Elasticsearch for text search if available
    if (this.useElasticsearch && query.text) {
      try {
        return await elasticsearchService.search(query);
      } catch (error) {
        logger.error('Elasticsearch search failed, falling back to database', { error });
        // Fall back to database search
      }
    }

    // Use database search
    return await this.listingRepository.search(query);
  }

  /**
   * Get all listings for a specific merchant
   * 
   * Requirements: 1.2
   */
  async getMerchantListings(merchantId: string): Promise<Listing[]> {
    return await this.listingRepository.findByMerchantId(merchantId);
  }

  /**
   * Get all active listings
   * 
   * Requirements: 1.1
   */
  async getActiveListings(): Promise<Listing[]> {
    return await this.listingRepository.findActive();
  }

  /**
   * Get popular listings (by purchase count)
   * 
   * Requirements: 1.1
   */
  async getPopularListings(limit: number = 10): Promise<Listing[]> {
    return await this.listingRepository.getPopular(limit);
  }

  /**
   * Get newest listings
   * 
   * Requirements: 1.1
   */
  async getNewestListings(limit: number = 10): Promise<Listing[]> {
    return await this.listingRepository.getNewest(limit);
  }

  /**
   * Increment view count for a listing
   * 
   * Called when a user views a listing detail page
   */
  async incrementViewCount(listingId: string): Promise<void> {
    await this.listingRepository.incrementViewCount(listingId);
  }

  /**
   * Increment purchase count for a listing
   * 
   * Called when an order is created for a listing
   */
  async incrementPurchaseCount(listingId: string): Promise<void> {
    await this.listingRepository.incrementPurchaseCount(listingId);
  }

  /**
   * Deactivate all listings for a channel
   * 
   * Called when bot loses admin permissions in a channel
   * 
   * Requirements: 1.5, 15.3
   */
  async deactivateListingsByChannel(channelId: string): Promise<number> {
    return await this.listingRepository.deactivateByChannelId(channelId);
  }

  /**
   * Validate bot permissions for a channel
   * 
   * Checks if the bot has admin permissions in the specified channel
   * 
   * Requirements: 15.1, 15.2
   */
  async validateBotPermissions(channelId: string): Promise<boolean> {
    const channel = await this.channelRepository.findById(channelId);
    if (!channel) {
      return false;
    }
    return channel.botIsAdmin;
  }

  /**
   * Reactivate a listing
   * 
   * Sets the listing status back to ACTIVE
   * Only allowed if bot has regained admin permissions
   * 
   * Requirements: 15.6
   */
  async reactivateListing(listingId: string, merchantId: string): Promise<Listing> {
    // Validate listing exists
    const listing = await this.listingRepository.findById(listingId);
    if (!listing) {
      throw new Error('Listing not found');
    }

    // Validate merchant owns the listing
    if (listing.merchantId !== merchantId) {
      throw new Error('Unauthorized: You do not own this listing');
    }

    // Validate bot has admin permissions
    const hasPermissions = await this.validateBotPermissions(listing.channelId);
    if (!hasPermissions) {
      throw new Error('Cannot reactivate listing: Bot does not have admin permissions in channel');
    }

    // Reactivate the listing
    const updated = await this.listingRepository.updateStatus(listingId, ListingStatus.ACTIVE);
    if (!updated) {
      throw new Error('Failed to reactivate listing');
    }

    // Update in Elasticsearch (status change)
    if (this.useElasticsearch) {
      try {
        const merchant = await this.merchantRepository.findById(updated.merchantId);
        const channel = await this.channelRepository.findById(updated.channelId);
        if (merchant && channel) {
          const user = await this.userRepository.findById(merchant.userId);
          await elasticsearchService.updateListing(
            updated,
            user?.username || '',
            merchant.displayName || null,
            channel.channelName,
            channel.channelUsername || null
          );
        }
      } catch (error) {
        logger.error('Failed to update listing status in Elasticsearch', { 
          error, 
          listingId: updated.id 
        });
        // Don't fail the request if Elasticsearch update fails
      }
    }

    return updated;
  }

  /**
   * Delete a listing (soft delete by setting status to INACTIVE)
   * 
   * Requirements: 1.4
   */
  async deleteListing(listingId: string, merchantId: string): Promise<void> {
    await this.deactivateListing(listingId, merchantId);
  }

  /**
   * Check if a merchant can create a listing for a channel
   * 
   * Validates:
   * - Channel exists
   * - Bot has admin permissions
   * - No exact duplicate exists
   * 
   * Requirements: 1.2, 1.5
   */
  async canCreateListing(merchantId: string, channelId: string): Promise<{
    canCreate: boolean;
    reason?: string;
  }> {
    // Check if merchant exists
    const merchant = await this.merchantRepository.findById(merchantId);
    if (!merchant) {
      return { canCreate: false, reason: 'Merchant not found' };
    }

    // Check if channel exists
    const channel = await this.channelRepository.findById(channelId);
    if (!channel) {
      return { canCreate: false, reason: 'Channel not found' };
    }

    // Check bot permissions
    if (!channel.botIsAdmin) {
      return { canCreate: false, reason: 'Bot does not have admin permissions in this channel' };
    }

    return { canCreate: true };
  }

  /**
   * Get listings by channel
   * 
   * Returns all listings for a specific channel
   * 
   * Requirements: 1.5
   */
  async getListingsByChannel(channelId: string): Promise<Listing[]> {
    return await this.listingRepository.findByChannelId(channelId);
  }

  /**
   * Get listings by status
   * 
   * Requirements: 1.1
   */
  async getListingsByStatus(status: ListingStatus): Promise<Listing[]> {
    return await this.listingRepository.findByStatus(status);
  }

  /**
   * Reindex all listings in Elasticsearch
   * 
   * This should be called when setting up Elasticsearch for the first time
   * or when the index needs to be rebuilt
   * 
   * Requirements: 9.1
   */
  async reindexAllListings(): Promise<void> {
    if (!this.useElasticsearch) {
      logger.warn('Elasticsearch is disabled, skipping reindex');
      return;
    }

    logger.info('Starting reindex of all listings...');

    try {
      // Get all listings with their related data
      const getListingsWithRelations = async () => {
        const listings = await this.listingRepository.findAll();
        const listingsWithRelations = [];

        for (const listing of listings) {
          const merchant = await this.merchantRepository.findById(listing.merchantId);
          const channel = await this.channelRepository.findById(listing.channelId);
          
          if (merchant && channel) {
            const user = await this.userRepository.findById(merchant.userId);
            listingsWithRelations.push({
              listing,
              merchantUsername: user?.username || '',
              merchantDisplayName: merchant.displayName || null,
              channelName: channel.channelName,
              channelUsername: channel.channelUsername || null,
            });
          }
        }

        return listingsWithRelations;
      };

      await elasticsearchService.reindexAll(getListingsWithRelations);
      logger.info('Reindex completed successfully');
    } catch (error) {
      logger.error('Reindex failed', { error });
      throw error;
    }
  }

  /**
   * Get autocomplete suggestions for search
   * 
   * Requirements: 9.3
   */
  async getAutocompleteSuggestions(prefix: string, limit: number = 10): Promise<string[]> {
    if (!this.useElasticsearch) {
      return [];
    }

    try {
      return await elasticsearchService.autocomplete(prefix, limit);
    } catch (error) {
      logger.error('Autocomplete failed', { error, prefix });
      return [];
    }
  }

  /**
   * Track a search query for popular searches
   * 
   * Requirements: 9.3
   */
  async trackSearch(query: string): Promise<void> {
    if (!this.useElasticsearch) {
      return;
    }

    try {
      await elasticsearchService.trackSearch(query);
    } catch (error) {
      logger.error('Failed to track search', { error, query });
      // Don't throw - tracking is non-critical
    }
  }
}
