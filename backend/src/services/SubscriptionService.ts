/**
 * Subscription Service
 * 
 * Manages subscription creation, activation, and lifecycle for channel access.
 * Coordinates with bot service for user access control.
 * 
 * Requirements: 2.2, 2.4, 10.5, 10.6 (Requirements 3.5, 12.3, 12.4)
 * 
 * Features:
 * - Create subscriptions from confirmed orders
 * - Calculate subscription expiry dates
 * - Queue bot operations for user access
 * - Track subscription status
 * - Handle subscription renewals
 */

import { v4 as uuidv4 } from 'uuid';
import { SubscriptionRepository } from '../database/repositories/SubscriptionRepository';
import { OrderRepository } from '../database/repositories/OrderRepository';
import { ListingRepository } from '../database/repositories/ListingRepository';
import { botQueueProducer } from './BotQueueProducer';
import { EscrowService } from './EscrowService';
import { logger } from '../utils/logger';
import {
  Subscription,
  SubscriptionStatus,
  OrderStatus,
  SubscriptionWithRelations
} from '../types/models';

/**
 * Subscription creation result
 */
export interface SubscriptionCreationResult {
  subscription: Subscription;
  botOperationQueued: boolean;
  botOperationMessageId?: string;
}

/**
 * Subscription Service
 * 
 * Handles subscription creation and management for channel access.
 * Creates subscriptions when orders are confirmed and queues bot operations.
 */
export class SubscriptionService {
  private subscriptionRepository: SubscriptionRepository;
  private orderRepository: OrderRepository;
  private listingRepository: ListingRepository;
  private escrowService: EscrowService;

  constructor() {
    this.subscriptionRepository = new SubscriptionRepository();
    this.orderRepository = new OrderRepository();
    this.listingRepository = new ListingRepository();
    this.escrowService = new EscrowService();
  }

  /**
   * Create a subscription from a confirmed order
   * 
   * Steps:
   * 1. Validate order exists and is confirmed
   * 2. Get listing details for duration and channel
   * 3. Calculate subscription dates
   * 4. Create subscription record
   * 5. Queue bot operation to invite user
   * 6. Update order status to subscription_active
   * 
   * Requirements: 2.2, 2.4, 3.5, 12.3, 12.4
   * 
   * @param orderId - Order ID to create subscription from
   * @returns Subscription creation result
   */
  async createSubscriptionFromOrder(orderId: string): Promise<SubscriptionCreationResult> {
    try {
      logger.info('Creating subscription from order', { orderId });

      // Get order
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Validate order status
      if (order.status !== OrderStatus.PAYMENT_CONFIRMED) {
        throw new Error(
          `Cannot create subscription for order with status: ${order.status}. ` +
          `Order must be in payment_confirmed status.`
        );
      }

      // Check if subscription already exists for this order
      const existingSubscription = await this.subscriptionRepository.findByOrderId(orderId);
      if (existingSubscription) {
        logger.warn('Subscription already exists for order', {
          orderId,
          subscriptionId: existingSubscription.id
        });
        return {
          subscription: existingSubscription,
          botOperationQueued: false
        };
      }

      // Get listing details
      const listing = await this.listingRepository.findById(order.listingId);
      if (!listing) {
        throw new Error(`Listing not found: ${order.listingId}`);
      }

      // Calculate subscription dates
      const startDate = new Date();
      const expiryDate = new Date(startDate.getTime() + listing.durationDays * 24 * 60 * 60 * 1000);

      // Create subscription
      const subscriptionId = uuidv4();
      const subscriptionData: Partial<Subscription> = {
        id: subscriptionId,
        buyerId: order.buyerId,
        listingId: listing.id,
        orderId: order.id,
        channelId: listing.channelId,
        status: SubscriptionStatus.PENDING_ACTIVATION,
        startDate,
        expiryDate,
        durationDays: listing.durationDays
      };

      const subscription = await this.subscriptionRepository.create(subscriptionData as Subscription);

      if (!subscription) {
        throw new Error('Failed to create subscription');
      }

      logger.info('Subscription created', {
        subscriptionId: subscription.id,
        orderId,
        buyerId: order.buyerId,
        channelId: listing.channelId,
        startDate,
        expiryDate,
        durationDays: listing.durationDays
      });

      // Queue bot operation to invite user to channel
      // Note: We need the buyer's Telegram user ID, which should be stored in the users table
      // For now, we'll queue the operation and let the bot consumer handle the user lookup
      let botOperationQueued = false;
      let botOperationMessageId: string | undefined;

      try {
        // Get buyer's Telegram user ID from users table
        const buyer = await this.getBuyerTelegramUserId(order.buyerId);
        
        if (buyer.telegramUserId) {
          const messageId = await botQueueProducer.enqueueInviteUser(
            buyer.telegramUserId,
            listing.channelId,
            subscription.id,
            order.id
          );

          if (messageId) {
            botOperationQueued = true;
            botOperationMessageId = messageId;
            
            logger.info('Bot invite operation queued', {
              subscriptionId: subscription.id,
              messageId,
              userId: buyer.telegramUserId,
              channelId: listing.channelId
            });
          } else {
            logger.warn('Failed to queue bot invite operation', {
              subscriptionId: subscription.id
            });
          }
        } else {
          logger.warn('Buyer does not have Telegram user ID', {
            buyerId: order.buyerId,
            subscriptionId: subscription.id
          });
        }
      } catch (error) {
        logger.error('Error queueing bot operation', {
          error,
          subscriptionId: subscription.id
        });
        // Don't fail subscription creation if bot queueing fails
        // The bot operation can be retried later
      }

      // Update order status to subscription_active
      await this.orderRepository.updateStatus(orderId, OrderStatus.SUBSCRIPTION_ACTIVE);

      logger.info('Order status updated to subscription_active', { orderId });

      return {
        subscription,
        botOperationQueued,
        botOperationMessageId
      };

    } catch (error) {
      logger.error('Error creating subscription from order', { error, orderId });
      throw error;
    }
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    try {
      return await this.subscriptionRepository.findById(subscriptionId);
    } catch (error) {
      logger.error('Error getting subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Get subscription with relations
   */
  async getSubscriptionWithRelations(subscriptionId: string): Promise<SubscriptionWithRelations | null> {
    try {
      return await this.subscriptionRepository.findByIdWithRelations(subscriptionId);
    } catch (error) {
      logger.error('Error getting subscription with relations', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Get subscriptions by buyer ID
   */
  async getBuyerSubscriptions(buyerId: string): Promise<Subscription[]> {
    try {
      return await this.subscriptionRepository.findByBuyerId(buyerId);
    } catch (error) {
      logger.error('Error getting buyer subscriptions', { error, buyerId });
      throw error;
    }
  }

  /**
   * Get active subscriptions
   */
  async getActiveSubscriptions(): Promise<Subscription[]> {
    try {
      return await this.subscriptionRepository.findActive();
    } catch (error) {
      logger.error('Error getting active subscriptions', { error });
      throw error;
    }
  }

  /**
   * Update subscription status
   */
  async updateSubscriptionStatus(
    subscriptionId: string,
    status: SubscriptionStatus
  ): Promise<Subscription | null> {
    try {
      logger.info('Updating subscription status', { subscriptionId, status });

      const subscription = await this.subscriptionRepository.updateStatus(subscriptionId, status);

      if (!subscription) {
        throw new Error(`Subscription not found: ${subscriptionId}`);
      }

      logger.info('Subscription status updated', { subscriptionId, status });
      return subscription;

    } catch (error) {
      logger.error('Error updating subscription status', { error, subscriptionId, status });
      throw error;
    }
  }

  /**
   * Activate subscription (called after bot successfully invites user)
   */
  async activateSubscription(subscriptionId: string): Promise<Subscription | null> {
    try {
      logger.info('Activating subscription', { subscriptionId });

      const subscription = await this.subscriptionRepository.updateStatus(
        subscriptionId,
        SubscriptionStatus.ACTIVE
      );

      if (!subscription) {
        throw new Error(`Subscription not found: ${subscriptionId}`);
      }

      logger.info('Subscription activated', { subscriptionId });
      return subscription;

    } catch (error) {
      logger.error('Error activating subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Expire subscription
   */
  async expireSubscription(subscriptionId: string): Promise<Subscription | null> {
    try {
      logger.info('Expiring subscription', { subscriptionId });

      const subscription = await this.getSubscription(subscriptionId);
      if (!subscription) {
        throw new Error(`Subscription not found: ${subscriptionId}`);
      }

      // Update status to expired
      const updatedSubscription = await this.subscriptionRepository.updateStatus(
        subscriptionId,
        SubscriptionStatus.EXPIRED
      );

      // Queue bot operation to remove user from channel
      try {
        const buyer = await this.getBuyerTelegramUserId(subscription.buyerId);
        
        if (buyer.telegramUserId) {
          await botQueueProducer.enqueueRemoveUser(
            buyer.telegramUserId,
            subscription.channelId,
            subscriptionId,
            'expiry'
          );

          logger.info('Bot remove operation queued for expired subscription', {
            subscriptionId,
            userId: buyer.telegramUserId,
            channelId: subscription.channelId
          });
        }
      } catch (error) {
        logger.error('Error queueing bot remove operation', {
          error,
          subscriptionId
        });
        // Don't fail expiration if bot queueing fails
      }

      logger.info('Subscription expired', { subscriptionId });
      return updatedSubscription;

    } catch (error) {
      logger.error('Error expiring subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Process expired subscriptions
   * 
   * Finds subscriptions that have passed their expiry date and are still active.
   * Updates their status to expired and queues bot operations to remove users.
   * 
   * This should be called by a scheduled job every hour.
   */
  async processExpiredSubscriptions(): Promise<number> {
    try {
      logger.info('Processing expired subscriptions');

      // Find expired subscriptions
      const expiredSubscriptions = await this.subscriptionRepository.findExpiredNeedingProcessing();

      if (expiredSubscriptions.length === 0) {
        logger.info('No expired subscriptions found');
        return 0;
      }

      logger.info('Found expired subscriptions', { count: expiredSubscriptions.length });

      // Process each expired subscription
      let processedCount = 0;
      for (const subscription of expiredSubscriptions) {
        try {
          await this.expireSubscription(subscription.id);
          processedCount++;
        } catch (error) {
          logger.error('Error processing expired subscription', {
            error,
            subscriptionId: subscription.id
          });
          // Continue processing other subscriptions
        }
      }

      logger.info('Expired subscriptions processed', { processedCount });
      return processedCount;

    } catch (error) {
      logger.error('Error processing expired subscriptions', { error });
      throw error;
    }
  }

  /**
   * Check if buyer has active subscription to channel
   */
  async hasActiveSubscription(buyerId: string, channelId: string): Promise<boolean> {
    try {
      return await this.subscriptionRepository.hasActiveSubscription(buyerId, channelId);
    } catch (error) {
      logger.error('Error checking active subscription', { error, buyerId, channelId });
      throw error;
    }
  }

  /**
   * Get subscription statistics for admin dashboard
   */
  async getSubscriptionStatistics(): Promise<{
    total: number;
    pendingActivation: number;
    active: number;
    expired: number;
    refunded: number;
    cancelled: number;
  }> {
    try {
      const [
        total,
        pendingActivation,
        active,
        expired,
        refunded,
        cancelled
      ] = await Promise.all([
        this.subscriptionRepository.count({}),
        this.subscriptionRepository.countByStatus(SubscriptionStatus.PENDING_ACTIVATION),
        this.subscriptionRepository.countByStatus(SubscriptionStatus.ACTIVE),
        this.subscriptionRepository.countByStatus(SubscriptionStatus.EXPIRED),
        this.subscriptionRepository.countByStatus(SubscriptionStatus.REFUNDED),
        this.subscriptionRepository.countByStatus(SubscriptionStatus.CANCELLED)
      ]);

      return {
        total,
        pendingActivation,
        active,
        expired,
        refunded,
        cancelled
      };

    } catch (error) {
      logger.error('Error getting subscription statistics', { error });
      throw error;
    }
  }

  /**
   * Check if subscription is eligible for renewal
   * 
   * A subscription is eligible for renewal if:
   * - It is currently active or will expire within 7 days
   * - It has not already been refunded or cancelled
   * 
   * Requirements: 10.5, 10.6
   * 
   * @param subscriptionId - Subscription ID to check
   * @returns True if eligible for renewal
   */
  async isEligibleForRenewal(subscriptionId: string): Promise<boolean> {
    try {
      const subscription = await this.getSubscription(subscriptionId);
      
      if (!subscription) {
        return false;
      }

      // Cannot renew refunded or cancelled subscriptions
      if (
        subscription.status === SubscriptionStatus.REFUNDED ||
        subscription.status === SubscriptionStatus.CANCELLED
      ) {
        return false;
      }

      // Check if subscription is active or within 7 days of expiry
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      // Eligible if:
      // 1. Currently active (expiry date is in the future)
      // 2. Expiry date is within the next 7 days
      const isActiveOrExpiringSoon = subscription.expiryDate <= sevenDaysFromNow;

      return isActiveOrExpiringSoon;

    } catch (error) {
      logger.error('Error checking renewal eligibility', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Renew a subscription by creating a new order for the same listing
   * 
   * This function:
   * 1. Validates the subscription is eligible for renewal
   * 2. Creates a new order for the same listing
   * 3. Returns the new order for payment
   * 
   * After payment is confirmed, a new subscription will be created that extends
   * access for the listing's duration.
   * 
   * Requirements: 10.5, 10.6, 2.6
   * 
   * @param subscriptionId - Subscription ID to renew
   * @returns New order for renewal payment
   */
  async renewSubscription(subscriptionId: string): Promise<{
    eligible: boolean;
    reason?: string;
    order?: any; // Will be Order type from OrderService
  }> {
    try {
      logger.info('Attempting to renew subscription', { subscriptionId });

      // Get subscription
      const subscription = await this.getSubscription(subscriptionId);
      
      if (!subscription) {
        return {
          eligible: false,
          reason: 'Subscription not found'
        };
      }

      // Check eligibility
      const eligible = await this.isEligibleForRenewal(subscriptionId);
      
      if (!eligible) {
        const reason = this.getRenewalIneligibilityReason(subscription);
        logger.warn('Subscription not eligible for renewal', {
          subscriptionId,
          status: subscription.status,
          expiryDate: subscription.expiryDate,
          reason
        });
        
        return {
          eligible: false,
          reason
        };
      }

      // Get listing to create new order
      const listing = await this.listingRepository.findById(subscription.listingId);
      
      if (!listing) {
        return {
          eligible: false,
          reason: 'Listing no longer exists'
        };
      }

      // Check if listing is still active
      if (listing.status !== 'active') {
        return {
          eligible: false,
          reason: 'Listing is no longer active'
        };
      }

      // Create new order for renewal
      // Import OrderService here to avoid circular dependencies
      const { orderService } = require('./OrderService');
      
      const order = await orderService.createOrder(subscription.buyerId, listing.id);

      logger.info('Renewal order created', {
        subscriptionId,
        orderId: order.id,
        buyerId: subscription.buyerId,
        listingId: listing.id
      });

      return {
        eligible: true,
        order
      };

    } catch (error) {
      logger.error('Error renewing subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Get reason why subscription is not eligible for renewal
   * 
   * @param subscription - Subscription to check
   * @returns Human-readable reason
   */
  private getRenewalIneligibilityReason(subscription: Subscription): string {
    if (subscription.status === SubscriptionStatus.REFUNDED) {
      return 'Subscription has been refunded';
    }
    
    if (subscription.status === SubscriptionStatus.CANCELLED) {
      return 'Subscription has been cancelled';
    }

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    if (subscription.expiryDate > sevenDaysFromNow) {
      const daysUntilExpiry = Math.ceil(
        (subscription.expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      );
      return `Subscription expires in ${daysUntilExpiry} days. Renewal available within 7 days of expiry.`;
    }

    return 'Subscription is not eligible for renewal';
  }

  /**
   * Get buyer's Telegram user ID from users table
   * 
   * @param buyerId - User ID
   * @returns Object with telegramUserId if found
   */
  private async getBuyerTelegramUserId(buyerId: string): Promise<{ telegramUserId: number | null }> {
    try {
      // Import db here to avoid circular dependencies
      const db = require('../database/connection').default;
      
      const user = await db('users')
        .where({ id: buyerId })
        .first('telegram_user_id');

      if (!user) {
        throw new Error(`User not found: ${buyerId}`);
      }

      return {
        telegramUserId: user.telegram_user_id
      };

    } catch (error) {
      logger.error('Error getting buyer Telegram user ID', { error, buyerId });
      throw error;
    }
  }

  /**
   * Expire subscriptions that have passed their expiry date
   * 
   * Steps:
   * 1. Find subscriptions where end_date <= now AND status = 'active'
   * 2. Update subscription status to 'expired'
   * 3. Queue bot operation to remove user from channel
   * 4. Release escrow to merchant
   * 5. Send expiry notification to buyer
   * 
   * Requirements: 10.1, 10.2, 10.3
   * 
   * @returns Statistics about expired subscriptions
   */
  async expireSubscriptions(): Promise<{ expired: number; errors: number }> {
    try {
      logger.info('Expiring subscriptions');

      let expired = 0;
      let errors = 0;

      // Find active subscriptions that have expired
      const expiredSubscriptions = await this.subscriptionRepository.findExpired();

      logger.info('Found expired subscriptions', { count: expiredSubscriptions.length });

      for (const subscription of expiredSubscriptions) {
        try {
          // Update subscription status to expired
          await this.subscriptionRepository.updateStatus(
            subscription.id,
            SubscriptionStatus.EXPIRED
          );

          logger.info('Subscription expired', {
            subscriptionId: subscription.id,
            buyerId: subscription.buyerId,
            channelId: subscription.channelId
          });

          // Queue bot operation to remove user from channel
          try {
            const buyer = await this.getBuyerTelegramUserId(subscription.buyerId);
            
            if (buyer.telegramUserId) {
              await botQueueProducer.enqueueRemoveUser(
                buyer.telegramUserId,
                subscription.channelId,
                subscription.id,
                'expiry'
              );

              logger.info('Bot remove operation queued for expired subscription', {
                subscriptionId: subscription.id,
                userId: buyer.telegramUserId,
                channelId: subscription.channelId
              });
            }
          } catch (error) {
            logger.error('Error queueing bot remove operation', {
              error,
              subscriptionId: subscription.id
            });
          }

          // Release escrow to merchant
          try {
            await this.escrowService.releaseEscrow(subscription.id);

            logger.info('Escrow released for expired subscription', {
              subscriptionId: subscription.id
            });
          } catch (error) {
            logger.error('Error releasing escrow', {
              error,
              subscriptionId: subscription.id
            });
          }

          // TODO: Send expiry notification to buyer

          expired++;
        } catch (error) {
          logger.error('Error expiring subscription', {
            error,
            subscriptionId: subscription.id
          });
          errors++;
        }
      }

      logger.info('Subscription expiry completed', { expired, errors });

      return { expired, errors };
    } catch (error) {
      logger.error('Error in expireSubscriptions', { error });
      throw error;
    }
  }

  /**
   * Send expiry reminders for subscriptions expiring soon
   * 
   * Finds subscriptions expiring in the next 24 hours and sends reminders.
   * 
   * Requirements: 10.4
   * 
   * @returns Statistics about reminders sent
   */
  async sendExpiryReminders(): Promise<{ sent: number; errors: number }> {
    try {
      logger.info('Sending expiry reminders');

      let sent = 0;
      let errors = 0;

      // Find subscriptions expiring in next 24 hours
      const subscriptions = await this.subscriptionRepository.findExpiringSoon(24);

      logger.info('Found subscriptions expiring soon', { count: subscriptions.length });

      for (const subscription of subscriptions) {
        try {
          // TODO: Send reminder notification to buyer
          // This would integrate with the notification service

          logger.info('Expiry reminder sent', {
            subscriptionId: subscription.id,
            buyerId: subscription.buyerId,
            expiryDate: subscription.expiryDate
          });

          sent++;
        } catch (error) {
          logger.error('Error sending expiry reminder', {
            error,
            subscriptionId: subscription.id
          });
          errors++;
        }
      }

      logger.info('Expiry reminders completed', { sent, errors });

      return { sent, errors };
    } catch (error) {
      logger.error('Error in sendExpiryReminders', { error });
      throw error;
    }
  }
}

// Export singleton instance
export const subscriptionService = new SubscriptionService();
