import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  SendMessageCommand,
  ReceiveMessageCommandInput,
  Message,
} from '@aws-sdk/client-sqs';
import { sqsClient, BOT_OPERATIONS_QUEUE_URL, BOT_OPERATIONS_DLQ_URL } from '../config/sqs';
import { logger } from '../utils/logger';
import { TelegramBotService } from './TelegramBotService';
import {
  BotOperation,
  BotOperationType,
  InviteUserOperation,
  RemoveUserOperation,
  VerifyPermissionsOperation,
  BotOperationResult,
} from '../types/botQueue';

/**
 * BotQueueConsumer
 * 
 * Responsible for consuming and processing bot operations from SQS
 * 
 * Features:
 * - Poll SQS queue for bot operations
 * - Process operations with exponential backoff retry
 * - Move failed operations to dead letter queue
 * - Handle visibility timeout for long-running operations
 * - Graceful shutdown
 * 
 * Requirements: 2.6
 */
export class BotQueueConsumer {
  private queueUrl: string;
  private dlqUrl: string;
  private botService: TelegramBotService;
  private isRunning: boolean = false;
  private pollInterval: number = 1000; // 1 second
  private maxMessages: number = 10; // Process up to 10 messages at a time
  private visibilityTimeout: number = 30; // 30 seconds
  private waitTimeSeconds: number = 20; // Long polling

  constructor(
    botService: TelegramBotService,
    queueUrl?: string,
    dlqUrl?: string
  ) {
    this.botService = botService;
    this.queueUrl = queueUrl || BOT_OPERATIONS_QUEUE_URL;
    this.dlqUrl = dlqUrl || BOT_OPERATIONS_DLQ_URL;

    if (!this.queueUrl) {
      logger.warn('Bot operations queue URL not configured - consumer will not start');
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
    logger.info('Bot queue consumer started', {
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
    logger.info('Bot queue consumer stopped');
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
          logger.info('Received messages from queue', {
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
      // Parse operation from message body
      const operation: BotOperation = JSON.parse(message.Body);

      logger.info('Processing bot operation', {
        operationType: operation.operationType,
        attemptCount: operation.attemptCount,
        messageId: message.MessageId,
      });

      // Process the operation
      const result = await this.processOperation(operation);

      if (result.success) {
        // Delete message from queue on success
        await this.deleteMessage(message.ReceiptHandle);
        
        logger.info('Bot operation completed successfully', {
          operationType: operation.operationType,
          messageId: message.MessageId,
        });
      } else if (result.shouldMoveToDeadLetter) {
        // Move to dead letter queue
        await this.moveToDeadLetterQueue(operation, message.ReceiptHandle, result.error);
        
        logger.error('Bot operation moved to dead letter queue', {
          operationType: operation.operationType,
          error: result.error,
          messageId: message.MessageId,
        });
      } else if (result.retryable) {
        // Retry with exponential backoff
        await this.retryOperation(operation, message.ReceiptHandle);
        
        logger.warn('Bot operation will be retried', {
          operationType: operation.operationType,
          attemptCount: operation.attemptCount,
          messageId: message.MessageId,
        });
      } else {
        // Non-retryable error - delete message
        await this.deleteMessage(message.ReceiptHandle);
        
        logger.error('Bot operation failed with non-retryable error', {
          operationType: operation.operationType,
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
   * Process a bot operation
   * 
   * @param operation - Bot operation to process
   * @returns Operation result
   */
  private async processOperation(operation: BotOperation): Promise<BotOperationResult> {
    try {
      switch (operation.operationType) {
        case BotOperationType.INVITE_USER:
          return await this.processInviteUser(operation as InviteUserOperation);
        
        case BotOperationType.REMOVE_USER:
          return await this.processRemoveUser(operation as RemoveUserOperation);
        
        case BotOperationType.VERIFY_PERMISSIONS:
          return await this.processVerifyPermissions(operation as VerifyPermissionsOperation);
        
        default:
          return {
            success: false,
            error: `Unknown operation type: ${(operation as any).operationType}`,
            retryable: false,
            shouldMoveToDeadLetter: true,
          };
      }
    } catch (error: any) {
      logger.error('Unexpected error processing operation', {
        operationType: operation.operationType,
        error: error.message,
        stack: error.stack,
      });

      return {
        success: false,
        error: error.message,
        retryable: true,
        shouldMoveToDeadLetter: false,
      };
    }
  }

  /**
   * Process invite user operation
   * 
   * @param operation - Invite user operation
   * @returns Operation result
   */
  private async processInviteUser(operation: InviteUserOperation): Promise<BotOperationResult> {
    const result = await this.botService.inviteUserToChannel(
      operation.userId,
      operation.channelId,
      1 // Single attempt - retry logic handled by queue
    );

    const shouldMoveToDeadLetter = 
      !result.success && 
      operation.attemptCount >= operation.maxRetries;

    return {
      success: result.success,
      error: result.error,
      retryable: result.retryable,
      shouldMoveToDeadLetter,
    };
  }

  /**
   * Process remove user operation
   * 
   * @param operation - Remove user operation
   * @returns Operation result
   */
  private async processRemoveUser(operation: RemoveUserOperation): Promise<BotOperationResult> {
    const result = await this.botService.removeUserFromChannel(
      operation.userId,
      operation.channelId,
      1 // Single attempt - retry logic handled by queue
    );

    const shouldMoveToDeadLetter = 
      !result.success && 
      operation.attemptCount >= operation.maxRetries;

    return {
      success: result.success,
      error: result.error,
      retryable: result.retryable,
      shouldMoveToDeadLetter,
    };
  }

  /**
   * Process verify permissions operation
   * 
   * @param operation - Verify permissions operation
   * @returns Operation result
   */
  private async processVerifyPermissions(
    operation: VerifyPermissionsOperation
  ): Promise<BotOperationResult> {
    try {
      const permissions = await this.botService.verifyAdminPermissions(operation.channelId);

      // Consider success if we got a valid response
      return {
        success: true,
        retryable: false,
        shouldMoveToDeadLetter: false,
      };
    } catch (error: any) {
      const shouldMoveToDeadLetter = operation.attemptCount >= operation.maxRetries;

      return {
        success: false,
        error: error.message,
        retryable: true,
        shouldMoveToDeadLetter,
      };
    }
  }

  /**
   * Retry an operation with exponential backoff
   * 
   * @param operation - Bot operation
   * @param receiptHandle - Message receipt handle
   */
  private async retryOperation(operation: BotOperation, receiptHandle: string): Promise<void> {
    // Increment attempt count
    operation.attemptCount += 1;

    // Calculate exponential backoff delay (1s, 2s, 4s, 8s, ...)
    const delaySeconds = Math.min(Math.pow(2, operation.attemptCount - 1), 900); // Max 15 minutes

    try {
      // Change message visibility to delay retry
      const command = new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: delaySeconds,
      });

      await sqsClient.send(command);

      logger.info('Operation retry scheduled', {
        operationType: operation.operationType,
        attemptCount: operation.attemptCount,
        delaySeconds,
      });
    } catch (error: any) {
      logger.error('Failed to schedule retry', {
        operationType: operation.operationType,
        error: error.message,
      });
    }
  }

  /**
   * Move operation to dead letter queue
   * 
   * @param operation - Bot operation
   * @param receiptHandle - Message receipt handle
   * @param error - Error message
   */
  private async moveToDeadLetterQueue(
    operation: BotOperation,
    receiptHandle: string,
    error?: string
  ): Promise<void> {
    if (!this.dlqUrl) {
      logger.warn('Dead letter queue not configured - deleting message', {
        operationType: operation.operationType,
      });
      
      await this.deleteMessage(receiptHandle);
      return;
    }

    try {
      // Add error information to operation
      const dlqMessage = {
        ...operation,
        error,
        movedToDlqAt: new Date().toISOString(),
      };

      // Send to dead letter queue
      const command = new SendMessageCommand({
        QueueUrl: this.dlqUrl,
        MessageBody: JSON.stringify(dlqMessage),
        MessageAttributes: {
          OperationType: {
            DataType: 'String',
            StringValue: operation.operationType,
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

      logger.info('Operation moved to dead letter queue', {
        operationType: operation.operationType,
        error,
      });
    } catch (error: any) {
      logger.error('Failed to move operation to dead letter queue', {
        operationType: operation.operationType,
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
