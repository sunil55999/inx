import { BaseRepository } from './BaseRepository';
import { Transaction, CryptoCurrency } from '../../types/models';

/**
 * Transaction Repository
 * Handles CRUD operations for blockchain transactions
 * 
 * Requirements: 1.1, 4.5, 6.7
 */
export class TransactionRepository extends BaseRepository<Transaction> {
  constructor() {
    super('transactions');
  }

  /**
   * Find transactions by order ID
   */
  async findByOrderId(orderId: string): Promise<Transaction[]> {
    return await this.query()
      .where({ order_id: orderId })
      .orderBy('detected_at', 'desc')
      .select('*');
  }

  /**
   * Find transaction by hash
   */
  async findByHash(transactionHash: string): Promise<Transaction | null> {
    const result = await this.query()
      .where({ transaction_hash: transactionHash })
      .first();
    return result || null;
  }

  /**
   * Find transactions by currency
   */
  async findByCurrency(currency: CryptoCurrency): Promise<Transaction[]> {
    return await this.query()
      .where({ currency })
      .orderBy('detected_at', 'desc')
      .select('*');
  }

  /**
   * Find transactions by from address
   */
  async findByFromAddress(fromAddress: string): Promise<Transaction[]> {
    return await this.query()
      .where({ from_address: fromAddress })
      .orderBy('detected_at', 'desc')
      .select('*');
  }

  /**
   * Find transactions by to address
   */
  async findByToAddress(toAddress: string): Promise<Transaction[]> {
    return await this.query()
      .where({ to_address: toAddress })
      .orderBy('detected_at', 'desc')
      .select('*');
  }

  /**
   * Update transaction confirmations
   */
  async updateConfirmations(id: string, confirmations: number): Promise<Transaction | null> {
    const updateData: Partial<Transaction> = { confirmations } as Partial<Transaction>;
    
    // Set confirmedAt timestamp when confirmations reach threshold
    // This is a simplified check - actual threshold depends on currency
    if (confirmations >= 3 && !await this.isConfirmed(id)) {
      updateData.confirmedAt = new Date();
    }
    
    return await this.update(id, updateData);
  }

  /**
   * Check if transaction is confirmed
   */
  async isConfirmed(id: string): Promise<boolean> {
    const result = await this.query()
      .where({ id })
      .whereNotNull('confirmed_at')
      .first('id');
    
    return !!result;
  }

  /**
   * Find pending transactions (not yet confirmed)
   */
  async findPending(): Promise<Transaction[]> {
    return await this.query()
      .whereNull('confirmed_at')
      .orderBy('detected_at', 'asc')
      .select('*');
  }

  /**
   * Find confirmed transactions
   */
  async findConfirmed(): Promise<Transaction[]> {
    return await this.query()
      .whereNotNull('confirmed_at')
      .orderBy('confirmed_at', 'desc')
      .select('*');
  }

  /**
   * Get recent transactions (for admin dashboard)
   */
  async getRecent(limit: number): Promise<Transaction[]> {
    return await this.query()
      .orderBy('detected_at', 'desc')
      .limit(limit)
      .select('*');
  }

  /**
   * Get total transaction volume by currency
   */
  async getTotalVolumeByCurrency(currency: CryptoCurrency): Promise<number> {
    const result = await this.query()
      .where({ currency })
      .whereNotNull('confirmed_at')
      .sum('amount as total')
      .first();
    
    return parseFloat(result?.total || '0');
  }

  /**
   * Count transactions by currency
   */
  async countByCurrency(currency: CryptoCurrency): Promise<number> {
    return await this.count({ currency } as Partial<Transaction>);
  }

  /**
   * Count confirmed transactions
   */
  async countConfirmed(): Promise<number> {
    const result = await this.query()
      .whereNotNull('confirmed_at')
      .count('* as count')
      .first();
    
    return parseInt(result?.count as string || '0', 10);
  }

  /**
   * Find transactions in time range
   */
  async findInTimeRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
    return await this.query()
      .whereBetween('detected_at', [startDate, endDate])
      .orderBy('detected_at', 'desc')
      .select('*');
  }

  /**
   * Check if transaction hash exists
   */
  async hashExists(transactionHash: string): Promise<boolean> {
    const result = await this.query()
      .where({ transaction_hash: transactionHash })
      .first('id');
    
    return !!result;
  }

  /**
   * Update block number
   */
  async updateBlockNumber(id: string, blockNumber: number): Promise<Transaction | null> {
    return await this.update(id, { blockNumber } as Partial<Transaction>);
  }
}
