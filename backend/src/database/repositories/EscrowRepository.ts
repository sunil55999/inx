import { BaseRepository } from './BaseRepository';
import { EscrowEntry, EscrowStatus, CryptoCurrency } from '../../types/models';

/**
 * Escrow Repository
 * Handles CRUD operations for escrow ledger entries
 * 
 * Requirements: 1.1, 4.5, 6.7
 */
export class EscrowRepository extends BaseRepository<EscrowEntry> {
  constructor() {
    super('escrow_ledger');
  }

  /**
   * Find escrow entry by order ID
   */
  async findByOrderId(orderId: string): Promise<EscrowEntry | null> {
    const result = await this.query()
      .where({ order_id: orderId })
      .first();
    return result || null;
  }

  /**
   * Find escrow entry by subscription ID
   */
  async findBySubscriptionId(subscriptionId: string): Promise<EscrowEntry | null> {
    const result = await this.query()
      .where({ subscription_id: subscriptionId })
      .first();
    return result || null;
  }

  /**
   * Find escrow entries by status
   */
  async findByStatus(status: EscrowStatus): Promise<EscrowEntry[]> {
    return await this.query()
      .where({ status })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find held escrow entries
   */
  async findHeld(): Promise<EscrowEntry[]> {
    return await this.findByStatus(EscrowStatus.HELD);
  }

  /**
   * Update escrow status
   */
  async updateStatus(id: string, status: EscrowStatus): Promise<EscrowEntry | null> {
    const updateData: Partial<EscrowEntry> = { status } as Partial<EscrowEntry>;
    
    // Set releasedAt timestamp when released or refunded
    if (status === EscrowStatus.RELEASED || status === EscrowStatus.REFUNDED) {
      updateData.releasedAt = new Date();
    }
    
    return await this.update(id, updateData);
  }

  /**
   * Release escrow (update status and set merchant amount)
   */
  async release(id: string, merchantAmount: number): Promise<EscrowEntry | null> {
    const [result] = await this.query()
      .where({ id })
      .update({
        status: EscrowStatus.RELEASED,
        merchant_amount: merchantAmount,
        released_at: this.db.fn.now(),
        updated_at: this.db.fn.now()
      })
      .returning('*');
    
    return result || null;
  }

  /**
   * Refund escrow
   */
  async refund(id: string): Promise<EscrowEntry | null> {
    return await this.updateStatus(id, EscrowStatus.REFUNDED);
  }

  /**
   * Get total escrow balance by currency
   */
  async getTotalBalanceByCurrency(currency: CryptoCurrency): Promise<number> {
    const result = await this.query()
      .where({ 
        status: EscrowStatus.HELD,
        currency 
      })
      .sum('amount as total')
      .first();
    
    return parseFloat(result?.total || '0');
  }

  /**
   * Get total escrow balance (all currencies)
   */
  async getTotalBalances(): Promise<Record<CryptoCurrency, number>> {
    const results = await this.query()
      .where({ status: EscrowStatus.HELD })
      .select('currency')
      .sum('amount as total')
      .groupBy('currency');
    
    const balances: Record<string, number> = {};
    results.forEach((row: any) => {
      balances[row.currency] = parseFloat(row.total || '0');
    });
    
    return balances as Record<CryptoCurrency, number>;
  }

  /**
   * Get escrow entries for a merchant (via listings)
   */
  async findByMerchantId(merchantId: string): Promise<EscrowEntry[]> {
    return await this.query()
      .join('orders', 'escrow_ledger.order_id', 'orders.id')
      .join('listings', 'orders.listing_id', 'listings.id')
      .where('listings.merchant_id', merchantId)
      .select('escrow_ledger.*')
      .orderBy('escrow_ledger.created_at', 'desc');
  }

  /**
   * Get held escrow amount for merchant
   */
  async getHeldAmountForMerchant(merchantId: string, currency: CryptoCurrency): Promise<number> {
    const result = await this.query()
      .join('orders', 'escrow_ledger.order_id', 'orders.id')
      .join('listings', 'orders.listing_id', 'listings.id')
      .where({
        'listings.merchant_id': merchantId,
        'escrow_ledger.status': EscrowStatus.HELD,
        'escrow_ledger.currency': currency
      })
      .sum('escrow_ledger.amount as total')
      .first();
    
    return parseFloat(result?.total || '0');
  }

  /**
   * Get released escrow amount for merchant
   */
  async getReleasedAmountForMerchant(merchantId: string, currency: CryptoCurrency): Promise<number> {
    const result = await this.query()
      .join('orders', 'escrow_ledger.order_id', 'orders.id')
      .join('listings', 'orders.listing_id', 'listings.id')
      .where({
        'listings.merchant_id': merchantId,
        'escrow_ledger.status': EscrowStatus.RELEASED,
        'escrow_ledger.currency': currency
      })
      .sum('escrow_ledger.merchant_amount as total')
      .first();
    
    return parseFloat(result?.total || '0');
  }

  /**
   * Count escrow entries by status
   */
  async countByStatus(status: EscrowStatus): Promise<number> {
    return await this.count({ status } as Partial<EscrowEntry>);
  }

  /**
   * Get escrow audit trail (all entries with timestamps)
   */
  async getAuditTrail(orderId?: string): Promise<EscrowEntry[]> {
    let query = this.query().orderBy('created_at', 'desc');
    
    if (orderId) {
      query = query.where({ order_id: orderId });
    }
    
    return await query.select('*');
  }
}
