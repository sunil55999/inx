import { BaseRepository } from './BaseRepository';
import { Dispute, DisputeStatus, DisputeWithRelations } from '../../types/models';

/**
 * Dispute Repository
 * Handles CRUD operations for disputes/tickets
 * 
 * Requirements: 1.1, 4.5, 6.7
 */
export class DisputeRepository extends BaseRepository<Dispute> {
  constructor() {
    super('tickets');
  }

  /**
   * Find disputes by buyer ID
   */
  async findByBuyerId(buyerId: string): Promise<Dispute[]> {
    return await this.query()
      .where({ buyer_id: buyerId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find disputes by order ID
   */
  async findByOrderId(orderId: string): Promise<Dispute[]> {
    return await this.query()
      .where({ order_id: orderId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find disputes by status
   */
  async findByStatus(status: DisputeStatus): Promise<Dispute[]> {
    return await this.query()
      .where({ status })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find open disputes
   */
  async findOpen(): Promise<Dispute[]> {
    return await this.findByStatus(DisputeStatus.OPEN);
  }

  /**
   * Find disputes assigned to admin
   */
  async findByAdminId(adminId: string): Promise<Dispute[]> {
    return await this.query()
      .where({ admin_id: adminId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find dispute with relations (order, buyer, admin)
   */
  async findByIdWithRelations(id: string): Promise<DisputeWithRelations | null> {
    const dispute = await this.findById(id);
    if (!dispute) return null;

    // Get related data
    const [buyer, admin] = await Promise.all([
      this.db('users').where({ id: dispute.buyerId }).first(),
      dispute.adminId ? this.db('users').where({ id: dispute.adminId }).first() : null
    ]);

    // Get order with its relations
    const order = await this.db('orders').where({ id: dispute.orderId }).first();
    let orderWithRelations = null;
    
    if (order) {
      const [listing, orderBuyer, subscription, transactions] = await Promise.all([
        this.db('listings').where({ id: order.listing_id }).first(),
        this.db('users').where({ id: order.buyer_id }).first(),
        this.db('subscriptions').where({ order_id: order.id }).first(),
        this.db('transactions').where({ order_id: order.id }).select('*')
      ]);

      orderWithRelations = {
        ...order,
        listing: listing || undefined,
        buyer: orderBuyer || undefined,
        subscription: subscription || undefined,
        transactions: transactions || []
      };
    }

    return {
      ...dispute,
      order: orderWithRelations || undefined,
      buyer: buyer || undefined,
      admin: admin || undefined
    };
  }

  /**
   * Update dispute status
   */
  async updateStatus(id: string, status: DisputeStatus): Promise<Dispute | null> {
    const updateData: Partial<Dispute> = { status } as Partial<Dispute>;
    
    // Set resolvedAt timestamp when resolved or closed
    if (status === DisputeStatus.RESOLVED || status === DisputeStatus.CLOSED) {
      updateData.resolvedAt = new Date();
    }
    
    return await this.update(id, updateData);
  }

  /**
   * Assign dispute to admin
   */
  async assignToAdmin(id: string, adminId: string): Promise<Dispute | null> {
    return await this.update(id, { 
      adminId,
      status: DisputeStatus.IN_PROGRESS 
    } as Partial<Dispute>);
  }

  /**
   * Resolve dispute
   */
  async resolve(id: string, resolution: string, adminId: string): Promise<Dispute | null> {
    const [result] = await this.query()
      .where({ id })
      .update({
        status: DisputeStatus.RESOLVED,
        resolution,
        admin_id: adminId,
        resolved_at: this.db.fn.now(),
        updated_at: this.db.fn.now()
      })
      .returning('*');
    
    return result || null;
  }

  /**
   * Count disputes by status
   */
  async countByStatus(status: DisputeStatus): Promise<number> {
    return await this.count({ status } as Partial<Dispute>);
  }

  /**
   * Count open disputes
   */
  async countOpen(): Promise<number> {
    return await this.countByStatus(DisputeStatus.OPEN);
  }

  /**
   * Get disputes needing attention (open or in progress)
   */
  async findNeedingAttention(): Promise<Dispute[]> {
    return await this.query()
      .whereIn('status', [DisputeStatus.OPEN, DisputeStatus.IN_PROGRESS])
      .orderBy('created_at', 'asc')
      .select('*');
  }

  /**
   * Get recent disputes (for admin dashboard)
   */
  async getRecent(limit: number): Promise<Dispute[]> {
    return await this.query()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .select('*');
  }

  /**
   * Check if order has existing dispute
   */
  async hasDisputeForOrder(orderId: string): Promise<boolean> {
    const result = await this.query()
      .where({ order_id: orderId })
      .whereIn('status', [DisputeStatus.OPEN, DisputeStatus.IN_PROGRESS])
      .first('id');
    
    return !!result;
  }
}
