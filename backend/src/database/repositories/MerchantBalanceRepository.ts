import { BaseRepository } from './BaseRepository';
import { MerchantBalance, CryptoCurrency, BalanceBreakdown } from '../../types/models';

/**
 * Merchant Balance Repository
 * Handles CRUD operations for merchant balances
 * 
 * Requirements: 1.1, 4.5, 6.7
 */
export class MerchantBalanceRepository extends BaseRepository<MerchantBalance> {
  constructor() {
    super('merchant_balances');
  }

  /**
   * Find balance by merchant ID and currency
   */
  async findByMerchantAndCurrency(
    merchantId: string,
    currency: CryptoCurrency
  ): Promise<MerchantBalance | null> {
    const result = await this.query()
      .where({ 
        merchant_id: merchantId,
        currency 
      })
      .first();
    return result || null;
  }

  /**
   * Find all balances for a merchant
   */
  async findByMerchantId(merchantId: string): Promise<MerchantBalance[]> {
    return await this.query()
      .where({ merchant_id: merchantId })
      .select('*');
  }

  /**
   * Get balance breakdown for merchant (all currencies)
   */
  async getBalanceBreakdown(merchantId: string): Promise<BalanceBreakdown> {
    const balances = await this.findByMerchantId(merchantId);
    
    const breakdown: BalanceBreakdown = {
      merchantId,
      balances: {} as Record<CryptoCurrency, any>
    };

    balances.forEach((balance) => {
      breakdown.balances[balance.currency] = {
        available: balance.availableBalance,
        pending: balance.pendingBalance,
        totalEarned: balance.totalEarned,
        totalWithdrawn: balance.totalWithdrawn
      };
    });

    return breakdown;
  }

  /**
   * Increment available balance
   */
  async incrementAvailable(
    merchantId: string,
    currency: CryptoCurrency,
    amount: number
  ): Promise<MerchantBalance | null> {
    // Ensure balance record exists
    await this.ensureBalanceExists(merchantId, currency);
    
    const [result] = await this.query()
      .where({ 
        merchant_id: merchantId,
        currency 
      })
      .increment('available_balance', amount)
      .increment('total_earned', amount)
      .update({ updated_at: this.db.fn.now() })
      .returning('*');
    
    return result || null;
  }

  /**
   * Decrement available balance
   */
  async decrementAvailable(
    merchantId: string,
    currency: CryptoCurrency,
    amount: number
  ): Promise<MerchantBalance | null> {
    const [result] = await this.query()
      .where({ 
        merchant_id: merchantId,
        currency 
      })
      .decrement('available_balance', amount)
      .increment('total_withdrawn', amount)
      .update({ updated_at: this.db.fn.now() })
      .returning('*');
    
    return result || null;
  }

  /**
   * Increment pending balance
   */
  async incrementPending(
    merchantId: string,
    currency: CryptoCurrency,
    amount: number
  ): Promise<MerchantBalance | null> {
    // Ensure balance record exists
    await this.ensureBalanceExists(merchantId, currency);
    
    const [result] = await this.query()
      .where({ 
        merchant_id: merchantId,
        currency 
      })
      .increment('pending_balance', amount)
      .update({ updated_at: this.db.fn.now() })
      .returning('*');
    
    return result || null;
  }

  /**
   * Move from pending to available
   */
  async movePendingToAvailable(
    merchantId: string,
    currency: CryptoCurrency,
    amount: number
  ): Promise<MerchantBalance | null> {
    const [result] = await this.query()
      .where({ 
        merchant_id: merchantId,
        currency 
      })
      .decrement('pending_balance', amount)
      .increment('available_balance', amount)
      .update({ updated_at: this.db.fn.now() })
      .returning('*');
    
    return result || null;
  }

  /**
   * Ensure balance record exists for merchant and currency
   */
  async ensureBalanceExists(
    merchantId: string,
    currency: CryptoCurrency
  ): Promise<MerchantBalance> {
    const existing = await this.findByMerchantAndCurrency(merchantId, currency);
    
    if (existing) {
      return existing;
    }

    // Create new balance record with zero values
    return await this.create({
      merchantId,
      currency,
      availableBalance: 0,
      pendingBalance: 0,
      totalEarned: 0,
      totalWithdrawn: 0
    } as Partial<MerchantBalance>);
  }

  /**
   * Check if merchant has sufficient available balance
   */
  async hasSufficientBalance(
    merchantId: string,
    currency: CryptoCurrency,
    amount: number
  ): Promise<boolean> {
    const balance = await this.findByMerchantAndCurrency(merchantId, currency);
    
    if (!balance) {
      return false;
    }

    return balance.availableBalance >= amount;
  }

  /**
   * Get total available balance across all merchants for a currency
   */
  async getTotalAvailableByCurrency(currency: CryptoCurrency): Promise<number> {
    const result = await this.query()
      .where({ currency })
      .sum('available_balance as total')
      .first();
    
    return parseFloat(result?.total || '0');
  }

  /**
   * Get total pending balance across all merchants for a currency
   */
  async getTotalPendingByCurrency(currency: CryptoCurrency): Promise<number> {
    const result = await this.query()
      .where({ currency })
      .sum('pending_balance as total')
      .first();
    
    return parseFloat(result?.total || '0');
  }
}

// Export singleton instance
export const merchantBalanceRepository = new MerchantBalanceRepository();
