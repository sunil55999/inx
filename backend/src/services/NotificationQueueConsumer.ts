/**
 * Notification Queue Consumer
 * 
 * Responsible for consuming notification messages from SQS and sending emails
 * 
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
 */

import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  SendMessageCommand,
  ReceiveMessageCommandInput,
  Message,
} from '@aws-sdk/client-sqs';
import { SendEmailCommand, SendEmailCommandInput } from '@aws-sdk/client-ses';
import { sqsClient } from '../config/sqs';
import { sesClient, EMAIL_FROM } from '../config/ses';
import { logger } from '../utils/logger';
import { NotificationQueueMessage, NotificationProcessingResult } from '../types/notificationQueue';
import { EmailTemplateService } from './EmailTemplateService';

/**
 * Notification Queue Consumer
 * 
 * Consumes notification messages and sends emails via AWS SES
 */
export class NotificationQueueConsumer {
  private queueUrl: string;
  private dlqUrl: string;
  private emailTemplateService: EmailTemplateService;
  private isRunning: boolean = false;
  private pollInterval: number = 1000; // 1 second
  private maxMessages: number = 10; // Process up to 10 messages at a time
  private visibilityTimeout: number = 30; // 30 seconds
  private waitTimeSeconds: number = 20; // Long polling

  constructor(
    emailTemplateService: EmailTemplateService,
    queueUrl?: string,
    dlqUrl?: string
  ) {
    this.emailTemplateService = emailTemplateService;
    this.queueUrl = queueUrl || process.env.AWS_SQS_NOTIFICATIONS_QUEUE_URL || '';
    this.dlqUrl = dlqUrl || process.env.AWS_SQS_NOTIFICATIONS_DLQ_URL || '';

    if (!this.queueUrl) {
      logger.warn('Notifications queue URL not configured - consumer will not start');
    }
  }

  /**
   * Start consuming messages from the queue
   */
  async start(): Promise<void> {
    if (!this.queueUrl) {
      logger.error('Cannot start consumer - queue URL not configured');
      return;
    }

    if (this.isRunning) {
      logger.warn('Consumer is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Notification queue consumer started', {
      queueUrl: this.queueUrl,
      dlqUrl: this.dlqUrl,
    });

    // Start polling loop
    this.pollMessages();
  }

  /**
   * Stop consuming messages from the queue
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Consumer is not running');
      return;
    }

    this.isRunning = false;
    logger.info('Notification queue consumer stopped');
  }

  /**
   * Poll messages from the queue
   */
  private async pollMessages(): Promise<void> {
    while (this.isRunning) {
      try {
        const params: ReceiveMessageCommandInput = {
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: this.maxMessages,
          VisibilityTimeout: this.visibilityTimeout,
          WaitTimeSeconds: this.waitTimeSeconds,
          MessageAttributeNames: ['All'],
        };

        const command = new ReceiveMessageCommand(params);
        const result = await sqsClient.send(command);

        if (result.Messages && result.Messages.length > 0) {
          logger.info('Received notification messages from queue', {
            count: result.Messages.length,
          });

          // Process messages in parallel
          await Promise.all(
            result.Messages.map(message => this.processMessage(message))
          );
        }
      } catch (error: any) {
        logger.error('Error polling messages from queue', {
          error: error.message,
          stack: error.stack,
        });

        // Wait before retrying
        await this.sleep(this.pollInterval);
      }
    }
  }

  /**
   * Process a single message from the queue
   * 
   * @param message - SQS message
   */
  private async processMessage(message: Message): Promise<void> {
    if (!message.Body || !message.ReceiptHandle) {
      logger.warn('Received invalid message', { message });
      return;
    }

    try {
      // Parse notification from message body
      const notification: NotificationQueueMessage = JSON.parse(message.Body);

      logger.info('Processing notification', {
        notificationId: notification.notificationId,
        userId: notification.userId,
        event: notification.event,
        attemptCount: notification.attemptCount,
        messageId: message.MessageId,
      });

      // Process the notification
      const result = await this.processNotification(notification);

      if (result.success) {
        // Delete message from queue on success
        await this.deleteMessage(message.ReceiptHandle);
        
        logger.info('Notification email sent successfully', {
          notificationId: notification.notificationId,
          userId: notification.userId,
          event: notification.event,
          messageId: message.MessageId,
        });
      } else if (result.shouldMoveToDeadLetter) {
        // Move to dead letter queue
        await this.moveToDeadLetterQueue(notification, message.ReceiptHandle, result.error);
        
        logger.error('Notification moved to dead letter queue', {
          notificationId: notification.notificationId,
          error: result.error,
          messageId: message.MessageId,
        });
      } else if (result.retryable) {
        // Retry with exponential backoff
        await this.retryNotification(notification, message.ReceiptHandle);
        
        logger.warn('Notification will be retried', {
          notificationId: notification.notificationId,
          attemptCount: notification.attemptCount,
          messageId: message.MessageId,
        });
      } else {
        // Non-retryable error - delete message
        await this.deleteMessage(message.ReceiptHandle);
        
        logger.error('Notification failed with non-retryable error', {
          notificationId: notification.notificationId,
          error: result.error,
          messageId: message.MessageId,
        });
      }
    } catch (error: any) {
      logger.error('Error processing message', {
        error: error.message,
        stack: error.stack,
        messageId: message.MessageId,
      });

      // Don't delete message - let it become visible again for retry
    }
  }

  /**
   * Process a notification and send email
   * 
   * @param notification - Notification message
   * @returns Processing result
   */
  private async processNotification(
    notification: NotificationQueueMessage
  ): Promise<NotificationProcessingResult> {
    try {
      // Validate email address
      if (!notification.userEmail || !this.isValidEmail(notification.userEmail)) {
        logger.warn('Invalid email address', {
          notificationId: notification.notificationId,
          userId: notification.userId,
          email: notification.userEmail,
        });

        return {
          success: false,
          error: 'Invalid email address',
          retryable: false,
          shouldMoveToDeadLetter: true,
        };
      }

      // Generate email template
      const template = this.emailTemplateService.generateTemplate(
        notification.event,
        notification.title,
        notification.message,
        notification.metadata
      );

      // Send email via AWS SES
      const params: SendEmailCommandInput = {
        Source: EMAIL_FROM,
        Destination: {
          ToAddresses: [notification.userEmail],
        },
        Message: {
          Subject: {
            Data: template.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: template.htmlBody,
              Charset: 'UTF-8',
            },
            Text: {
              Data: template.textBody,
              Charset: 'UTF-8',
            },
          },
        },
      };

      const command = new SendEmailCommand(params);
      const result = await sesClient.send(command);

      logger.info('Email sent successfully', {
        notificationId: notification.notificationId,
        userId: notification.userId,
        email: notification.userEmail,
        event: notification.event,
        messageId: result.MessageId,
      });

      return {
        success: true,
        retryable: false,
        shouldMoveToDeadLetter: false,
      };

    } catch (error: any) {
      logger.error('Failed to send email', {
        error: error.message,
        stack: error.stack,
        notificationId: notification.notificationId,
        userId: notification.userId,
        event: notification.event,
      });

      // Determine if error is retryable
      const isRetryable = this.isRetryableError(error);
      const shouldMoveToDeadLetter = 
        !isRetryable || notification.attemptCount >= notification.maxRetries;

      return {
        success: false,
        error: error.message,
        retryable: isRetryable,
        shouldMoveToDeadLetter,
      };
    }
  }

  /**
   * Check if an error is retryable
   * 
   * @param error - Error object
   * @returns True if error is retryable
   */
  private isRetryableError(error: any): boolean {
    // AWS SES throttling errors
    if (error.name === 'Throttling' || error.name === 'TooManyRequestsException') {
      return true;
    }

    // Temporary service errors
    if (error.name === 'ServiceUnavailable' || error.name === 'InternalFailure') {
      return true;
    }

    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // Non-retryable errors (invalid email, message rejected, etc.)
    return false;
  }

  /**
   * Validate email address format
   * 
   * @param email - Email address
   * @returns True if valid
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Retry a notification with exponential backoff
   * 
   * @param notification - Notification message
   * @param receiptHandle - Message receipt handle
   */
  private async retryNotification(
    notification: NotificationQueueMessage,
    receiptHandle: string
  ): Promise<void> {
    // Increment attempt count
    notification.attemptCount += 1;

    // Calculate exponential backoff delay (1s, 2s, 4s, 8s, ...)
    const delaySeconds = Math.min(Math.pow(2, notification.attemptCount - 1), 900); // Max 15 minutes

    try {
      // Change message visibility to delay retry
      const command = new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: delaySeconds,
      });

      await sqsClient.send(command);

      logger.info('Notification retry scheduled', {
        notificationId: notification.notificationId,
        attemptCount: notification.attemptCount,
        delaySeconds,
      });
    } catch (error: any) {
      logger.error('Failed to schedule retry', {
        notificationId: notification.notificationId,
        error: error.message,
      });
    }
  }

  /**
   * Move notification to dead letter queue
   * 
   * @param notification - Notification message
   * @param receiptHandle - Message receipt handle
   * @param error - Error message
   */
  private async moveToDeadLetterQueue(
    notification: NotificationQueueMessage,
    receiptHandle: string,
    error?: string
  ): Promise<void> {
    if (!this.dlqUrl) {
      logger.warn('Dead letter queue not configured - deleting message', {
        notificationId: notification.notificationId,
      });
      
      await this.deleteMessage(receiptHandle);
      return;
    }

    try {
      // Add error information to notification
      const dlqMessage = {
        ...notification,
        error,
        movedToDlqAt: new Date().toISOString(),
      };

      // Send to dead letter queue
      const command = new SendMessageCommand({
        QueueUrl: this.dlqUrl,
        MessageBody: JSON.stringify(dlqMessage),
        MessageAttributes: {
          NotificationId: {
            DataType: 'String',
            StringValue: notification.notificationId,
          },
          Event: {
            DataType: 'String',
            StringValue: notification.event,
          },
          Error: {
            DataType: 'String',
            StringValue: error || 'Unknown error',
          },
        },
      });

      await sqsClient.send(command);

      // Delete from main queue
      await this.deleteMessage(receiptHandle);

      logger.info('Notification moved to dead letter queue', {
        notificationId: notification.notificationId,
        error,
      });
    } catch (error: any) {
      logger.error('Failed to move notification to dead letter queue', {
        notificationId: notification.notificationId,
        error: error.message,
      });
    }
  }

  /**
   * Delete a message from the queue
   * 
   * @param receiptHandle - Message receipt handle
   */
  private async deleteMessage(receiptHandle: string): Promise<void> {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await sqsClient.send(command);
    } catch (error: any) {
      logger.error('Failed to delete message', {
        error: error.message,
      });
    }
  }

  /**
   * Sleep for a specified duration
   * 
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if consumer is running
   * 
   * @returns True if consumer is running
   */
  isConsumerRunning(): boolean {
    return this.isRunning;
  }
}

// Export singleton instance
export const notificationQueueConsumer = new NotificationQueueConsumer(
  new EmailTemplateService()
);
