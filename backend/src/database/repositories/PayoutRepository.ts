import { BaseRepository } from './BaseRepository';
import { Payout, PayoutStatus, CryptoCurrency } from '../../types/models';

/**
 * Payout Repository
 * Handles CRUD operations for merchant payouts
 * 
 * Requirements: 1.1, 4.5, 6.7
 */
export class PayoutRepository extends BaseRepository<Payout> {
  constructor() {
    super('payouts');
  }

  /**
   * Find payouts by merchant ID
   */
  async findByMerchantId(merchantId: string): Promise<Payout[]> {
    return await this.query()
      .where({ merchant_id: merchantId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find payouts by status
   */
  async findByStatus(status: PayoutStatus): Promise<Payout[]> {
    return await this.query()
      .where({ status })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find pending payouts
   */
  async findPending(): Promise<Payout[]> {
    return await this.findByStatus(PayoutStatus.PENDING);
  }

  /**
   * Find processing payouts
   */
  async findProcessing(): Promise<Payout[]> {
    return await this.findByStatus(PayoutStatus.PROCESSING);
  }

  /**
   * Update payout status
   */
  async updateStatus(id: string, status: PayoutStatus, errorMessage?: string): Promise<Payout | null> {
    const updateData: Partial<Payout> = { status } as Partial<Payout>;
    
    // Set processedAt timestamp when completed or failed
    if (status === PayoutStatus.COMPLETED || status === PayoutStatus.FAILED) {
      updateData.processedAt = new Date();
    }
    
    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }
    
    return await this.update(id, updateData);
  }

  /**
   * Mark payout as processing
   */
  async markProcessing(id: string): Promise<Payout | null> {
    return await this.updateStatus(id, PayoutStatus.PROCESSING);
  }

  /**
   * Mark payout as completed
   */
  async markCompleted(id: string, transactionHash: string): Promise<Payout | null> {
    const [result] = await this.query()
      .where({ id })
      .update({
        status: PayoutStatus.COMPLETED,
        transaction_hash: transactionHash,
        processed_at: this.db.fn.now(),
        updated_at: this.db.fn.now()
      })
      .returning('*');
    
    return result || null;
  }

  /**
   * Mark payout as failed
   */
  async markFailed(id: string, errorMessage: string): Promise<Payout | null> {
    return await this.updateStatus(id, PayoutStatus.FAILED, errorMessage);
  }

  /**
   * Get total payout amount by merchant and currency
   */
  async getTotalByMerchant(merchantId: string, currency: CryptoCurrency): Promise<number> {
    const result = await this.query()
      .where({ 
        merchant_id: merchantId,
        currency,
        status: PayoutStatus.COMPLETED
      })
      .sum('amount as total')
      .first();
    
    return parseFloat(result?.total || '0');
  }

  /**
   * Get pending payout amount by merchant and currency
   */
  async getPendingAmountByMerchant(merchantId: string, currency: CryptoCurrency): Promise<number> {
    const result = await this.query()
      .where({ 
        merchant_id: merchantId,
        currency
      })
      .whereIn('status', [PayoutStatus.PENDING, PayoutStatus.PROCESSING])
      .sum('amount as total')
      .first();
    
    return parseFloat(result?.total || '0');
  }

  /**
   * Count payouts by status
   */
  async countByStatus(status: PayoutStatus): Promise<number> {
    return await this.count({ status } as Partial<Payout>);
  }

  /**
   * Get recent payouts (for admin dashboard)
   */
  async getRecent(limit: number): Promise<Payout[]> {
    return await this.query()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .select('*');
  }

  /**
   * Get failed payouts for retry
   */
  async getFailedForRetry(maxAge: Date): Promise<Payout[]> {
    return await this.query()
      .where({ status: PayoutStatus.FAILED })
      .where('created_at', '>=', maxAge)
      .orderBy('created_at', 'asc')
      .select('*');
  }

  /**
   * Get payouts by transaction hash
   */
  async findByTransactionHash(transactionHash: string): Promise<Payout | null> {
    const result = await this.query()
      .where({ transaction_hash: transactionHash })
      .first();
    return result || null;
  }
}

// Export singleton instance
export const payoutRepository = new PayoutRepository();
