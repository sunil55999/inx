/**
 * Refund Transaction Queue Types
 * 
 * Defines types for cryptocurrency refund transactions that are queued
 * for asynchronous processing. Refunds are sent back to the original
 * deposit address used for payment.
 * 
 * Requirements: 14.3
 */

import { CryptoCurrency } from './models';

/**
 * Refund transaction operation
 * 
 * Represents a queued cryptocurrency refund that needs to be sent
 * back to the buyer's original deposit address.
 */
export interface RefundTransactionOperation {
  /**
   * Unique refund transaction ID
   */
  refundId: string;

  /**
   * Order ID associated with the refund
   */
  orderId: string;

  /**
   * Subscription ID associated with the refund
   */
  subscriptionId: string;

  /**
   * Buyer user ID
   */
  buyerId: string;

  /**
   * Original deposit address to send refund to
   */
  toAddress: string;

  /**
   * Refund amount in cryptocurrency
   */
  amount: number;

  /**
   * Cryptocurrency type
   */
  currency: CryptoCurrency;

  /**
   * Reason for refund
   */
  reason: string;

  /**
   * Timestamp when refund was queued
   */
  timestamp: string;

  /**
   * Number of processing attempts
   */
  attemptCount: number;

  /**
   * Maximum number of retry attempts
   */
  maxRetries: number;
}

/**
 * Result of processing a refund transaction
 */
export interface RefundTransactionResult {
  /**
   * Whether the refund was successfully sent
   */
  success: boolean;

  /**
   * Transaction hash if successful
   */
  transactionHash?: string;

  /**
   * Error message if failed
   */
  error?: string;

  /**
   * Whether the operation should be retried
   */
  retryable: boolean;

  /**
   * Whether to move to dead letter queue
   */
  shouldMoveToDeadLetter: boolean;
}

/**
 * Refund transaction status
 */
export enum RefundTransactionStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * Refund transaction record
 * 
 * Stored in database to track refund transaction status
 */
export interface RefundTransaction {
  id: string;
  orderId: string;
  subscriptionId: string;
  buyerId: string;
  toAddress: string;
  amount: number;
  currency: CryptoCurrency;
  status: RefundTransactionStatus;
  transactionHash?: string;
  error?: string;
  attemptCount: number;
  createdAt: Date;
  processedAt?: Date;
  updatedAt: Date;
}
