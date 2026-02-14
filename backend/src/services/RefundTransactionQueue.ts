/**
 * Refund Transaction Queue Service
 * 
 * Manages queueing of cryptocurrency refund transactions that need to be
 * sent back to buyers. Refunds are sent to the original deposit address
 * used for payment.
 * 
 * Requirements: 14.3, 14.4
 * 
 * Features:
 * - Queue refund transactions to SQS
 * - Track refund transaction status in database
 * - Support retry logic for failed refunds
 * - Log all refund operations for audit
 * 
 * Note: The actual cryptocurrency sending logic will be implemented in a
 * separate RefundTransactionProcessor service (similar to PaymentProcessingService).
 * This service only handles queueing the refund operations.
 */

import { SendMessageCommand, SendMessageCommandInput } from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';
import { sqsClient } from '../config/sqs';
import db from '../database/connection';
import { logger } from '../utils/logger';
import {
  RefundTransactionOperation,
  RefundTransactionStatus,
  RefundTransaction
} from '../types/refundQueue';
import { CryptoCurrency } from '../types/models';

/**
 * Refund queueing result
 */
export interface RefundQueueResult {
  refundId: string;
  messageId: string | null;
  queued: boolean;
}

/**
 * Refund Transaction Queue Service
 * 
 * Handles queueing of cryptocurrency refund transactions.
 */
export class RefundTransactionQueue {
  private queueUrl: string;

  constructor(queueUrl?: string) {
    // Use environment variable or provided URL
    this.queueUrl = queueUrl !== undefined 
      ? queueUrl 
      : (process.env.REFUND_QUEUE_URL || '');
    
    if (!this.queueUrl) {
      logger.warn('Refund queue URL not configured - refunds will be tracked but not queued');
    }
  }

  /**
   * Queue a refund transaction
   * 
   * Creates a refund transaction record in the database and queues it
   * for processing. The refund will be sent to the original deposit
   * address used for payment.
   * 
   * Requirements: 14.3
   * 
   * @param orderId - Order ID
   * @param subscriptionId - Subscription ID
   * @param buyerId - Buyer user ID
   * @param toAddress - Original deposit address to send refund to
   * @param amount - Refund amount
   * @param currency - Cryptocurrency type
   * @param reason - Reason for refund
   * @param maxRetries - Maximum retry attempts (default: 3)
   * @returns Refund queue result
   */
  async queueRefund(
    orderId: string,
    subscriptionId: string,
    buyerId: string,
    toAddress: string,
    amount: number,
    currency: CryptoCurrency,
    reason: string,
    maxRetries: number = 3
  ): Promise<RefundQueueResult> {
    try {
      logger.info('Queueing refund transaction', {
        orderId,
        subscriptionId,
        buyerId,
        toAddress,
        amount,
        currency,
        reason
      });

      // Validate inputs
      if (!toAddress || toAddress.trim().length === 0) {
        throw new Error('Refund address is required');
      }

      if (amount <= 0) {
        throw new Error('Refund amount must be positive');
      }

      // Generate refund ID
      const refundId = uuidv4();

      // Create refund transaction record in database
      await this.createRefundRecord(
        refundId,
        orderId,
        subscriptionId,
        buyerId,
        toAddress,
        amount,
        currency
      );

      logger.info('Refund transaction record created', {
        refundId,
        orderId,
        subscriptionId
      });

      // Queue refund operation to SQS (if configured)
      let messageId: string | null = null;
      let queued = false;

      if (this.queueUrl) {
        const operation: RefundTransactionOperation = {
          refundId,
          orderId,
          subscriptionId,
          buyerId,
          toAddress,
          amount,
          currency,
          reason,
          timestamp: new Date().toISOString(),
          attemptCount: 0,
          maxRetries
        };

        messageId = await this.enqueueOperation(operation);
        queued = messageId !== null;

        if (queued) {
          logger.info('Refund transaction queued to SQS', {
            refundId,
            messageId,
            orderId
          });
        } else {
          logger.warn('Failed to queue refund transaction to SQS', {
            refundId,
            orderId
          });
        }
      } else {
        logger.warn('Refund queue not configured - refund tracked but not queued', {
          refundId,
          orderId
        });
      }

      return {
        refundId,
        messageId,
        queued
      };

    } catch (error) {
      logger.error('Error queueing refund transaction', {
        error,
        orderId,
        subscriptionId
      });
      throw error;
    }
  }

  /**
   * Enqueue refund operation to SQS
   * 
   * @param operation - Refund transaction operation
   * @returns Message ID if successful, null otherwise
   */
  private async enqueueOperation(
    operation: RefundTransactionOperation
  ): Promise<string | null> {
    if (!this.queueUrl) {
      return null;
    }

    try {
      const messageBody = JSON.stringify(operation);
      
      const params: SendMessageCommandInput = {
        QueueUrl: this.queueUrl,
        MessageBody: messageBody,
        MessageGroupId: 'refund-transactions', // For FIFO queues
        MessageDeduplicationId: `${operation.refundId}-${Date.now()}`, // For FIFO queues
        MessageAttributes: {
          RefundId: {
            DataType: 'String',
            StringValue: operation.refundId
          },
          OrderId: {
            DataType: 'String',
            StringValue: operation.orderId
          },
          Currency: {
            DataType: 'String',
            StringValue: operation.currency
          },
          Amount: {
            DataType: 'Number',
            StringValue: operation.amount.toString()
          }
        }
      };

      const command = new SendMessageCommand(params);
      const result = await sqsClient.send(command);

      return result.MessageId || null;

    } catch (error: any) {
      logger.error('Failed to enqueue refund operation to SQS', {
        error: error.message,
        refundId: operation.refundId,
        orderId: operation.orderId
      });
      
      return null;
    }
  }

  /**
   * Create refund transaction record in database
   * 
   * @param refundId - Refund ID
   * @param orderId - Order ID
   * @param subscriptionId - Subscription ID
   * @param buyerId - Buyer user ID
   * @param toAddress - Refund address
   * @param amount - Refund amount
   * @param currency - Cryptocurrency type
   */
  private async createRefundRecord(
    refundId: string,
    orderId: string,
    subscriptionId: string,
    buyerId: string,
    toAddress: string,
    amount: number,
    currency: CryptoCurrency
  ): Promise<void> {
    await db('refund_transactions').insert({
      id: refundId,
      order_id: orderId,
      subscription_id: subscriptionId,
      buyer_id: buyerId,
      to_address: toAddress,
      amount,
      currency,
      status: RefundTransactionStatus.QUEUED,
      attempt_count: 0,
      created_at: db.fn.now(),
      updated_at: db.fn.now()
    });
  }

  /**
   * Get refund transaction by ID
   * 
   * @param refundId - Refund ID
   * @returns Refund transaction or null
   */
  async getRefund(refundId: string): Promise<RefundTransaction | null> {
    try {
      const result = await db('refund_transactions')
        .where({ id: refundId })
        .first();

      if (!result) {
        return null;
      }

      return this.mapRefundRecord(result);

    } catch (error) {
      logger.error('Error getting refund transaction', { error, refundId });
      throw error;
    }
  }

  /**
   * Get refund transactions by order ID
   * 
   * @param orderId - Order ID
   * @returns Array of refund transactions
   */
  async getRefundsByOrder(orderId: string): Promise<RefundTransaction[]> {
    try {
      const results = await db('refund_transactions')
        .where({ order_id: orderId })
        .orderBy('created_at', 'desc');

      return results.map(this.mapRefundRecord);

    } catch (error) {
      logger.error('Error getting refunds by order', { error, orderId });
      throw error;
    }
  }

  /**
   * Get refund transactions by subscription ID
   * 
   * @param subscriptionId - Subscription ID
   * @returns Array of refund transactions
   */
  async getRefundsBySubscription(subscriptionId: string): Promise<RefundTransaction[]> {
    try {
      const results = await db('refund_transactions')
        .where({ subscription_id: subscriptionId })
        .orderBy('created_at', 'desc');

      return results.map(this.mapRefundRecord);

    } catch (error) {
      logger.error('Error getting refunds by subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Get refund transactions by buyer ID
   * 
   * @param buyerId - Buyer user ID
   * @returns Array of refund transactions
   */
  async getRefundsByBuyer(buyerId: string): Promise<RefundTransaction[]> {
    try {
      const results = await db('refund_transactions')
        .where({ buyer_id: buyerId })
        .orderBy('created_at', 'desc');

      return results.map(this.mapRefundRecord);

    } catch (error) {
      logger.error('Error getting refunds by buyer', { error, buyerId });
      throw error;
    }
  }

  /**
   * Get refund transactions by status
   * 
   * @param status - Refund transaction status
   * @returns Array of refund transactions
   */
  async getRefundsByStatus(status: RefundTransactionStatus): Promise<RefundTransaction[]> {
    try {
      const results = await db('refund_transactions')
        .where({ status })
        .orderBy('created_at', 'desc');

      return results.map(this.mapRefundRecord);

    } catch (error) {
      logger.error('Error getting refunds by status', { error, status });
      throw error;
    }
  }

  /**
   * Update refund transaction status
   * 
   * @param refundId - Refund ID
   * @param status - New status
   * @param transactionHash - Transaction hash (if completed)
   * @param error - Error message (if failed)
   */
  async updateRefundStatus(
    refundId: string,
    status: RefundTransactionStatus,
    transactionHash?: string,
    error?: string
  ): Promise<void> {
    try {
      const updates: any = {
        status,
        updated_at: db.fn.now()
      };

      if (transactionHash) {
        updates.transaction_hash = transactionHash;
      }

      if (error) {
        updates.error = error;
      }

      if (status === RefundTransactionStatus.COMPLETED || 
          status === RefundTransactionStatus.FAILED) {
        updates.processed_at = db.fn.now();
      }

      await db('refund_transactions')
        .where({ id: refundId })
        .update(updates);

      logger.info('Refund transaction status updated', {
        refundId,
        status,
        transactionHash
      });

    } catch (error) {
      logger.error('Error updating refund status', { error, refundId, status });
      throw error;
    }
  }

  /**
   * Increment refund attempt count
   * 
   * @param refundId - Refund ID
   */
  async incrementAttemptCount(refundId: string): Promise<void> {
    try {
      await db('refund_transactions')
        .where({ id: refundId })
        .increment('attempt_count', 1)
        .update({ updated_at: db.fn.now() });

      logger.info('Refund attempt count incremented', { refundId });

    } catch (error) {
      logger.error('Error incrementing refund attempt count', { error, refundId });
      throw error;
    }
  }

  /**
   * Map database record to RefundTransaction type
   * 
   * @param record - Database record
   * @returns RefundTransaction
   */
  private mapRefundRecord(record: any): RefundTransaction {
    return {
      id: record.id,
      orderId: record.order_id,
      subscriptionId: record.subscription_id,
      buyerId: record.buyer_id,
      toAddress: record.to_address,
      amount: parseFloat(record.amount),
      currency: record.currency,
      status: record.status,
      transactionHash: record.transaction_hash,
      error: record.error,
      attemptCount: record.attempt_count,
      createdAt: record.created_at,
      processedAt: record.processed_at,
      updatedAt: record.updated_at
    };
  }

  /**
   * Check if queue is configured
   * 
   * @returns True if queue URL is configured
   */
  isConfigured(): boolean {
    return !!this.queueUrl && this.queueUrl.length > 0;
  }

  /**
   * Get queue URL
   * 
   * @returns Queue URL
   */
  getQueueUrl(): string {
    return this.queueUrl;
  }
}

// Export singleton instance
export const refundTransactionQueue = new RefundTransactionQueue();
