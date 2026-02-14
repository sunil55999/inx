import { BaseRepository } from './BaseRepository';
import { Order, OrderStatus, OrderWithRelations } from '../../types/models';

/**
 * Order Repository
 * Handles CRUD operations for orders
 * 
 * Requirements: 1.1, 4.5, 6.7
 */
export class OrderRepository extends BaseRepository<Order> {
  constructor() {
    super('orders');
  }

  /**
   * Find orders by buyer ID
   */
  async findByBuyerId(buyerId: string): Promise<Order[]> {
    return await this.query()
      .where({ buyer_id: buyerId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find orders by listing ID
   */
  async findByListingId(listingId: string): Promise<Order[]> {
    return await this.query()
      .where({ listing_id: listingId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find order by deposit address
   */
  async findByDepositAddress(depositAddress: string): Promise<Order | null> {
    const result = await this.query()
      .where({ deposit_address: depositAddress })
      .first();
    return result || null;
  }

  /**
   * Find orders by status
   */
  async findByStatus(status: OrderStatus): Promise<Order[]> {
    return await this.query()
      .where({ status })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find expired unpaid orders
   */
  async findExpiredUnpaid(): Promise<Order[]> {
    return await this.query()
      .where({ status: OrderStatus.PENDING_PAYMENT })
      .where('expires_at', '<=', this.db.fn.now())
      .select('*');
  }

  /**
   * Alias for findExpiredUnpaid
   */
  async findExpired(): Promise<Order[]> {
    return await this.findExpiredUnpaid();
  }

  /**
   * Find order with relations (listing, buyer, subscription, transactions)
   */
  async findByIdWithRelations(id: string): Promise<OrderWithRelations | null> {
    const order = await this.findById(id);
    if (!order) return null;

    // Get related data
    const [listing, buyer, subscription, transactions] = await Promise.all([
      this.db('listings').where({ id: order.listingId }).first(),
      this.db('users').where({ id: order.buyerId }).first(),
      this.db('subscriptions').where({ order_id: id }).first(),
      this.db('transactions').where({ order_id: id }).select('*')
    ]);

    return {
      ...order,
      listing: listing || undefined,
      buyer: buyer || undefined,
      subscription: subscription || undefined,
      transactions: transactions || []
    };
  }

  /**
   * Update order status
   */
  async updateStatus(id: string, status: OrderStatus): Promise<Order | null> {
    const updateData: Partial<Order> = { status } as Partial<Order>;
    
    // Set paidAt timestamp when payment is confirmed
    if (status === OrderStatus.PAYMENT_CONFIRMED) {
      updateData.paidAt = new Date();
    }
    
    return await this.update(id, updateData);
  }

  /**
   * Update order confirmations
   */
  async updateConfirmations(id: string, confirmations: number): Promise<Order | null> {
    return await this.update(id, { confirmations } as Partial<Order>);
  }

  /**
   * Update transaction hash
   */
  async updateTransactionHash(id: string, transactionHash: string): Promise<Order | null> {
    return await this.update(id, { transactionHash } as Partial<Order>);
  }

  /**
   * Mark orders as expired
   */
  async markExpired(orderIds: string[]): Promise<number> {
    if (orderIds.length === 0) return 0;
    
    return await this.query()
      .whereIn('id', orderIds)
      .update({ 
        status: OrderStatus.EXPIRED,
        updated_at: this.db.fn.now()
      });
  }

  /**
   * Get orders pending payment confirmation
   */
  async findPendingConfirmation(): Promise<Order[]> {
    return await this.query()
      .where({ status: OrderStatus.PAYMENT_DETECTED })
      .select('*');
  }

  /**
   * Get recent orders (for admin dashboard)
   */
  async getRecent(limit: number): Promise<Order[]> {
    return await this.query()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .select('*');
  }

  /**
   * Count orders by status
   */
  async countByStatus(status: OrderStatus): Promise<number> {
    return await this.count({ status } as Partial<Order>);
  }

  /**
   * Get total order value by merchant
   */
  async getTotalValueByMerchant(merchantId: string): Promise<number> {
    const result = await this.query()
      .join('listings', 'orders.listing_id', 'listings.id')
      .where('listings.merchant_id', merchantId)
      .whereIn('orders.status', [
        OrderStatus.PAYMENT_CONFIRMED,
        OrderStatus.SUBSCRIPTION_ACTIVE
      ])
      .sum('orders.amount as total')
      .first();
    
    return parseFloat(result?.total || '0');
  }

  /**
   * Get order statistics
   */
  async getStatistics(): Promise<{
    total: number;
    pendingPayment: number;
    paymentDetected: number;
    paymentConfirmed: number;
    subscriptionActive: number;
    expired: number;
    refunded: number;
  }> {
    const [
      total,
      pendingPayment,
      paymentDetected,
      paymentConfirmed,
      subscriptionActive,
      expired,
      refunded
    ] = await Promise.all([
      this.count({}),
      this.countByStatus(OrderStatus.PENDING_PAYMENT),
      this.countByStatus(OrderStatus.PAYMENT_DETECTED),
      this.countByStatus(OrderStatus.PAYMENT_CONFIRMED),
      this.countByStatus(OrderStatus.SUBSCRIPTION_ACTIVE),
      this.countByStatus(OrderStatus.EXPIRED),
      this.countByStatus(OrderStatus.REFUNDED)
    ]);

    return {
      total,
      pendingPayment,
      paymentDetected,
      paymentConfirmed,
      subscriptionActive,
      expired,
      refunded
    };
  }
}
