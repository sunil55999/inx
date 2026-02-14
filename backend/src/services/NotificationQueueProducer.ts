/**
 * Notification Queue Producer
 * 
 * Responsible for queuing notification messages to SQS for async email delivery
 * 
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
 */

import { SendMessageCommand, SendMessageCommandInput } from '@aws-sdk/client-sqs';
import { sqsClient } from '../config/sqs';
import { logger } from '../utils/logger';
import { NotificationQueueMessage } from '../types/notificationQueue';
import { NotificationEvent } from './NotificationService';

/**
 * Notification Queue Producer
 * 
 * Queues notifications for async email delivery
 */
export class NotificationQueueProducer {
  private queueUrl: string;

  constructor(queueUrl?: string) {
    this.queueUrl = queueUrl || process.env.AWS_SQS_NOTIFICATIONS_QUEUE_URL || '';

    if (!this.queueUrl) {
      logger.warn('Notifications queue URL not configured - notifications will not be queued');
    }
  }

  /**
   * Queue a notification for email delivery
   * 
   * @param notificationId - Notification ID
   * @param userId - User ID
   * @param userEmail - User email address
   * @param event - Notification event type
   * @param title - Notification title
   * @param message - Notification message
   * @param metadata - Additional metadata
   * @returns True if queued successfully
   */
  async queueNotification(
    notificationId: string,
    userId: string,
    userEmail: string,
    event: NotificationEvent,
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    if (!this.queueUrl) {
      logger.warn('Cannot queue notification - queue URL not configured', {
        notificationId,
        userId,
        event,
      });
      return false;
    }

    try {
      const queueMessage: NotificationQueueMessage = {
        notificationId,
        userId,
        userEmail,
        event,
        title,
        message,
        metadata,
        attemptCount: 0,
        maxRetries: 3,
        createdAt: new Date().toISOString(),
      };

      const params: SendMessageCommandInput = {
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(queueMessage),
        MessageAttributes: {
          NotificationId: {
            DataType: 'String',
            StringValue: notificationId,
          },
          UserId: {
            DataType: 'String',
            StringValue: userId,
          },
          Event: {
            DataType: 'String',
            StringValue: event,
          },
        },
      };

      const command = new SendMessageCommand(params);
      const result = await sqsClient.send(command);

      logger.info('Notification queued for email delivery', {
        notificationId,
        userId,
        event,
        messageId: result.MessageId,
      });

      return true;
    } catch (error: any) {
      logger.error('Failed to queue notification', {
        error: error.message,
        stack: error.stack,
        notificationId,
        userId,
        event,
      });

      return false;
    }
  }
}

// Export singleton instance
export const notificationQueueProducer = new NotificationQueueProducer();
