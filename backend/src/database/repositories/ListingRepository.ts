import { BaseRepository } from './BaseRepository';
import { Listing, ListingStatus, ListingWithRelations, SearchQuery, SearchResult } from '../../types/models';

/**
 * Listing Repository
 * Handles CRUD operations for channel listings
 * 
 * Requirements: 1.1, 4.5
 */
export class ListingRepository extends BaseRepository<Listing> {
  constructor() {
    super('listings');
  }

  /**
   * Find listings by merchant ID
   */
  async findByMerchantId(merchantId: string): Promise<Listing[]> {
    return await this.query()
      .where({ merchant_id: merchantId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find listings by channel ID
   */
  async findByChannelId(channelId: string): Promise<Listing[]> {
    return await this.query()
      .where({ channel_id: channelId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find active listings
   */
  async findActive(): Promise<Listing[]> {
    return await this.query()
      .where({ status: ListingStatus.ACTIVE })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find listings by status
   */
  async findByStatus(status: ListingStatus): Promise<Listing[]> {
    return await this.query()
      .where({ status })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Search listings with filters and pagination
   */
  async search(query: SearchQuery): Promise<SearchResult<Listing>> {
    let dbQuery = this.query().where({ status: ListingStatus.ACTIVE });

    // Apply text search
    if (query.text) {
      dbQuery = dbQuery.where((builder) => {
        builder
          .where('description', 'ilike', `%${query.text}%`)
          .orWhere('channel_id', 'in', 
            this.db('channels')
              .where('channel_name', 'ilike', `%${query.text}%`)
              .orWhere('channel_username', 'ilike', `%${query.text}%`)
              .select('id')
          );
      });
    }

    // Apply merchant filter
    if (query.merchantId) {
      dbQuery = dbQuery.where({ merchant_id: query.merchantId });
    }

    // Apply price range filter
    if (query.minPrice !== undefined) {
      dbQuery = dbQuery.where('price', '>=', query.minPrice);
    }
    if (query.maxPrice !== undefined) {
      dbQuery = dbQuery.where('price', '<=', query.maxPrice);
    }

    // Apply currency filter
    if (query.currency) {
      dbQuery = dbQuery.where({ currency: query.currency });
    }

    // Apply signal types filter
    if (query.signalTypes && query.signalTypes.length > 0) {
      dbQuery = dbQuery.where((builder) => {
        query.signalTypes!.forEach((type) => {
          builder.orWhereRaw('? = ANY(signal_types)', [type]);
        });
      });
    }

    // Apply sorting
    switch (query.sortBy) {
      case 'price_asc':
        dbQuery = dbQuery.orderBy('price', 'asc');
        break;
      case 'price_desc':
        dbQuery = dbQuery.orderBy('price', 'desc');
        break;
      case 'popularity':
        dbQuery = dbQuery.orderBy('purchase_count', 'desc');
        break;
      case 'newest':
      default:
        dbQuery = dbQuery.orderBy('created_at', 'desc');
        break;
    }

    // Get total count
    const countQuery = dbQuery.clone();
    const countResult = await countQuery.count('* as count').first();
    const total = parseInt(countResult?.count as string || '0', 10);

    // Apply pagination
    const items = await dbQuery
      .limit(query.limit)
      .offset(query.offset)
      .select('*');

    return {
      items,
      total,
      hasMore: query.offset + items.length < total,
      limit: query.limit,
      offset: query.offset
    };
  }

  /**
   * Find listing with relations (merchant and channel)
   */
  async findByIdWithRelations(id: string): Promise<ListingWithRelations | null> {
    const result = await this.query()
      .where({ 'listings.id': id })
      .leftJoin('merchants', 'listings.merchant_id', 'merchants.id')
      .leftJoin('channels', 'listings.channel_id', 'channels.id')
      .select(
        'listings.*',
        'merchants.id as merchant_id',
        'merchants.storefront_slug as merchant_storefront_slug',
        'merchants.display_name as merchant_display_name',
        'channels.id as channel_id',
        'channels.channel_name as channel_name',
        'channels.channel_username as channel_username'
      )
      .first();

    if (!result) return null;

    return {
      ...result,
      merchant: {
        id: result.merchant_id,
        storefrontSlug: result.merchant_storefront_slug,
        displayName: result.merchant_display_name
      },
      channel: {
        id: result.channel_id,
        channelName: result.channel_name,
        channelUsername: result.channel_username
      }
    } as ListingWithRelations;
  }

  /**
   * Update listing status
   */
  async updateStatus(id: string, status: ListingStatus): Promise<Listing | null> {
    return await this.update(id, { status } as Partial<Listing>);
  }

  /**
   * Increment view count
   */
  async incrementViewCount(id: string): Promise<void> {
    await this.query()
      .where({ id })
      .increment('view_count', 1);
  }

  /**
   * Increment purchase count
   */
  async incrementPurchaseCount(id: string): Promise<void> {
    await this.query()
      .where({ id })
      .increment('purchase_count', 1);
  }

  /**
   * Deactivate all listings for a channel
   */
  async deactivateByChannelId(channelId: string): Promise<number> {
    return await this.query()
      .where({ channel_id: channelId })
      .update({ 
        status: ListingStatus.INACTIVE,
        updated_at: this.db.fn.now()
      });
  }

  /**
   * Find listings by merchant and channel (for uniqueness check)
   */
  async findByMerchantAndChannel(merchantId: string, channelId: string): Promise<Listing[]> {
    return await this.query()
      .where({ 
        merchant_id: merchantId,
        channel_id: channelId
      })
      .select('*');
  }

  /**
   * Get popular listings (by purchase count)
   */
  async getPopular(limit: number): Promise<Listing[]> {
    return await this.query()
      .where({ status: ListingStatus.ACTIVE })
      .orderBy('purchase_count', 'desc')
      .limit(limit)
      .select('*');
  }

  /**
   * Get newest listings
   */
  async getNewest(limit: number): Promise<Listing[]> {
    return await this.query()
      .where({ status: ListingStatus.ACTIVE })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .select('*');
  }

  /**
   * Count active listings
   */
  async countActive(): Promise<number> {
    return await this.count({ status: ListingStatus.ACTIVE } as Partial<Listing>);
  }
}
