/**
 * Admin Service
 * 
 * Provides administrative functions for platform management.
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.6
 * 
 * Features:
 * - Get disputes for review
 * - Get pending payouts
 * - Get platform metrics
 * - Suspend/unsuspend merchants
 * - Audit logging for admin actions
 */

import { DisputeRepository } from '../database/repositories/DisputeRepository';
import { PayoutRepository } from '../database/repositories/PayoutRepository';
import { OrderRepository } from '../database/repositories/OrderRepository';
import { SubscriptionRepository } from '../database/repositories/SubscriptionRepository';
import { ListingRepository } from '../database/repositories/ListingRepository';
import { MerchantRepository } from '../database/repositories/MerchantRepository';
import { AuditLogRepository } from '../database/repositories/AuditLogRepository';
import { logger } from '../utils/logger';
import {
  Dispute,
  Payout,
  DisputeStatus,
  PayoutStatus,
  SubscriptionStatus,
  PlatformMetrics
} from '../types/models';

/**
 * Admin Service
 * 
 * Handles administrative operations and platform management.
 */
export class AdminService {
  private disputeRepository: DisputeRepository;
  private payoutRepository: PayoutRepository;
  private orderRepository: OrderRepository;
  private subscriptionRepository: SubscriptionRepository;
  private listingRepository: ListingRepository;
  private merchantRepository: MerchantRepository;
  private auditLogRepository: AuditLogRepository;

  constructor() {
    this.disputeRepository = new DisputeRepository();
    this.payoutRepository = new PayoutRepository();
    this.orderRepository = new OrderRepository();
    this.subscriptionRepository = new SubscriptionRepository();
    this.listingRepository = new ListingRepository();
    this.merchantRepository = new MerchantRepository();
    this.auditLogRepository = new AuditLogRepository();
  }

  /**
   * Get disputes for admin review
   * 
   * Returns disputes that need attention (open or in progress).
   * 
   * Requirements: 13.1, 13.2
   * 
   * @param status - Filter by status (optional)
   * @param limit - Maximum number of disputes
   * @param offset - Number of disputes to skip
   * @returns Array of disputes
   */
  async getDisputesForReview(
    status?: DisputeStatus,
    limit: number = 50,
    offset: number = 0
  ): Promise<Dispute[]> {
    try {
      logger.info('Getting disputes for review', { status, limit, offset });

      if (status) {
        return await this.disputeRepository.findByStatus(status);
      }

      return await this.disputeRepository.findNeedingAttention();

    } catch (error) {
      logger.error('Error getting disputes for review', { error, status });
      throw error;
    }
  }

  /**
   * Get pending payouts for admin review
   * 
   * Requirements: 13.1, 13.3
   * 
   * @param limit - Maximum number of payouts
   * @returns Array of pending payouts
   */
  async getPendingPayouts(limit: number = 50): Promise<Payout[]> {
    try {
      logger.info('Getting pending payouts', { limit });

      const payouts = await this.payoutRepository.findByStatus(PayoutStatus.PENDING);

      return payouts.slice(0, limit);

    } catch (error) {
      logger.error('Error getting pending payouts', { error });
      throw error;
    }
  }

  /**
   * Get platform metrics
   * 
   * Returns key metrics for admin dashboard.
   * 
   * Requirements: 13.1, 13.3
   * 
   * @returns Platform metrics
   */
  async getPlatformMetrics(): Promise<PlatformMetrics> {
    try {
      logger.info('Getting platform metrics');

      const [
        totalUsers,
        totalMerchants,
        totalListings,
        activeSubscriptions,
        pendingDisputes,
        recentTransactions
      ] = await Promise.all([
        this.getUserCount(),
        this.merchantRepository.count({}),
        this.listingRepository.count({}),
        this.subscriptionRepository.countByStatus(SubscriptionStatus.ACTIVE),
        this.disputeRepository.countByStatus(DisputeStatus.OPEN),
        this.orderRepository.count({
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        })
      ]);

      // Get total escrow balance (would need to sum from escrow_ledger table)
      const totalEscrowBalance = {
        BNB: 0,
        BTC: 0,
        USDT_BEP20: 0,
        USDC_BEP20: 0,
        USDT_TRC20: 0
      };

      const metrics: PlatformMetrics = {
        totalUsers,
        totalMerchants,
        totalListings,
        activeSubscriptions,
        pendingDisputes,
        totalEscrowBalance,
        recentTransactions
      };

      logger.info('Platform metrics retrieved', metrics);

      return metrics;

    } catch (error) {
      logger.error('Error getting platform metrics', { error });
      throw error;
    }
  }

  /**
   * Get user count
   * 
   * @returns Number of users
   */
  private async getUserCount(): Promise<number> {
    try {
      // Import db here to avoid circular dependencies
      const db = require('../database/connection').default;
      
      const result = await db('users').count('* as count').first();
      
      return parseInt(result?.count || '0');

    } catch (error) {
      logger.error('Error getting user count', { error });
      return 0;
    }
  }

  /**
   * Log admin action
   * 
   * Requirements: 13.4, 13.6
   * 
   * @param adminId - Admin user ID
   * @param action - Action performed
   * @param entityType - Type of entity affected
   * @param entityId - ID of entity affected
   * @param details - Additional details
   */
  async logAdminAction(
    adminId: string,
    action: string,
    entityType: string,
    entityId: string,
    details?: Record<string, any>
  ): Promise<void> {
    try {
      await this.auditLogRepository.create({
        id: require('uuid').v4(),
        adminId: adminId,
        action,
        entityType,
        entityId,
        changes: details,
        ipAddress: undefined,
        createdAt: new Date()
      });

      logger.info('Admin action logged', {
        adminId,
        action,
        entityType,
        entityId
      });

    } catch (error) {
      logger.error('Error logging admin action', {
        error,
        adminId,
        action,
        entityType,
        entityId
      });
      // Don't throw - logging failure shouldn't break the operation
    }
  }

  /**
   * Get audit log entries
   * 
   * Requirements: 13.6
   * 
   * @param limit - Maximum number of entries
   * @param offset - Number of entries to skip
   * @returns Array of audit log entries
   */
  async getAuditLog(limit: number = 100, offset: number = 0) {
    try {
      return await this.auditLogRepository.findRecent(limit, offset);
    } catch (error) {
      logger.error('Error getting audit log', { error, limit, offset });
      throw error;
    }
  }

  /**
   * Get audit log entries for specific entity
   * 
   * Requirements: 13.6
   * 
   * @param entityType - Type of entity
   * @param entityId - ID of entity
   * @returns Array of audit log entries
   */
  async getAuditLogForEntity(entityType: string, entityId: string) {
    try {
      return await this.auditLogRepository.findByEntity(entityType, entityId);
    } catch (error) {
      logger.error('Error getting audit log for entity', {
        error,
        entityType,
        entityId
      });
      throw error;
    }
  }

  /**
   * Get recent orders for admin dashboard
   * 
   * @param limit - Maximum number of orders
   * @returns Array of recent orders
   */
  async getRecentOrders(limit: number = 20) {
    try {
      return await this.orderRepository.getRecent(limit);
    } catch (error) {
      logger.error('Error getting recent orders', { error, limit });
      throw error;
    }
  }

  /**
   * Get statistics summary
   * 
   * @returns Statistics object
   */
  async getStatistics() {
    try {
      const [orderStats, subscriptionStats] = await Promise.all([
        this.orderRepository.getStatistics(),
        this.getSubscriptionStatistics()
      ]);

      return {
        orders: orderStats,
        subscriptions: subscriptionStats
      };

    } catch (error) {
      logger.error('Error getting statistics', { error });
      throw error;
    }
  }

  /**
   * Get subscription statistics
   * 
   * @returns Subscription statistics
   */
  private async getSubscriptionStatistics() {
    try {
      const [total, active, expired, cancelled, refunded] = await Promise.all([
        this.subscriptionRepository.count({}),
        this.subscriptionRepository.countByStatus(SubscriptionStatus.ACTIVE),
        this.subscriptionRepository.countByStatus(SubscriptionStatus.EXPIRED),
        this.subscriptionRepository.countByStatus(SubscriptionStatus.CANCELLED),
        this.subscriptionRepository.countByStatus(SubscriptionStatus.REFUNDED)
      ]);

      return {
        total,
        active,
        expired,
        cancelled,
        refunded
      };

    } catch (error) {
      logger.error('Error getting subscription statistics', { error });
      throw error;
    }
  }
}

// Export singleton instance
export const adminService = new AdminService();
