/**
 * Dispute Service
 * 
 * Manages dispute creation, resolution, and refund processing for subscription issues.
 * Coordinates with escrow service for refunds and bot service for access revocation.
 * 
 * Requirements: 13.1, 13.2, 13.4, 13.5, 13.6, 14.1, 14.2, 14.3, 14.4
 * 
 * Features:
 * - Create disputes with validation (time window check)
 * - Update dispute status through workflow
 * - Resolve disputes with admin decision
 * - Calculate and process refunds
 * - Coordinate with escrow and bot services
 */

import { v4 as uuidv4 } from 'uuid';
import { DisputeRepository } from '../database/repositories/DisputeRepository';
import { OrderRepository } from '../database/repositories/OrderRepository';
import { SubscriptionRepository } from '../database/repositories/SubscriptionRepository';
import { escrowService } from './EscrowService';
import { botQueueProducer } from './BotQueueProducer';
import { refundTransactionQueue } from './RefundTransactionQueue';
import { logger } from '../utils/logger';
import {
  Dispute,
  DisputeStatus,
  DisputeWithRelations,
  CreateDisputeRequest,
  ResolveDisputeRequest,
  SubscriptionStatus,
  OrderStatus
} from '../types/models';

/**
 * Dispute creation result
 */
export interface DisputeCreationResult {
  dispute: Dispute;
  withinTimeWindow: boolean;
}

/**
 * Dispute resolution result
 */
export interface DisputeResolutionResult {
  dispute: Dispute;
  refundProcessed: boolean;
  refundAmount?: number;
  refundTransactionQueued: boolean;
  refundTransactionId?: string;
  botOperationQueued: boolean;
}

/**
 * Dispute time window validation result
 */
export interface TimeWindowValidation {
  isValid: boolean;
  reason?: string;
  subscriptionStatus?: SubscriptionStatus;
  daysAfterExpiry?: number;
}

/**
 * Dispute Service
 * 
 * Handles dispute creation, resolution, and refund processing.
 */
export class DisputeService {
  private disputeRepository: DisputeRepository;
  private orderRepository: OrderRepository;
  private subscriptionRepository: SubscriptionRepository;

  // Time window for dispute creation: 7 days after subscription ends
  private static readonly DISPUTE_TIME_WINDOW_DAYS = 7;

  constructor() {
    this.disputeRepository = new DisputeRepository();
    this.orderRepository = new OrderRepository();
    this.subscriptionRepository = new SubscriptionRepository();
  }

  /**
   * Validate dispute time window
   * 
   * A dispute can be created if:
   * - Subscription is currently active, OR
   * - Subscription ended within the last 7 days
   * 
   * Requirements: 13.2
   * 
   * @param orderId - Order ID to validate
   * @returns Time window validation result
   */
  async validateDisputeTimeWindow(orderId: string): Promise<TimeWindowValidation> {
    try {
      logger.info('Validating dispute time window', { orderId });

      // Get subscription for this order
      const subscription = await this.subscriptionRepository.findByOrderId(orderId);
      
      if (!subscription) {
        return {
          isValid: false,
          reason: 'No subscription found for this order'
        };
      }

      const now = new Date();
      const expiryDate = new Date(subscription.expiryDate);

      // Check if subscription is active
      if (subscription.status === SubscriptionStatus.ACTIVE) {
        logger.info('Subscription is active, dispute allowed', {
          orderId,
          subscriptionId: subscription.id,
          status: subscription.status
        });
        return {
          isValid: true,
          subscriptionStatus: subscription.status
        };
      }

      // Check if subscription ended within the time window
      if (
        subscription.status === SubscriptionStatus.EXPIRED ||
        subscription.status === SubscriptionStatus.CANCELLED
      ) {
        const daysSinceExpiry = Math.floor(
          (now.getTime() - expiryDate.getTime()) / (24 * 60 * 60 * 1000)
        );

        if (daysSinceExpiry <= DisputeService.DISPUTE_TIME_WINDOW_DAYS) {
          logger.info('Subscription ended within time window, dispute allowed', {
            orderId,
            subscriptionId: subscription.id,
            status: subscription.status,
            daysSinceExpiry
          });
          return {
            isValid: true,
            subscriptionStatus: subscription.status,
            daysAfterExpiry: daysSinceExpiry
          };
        } else {
          logger.warn('Subscription ended outside time window', {
            orderId,
            subscriptionId: subscription.id,
            daysSinceExpiry,
            maxDays: DisputeService.DISPUTE_TIME_WINDOW_DAYS
          });
          return {
            isValid: false,
            reason: `Dispute time window expired. Disputes must be created within ${DisputeService.DISPUTE_TIME_WINDOW_DAYS} days after subscription ends.`,
            subscriptionStatus: subscription.status,
            daysAfterExpiry: daysSinceExpiry
          };
        }
      }

      // Subscription is refunded or in another state
      logger.warn('Subscription in invalid state for dispute', {
        orderId,
        subscriptionId: subscription.id,
        status: subscription.status
      });
      return {
        isValid: false,
        reason: `Cannot create dispute for subscription with status: ${subscription.status}`,
        subscriptionStatus: subscription.status
      };

    } catch (error) {
      logger.error('Error validating dispute time window', { error, orderId });
      throw error;
    }
  }

  /**
   * Create a dispute for an order
   * 
   * Steps:
   * 1. Validate order exists
   * 2. Validate dispute time window (active or ended within 7 days)
   * 3. Check for existing open disputes
   * 4. Create dispute record
   * 
   * Requirements: 13.1, 13.2
   * 
   * @param buyerId - Buyer creating the dispute
   * @param request - Dispute creation request
   * @returns Dispute creation result
   */
  async createDispute(
    buyerId: string,
    request: CreateDisputeRequest
  ): Promise<DisputeCreationResult> {
    try {
      logger.info('Creating dispute', { buyerId, orderId: request.orderId });

      // Validate order exists
      const order = await this.orderRepository.findById(request.orderId);
      if (!order) {
        throw new Error(`Order not found: ${request.orderId}`);
      }

      // Validate buyer owns the order
      if (order.buyerId !== buyerId) {
        throw new Error('Buyer does not own this order');
      }

      // Validate order has a subscription (payment was confirmed)
      if (order.status === OrderStatus.PENDING_PAYMENT || order.status === OrderStatus.EXPIRED) {
        throw new Error('Cannot create dispute for unpaid or expired order');
      }

      // Validate dispute time window
      const timeWindowValidation = await this.validateDisputeTimeWindow(request.orderId);
      if (!timeWindowValidation.isValid) {
        throw new Error(timeWindowValidation.reason || 'Dispute time window validation failed');
      }

      // Check for existing open disputes
      const hasExistingDispute = await this.disputeRepository.hasDisputeForOrder(request.orderId);
      if (hasExistingDispute) {
        throw new Error('An open dispute already exists for this order');
      }

      // Validate issue description
      if (!request.issue || request.issue.trim().length === 0) {
        throw new Error('Issue description is required');
      }

      if (request.issue.length > 2000) {
        throw new Error('Issue description must be 2000 characters or less');
      }

      // Create dispute
      const disputeId = uuidv4();
      const disputeData: Partial<Dispute> = {
        id: disputeId,
        buyerId,
        orderId: request.orderId,
        issue: request.issue.trim(),
        status: DisputeStatus.OPEN
      };

      const dispute = await this.disputeRepository.create(disputeData as Dispute);

      if (!dispute) {
        throw new Error('Failed to create dispute');
      }

      logger.info('Dispute created', {
        disputeId: dispute.id,
        buyerId,
        orderId: request.orderId,
        status: dispute.status,
        withinTimeWindow: timeWindowValidation.isValid
      });

      // TODO: Send notification to admins about new dispute
      // This would be implemented in the notification service

      return {
        dispute,
        withinTimeWindow: timeWindowValidation.isValid
      };

    } catch (error) {
      logger.error('Error creating dispute', { error, buyerId, request });
      throw error;
    }
  }

  /**
   * Update dispute status
   * 
   * Allows updating the dispute status through the workflow:
   * OPEN -> IN_PROGRESS -> RESOLVED/CLOSED
   * 
   * Requirements: 13.4
   * 
   * @param disputeId - Dispute ID
   * @param status - New status
   * @param adminId - Admin performing the update (optional)
   * @returns Updated dispute
   */
  async updateDisputeStatus(
    disputeId: string,
    status: DisputeStatus,
    adminId?: string
  ): Promise<Dispute> {
    try {
      logger.info('Updating dispute status', { disputeId, status, adminId });

      // Get current dispute
      const dispute = await this.disputeRepository.findById(disputeId);
      if (!dispute) {
        throw new Error(`Dispute not found: ${disputeId}`);
      }

      // Validate status transition
      this.validateStatusTransition(dispute.status, status);

      // If moving to IN_PROGRESS and admin is provided, assign to admin
      if (status === DisputeStatus.IN_PROGRESS && adminId) {
        const updatedDispute = await this.disputeRepository.assignToAdmin(disputeId, adminId);
        if (!updatedDispute) {
          throw new Error('Failed to assign dispute to admin');
        }
        
        logger.info('Dispute assigned to admin', {
          disputeId,
          adminId,
          status: updatedDispute.status
        });
        
        return updatedDispute;
      }

      // Update status
      const updatedDispute = await this.disputeRepository.updateStatus(disputeId, status);
      if (!updatedDispute) {
        throw new Error('Failed to update dispute status');
      }

      logger.info('Dispute status updated', {
        disputeId,
        oldStatus: dispute.status,
        newStatus: status
      });

      return updatedDispute;

    } catch (error) {
      logger.error('Error updating dispute status', { error, disputeId, status });
      throw error;
    }
  }

  /**
   * Resolve a dispute with admin decision
   * 
   * Steps:
   * 1. Validate dispute exists and is in valid state
   * 2. Update dispute with resolution and admin ID
   * 3. If refund approved, calculate and process refund
   * 4. Update subscription status to refunded
   * 5. Queue bot operation to remove user from channel
   * 
   * Requirements: 13.5, 13.6, 14.1, 14.2, 14.3, 14.4
   * 
   * @param disputeId - Dispute ID
   * @param adminId - Admin resolving the dispute
   * @param request - Resolution request
   * @returns Dispute resolution result
   */
  async resolveDispute(
    disputeId: string,
    adminId: string,
    request: ResolveDisputeRequest
  ): Promise<DisputeResolutionResult> {
    try {
      logger.info('Resolving dispute', { disputeId, adminId, approveRefund: request.approveRefund });

      // Get dispute with relations
      const disputeWithRelations = await this.disputeRepository.findByIdWithRelations(disputeId);
      if (!disputeWithRelations) {
        throw new Error(`Dispute not found: ${disputeId}`);
      }

      // Validate dispute can be resolved
      if (disputeWithRelations.status === DisputeStatus.RESOLVED || 
          disputeWithRelations.status === DisputeStatus.CLOSED) {
        throw new Error(`Dispute already ${disputeWithRelations.status}`);
      }

      // Validate resolution text
      if (!request.resolution || request.resolution.trim().length === 0) {
        throw new Error('Resolution description is required');
      }

      // Resolve dispute
      const resolvedDispute = await this.disputeRepository.resolve(
        disputeId,
        request.resolution.trim(),
        adminId
      );

      if (!resolvedDispute) {
        throw new Error('Failed to resolve dispute');
      }

      logger.info('Dispute resolved', {
        disputeId,
        adminId,
        approveRefund: request.approveRefund
      });

      let refundProcessed = false;
      let refundAmount: number | undefined;
      let refundTransactionQueued = false;
      let refundTransactionId: string | undefined;
      let botOperationQueued = false;

      // Process refund if approved
      if (request.approveRefund) {
        try {
          // Get subscription
          const subscription = await this.subscriptionRepository.findByOrderId(
            disputeWithRelations.orderId
          );

          if (!subscription) {
            throw new Error(`Subscription not found for order: ${disputeWithRelations.orderId}`);
          }

          // Get order to get deposit address and currency
          const order = await this.orderRepository.findById(disputeWithRelations.orderId);
          if (!order) {
            throw new Error(`Order not found: ${disputeWithRelations.orderId}`);
          }

          // Process refund through escrow service
          const refundCalculation = await escrowService.refundEscrow(subscription.id);
          refundAmount = refundCalculation.refundAmount;
          refundProcessed = true;

          logger.info('Refund processed', {
            disputeId,
            subscriptionId: subscription.id,
            refundAmount,
            usedDays: refundCalculation.usedDays,
            unusedDays: refundCalculation.unusedDays
          });

          // Queue cryptocurrency refund transaction
          // Requirement 14.3: Return funds to original deposit address
          try {
            const refundQueueResult = await refundTransactionQueue.queueRefund(
              order.id,
              subscription.id,
              disputeWithRelations.buyerId,
              order.depositAddress, // Send refund to original deposit address
              refundAmount,
              order.currency,
              `Dispute ${disputeId} resolved - refund approved by admin`
            );

            refundTransactionQueued = refundQueueResult.queued;
            refundTransactionId = refundQueueResult.refundId;

            if (refundTransactionQueued) {
              logger.info('Refund transaction queued', {
                disputeId,
                refundId: refundTransactionId,
                orderId: order.id,
                toAddress: order.depositAddress,
                amount: refundAmount,
                currency: order.currency
              });
            } else {
              logger.warn('Refund transaction tracked but not queued (queue not configured)', {
                disputeId,
                refundId: refundTransactionId,
                orderId: order.id
              });
            }
          } catch (error) {
            logger.error('Error queueing refund transaction', {
              error,
              disputeId,
              orderId: order.id
            });
            // Don't fail dispute resolution if refund queueing fails
            // The refund can be processed manually
          }

          // Update subscription status to refunded
          await this.subscriptionRepository.updateStatus(
            subscription.id,
            SubscriptionStatus.REFUNDED
          );

          logger.info('Subscription status updated to refunded', {
            subscriptionId: subscription.id
          });

          // Update order status to refunded
          await this.orderRepository.updateStatus(
            disputeWithRelations.orderId,
            OrderStatus.REFUNDED
          );

          logger.info('Order status updated to refunded', {
            orderId: disputeWithRelations.orderId
          });

          // Queue bot operation to remove user from channel
          try {
            // Get buyer's Telegram user ID
            const buyer = disputeWithRelations.buyer;
            
            if (buyer && buyer.telegramUserId) {
              const messageId = await botQueueProducer.enqueueRemoveUser(
                buyer.telegramUserId,
                subscription.channelId,
                subscription.id,
                'refund'
              );

              if (messageId) {
                botOperationQueued = true;
                
                logger.info('Bot remove operation queued', {
                  disputeId,
                  subscriptionId: subscription.id,
                  messageId,
                  userId: buyer.telegramUserId,
                  channelId: subscription.channelId
                });
              } else {
                logger.warn('Failed to queue bot remove operation', {
                  disputeId,
                  subscriptionId: subscription.id
                });
              }
            } else {
              logger.warn('Buyer does not have Telegram user ID', {
                buyerId: disputeWithRelations.buyerId,
                disputeId
              });
            }
          } catch (error) {
            logger.error('Error queueing bot remove operation', {
              error,
              disputeId,
              subscriptionId: subscription.id
            });
            // Don't fail dispute resolution if bot queueing fails
          }

          // TODO: Send notification to buyer about refund
          // TODO: Send notification to merchant about refund

        } catch (error) {
          logger.error('Error processing refund', { error, disputeId });
          // Re-throw to fail the dispute resolution
          throw new Error(`Failed to process refund: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        logger.info('Refund denied by admin', { disputeId });
        // TODO: Send notification to buyer about denial
      }

      return {
        dispute: resolvedDispute,
        refundProcessed,
        refundAmount,
        refundTransactionQueued,
        refundTransactionId,
        botOperationQueued
      };

    } catch (error) {
      logger.error('Error resolving dispute', { error, disputeId, adminId });
      throw error;
    }
  }

  /**
   * Get dispute by ID
   * 
   * @param disputeId - Dispute ID
   * @returns Dispute or null
   */
  async getDispute(disputeId: string): Promise<Dispute | null> {
    try {
      return await this.disputeRepository.findById(disputeId);
    } catch (error) {
      logger.error('Error getting dispute', { error, disputeId });
      throw error;
    }
  }

  /**
   * Get dispute with relations (order, buyer, admin)
   * 
   * Requirements: 13.4
   * 
   * @param disputeId - Dispute ID
   * @returns Dispute with relations or null
   */
  async getDisputeWithRelations(disputeId: string): Promise<DisputeWithRelations | null> {
    try {
      return await this.disputeRepository.findByIdWithRelations(disputeId);
    } catch (error) {
      logger.error('Error getting dispute with relations', { error, disputeId });
      throw error;
    }
  }

  /**
   * Get disputes by buyer ID
   * 
   * @param buyerId - Buyer ID
   * @returns Array of disputes
   */
  async getDisputesByBuyer(buyerId: string): Promise<Dispute[]> {
    try {
      return await this.disputeRepository.findByBuyerId(buyerId);
    } catch (error) {
      logger.error('Error getting disputes by buyer', { error, buyerId });
      throw error;
    }
  }

  /**
   * Get disputes by order ID
   * 
   * @param orderId - Order ID
   * @returns Array of disputes
   */
  async getDisputesByOrder(orderId: string): Promise<Dispute[]> {
    try {
      return await this.disputeRepository.findByOrderId(orderId);
    } catch (error) {
      logger.error('Error getting disputes by order', { error, orderId });
      throw error;
    }
  }

  /**
   * Get open disputes (for admin review)
   * 
   * @returns Array of open disputes
   */
  async getOpenDisputes(): Promise<Dispute[]> {
    try {
      return await this.disputeRepository.findOpen();
    } catch (error) {
      logger.error('Error getting open disputes', { error });
      throw error;
    }
  }

  /**
   * Get disputes needing attention (open or in progress)
   * 
   * @returns Array of disputes needing attention
   */
  async getDisputesNeedingAttention(): Promise<Dispute[]> {
    try {
      return await this.disputeRepository.findNeedingAttention();
    } catch (error) {
      logger.error('Error getting disputes needing attention', { error });
      throw error;
    }
  }

  /**
   * Get disputes by status
   * 
   * @param status - Dispute status
   * @returns Array of disputes
   */
  async getDisputesByStatus(status: DisputeStatus): Promise<Dispute[]> {
    try {
      return await this.disputeRepository.findByStatus(status);
    } catch (error) {
      logger.error('Error getting disputes by status', { error, status });
      throw error;
    }
  }

  /**
   * Get disputes assigned to admin
   * 
   * @param adminId - Admin ID
   * @returns Array of disputes
   */
  async getDisputesByAdmin(adminId: string): Promise<Dispute[]> {
    try {
      return await this.disputeRepository.findByAdminId(adminId);
    } catch (error) {
      logger.error('Error getting disputes by admin', { error, adminId });
      throw error;
    }
  }

  /**
   * Count open disputes
   * 
   * @returns Number of open disputes
   */
  async countOpenDisputes(): Promise<number> {
    try {
      return await this.disputeRepository.countOpen();
    } catch (error) {
      logger.error('Error counting open disputes', { error });
      throw error;
    }
  }

  /**
   * Validate status transition
   * 
   * Valid transitions:
   * - OPEN -> IN_PROGRESS
   * - OPEN -> RESOLVED
   * - OPEN -> CLOSED
   * - IN_PROGRESS -> RESOLVED
   * - IN_PROGRESS -> CLOSED
   * 
   * @param currentStatus - Current dispute status
   * @param newStatus - New dispute status
   * @throws Error if transition is invalid
   */
  private validateStatusTransition(currentStatus: DisputeStatus, newStatus: DisputeStatus): void {
    // Can't transition from resolved or closed
    if (currentStatus === DisputeStatus.RESOLVED || currentStatus === DisputeStatus.CLOSED) {
      throw new Error(`Cannot transition from ${currentStatus} status`);
    }

    // Can't transition to the same status
    if (currentStatus === newStatus) {
      throw new Error(`Dispute is already in ${newStatus} status`);
    }

    // Valid transitions from OPEN
    if (currentStatus === DisputeStatus.OPEN) {
      if (![DisputeStatus.IN_PROGRESS, DisputeStatus.RESOLVED, DisputeStatus.CLOSED].includes(newStatus)) {
        throw new Error(`Invalid transition from ${currentStatus} to ${newStatus}`);
      }
    }

    // Valid transitions from IN_PROGRESS
    if (currentStatus === DisputeStatus.IN_PROGRESS) {
      if (![DisputeStatus.RESOLVED, DisputeStatus.CLOSED].includes(newStatus)) {
        throw new Error(`Invalid transition from ${currentStatus} to ${newStatus}`);
      }
    }
  }

  /**
   * Get dispute time window in days
   * 
   * @returns Number of days for dispute time window
   */
  static getDisputeTimeWindowDays(): number {
    return DisputeService.DISPUTE_TIME_WINDOW_DAYS;
  }
}

// Export singleton instance
export const disputeService = new DisputeService();
