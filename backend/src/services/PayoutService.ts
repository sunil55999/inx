/**
 * Payout Service
 * 
 * Manages merchant payout requests and cryptocurrency transactions.
 * Validates balances, enforces minimum thresholds, and coordinates with blockchain services.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 * 
 * Features:
 * - Create payout requests with balance verification
 * - Enforce minimum payout thresholds
 * - Deduct from merchant available balance
 * - Queue cryptocurrency transactions
 * - Handle failed transactions and restore balances
 * - Track payout history
 */

import { v4 as uuidv4 } from 'uuid';
import { PayoutRepository } from '../database/repositories/PayoutRepository';
import { MerchantBalanceRepository } from '../database/repositories/MerchantBalanceRepository';
import { logger } from '../utils/logger';
import {
  Payout,
  PayoutStatus,
  CryptoCurrency,
  CreatePayoutRequest
} from '../types/models';
import { cryptoTransactionService } from './CryptoTransactionService';

/**
 * Payout creation result
 */
export interface PayoutCreationResult {
  payout: Payout;
  balanceDeducted: number;
  newAvailableBalance: number;
}

/**
 * Payout Service
 * 
 * Handles merchant payout requests and cryptocurrency transactions.
 */
export class PayoutService {
  private payoutRepository: PayoutRepository;
  private merchantBalanceRepository: MerchantBalanceRepository;

  // Minimum payout thresholds by currency (in USD equivalent)
  private static readonly MINIMUM_PAYOUT_THRESHOLDS: Record<CryptoCurrency, number> = {
    BNB: 50,
    BTC: 50,
    USDT_BEP20: 20,
    USDC_BEP20: 20,
    USDT_TRC20: 20,
  };

  constructor() {
    this.payoutRepository = new PayoutRepository();
    this.merchantBalanceRepository = new MerchantBalanceRepository();
  }

  /**
   * Create a payout request
   * 
   * Steps:
   * 1. Validate merchant balance
   * 2. Validate minimum threshold
   * 3. Deduct from available balance
   * 4. Create payout record
   * 5. Queue cryptocurrency transaction
   * 
   * Requirements: 6.1, 6.2, 6.3, 6.5
   * 
   * @param merchantId - Merchant requesting payout
   * @param request - Payout request details
   * @returns Payout creation result
   */
  async createPayout(
    merchantId: string,
    request: CreatePayoutRequest
  ): Promise<PayoutCreationResult> {
    try {
      logger.info('Creating payout', { merchantId, amount: request.amount, currency: request.currency });

      // Validate amount
      if (request.amount <= 0) {
        throw new Error('Payout amount must be greater than zero');
      }

      // Validate destination address
      if (!request.walletAddress || request.walletAddress.trim().length === 0) {
        throw new Error('Wallet address is required');
      }

      // Get merchant balance for this currency
      const balances = await this.merchantBalanceRepository.findByMerchantId(merchantId);
      const balance = balances.find(b => b.currency === request.currency);
      
      if (!balance) {
        throw new Error(`No balance found for currency: ${request.currency}`);
      }

      // Validate sufficient balance
      if (balance.availableBalance < request.amount) {
        throw new Error(
          `Insufficient balance. Available: ${balance.availableBalance}, Requested: ${request.amount}`
        );
      }

      // Validate minimum threshold
      const minimumThreshold = PayoutService.MINIMUM_PAYOUT_THRESHOLDS[request.currency];
      if (request.amount < minimumThreshold) {
        throw new Error(
          `Payout amount must be at least ${minimumThreshold} USD equivalent for ${request.currency}`
        );
      }

      // Deduct from available balance
      const updatedBalance = await this.merchantBalanceRepository.decrementAvailable(
        merchantId,
        request.currency,
        request.amount
      );

      if (!updatedBalance) {
        throw new Error('Failed to deduct balance');
      }

      logger.info('Balance deducted', {
        merchantId,
        currency: request.currency,
        amount: request.amount,
        oldBalance: balance.availableBalance,
        newBalance: updatedBalance.availableBalance
      });

      // Create payout record
      const payoutId = uuidv4();
      const payoutData: Partial<Payout> = {
        id: payoutId,
        merchantId,
        amount: request.amount,
        currency: request.currency,
        walletAddress: request.walletAddress.trim(),
        status: PayoutStatus.PENDING
      };

      const payout = await this.payoutRepository.create(payoutData as Payout);

      if (!payout) {
        // Restore balance if payout creation fails
        await this.merchantBalanceRepository.incrementAvailable(
          merchantId,
          request.currency,
          request.amount
        );
        throw new Error('Failed to create payout');
      }

      logger.info('Payout created', {
        payoutId: payout.id,
        merchantId,
        amount: request.amount,
        currency: request.currency,
        status: payout.status
      });

      // TODO: Queue cryptocurrency transaction
      // This would integrate with blockchain services to send the funds
      // For now, the payout remains in PENDING status until processed

      return {
        payout,
        balanceDeducted: request.amount,
        newAvailableBalance: updatedBalance.availableBalance
      };

    } catch (error) {
      logger.error('Error creating payout', { error, merchantId, request });
      throw error;
    }
  }

  /**
   * Process a payout (send cryptocurrency)
   * 
   * This is called by a worker process to actually send the cryptocurrency.
   * 
   * Steps:
   * 1. Get payout details
   * 2. Send cryptocurrency transaction
   * 3. Update payout status to COMPLETED
   * 4. Store transaction hash
   * 5. If transaction fails, restore merchant balance
   * 
   * Requirements: 6.4, 6.6, 6.7
   * 
   * @param payoutId - Payout ID to process
   * @returns Updated payout
   */
  async processPayout(payoutId: string): Promise<Payout> {
    try {
      logger.info('Processing payout', { payoutId });

      const payout = await this.payoutRepository.findById(payoutId);
      if (!payout) {
        throw new Error(`Payout not found: ${payoutId}`);
      }

      if (payout.status !== PayoutStatus.PENDING) {
        throw new Error(`Payout is not in PENDING status: ${payout.status}`);
      }

      // Update status to PROCESSING
      await this.payoutRepository.updateStatus(payoutId, PayoutStatus.PROCESSING);

      // Send cryptocurrency transaction
      const txResult = await cryptoTransactionService.sendTransaction({
        currency: payout.currency,
        toAddress: payout.walletAddress,
        amount: payout.amount
      });

      if (!txResult.success) {
        // Transaction failed - restore balance and mark payout as failed
        logger.error('Cryptocurrency transaction failed', {
          payoutId,
          error: txResult.error,
          retryable: txResult.retryable
        });

        // Restore merchant balance
        await this.merchantBalanceRepository.incrementAvailable(
          payout.merchantId,
          payout.currency,
          payout.amount
        );

        logger.info('Merchant balance restored after failed transaction', {
          merchantId: payout.merchantId,
          currency: payout.currency,
          amount: payout.amount
        });

        // Mark payout as failed
        const failedPayout = await this.payoutRepository.markFailed(
          payoutId,
          txResult.error || 'Transaction failed'
        );

        if (!failedPayout) {
          throw new Error('Failed to update payout status to FAILED');
        }

        return failedPayout;
      }

      // Transaction succeeded - update payout with transaction hash
      const updatedPayout = await this.payoutRepository.markCompleted(
        payoutId,
        txResult.transactionHash!
      );

      if (!updatedPayout) {
        throw new Error('Failed to update payout status to COMPLETED');
      }

      logger.info('Payout processed successfully', {
        payoutId,
        txHash: txResult.transactionHash,
        status: updatedPayout.status
      });

      return updatedPayout;

    } catch (error) {
      logger.error('Error processing payout', { error, payoutId });
      
      // Attempt to restore balance and mark as failed
      try {
        const payout = await this.payoutRepository.findById(payoutId);
        if (payout && payout.status !== PayoutStatus.COMPLETED) {
          await this.merchantBalanceRepository.incrementAvailable(
            payout.merchantId,
            payout.currency,
            payout.amount
          );
          await this.payoutRepository.markFailed(
            payoutId,
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
      } catch (restoreError) {
        logger.error('Failed to restore balance after error', { restoreError, payoutId });
      }

      throw error;
    }
  }

  /**
   * Fail a payout and restore merchant balance
   * 
   * Called when cryptocurrency transaction fails.
   * 
   * Requirements: 6.6
   * 
   * @param payoutId - Payout ID to fail
   * @param reason - Failure reason
   * @returns Updated payout
   */
  async failPayout(payoutId: string, reason: string): Promise<Payout> {
    try {
      logger.info('Failing payout', { payoutId, reason });

      const payout = await this.payoutRepository.findById(payoutId);
      if (!payout) {
        throw new Error(`Payout not found: ${payoutId}`);
      }

      if (payout.status === PayoutStatus.COMPLETED) {
        throw new Error('Cannot fail a completed payout');
      }

      // Restore merchant balance
      await this.merchantBalanceRepository.incrementAvailable(
        payout.merchantId,
        payout.currency,
        payout.amount
      );

      logger.info('Balance restored', {
        merchantId: payout.merchantId,
        currency: payout.currency,
        amount: payout.amount
      });

      // Update payout status
      const updatedPayout = await this.payoutRepository.markFailed(payoutId, reason);

      if (!updatedPayout) {
        throw new Error('Failed to update payout status');
      }

      logger.info('Payout failed', {
        payoutId,
        reason,
        status: updatedPayout.status
      });

      return updatedPayout;

    } catch (error) {
      logger.error('Error failing payout', { error, payoutId });
      throw error;
    }
  }

  /**
   * Get payout by ID
   * 
   * @param payoutId - Payout ID
   * @returns Payout or null
   */
  async getPayout(payoutId: string): Promise<Payout | null> {
    try {
      return await this.payoutRepository.findById(payoutId);
    } catch (error) {
      logger.error('Error getting payout', { error, payoutId });
      throw error;
    }
  }

  /**
   * Get payouts by merchant ID
   * 
   * Requirements: 6.7
   * 
   * @param merchantId - Merchant ID
   * @returns Array of payouts
   */
  async getPayoutsByMerchant(merchantId: string): Promise<Payout[]> {
    try {
      return await this.payoutRepository.findByMerchantId(merchantId);
    } catch (error) {
      logger.error('Error getting payouts by merchant', { error, merchantId });
      throw error;
    }
  }

  /**
   * Get payouts by status
   * 
   * @param status - Payout status
   * @returns Array of payouts
   */
  async getPayoutsByStatus(status: PayoutStatus): Promise<Payout[]> {
    try {
      return await this.payoutRepository.findByStatus(status);
    } catch (error) {
      logger.error('Error getting payouts by status', { error, status });
      throw error;
    }
  }

  /**
   * Get pending payouts (for admin review)
   * 
   * @returns Array of pending payouts
   */
  async getPendingPayouts(): Promise<Payout[]> {
    try {
      return await this.payoutRepository.findByStatus(PayoutStatus.PENDING);
    } catch (error) {
      logger.error('Error getting pending payouts', { error });
      throw error;
    }
  }

  /**
   * Get minimum payout threshold for currency
   * 
   * @param currency - Cryptocurrency type
   * @returns Minimum threshold in USD equivalent
   */
  static getMinimumThreshold(currency: CryptoCurrency): number {
    return PayoutService.MINIMUM_PAYOUT_THRESHOLDS[currency];
  }
}

// Export singleton instance
export const payoutService = new PayoutService();
