import { SendMessageCommand, SendMessageCommandInput } from '@aws-sdk/client-sqs';
import { sqsClient, BOT_OPERATIONS_QUEUE_URL } from '../config/sqs';
import { logger } from '../utils/logger';
import {
  BotOperation,
  BotOperationType,
  InviteUserOperation,
  RemoveUserOperation,
  VerifyPermissionsOperation,
} from '../types/botQueue';

/**
 * BotQueueProducer
 * 
 * Responsible for enqueuing bot operations to SQS
 * 
 * Features:
 * - Enqueue invite user operations
 * - Enqueue remove user operations
 * - Enqueue permission verification operations
 * - Message deduplication
 * - Error handling and logging
 * 
 * Requirements: 2.6
 */
export class BotQueueProducer {
  private queueUrl: string;

  constructor(queueUrl?: string) {
    this.queueUrl = queueUrl !== undefined ? queueUrl : BOT_OPERATIONS_QUEUE_URL;
    
    if (!this.queueUrl) {
      logger.warn('Bot operations queue URL not configured - operations will not be queued');
    }
  }

  /**
   * Enqueue an invite user operation
   * 
   * @param userId - Telegram user ID
   * @param channelId - Telegram channel ID
   * @param subscriptionId - Subscription ID
   * @param orderId - Order ID
   * @param maxRetries - Maximum number of retries (default: 3)
   * @returns Message ID if successful
   */
  async enqueueInviteUser(
    userId: number,
    channelId: string,
    subscriptionId: string,
    orderId: string,
    maxRetries: number = 3
  ): Promise<string | null> {
    const operation: InviteUserOperation = {
      operationType: BotOperationType.INVITE_USER,
      userId,
      channelId,
      subscriptionId,
      orderId,
      timestamp: new Date().toISOString(),
      attemptCount: 0,
      maxRetries,
    };

    return this.enqueueOperation(operation, `invite-${subscriptionId}`);
  }

  /**
   * Enqueue a remove user operation
   * 
   * @param userId - Telegram user ID
   * @param channelId - Telegram channel ID
   * @param subscriptionId - Subscription ID
   * @param reason - Reason for removal
   * @param maxRetries - Maximum number of retries (default: 3)
   * @returns Message ID if successful
   */
  async enqueueRemoveUser(
    userId: number,
    channelId: string,
    subscriptionId: string,
    reason: 'expiry' | 'refund' | 'cancellation',
    maxRetries: number = 3
  ): Promise<string | null> {
    const operation: RemoveUserOperation = {
      operationType: BotOperationType.REMOVE_USER,
      userId,
      channelId,
      subscriptionId,
      reason,
      timestamp: new Date().toISOString(),
      attemptCount: 0,
      maxRetries,
    };

    return this.enqueueOperation(operation, `remove-${subscriptionId}-${reason}`);
  }

  /**
   * Enqueue a verify permissions operation
   * 
   * @param channelId - Telegram channel ID
   * @param listingId - Optional listing ID
   * @param maxRetries - Maximum number of retries (default: 3)
   * @returns Message ID if successful
   */
  async enqueueVerifyPermissions(
    channelId: string,
    listingId?: string,
    maxRetries: number = 3
  ): Promise<string | null> {
    const operation: VerifyPermissionsOperation = {
      operationType: BotOperationType.VERIFY_PERMISSIONS,
      channelId,
      listingId,
      timestamp: new Date().toISOString(),
      attemptCount: 0,
      maxRetries,
    };

    return this.enqueueOperation(operation, `verify-${channelId}`);
  }

  /**
   * Enqueue a bot operation to SQS
   * 
   * @param operation - Bot operation to enqueue
   * @param deduplicationId - Message deduplication ID
   * @returns Message ID if successful
   */
  private async enqueueOperation(
    operation: BotOperation,
    deduplicationId: string
  ): Promise<string | null> {
    if (!this.queueUrl) {
      logger.error('Cannot enqueue operation - queue URL not configured', {
        operationType: operation.operationType,
      });
      return null;
    }

    try {
      const messageBody = JSON.stringify(operation);
      
      const params: SendMessageCommandInput = {
        QueueUrl: this.queueUrl,
        MessageBody: messageBody,
        MessageGroupId: operation.operationType, // For FIFO queues
        MessageDeduplicationId: `${deduplicationId}-${Date.now()}`, // For FIFO queues
        MessageAttributes: {
          OperationType: {
            DataType: 'String',
            StringValue: operation.operationType,
          },
          AttemptCount: {
            DataType: 'Number',
            StringValue: operation.attemptCount.toString(),
          },
        },
      };

      const command = new SendMessageCommand(params);
      const result = await sqsClient.send(command);

      logger.info('Bot operation enqueued', {
        operationType: operation.operationType,
        messageId: result.MessageId,
        deduplicationId,
      });

      return result.MessageId || null;
    } catch (error: any) {
      logger.error('Failed to enqueue bot operation', {
        operationType: operation.operationType,
        error: error.message,
        stack: error.stack,
      });
      
      return null;
    }
  }

  /**
   * Get queue URL
   * 
   * @returns Queue URL
   */
  getQueueUrl(): string {
    return this.queueUrl;
  }

  /**
   * Check if queue is configured
   * 
   * @returns True if queue URL is configured
   */
  isConfigured(): boolean {
    return !!this.queueUrl && this.queueUrl.length > 0;
  }
}

// Export singleton instance
export const botQueueProducer = new BotQueueProducer();
