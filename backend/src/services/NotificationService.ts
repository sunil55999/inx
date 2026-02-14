/**
 * Notification Service
 * 
 * Manages user notifications for various system events.
 * Queues notifications to SQS for async processing and stores in database.
 * 
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7
 * 
 * Features:
 * - Send notifications for system events
 * - Queue notifications to SQS
 * - Store notifications in database
 * - Check notification preferences
 * - Mark notifications as read
 * - Get notification history
 */

import { v4 as uuidv4 } from 'uuid';
import { NotificationRepository } from '../database/repositories/NotificationRepository';
import { UserRepository } from '../database/repositories/UserRepository';
import { logger } from '../utils/logger';
import {
  Notification,
  NotificationType
} from '../types/models';
import { NotificationQueueProducer } from './NotificationQueueProducer';

/**
 * Notification event types
 */
export enum NotificationEvent {
  ORDER_PAYMENT_DETECTED = 'order_payment_detected',
  ORDER_PAYMENT_CONFIRMED = 'order_payment_confirmed',
  SUBSCRIPTION_ACTIVATED = 'subscription_activated',
  SUBSCRIPTION_EXPIRING_SOON = 'subscription_expiring_soon',
  SUBSCRIPTION_EXPIRED = 'subscription_expired',
  SUBSCRIPTION_RENEWED = 'subscription_renewed',
  DISPUTE_CREATED = 'dispute_created',
  DISPUTE_RESOLVED = 'dispute_resolved',
  REFUND_PROCESSED = 'refund_processed',
  PAYOUT_COMPLETED = 'payout_completed',
  PAYOUT_FAILED = 'payout_failed',
  LISTING_DEACTIVATED = 'listing_deactivated',
  MERCHANT_SUSPENDED = 'merchant_suspended',
  MERCHANT_VERIFIED = 'merchant_verified',
}

/**
 * Notification data for different event types
 */
export interface NotificationData {
  event: NotificationEvent;
  userId: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

/**
 * Notification Service
 * 
 * Handles notification creation, delivery, and management.
 */
export class NotificationService {
  private notificationRepository: NotificationRepository;
  private userRepository: UserRepository;
  private queueProducer: NotificationQueueProducer;

  constructor() {
    this.notificationRepository = new NotificationRepository();
    this.userRepository = new UserRepository();
    this.queueProducer = new NotificationQueueProducer();
  }

  /**
   * Send a notification
   * 
   * Steps:
   * 1. Check user notification preferences
   * 2. Create notification record in database
   * 3. Queue notification for delivery (email, push, etc.)
   * 
   * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
   * 
   * @param data - Notification data
   * @returns Created notification
   */
  async sendNotification(data: NotificationData): Promise<Notification> {
    try {
      logger.info('Sending notification', {
        event: data.event,
        userId: data.userId
      });

      // TODO: Check user notification preferences
      // For now, send all notifications

      // Determine notification type based on event
      const type = this.getNotificationType(data.event);

      // Create notification record
      const notificationId = uuidv4();
      const notificationData: Partial<Notification> = {
        id: notificationId,
        userId: data.userId,
        type,
        title: data.title,
        message: data.message,
        isRead: false
      };

      const notification = await this.notificationRepository.create(
        notificationData as Notification
      );

      if (!notification) {
        throw new Error('Failed to create notification');
      }

      logger.info('Notification created', {
        notificationId: notification.id,
        userId: data.userId,
        type,
        event: data.event
      });

      // Get user email for email delivery
      try {
        const user = await this.userRepository.findById(data.userId);
        
        if (user && user.email) {
          // Queue notification for email delivery
          await this.queueProducer.queueNotification(
            notification.id,
            data.userId,
            user.email,
            data.event,
            data.title,
            data.message,
            data.metadata
          );

          logger.info('Notification queued for email delivery', {
            notificationId: notification.id,
            userId: data.userId,
            email: user.email
          });
        } else {
          logger.warn('User email not found - skipping email notification', {
            notificationId: notification.id,
            userId: data.userId
          });
        }
      } catch (error) {
        logger.error('Error queuing notification for email', {
          error,
          notificationId: notification.id,
          userId: data.userId
        });
        // Don't fail the notification creation if email queueing fails
      }

      return notification;

    } catch (error) {
      logger.error('Error sending notification', { error, data });
      throw error;
    }
  }

  /**
   * Send order payment detected notification
   * 
   * Requirements: 15.1
   * 
   * @param userId - User ID
   * @param orderId - Order ID
   * @param amount - Payment amount
   * @param currency - Payment currency
   */
  async sendOrderPaymentDetected(
    userId: string,
    orderId: string,
    amount: number,
    currency: string
  ): Promise<void> {
    try {
      await this.sendNotification({
        event: NotificationEvent.ORDER_PAYMENT_DETECTED,
        userId,
        title: 'Payment Detected',
        message: `We've detected your payment of ${amount} ${currency}. Waiting for blockchain confirmations.`,
        metadata: { orderId, amount, currency }
      });
    } catch (error) {
      logger.error('Error sending order payment detected notification', {
        error,
        userId,
        orderId
      });
    }
  }

  /**
   * Send order payment confirmed notification
   * 
   * Requirements: 15.2
   * 
   * @param userId - User ID
   * @param orderId - Order ID
   * @param channelName - Channel name
   */
  async sendOrderPaymentConfirmed(
    userId: string,
    orderId: string,
    channelName: string
  ): Promise<void> {
    try {
      await this.sendNotification({
        event: NotificationEvent.ORDER_PAYMENT_CONFIRMED,
        userId,
        title: 'Payment Confirmed',
        message: `Your payment has been confirmed! You'll be added to ${channelName} shortly.`,
        metadata: { orderId, channelName }
      });
    } catch (error) {
      logger.error('Error sending order payment confirmed notification', {
        error,
        userId,
        orderId
      });
    }
  }

  /**
   * Send subscription activated notification
   * 
   * Requirements: 15.2
   * 
   * @param userId - User ID
   * @param subscriptionId - Subscription ID
   * @param channelName - Channel name
   * @param expiryDate - Subscription expiry date
   */
  async sendSubscriptionActivated(
    userId: string,
    subscriptionId: string,
    channelName: string,
    expiryDate: Date
  ): Promise<void> {
    try {
      await this.sendNotification({
        event: NotificationEvent.SUBSCRIPTION_ACTIVATED,
        userId,
        title: 'Subscription Activated',
        message: `Your subscription to ${channelName} is now active! Expires on ${expiryDate.toLocaleDateString()}.`,
        metadata: { subscriptionId, channelName, expiryDate: expiryDate.toISOString() }
      });
    } catch (error) {
      logger.error('Error sending subscription activated notification', {
        error,
        userId,
        subscriptionId
      });
    }
  }

  /**
   * Send subscription expiring soon notification
   * 
   * Requirements: 15.4
   * 
   * @param userId - User ID
   * @param subscriptionId - Subscription ID
   * @param channelName - Channel name
   * @param expiryDate - Subscription expiry date
   */
  async sendSubscriptionExpiringSoon(
    userId: string,
    subscriptionId: string,
    channelName: string,
    expiryDate: Date
  ): Promise<void> {
    try {
      await this.sendNotification({
        event: NotificationEvent.SUBSCRIPTION_EXPIRING_SOON,
        userId,
        title: 'Subscription Expiring Soon',
        message: `Your subscription to ${channelName} expires on ${expiryDate.toLocaleDateString()}. Renew now to continue access.`,
        metadata: { subscriptionId, channelName, expiryDate: expiryDate.toISOString() }
      });
    } catch (error) {
      logger.error('Error sending subscription expiring soon notification', {
        error,
        userId,
        subscriptionId
      });
    }
  }

  /**
   * Send subscription expired notification
   * 
   * Requirements: 15.3
   * 
   * @param userId - User ID
   * @param subscriptionId - Subscription ID
   * @param channelName - Channel name
   */
  async sendSubscriptionExpired(
    userId: string,
    subscriptionId: string,
    channelName: string
  ): Promise<void> {
    try {
      await this.sendNotification({
        event: NotificationEvent.SUBSCRIPTION_EXPIRED,
        userId,
        title: 'Subscription Expired',
        message: `Your subscription to ${channelName} has expired. You've been removed from the channel.`,
        metadata: { subscriptionId, channelName }
      });
    } catch (error) {
      logger.error('Error sending subscription expired notification', {
        error,
        userId,
        subscriptionId
      });
    }
  }

  /**
   * Send dispute created notification (to merchant and admins)
   * 
   * Requirements: 15.5
   * 
   * @param userId - User ID (merchant or admin)
   * @param disputeId - Dispute ID
   * @param orderId - Order ID
   */
  async sendDisputeCreated(
    userId: string,
    disputeId: string,
    orderId: string
  ): Promise<void> {
    try {
      await this.sendNotification({
        event: NotificationEvent.DISPUTE_CREATED,
        userId,
        title: 'New Dispute',
        message: `A dispute has been created for order ${orderId}.`,
        metadata: { disputeId, orderId }
      });
    } catch (error) {
      logger.error('Error sending dispute created notification', {
        error,
        userId,
        disputeId
      });
    }
  }

  /**
   * Send dispute resolved notification
   * 
   * Requirements: 15.5
   * 
   * @param userId - User ID
   * @param disputeId - Dispute ID
   * @param refundApproved - Whether refund was approved
   */
  async sendDisputeResolved(
    userId: string,
    disputeId: string,
    refundApproved: boolean
  ): Promise<void> {
    try {
      const message = refundApproved
        ? 'Your dispute has been resolved in your favor. A refund has been processed.'
        : 'Your dispute has been resolved. The refund request was denied.';

      await this.sendNotification({
        event: NotificationEvent.DISPUTE_RESOLVED,
        userId,
        title: 'Dispute Resolved',
        message,
        metadata: { disputeId, refundApproved }
      });
    } catch (error) {
      logger.error('Error sending dispute resolved notification', {
        error,
        userId,
        disputeId
      });
    }
  }

  /**
   * Send payout completed notification
   * 
   * Requirements: 15.5
   * 
   * @param userId - User ID (merchant)
   * @param payoutId - Payout ID
   * @param amount - Payout amount
   * @param currency - Payout currency
   * @param transactionHash - Blockchain transaction hash
   */
  async sendPayoutCompleted(
    userId: string,
    payoutId: string,
    amount: number,
    currency: string,
    transactionHash: string
  ): Promise<void> {
    try {
      await this.sendNotification({
        event: NotificationEvent.PAYOUT_COMPLETED,
        userId,
        title: 'Payout Completed',
        message: `Your payout of ${amount} ${currency} has been processed successfully.`,
        metadata: { payoutId, amount, currency, transactionHash }
      });
    } catch (error) {
      logger.error('Error sending payout completed notification', {
        error,
        userId,
        payoutId
      });
    }
  }

  /**
   * Get notification type from event
   * 
   * @param event - Notification event
   * @returns Notification type
   */
  private getNotificationType(event: NotificationEvent): NotificationType {
    switch (event) {
      case NotificationEvent.ORDER_PAYMENT_DETECTED:
      case NotificationEvent.ORDER_PAYMENT_CONFIRMED:
        return NotificationType.PAYMENT_RECEIVED;
      
      case NotificationEvent.SUBSCRIPTION_ACTIVATED:
        return NotificationType.SUBSCRIPTION_ACTIVATED;
      
      case NotificationEvent.SUBSCRIPTION_EXPIRING_SOON:
        return NotificationType.SUBSCRIPTION_EXPIRING;
      
      case NotificationEvent.SUBSCRIPTION_EXPIRED:
        return NotificationType.SUBSCRIPTION_EXPIRED;
      
      case NotificationEvent.SUBSCRIPTION_RENEWED:
        return NotificationType.SUBSCRIPTION_ACTIVATED;
      
      case NotificationEvent.DISPUTE_CREATED:
        return NotificationType.DISPUTE_CREATED;
      
      case NotificationEvent.DISPUTE_RESOLVED:
        return NotificationType.DISPUTE_RESOLVED;
      
      case NotificationEvent.REFUND_PROCESSED:
        return NotificationType.DISPUTE_RESOLVED;
      
      case NotificationEvent.PAYOUT_COMPLETED:
        return NotificationType.PAYOUT_COMPLETED;
      
      case NotificationEvent.PAYOUT_FAILED:
        return NotificationType.PAYOUT_FAILED;
      
      case NotificationEvent.LISTING_DEACTIVATED:
        return NotificationType.LISTING_INACTIVE;
      
      case NotificationEvent.MERCHANT_SUSPENDED:
      case NotificationEvent.MERCHANT_VERIFIED:
        return NotificationType.LISTING_INACTIVE; // Using closest available type
      
      default:
        return NotificationType.LISTING_INACTIVE;
    }
  }

  /**
   * Get notifications for user
   * 
   * Requirements: 15.6
   * 
   * @param userId - User ID
   * @param limit - Maximum number of notifications
   * @param offset - Number of notifications to skip
   * @returns Array of notifications
   */
  async getNotifications(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Notification[]> {
    try {
      const result = await this.notificationRepository.getRecentForUser(userId, limit, offset);
      return result.data;
    } catch (error) {
      logger.error('Error getting notifications', { error, userId });
      throw error;
    }
  }

  /**
   * Get unread notification count
   * 
   * Requirements: 15.6
   * 
   * @param userId - User ID
   * @returns Number of unread notifications
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      return await this.notificationRepository.countUnreadByUserId(userId);
    } catch (error) {
      logger.error('Error getting unread count', { error, userId });
      throw error;
    }
  }

  /**
   * Mark notification as read
   * 
   * Requirements: 15.6
   * 
   * @param notificationId - Notification ID
   * @param userId - User ID (for authorization)
   * @returns Updated notification
   */
  async markAsRead(notificationId: string, userId: string): Promise<Notification> {
    try {
      const notification = await this.notificationRepository.findById(notificationId);
      
      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.userId !== userId) {
        throw new Error('Unauthorized');
      }

      const updatedNotification = await this.notificationRepository.markAsRead(notificationId);

      if (!updatedNotification) {
        throw new Error('Failed to mark notification as read');
      }

      return updatedNotification;

    } catch (error) {
      logger.error('Error marking notification as read', { error, notificationId, userId });
      throw error;
    }
  }

  /**
   * Mark all notifications as read for user
   * 
   * Requirements: 15.6
   * 
   * @param userId - User ID
   * @returns Number of notifications marked as read
   */
  async markAllAsRead(userId: string): Promise<number> {
    try {
      return await this.notificationRepository.markAllAsReadForUser(userId);
    } catch (error) {
      logger.error('Error marking all notifications as read', { error, userId });
      throw error;
    }
  }

  /**
   * Delete notification
   * 
   * @param notificationId - Notification ID
   * @param userId - User ID (for authorization)
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    try {
      const notification = await this.notificationRepository.findById(notificationId);
      
      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.userId !== userId) {
        throw new Error('Unauthorized');
      }

      await this.notificationRepository.delete(notificationId);

      logger.info('Notification deleted', { notificationId, userId });

    } catch (error) {
      logger.error('Error deleting notification', { error, notificationId, userId });
      throw error;
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
