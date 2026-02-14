import { BaseRepository } from './BaseRepository';
import { Subscription, SubscriptionStatus, SubscriptionWithRelations } from '../../types/models';

/**
 * Subscription Repository
 * Handles CRUD operations for subscriptions
 * 
 * Requirements: 1.1, 4.5, 6.7
 */
export class SubscriptionRepository extends BaseRepository<Subscription> {
  constructor() {
    super('subscriptions');
  }

  /**
   * Find subscriptions by buyer ID
   */
  async findByBuyerId(buyerId: string): Promise<Subscription[]> {
    return await this.query()
      .where({ buyer_id: buyerId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find subscriptions by listing ID
   */
  async findByListingId(listingId: string): Promise<Subscription[]> {
    return await this.query()
      .where({ listing_id: listingId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find subscription by order ID
   */
  async findByOrderId(orderId: string): Promise<Subscription | null> {
    const result = await this.query()
      .where({ order_id: orderId })
      .first();
    return result || null;
  }

  /**
   * Find subscriptions by channel ID
   */
  async findByChannelId(channelId: string): Promise<Subscription[]> {
    return await this.query()
      .where({ channel_id: channelId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find active subscriptions
   */
  async findActive(): Promise<Subscription[]> {
    return await this.query()
      .where({ status: SubscriptionStatus.ACTIVE })
      .orderBy('expiry_date', 'asc')
      .select('*');
  }

  /**
   * Find subscriptions by status
   */
  async findByStatus(status: SubscriptionStatus): Promise<Subscription[]> {
    return await this.query()
      .where({ status })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find expired subscriptions that need processing
   */
  async findExpiredNeedingProcessing(): Promise<Subscription[]> {
    return await this.query()
      .where({ status: SubscriptionStatus.ACTIVE })
      .where('expiry_date', '<=', this.db.fn.now())
      .select('*');
  }

  /**
   * Alias for findExpiredNeedingProcessing
   */
  async findExpired(): Promise<Subscription[]> {
    return await this.findExpiredNeedingProcessing();
  }

  /**
   * Find subscriptions expiring soon (within specified hours)
   */
  async findExpiringSoon(hours: number): Promise<Subscription[]> {
    const expiryThreshold = new Date(Date.now() + hours * 60 * 60 * 1000);
    
    return await this.query()
      .where({ status: SubscriptionStatus.ACTIVE })
      .where('expiry_date', '<=', expiryThreshold)
      .where('expiry_date', '>', this.db.fn.now())
      .select('*');
  }

  /**
   * Find subscription with relations
   */
  async findByIdWithRelations(id: string): Promise<SubscriptionWithRelations | null> {
    const subscription = await this.findById(id);
    if (!subscription) return null;

    // Get related data
    const [listing, order, channel, buyer] = await Promise.all([
      this.db('listings').where({ id: subscription.listingId }).first(),
      this.db('orders').where({ id: subscription.orderId }).first(),
      this.db('channels').where({ id: subscription.channelId }).first(),
      this.db('users').where({ id: subscription.buyerId }).first()
    ]);

    return {
      ...subscription,
      listing: listing || undefined,
      order: order || undefined,
      channel: channel || undefined,
      buyer: buyer || undefined
    };
  }

  /**
   * Update subscription status
   */
  async updateStatus(id: string, status: SubscriptionStatus): Promise<Subscription | null> {
    return await this.update(id, { status } as Partial<Subscription>);
  }

  /**
   * Mark subscriptions as expired
   */
  async markExpired(subscriptionIds: string[]): Promise<number> {
    if (subscriptionIds.length === 0) return 0;
    
    return await this.query()
      .whereIn('id', subscriptionIds)
      .update({ 
        status: SubscriptionStatus.EXPIRED,
        updated_at: this.db.fn.now()
      });
  }

  /**
   * Check if buyer has active subscription to channel
   */
  async hasActiveSubscription(buyerId: string, channelId: string): Promise<boolean> {
    const result = await this.query()
      .where({ 
        buyer_id: buyerId,
        channel_id: channelId,
        status: SubscriptionStatus.ACTIVE
      })
      .where('expiry_date', '>', this.db.fn.now())
      .first('id');
    
    return !!result;
  }

  /**
   * Get active subscriptions for buyer and channel
   */
  async getActiveForBuyerAndChannel(buyerId: string, channelId: string): Promise<Subscription[]> {
    return await this.query()
      .where({ 
        buyer_id: buyerId,
        channel_id: channelId,
        status: SubscriptionStatus.ACTIVE
      })
      .where('expiry_date', '>', this.db.fn.now())
      .select('*');
  }

  /**
   * Count active subscriptions
   */
  async countActive(): Promise<number> {
    return await this.count({ status: SubscriptionStatus.ACTIVE } as Partial<Subscription>);
  }

  /**
   * Count subscriptions by status
   */
  async countByStatus(status: SubscriptionStatus): Promise<number> {
    return await this.count({ status } as Partial<Subscription>);
  }

  /**
   * Get subscriptions for renewal (expiring within days)
   */
  async findEligibleForRenewal(daysBeforeExpiry: number): Promise<Subscription[]> {
    const startDate = new Date();
    const endDate = new Date(Date.now() + daysBeforeExpiry * 24 * 60 * 60 * 1000);
    
    return await this.query()
      .where({ status: SubscriptionStatus.ACTIVE })
      .whereBetween('expiry_date', [startDate, endDate])
      .select('*');
  }

  /**
   * Get total active subscriptions by merchant
   */
  async countActiveByMerchant(merchantId: string): Promise<number> {
    const result = await this.query()
      .join('listings', 'subscriptions.listing_id', 'listings.id')
      .where('listings.merchant_id', merchantId)
      .where('subscriptions.status', SubscriptionStatus.ACTIVE)
      .count('* as count')
      .first();
    
    return parseInt(result?.count as string || '0', 10);
  }
}
