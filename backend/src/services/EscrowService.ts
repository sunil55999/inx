/**
 * Escrow Service
 * 
 * Manages escrow funds for subscription payments, ensuring buyer protection
 * and proper merchant payouts. Handles fund holding, release, and refunds.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 * 
 * Features:
 * - Create escrow entries when subscriptions activate
 * - Calculate platform fees (5% configurable)
 * - Release escrow funds to merchant balances on subscription completion
 * - Process pro-rated refunds based on unused subscription time
 * - Update merchant balances (available_balance, pending_balance)
 */

import { v4 as uuidv4 } from 'uuid';
import { EscrowRepository } from '../database/repositories/EscrowRepository';
import { MerchantBalanceRepository } from '../database/repositories/MerchantBalanceRepository';
import { SubscriptionRepository } from '../database/repositories/SubscriptionRepository';
import { OrderRepository } from '../database/repositories/OrderRepository';
import { ListingRepository } from '../database/repositories/ListingRepository';
import { AuditLogRepository } from '../database/repositories/AuditLogRepository';
import { logger } from '../utils/logger';
import {
  EscrowEntry,
  EscrowStatus,
  CryptoCurrency,
  Subscription,
  AuditLog,
  DEFAULT_PLATFORM_FEE
} from '../types/models';

/**
 * Escrow creation result
 */
export interface EscrowCreationResult {
  escrow: EscrowEntry;
  platformFee: number;
  merchantAmount: number;
}

/**
 * Refund calculation result
 */
export interface RefundCalculation {
  totalAmount: number;
  usedDays: number;
  unusedDays: number;
  totalDays: number;
  refundAmount: number;
  refundPercentage: number;
}

/**
 * Escrow Service
 * 
 * Handles escrow fund management for subscription payments.
 * Ensures buyer protection and proper merchant payouts.
 */
export class EscrowService {
  private escrowRepository: EscrowRepository;
  private merchantBalanceRepository: MerchantBalanceRepository;
  private subscriptionRepository: SubscriptionRepository;
  private orderRepository: OrderRepository;
  private listingRepository: ListingRepository;
  private auditLogRepository: AuditLogRepository;
  private platformFeePercentage: number;

  constructor() {
    this.escrowRepository = new EscrowRepository();
    this.merchantBalanceRepository = new MerchantBalanceRepository();
    this.subscriptionRepository = new SubscriptionRepository();
    this.orderRepository = new OrderRepository();
    this.listingRepository = new ListingRepository();
    this.auditLogRepository = new AuditLogRepository();
    
    // Get platform fee from environment or use default (5%)
    this.platformFeePercentage = parseFloat(
      process.env.PLATFORM_FEE_PERCENTAGE || String(DEFAULT_PLATFORM_FEE)
    );
  }

  /**
   * Log escrow transaction to audit trail
   * 
   * Records all escrow status changes with timestamps for audit purposes.
   * 
   * Requirements: 4.5
   * 
   * @param escrowId - Escrow entry ID
   * @param action - Action performed (created, released, refunded)
   * @param oldStatus - Previous status (if applicable)
   * @param newStatus - New status
   * @param metadata - Additional metadata about the transaction
   * @param userId - User ID who initiated the action (optional, system if not provided)
   */
  private async logEscrowTransaction(
    escrowId: string,
    action: string,
    oldStatus: EscrowStatus | null,
    newStatus: EscrowStatus,
    metadata?: Record<string, any>,
    userId?: string
  ): Promise<void> {
    try {
      const changes: Record<string, any> = {
        oldStatus,
        newStatus,
        timestamp: new Date().toISOString(),
        ...metadata
      };

      await this.auditLogRepository.create({
        adminId: userId || 'system',
        action: `escrow_${action}`,
        entityType: 'escrow',
        entityId: escrowId,
        changes
      } as Partial<AuditLog>);

      logger.info('Escrow transaction logged', {
        escrowId,
        action,
        oldStatus,
        newStatus
      });
    } catch (error) {
      // Log error but don't fail the main operation
      logger.error('Error logging escrow transaction', {
        error,
        escrowId,
        action
      });
    }
  }

  /**
   * Create escrow entry when subscription activates
   * 
   * This function is called when a subscription is created from a confirmed order.
   * It holds the payment amount in escrow until the subscription completes or is refunded.
   * 
   * Steps:
   * 1. Validate order and subscription exist
   * 2. Calculate platform fee
   * 3. Create escrow entry with HELD status
   * 4. Update merchant pending balance
   * 
   * Requirements: 4.1
   * 
   * @param orderId - Order ID for the payment
   * @param subscriptionId - Subscription ID to link escrow to
   * @returns Escrow creation result
   */
  async createEscrow(orderId: string, subscriptionId: string): Promise<EscrowCreationResult> {
    try {
      logger.info('Creating escrow entry', { orderId, subscriptionId });

      // Validate order exists
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Validate subscription exists
      const subscription = await this.subscriptionRepository.findById(subscriptionId);
      if (!subscription) {
        throw new Error(`Subscription not found: ${subscriptionId}`);
      }

      // Check if escrow already exists for this order
      const existingEscrow = await this.escrowRepository.findByOrderId(orderId);
      if (existingEscrow) {
        logger.warn('Escrow already exists for order', {
          orderId,
          escrowId: existingEscrow.id
        });
        return {
          escrow: existingEscrow,
          platformFee: existingEscrow.platformFee,
          merchantAmount: existingEscrow.merchantAmount || 0
        };
      }

      // Calculate platform fee
      const platformFee = this.calculatePlatformFee(order.amount);
      const merchantAmount = order.amount - platformFee;

      // Create escrow entry
      const escrowId = uuidv4();
      const escrowData: Partial<EscrowEntry> = {
        id: escrowId,
        orderId: order.id,
        subscriptionId: subscription.id,
        amount: order.amount,
        currency: order.currency,
        status: EscrowStatus.HELD,
        platformFee,
        merchantAmount
      };

      const escrow = await this.escrowRepository.create(escrowData as EscrowEntry);

      if (!escrow) {
        throw new Error('Failed to create escrow entry');
      }

      logger.info('Escrow entry created', {
        escrowId: escrow.id,
        orderId,
        subscriptionId,
        amount: order.amount,
        currency: order.currency,
        platformFee,
        merchantAmount
      });

      // Log escrow creation to audit trail
      await this.logEscrowTransaction(
        escrow.id,
        'created',
        null,
        EscrowStatus.HELD,
        {
          orderId,
          subscriptionId,
          amount: order.amount,
          currency: order.currency,
          platformFee,
          merchantAmount
        }
      );

      // Get merchant ID from listing
      const listing = await this.listingRepository.findById(order.listingId);
      if (!listing) {
        throw new Error(`Listing not found: ${order.listingId}`);
      }

      // Update merchant pending balance
      await this.merchantBalanceRepository.incrementPending(
        listing.merchantId,
        order.currency,
        merchantAmount
      );

      logger.info('Merchant pending balance updated', {
        merchantId: listing.merchantId,
        currency: order.currency,
        amount: merchantAmount
      });

      return {
        escrow,
        platformFee,
        merchantAmount
      };

    } catch (error) {
      logger.error('Error creating escrow entry', { error, orderId, subscriptionId });
      throw error;
    }
  }

  /**
   * Release escrow funds to merchant when subscription completes
   * 
   * This function is called when a subscription reaches its expiry date successfully.
   * It moves funds from escrow to the merchant's available balance.
   * 
   * Steps:
   * 1. Validate escrow exists and is in HELD status
   * 2. Update escrow status to RELEASED
   * 3. Move funds from merchant pending to available balance
   * 
   * Requirements: 4.2
   * 
   * @param subscriptionId - Subscription ID that completed
   * @returns Released escrow entry
   */
  async releaseEscrow(subscriptionId: string): Promise<EscrowEntry> {
    try {
      logger.info('Releasing escrow for subscription', { subscriptionId });

      // Find escrow entry
      const escrow = await this.escrowRepository.findBySubscriptionId(subscriptionId);
      if (!escrow) {
        throw new Error(`Escrow not found for subscription: ${subscriptionId}`);
      }

      // Validate escrow is in HELD status
      if (escrow.status !== EscrowStatus.HELD) {
        throw new Error(
          `Cannot release escrow with status: ${escrow.status}. ` +
          `Escrow must be in HELD status.`
        );
      }

      // Get order to find listing and merchant
      const order = await this.orderRepository.findById(escrow.orderId);
      if (!order) {
        throw new Error(`Order not found: ${escrow.orderId}`);
      }

      const listing = await this.listingRepository.findById(order.listingId);
      if (!listing) {
        throw new Error(`Listing not found: ${order.listingId}`);
      }

      // Update escrow status to RELEASED
      const releasedEscrow = await this.escrowRepository.release(
        escrow.id,
        escrow.merchantAmount || 0
      );

      if (!releasedEscrow) {
        throw new Error('Failed to release escrow');
      }

      logger.info('Escrow released', {
        escrowId: escrow.id,
        subscriptionId,
        merchantAmount: escrow.merchantAmount
      });

      // Log escrow release to audit trail
      await this.logEscrowTransaction(
        escrow.id,
        'released',
        EscrowStatus.HELD,
        EscrowStatus.RELEASED,
        {
          subscriptionId,
          merchantAmount: escrow.merchantAmount,
          merchantId: listing.merchantId,
          currency: order.currency
        }
      );

      // Move funds from pending to available balance
      const merchantAmount = escrow.merchantAmount || 0;
      await this.merchantBalanceRepository.movePendingToAvailable(
        listing.merchantId,
        order.currency,
        merchantAmount
      );

      logger.info('Merchant balance updated', {
        merchantId: listing.merchantId,
        currency: order.currency,
        pendingToAvailable: merchantAmount
      });

      return releasedEscrow;

    } catch (error) {
      logger.error('Error releasing escrow', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Process refund with pro-rated calculation
   * 
   * This function is called when a refund is approved for a subscription.
   * It calculates the pro-rated refund amount based on unused subscription days.
   * 
   * Formula: refundAmount = paymentAmount × (unusedDays / totalDays)
   * 
   * Steps:
   * 1. Validate escrow exists and is in HELD status
   * 2. Calculate pro-rated refund amount
   * 3. Update escrow status to REFUNDED
   * 4. Deduct from merchant pending balance
   * 
   * Requirements: 4.3, 4.4
   * 
   * @param subscriptionId - Subscription ID to refund
   * @returns Refund calculation details
   */
  async refundEscrow(subscriptionId: string): Promise<RefundCalculation> {
    try {
      logger.info('Processing escrow refund', { subscriptionId });

      // Find escrow entry
      const escrow = await this.escrowRepository.findBySubscriptionId(subscriptionId);
      if (!escrow) {
        throw new Error(`Escrow not found for subscription: ${subscriptionId}`);
      }

      // Validate escrow is in HELD status
      if (escrow.status !== EscrowStatus.HELD) {
        throw new Error(
          `Cannot refund escrow with status: ${escrow.status}. ` +
          `Escrow must be in HELD status.`
        );
      }

      // Get subscription to calculate pro-rated refund
      const subscription = await this.subscriptionRepository.findById(subscriptionId);
      if (!subscription) {
        throw new Error(`Subscription not found: ${subscriptionId}`);
      }

      // Calculate pro-rated refund
      const refundCalculation = this.calculateProRatedRefund(subscription, escrow.amount);

      logger.info('Refund calculation', {
        subscriptionId,
        ...refundCalculation
      });

      // Update escrow status to REFUNDED
      const refundedEscrow = await this.escrowRepository.refund(escrow.id);

      if (!refundedEscrow) {
        throw new Error('Failed to refund escrow');
      }

      logger.info('Escrow refunded', {
        escrowId: escrow.id,
        subscriptionId,
        refundAmount: refundCalculation.refundAmount
      });

      // Log escrow refund to audit trail
      await this.logEscrowTransaction(
        escrow.id,
        'refunded',
        EscrowStatus.HELD,
        EscrowStatus.REFUNDED,
        {
          subscriptionId,
          refundAmount: refundCalculation.refundAmount,
          usedDays: refundCalculation.usedDays,
          unusedDays: refundCalculation.unusedDays,
          totalDays: refundCalculation.totalDays,
          refundPercentage: refundCalculation.refundPercentage
        }
      );

      // Get order to find listing and merchant
      const order = await this.orderRepository.findById(escrow.orderId);
      if (!order) {
        throw new Error(`Order not found: ${escrow.orderId}`);
      }

      const listing = await this.listingRepository.findById(order.listingId);
      if (!listing) {
        throw new Error(`Listing not found: ${order.listingId}`);
      }

      // Deduct the merchant amount from pending balance
      // The merchant loses the full amount they would have received
      const merchantAmount = escrow.merchantAmount || 0;
      
      // Get the current balance to manually decrement
      const currentBalance = await this.merchantBalanceRepository.findByMerchantAndCurrency(
        listing.merchantId,
        order.currency
      );

      if (currentBalance) {
        // Manually update the pending balance by decrementing
        const newPendingBalance = Math.max(0, currentBalance.pendingBalance - merchantAmount);
        await this.merchantBalanceRepository.update(currentBalance.id, {
          pendingBalance: newPendingBalance
        } as any);
      }

      logger.info('Merchant pending balance reduced', {
        merchantId: listing.merchantId,
        currency: order.currency,
        amount: merchantAmount
      });

      return refundCalculation;

    } catch (error) {
      logger.error('Error processing escrow refund', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Calculate platform fee from payment amount
   * 
   * @param amount - Payment amount
   * @returns Platform fee amount
   */
  private calculatePlatformFee(amount: number): number {
    return amount * this.platformFeePercentage;
  }

  /**
   * Calculate pro-rated refund based on unused subscription days
   * 
   * Formula: refundAmount = paymentAmount × (unusedDays / totalDays)
   * 
   * Requirements: 4.3, 4.4
   * 
   * @param subscription - Subscription to calculate refund for
   * @param paymentAmount - Original payment amount
   * @returns Refund calculation details
   */
  calculateProRatedRefund(
    subscription: Subscription,
    paymentAmount: number
  ): RefundCalculation {
    const now = new Date();
    const startDate = new Date(subscription.startDate);
    const expiryDate = new Date(subscription.expiryDate);
    const totalDays = subscription.durationDays;

    // Calculate used days (from start to now)
    const usedMs = now.getTime() - startDate.getTime();
    const usedDays = Math.max(0, Math.floor(usedMs / (24 * 60 * 60 * 1000)));

    // Calculate unused days (from now to expiry)
    const unusedMs = expiryDate.getTime() - now.getTime();
    const unusedDays = Math.max(0, Math.ceil(unusedMs / (24 * 60 * 60 * 1000)));

    // Calculate refund amount
    const refundPercentage = unusedDays / totalDays;
    const refundAmount = paymentAmount * refundPercentage;

    return {
      totalAmount: paymentAmount,
      usedDays,
      unusedDays,
      totalDays,
      refundAmount,
      refundPercentage
    };
  }

  /**
   * Get escrow entry by subscription ID
   * 
   * @param subscriptionId - Subscription ID
   * @returns Escrow entry or null
   */
  async getEscrowBySubscriptionId(subscriptionId: string): Promise<EscrowEntry | null> {
    try {
      return await this.escrowRepository.findBySubscriptionId(subscriptionId);
    } catch (error) {
      logger.error('Error getting escrow by subscription ID', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Get escrow entry by order ID
   * 
   * @param orderId - Order ID
   * @returns Escrow entry or null
   */
  async getEscrowByOrderId(orderId: string): Promise<EscrowEntry | null> {
    try {
      return await this.escrowRepository.findByOrderId(orderId);
    } catch (error) {
      logger.error('Error getting escrow by order ID', { error, orderId });
      throw error;
    }
  }

  /**
   * Get all held escrow entries
   * 
   * @returns Array of held escrow entries
   */
  async getHeldEscrows(): Promise<EscrowEntry[]> {
    try {
      return await this.escrowRepository.findHeld();
    } catch (error) {
      logger.error('Error getting held escrows', { error });
      throw error;
    }
  }

  /**
   * Get total escrow balance by currency
   * 
   * @param currency - Cryptocurrency type
   * @returns Total held amount
   */
  async getTotalEscrowBalance(currency: CryptoCurrency): Promise<number> {
    try {
      return await this.escrowRepository.getTotalBalanceByCurrency(currency);
    } catch (error) {
      logger.error('Error getting total escrow balance', { error, currency });
      throw error;
    }
  }

  /**
   * Get total escrow balances for all currencies
   * 
   * @returns Record of currency to total held amount
   */
  async getTotalEscrowBalances(): Promise<Record<CryptoCurrency, number>> {
    try {
      return await this.escrowRepository.getTotalBalances();
    } catch (error) {
      logger.error('Error getting total escrow balances', { error });
      throw error;
    }
  }

  /**
   * Get escrow entries for a merchant
   * 
   * @param merchantId - Merchant ID
   * @returns Array of escrow entries
   */
  async getMerchantEscrows(merchantId: string): Promise<EscrowEntry[]> {
    try {
      return await this.escrowRepository.findByMerchantId(merchantId);
    } catch (error) {
      logger.error('Error getting merchant escrows', { error, merchantId });
      throw error;
    }
  }

  /**
   * Get held escrow amount for merchant
   * 
   * @param merchantId - Merchant ID
   * @param currency - Cryptocurrency type
   * @returns Total held amount for merchant
   */
  async getMerchantHeldAmount(merchantId: string, currency: CryptoCurrency): Promise<number> {
    try {
      return await this.escrowRepository.getHeldAmountForMerchant(merchantId, currency);
    } catch (error) {
      logger.error('Error getting merchant held amount', { error, merchantId, currency });
      throw error;
    }
  }

  /**
   * Get platform fee percentage
   * 
   * @returns Platform fee as decimal (e.g., 0.05 for 5%)
   */
  getPlatformFeePercentage(): number {
    return this.platformFeePercentage;
  }

  /**
   * Set platform fee percentage (admin function)
   * 
   * @param percentage - New fee percentage as decimal (e.g., 0.05 for 5%)
   */
  setPlatformFeePercentage(percentage: number): void {
    if (percentage < 0 || percentage > 1) {
      throw new Error('Platform fee percentage must be between 0 and 1');
    }
    
    this.platformFeePercentage = percentage;
    logger.info('Platform fee percentage updated', { percentage });
  }

  /**
   * Get audit trail for escrow transactions
   * 
   * Retrieves all audit log entries for escrow transactions, optionally filtered
   * by escrow ID or time range.
   * 
   * Requirements: 4.5
   * 
   * @param filters - Optional filters for the audit trail
   * @returns Array of audit log entries
   */
  async getEscrowAuditTrail(filters?: {
    escrowId?: string;
    orderId?: string;
    subscriptionId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<AuditLog[]> {
    try {
      logger.info('Retrieving escrow audit trail', { filters });

      // If escrowId is provided, query by entity
      if (filters?.escrowId) {
        return await this.auditLogRepository.findByEntity('escrow', filters.escrowId);
      }

      // If orderId is provided, find escrow first then get audit trail
      if (filters?.orderId) {
        const escrow = await this.escrowRepository.findByOrderId(filters.orderId);
        if (escrow) {
          return await this.auditLogRepository.findByEntity('escrow', escrow.id);
        }
        return [];
      }

      // If subscriptionId is provided, find escrow first then get audit trail
      if (filters?.subscriptionId) {
        const escrow = await this.escrowRepository.findBySubscriptionId(filters.subscriptionId);
        if (escrow) {
          return await this.auditLogRepository.findByEntity('escrow', escrow.id);
        }
        return [];
      }

      // Build search filters
      const searchFilters: any = {
        entityType: 'escrow'
      };

      if (filters?.action) {
        searchFilters.action = `escrow_${filters.action}`;
      }

      if (filters?.startDate) {
        searchFilters.startDate = filters.startDate;
      }

      if (filters?.endDate) {
        searchFilters.endDate = filters.endDate;
      }

      // Use search with pagination (get all results)
      const result = await this.auditLogRepository.search(
        searchFilters,
        1000, // limit
        0     // offset
      );

      return result.data;

    } catch (error) {
      logger.error('Error retrieving escrow audit trail', { error, filters });
      throw error;
    }
  }

  /**
   * Get audit trail for a specific merchant's escrow transactions
   * 
   * Requirements: 4.5
   * 
   * @param merchantId - Merchant ID
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns Array of audit log entries
   */
  async getMerchantEscrowAuditTrail(
    merchantId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<AuditLog[]> {
    try {
      logger.info('Retrieving merchant escrow audit trail', {
        merchantId,
        startDate,
        endDate
      });

      // Get all escrow entries for the merchant
      const escrows = await this.escrowRepository.findByMerchantId(merchantId);

      if (escrows.length === 0) {
        return [];
      }

      // Get audit logs for all escrow entries
      const auditLogs: AuditLog[] = [];
      
      for (const escrow of escrows) {
        const logs = await this.auditLogRepository.findByEntity('escrow', escrow.id);
        
        // Filter by date range if provided
        const filteredLogs = logs.filter(log => {
          if (startDate && new Date(log.createdAt) < startDate) {
            return false;
          }
          if (endDate && new Date(log.createdAt) > endDate) {
            return false;
          }
          return true;
        });

        auditLogs.push(...filteredLogs);
      }

      // Sort by created date descending
      auditLogs.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return auditLogs;

    } catch (error) {
      logger.error('Error retrieving merchant escrow audit trail', {
        error,
        merchantId
      });
      throw error;
    }
  }

  /**
   * Get escrow transaction statistics
   * 
   * Requirements: 4.5
   * 
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns Statistics about escrow transactions
   */
  async getEscrowStatistics(startDate?: Date, endDate?: Date): Promise<{
    totalCreated: number;
    totalReleased: number;
    totalRefunded: number;
    totalAmount: Record<CryptoCurrency, number>;
    releasedAmount: Record<CryptoCurrency, number>;
    refundedAmount: Record<CryptoCurrency, number>;
  }> {
    try {
      logger.info('Retrieving escrow statistics', { startDate, endDate });

      // Get audit logs for escrow transactions
      const searchFilters: any = {
        entityType: 'escrow'
      };

      if (startDate) {
        searchFilters.startDate = startDate;
      }

      if (endDate) {
        searchFilters.endDate = endDate;
      }

      const result = await this.auditLogRepository.search(
        searchFilters,
        10000, // large limit to get all
        0
      );

      const logs = result.data;

      // Count transactions by type
      const totalCreated = logs.filter(log => log.action === 'escrow_created').length;
      const totalReleased = logs.filter(log => log.action === 'escrow_released').length;
      const totalRefunded = logs.filter(log => log.action === 'escrow_refunded').length;

      // Calculate amounts by currency
      const totalAmount: Record<string, number> = {};
      const releasedAmount: Record<string, number> = {};
      const refundedAmount: Record<string, number> = {};

      logs.forEach(log => {
        const changes = log.changes || {};
        const currency = changes.currency;
        const amount = changes.amount || changes.merchantAmount || changes.refundAmount || 0;

        if (!currency) return;

        if (log.action === 'escrow_created') {
          totalAmount[currency] = (totalAmount[currency] || 0) + amount;
        } else if (log.action === 'escrow_released') {
          releasedAmount[currency] = (releasedAmount[currency] || 0) + amount;
        } else if (log.action === 'escrow_refunded') {
          refundedAmount[currency] = (refundedAmount[currency] || 0) + amount;
        }
      });

      return {
        totalCreated,
        totalReleased,
        totalRefunded,
        totalAmount: totalAmount as Record<CryptoCurrency, number>,
        releasedAmount: releasedAmount as Record<CryptoCurrency, number>,
        refundedAmount: refundedAmount as Record<CryptoCurrency, number>
      };

    } catch (error) {
      logger.error('Error retrieving escrow statistics', { error });
      throw error;
    }
  }
}

// Export singleton instance
export const escrowService = new EscrowService();
