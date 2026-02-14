/**
 * Payment Processing Service
 * 
 * Processes detected blockchain transactions from SQS queue and updates order status.
 * Handles payment verification, confirmation tracking, and subscription activation.
 * 
 * Requirements: 3.3, 3.5, 3.7 (Requirements 5.4, 5.5, 6.5)
 * 
 * Features:
 * - Consumes transaction events from SQS
 * - Verifies payment amounts with tolerance check (±0.1%)
 * - Tracks confirmation progress
 * - Updates order status based on confirmations
 * - Handles partial payments
 * - Triggers subscription activation when payment confirmed
 */

import { ReceiveMessageCommand, DeleteMessageCommand, Message } from '@aws-sdk/client-sqs';
import { sqsClient } from '../config/sqs';
import db from '../database/connection';
import { logger } from '../utils/logger';
import {
  Order,
  OrderStatus,
  Transaction,
  CryptoCurrency,
  REQUIRED_CONFIRMATIONS,
  PAYMENT_TOLERANCE
} from '../types/models';
import { TransactionEvent } from './BlockchainMonitorService';

/**
 * Payment verification result
 */
interface PaymentVerification {
  isValid: boolean;
  amountMatch: boolean;
  addressMatch: boolean;
  sufficientConfirmations: boolean;
  actualAmount: number;
  expectedAmount: number;
  confirmations: number;
  requiredConfirmations: number;
}

/**
 * Payment Processing Service
 * 
 * Consumes transaction events from SQS and processes payments for orders.
 * Updates order status based on payment verification and confirmation tracking.
 */
export class PaymentProcessingService {
  private transactionQueueUrl: string;
  private isRunning: boolean = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
  private readonly MAX_MESSAGES = 10; // Process up to 10 messages per poll
  private readonly VISIBILITY_TIMEOUT = 30; // 30 seconds to process message

  constructor(transactionQueueUrl: string) {
    this.transactionQueueUrl = transactionQueueUrl;
  }

  /**
   * Start consuming transaction events from SQS
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Payment processing service already running');
      return;
    }

    if (!this.transactionQueueUrl) {
      logger.error('Transaction queue URL not configured');
      throw new Error('TRANSACTION_QUEUE_URL environment variable is required');
    }

    logger.info('Starting payment processing service', {
      queueUrl: this.transactionQueueUrl,
      pollInterval: this.POLL_INTERVAL_MS
    });

    this.isRunning = true;
    this.startPolling();

    logger.info('Payment processing service started successfully');
  }

  /**
   * Stop consuming transaction events
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping payment processing service');
    this.isRunning = false;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    logger.info('Payment processing service stopped');
  }

  /**
   * Start polling SQS for transaction events
   */
  private startPolling(): void {
    // Initial poll
    this.pollQueue();

    // Set up interval for continuous polling
    this.pollingInterval = setInterval(() => {
      this.pollQueue();
    }, this.POLL_INTERVAL_MS);
  }

  /**
   * Poll SQS queue for transaction events
   */
  private async pollQueue(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: this.transactionQueueUrl,
        MaxNumberOfMessages: this.MAX_MESSAGES,
        WaitTimeSeconds: 20, // Long polling
        VisibilityTimeout: this.VISIBILITY_TIMEOUT,
        MessageAttributeNames: ['All']
      });

      const response = await sqsClient.send(command);

      if (!response.Messages || response.Messages.length === 0) {
        return; // No messages to process
      }

      logger.info('Received transaction events from SQS', {
        messageCount: response.Messages.length
      });

      // Process messages in parallel
      await Promise.all(
        response.Messages.map(message => this.processMessage(message))
      );

    } catch (error) {
      logger.error('Error polling SQS queue', { error });
    }
  }

  /**
   * Process a single SQS message
   */
  private async processMessage(message: Message): Promise<void> {
    try {
      if (!message.Body) {
        logger.warn('Received message without body', { messageId: message.MessageId });
        await this.deleteMessage(message);
        return;
      }

      // Parse transaction event
      const event: TransactionEvent = JSON.parse(message.Body);

      logger.info('Processing transaction event', {
        messageId: message.MessageId,
        eventType: event.type,
        orderId: event.orderId,
        txHash: event.transaction.hash
      });

      // Process payment based on event type
      if (event.type === 'TRANSACTION_DETECTED') {
        await this.handleTransactionDetected(event);
      } else if (event.type === 'TRANSACTION_CONFIRMED') {
        await this.handleTransactionConfirmed(event);
      } else {
        logger.warn('Unknown transaction event type', { eventType: event.type });
      }

      // Delete message from queue after successful processing
      await this.deleteMessage(message);

      logger.info('Transaction event processed successfully', {
        messageId: message.MessageId,
        orderId: event.orderId
      });

    } catch (error) {
      logger.error('Error processing transaction message', {
        error,
        messageId: message.MessageId
      });
      // Message will become visible again after visibility timeout for retry
    }
  }

  /**
   * Delete message from SQS queue
   */
  private async deleteMessage(message: Message): Promise<void> {
    if (!message.ReceiptHandle) {
      return;
    }

    try {
      const command = new DeleteMessageCommand({
        QueueUrl: this.transactionQueueUrl,
        ReceiptHandle: message.ReceiptHandle
      });

      await sqsClient.send(command);
    } catch (error) {
      logger.error('Error deleting message from queue', {
        error,
        messageId: message.MessageId
      });
    }
  }

  /**
   * Handle TRANSACTION_DETECTED event
   * 
   * Updates order status to payment_detected and stores transaction record
   */
  private async handleTransactionDetected(event: TransactionEvent): Promise<void> {
    const { orderId, transaction } = event;

    try {
      // Get order
      const order = await this.getOrder(orderId);
      if (!order) {
        logger.error('Order not found for transaction', { orderId, txHash: transaction.hash });
        return;
      }

      // Skip if order already processed
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        logger.info('Order already processed, skipping', {
          orderId,
          currentStatus: order.status
        });
        return;
      }

      // Verify payment
      const verification = await this.verifyPayment(order, transaction);

      if (!verification.addressMatch) {
        logger.error('Payment address mismatch', {
          orderId,
          expected: order.depositAddress,
          actual: transaction.to
        });
        return;
      }

      // Store transaction record
      await this.storeTransaction(orderId, transaction);

      // Update order status to payment_detected
      await this.updateOrderStatus(
        orderId,
        OrderStatus.PAYMENT_DETECTED,
        transaction.hash,
        transaction.confirmations
      );

      logger.info('Payment detected for order', {
        orderId,
        txHash: transaction.hash,
        amount: transaction.amount,
        confirmations: transaction.confirmations,
        amountMatch: verification.amountMatch
      });

      // Log warning if amount doesn't match
      if (!verification.amountMatch) {
        logger.warn('Payment amount outside tolerance', {
          orderId,
          expected: verification.expectedAmount,
          actual: verification.actualAmount,
          difference: Math.abs(verification.actualAmount - verification.expectedAmount),
          tolerance: PAYMENT_TOLERANCE
        });
      }

    } catch (error) {
      logger.error('Error handling transaction detected', {
        error,
        orderId,
        txHash: transaction.hash
      });
      throw error;
    }
  }

  /**
   * Handle TRANSACTION_CONFIRMED event
   * 
   * Updates order status to payment_confirmed and triggers subscription activation
   */
  private async handleTransactionConfirmed(event: TransactionEvent): Promise<void> {
    const { orderId, transaction } = event;

    try {
      // Get order
      const order = await this.getOrder(orderId);
      if (!order) {
        logger.error('Order not found for transaction', { orderId, txHash: transaction.hash });
        return;
      }

      // Skip if order already confirmed
      if (order.status === OrderStatus.PAYMENT_CONFIRMED || 
          order.status === OrderStatus.SUBSCRIPTION_ACTIVE) {
        logger.info('Order already confirmed, skipping', {
          orderId,
          currentStatus: order.status
        });
        return;
      }

      // Verify payment
      const verification = await this.verifyPayment(order, transaction);

      if (!verification.isValid) {
        logger.error('Payment verification failed', {
          orderId,
          verification
        });
        return;
      }

      // Update transaction confirmations
      await this.updateTransactionConfirmations(
        transaction.hash,
        transaction.confirmations
      );

      // Update order status to payment_confirmed
      await this.updateOrderStatus(
        orderId,
        OrderStatus.PAYMENT_CONFIRMED,
        transaction.hash,
        transaction.confirmations,
        new Date() // Set paidAt timestamp
      );

      logger.info('Payment confirmed for order', {
        orderId,
        txHash: transaction.hash,
        confirmations: transaction.confirmations,
        amount: transaction.amount
      });

      // Trigger subscription creation
      try {
        const { subscriptionService } = await import('./SubscriptionService');
        const result = await subscriptionService.createSubscriptionFromOrder(orderId);
        
        logger.info('Subscription created from confirmed order', {
          orderId,
          subscriptionId: result.subscription.id,
          botOperationQueued: result.botOperationQueued
        });
      } catch (error) {
        logger.error('Error creating subscription from order', {
          error,
          orderId
        });
        // Don't fail the payment confirmation if subscription creation fails
        // The subscription can be created manually or retried later
      }

    } catch (error) {
      logger.error('Error handling transaction confirmed', {
        error,
        orderId,
        txHash: transaction.hash
      });
      throw error;
    }
  }

  /**
   * Verify payment against order requirements
   * 
   * Checks:
   * - Amount matches within tolerance (±0.1%)
   * - Destination address matches
   * - Sufficient confirmations
   */
  async verifyPayment(
    order: Order,
    transaction: {
      to: string;
      amount: number;
      confirmations: number;
      currency: CryptoCurrency;
    }
  ): Promise<PaymentVerification> {
    const requiredConfirmations = REQUIRED_CONFIRMATIONS[order.currency];

    // Check address match
    const addressMatch = transaction.to.toLowerCase() === order.depositAddress.toLowerCase();

    // Check amount within tolerance
    const expectedAmount = order.amount;
    const actualAmount = transaction.amount;
    
    // Handle zero amount edge case
    let amountMatch: boolean;
    if (expectedAmount === 0 && actualAmount === 0) {
      amountMatch = true;
    } else if (expectedAmount === 0) {
      amountMatch = false;
    } else {
      const difference = Math.abs(actualAmount - expectedAmount) / expectedAmount;
      amountMatch = difference <= PAYMENT_TOLERANCE;
    }

    // Check confirmations
    const sufficientConfirmations = transaction.confirmations >= requiredConfirmations;

    // Overall validity
    const isValid = addressMatch && amountMatch && sufficientConfirmations;

    return {
      isValid,
      amountMatch,
      addressMatch,
      sufficientConfirmations,
      actualAmount,
      expectedAmount,
      confirmations: transaction.confirmations,
      requiredConfirmations
    };
  }

  /**
   * Process payment for an order
   * 
   * Public method for manual payment processing (e.g., from API endpoint)
   */
  async processPayment(
    orderId: string,
    transactionHash: string,
    amount: number,
    confirmations: number
  ): Promise<void> {
    try {
      logger.info('Processing payment manually', {
        orderId,
        transactionHash,
        amount,
        confirmations
      });

      const order = await this.getOrder(orderId);
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Verify payment
      const verification = await this.verifyPayment(order, {
        to: order.depositAddress,
        amount,
        confirmations,
        currency: order.currency
      });

      if (!verification.amountMatch) {
        throw new Error(
          `Payment amount mismatch: expected ${verification.expectedAmount}, got ${verification.actualAmount}`
        );
      }

      // Determine status based on confirmations
      const newStatus = verification.sufficientConfirmations
        ? OrderStatus.PAYMENT_CONFIRMED
        : OrderStatus.PAYMENT_DETECTED;

      // Update order
      await this.updateOrderStatus(
        orderId,
        newStatus,
        transactionHash,
        confirmations,
        verification.sufficientConfirmations ? new Date() : undefined
      );

      logger.info('Payment processed successfully', {
        orderId,
        newStatus,
        confirmations
      });

    } catch (error) {
      logger.error('Error processing payment', { error, orderId });
      throw error;
    }
  }

  /**
   * Handle partial payment
   * 
   * Tracks partial payments and updates order when full amount received
   */
  async handlePartialPayment(
    orderId: string,
    transactionHash: string,
    amount: number
  ): Promise<void> {
    try {
      logger.info('Handling partial payment', { orderId, transactionHash, amount });

      const order = await this.getOrder(orderId);
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Get all transactions for this order
      const transactions = await this.getOrderTransactions(orderId);
      const totalReceived = transactions.reduce((sum, tx) => sum + tx.amount, 0) + amount;

      logger.info('Partial payment tracking', {
        orderId,
        currentPayment: amount,
        totalReceived,
        expectedAmount: order.amount,
        percentComplete: (totalReceived / order.amount) * 100
      });

      // Store transaction
      await this.storeTransaction(orderId, {
        hash: transactionHash,
        from: '', // Will be filled by blockchain monitor
        to: order.depositAddress,
        amount,
        currency: order.currency,
        confirmations: 0,
        timestamp: new Date()
      });

      // Check if full amount received
      const difference = Math.abs(totalReceived - order.amount) / order.amount;
      if (difference <= PAYMENT_TOLERANCE) {
        logger.info('Full payment amount received via partial payments', {
          orderId,
          totalReceived,
          expectedAmount: order.amount
        });

        // Update order status
        await this.updateOrderStatus(
          orderId,
          OrderStatus.PAYMENT_DETECTED,
          transactionHash,
          0 // Confirmations will be updated by blockchain monitor
        );
      }

    } catch (error) {
      logger.error('Error handling partial payment', { error, orderId });
      throw error;
    }
  }

  // ============================================================================
  // Database Operations
  // ============================================================================

  /**
   * Get order by ID
   */
  private async getOrder(orderId: string): Promise<Order | null> {
    const result = await db('orders')
      .where({ id: orderId })
      .first();

    if (!result) return null;

    return {
      id: result.id,
      buyerId: result.buyer_id,
      listingId: result.listing_id,
      depositAddress: result.deposit_address,
      amount: parseFloat(result.amount),
      currency: result.currency,
      status: result.status,
      transactionHash: result.transaction_hash,
      confirmations: result.confirmations,
      createdAt: result.created_at,
      expiresAt: result.expires_at,
      paidAt: result.paid_at
    };
  }

  /**
   * Update order status
   */
  private async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    transactionHash?: string,
    confirmations?: number,
    paidAt?: Date
  ): Promise<void> {
    const updates: any = {
      status,
      updated_at: db.fn.now()
    };

    if (transactionHash) {
      updates.transaction_hash = transactionHash;
    }

    if (confirmations !== undefined) {
      updates.confirmations = confirmations;
    }

    if (paidAt) {
      updates.paid_at = paidAt;
    }

    await db('orders')
      .where({ id: orderId })
      .update(updates);

    logger.info('Order status updated', { orderId, status, confirmations });
  }

  /**
   * Store transaction record
   */
  private async storeTransaction(
    orderId: string,
    transaction: {
      hash: string;
      from: string;
      to: string;
      amount: number;
      currency: CryptoCurrency;
      confirmations: number;
      blockNumber?: number;
      timestamp: Date;
    }
  ): Promise<void> {
    // Check if transaction already exists
    const existing = await db('transactions')
      .where({ transaction_hash: transaction.hash })
      .first();

    if (existing) {
      logger.info('Transaction already stored', { txHash: transaction.hash });
      return;
    }

    await db('transactions').insert({
      order_id: orderId,
      transaction_hash: transaction.hash,
      from_address: transaction.from,
      to_address: transaction.to,
      amount: transaction.amount,
      currency: transaction.currency,
      confirmations: transaction.confirmations,
      block_number: transaction.blockNumber,
      detected_at: transaction.timestamp,
      confirmed_at: transaction.confirmations >= REQUIRED_CONFIRMATIONS[transaction.currency]
        ? transaction.timestamp
        : null
    });

    logger.info('Transaction stored', {
      orderId,
      txHash: transaction.hash,
      amount: transaction.amount
    });
  }

  /**
   * Update transaction confirmations
   */
  private async updateTransactionConfirmations(
    transactionHash: string,
    confirmations: number
  ): Promise<void> {
    const updates: any = {
      confirmations,
      updated_at: db.fn.now()
    };

    // Get transaction to check if it should be marked as confirmed
    const tx = await db('transactions')
      .where({ transaction_hash: transactionHash })
      .first();

    if (tx && !tx.confirmed_at) {
      const currency = tx.currency as CryptoCurrency;
      const requiredConfirmations = REQUIRED_CONFIRMATIONS[currency];
      if (confirmations >= requiredConfirmations) {
        updates.confirmed_at = db.fn.now();
      }
    }

    await db('transactions')
      .where({ transaction_hash: transactionHash })
      .update(updates);

    logger.info('Transaction confirmations updated', {
      txHash: transactionHash,
      confirmations
    });
  }

  /**
   * Get all transactions for an order
   */
  private async getOrderTransactions(orderId: string): Promise<Transaction[]> {
    const results = await db('transactions')
      .where({ order_id: orderId })
      .select('*');

    return results.map((row: any) => ({
      id: row.id,
      orderId: row.order_id,
      transactionHash: row.transaction_hash,
      fromAddress: row.from_address,
      toAddress: row.to_address,
      amount: parseFloat(row.amount),
      currency: row.currency,
      confirmations: row.confirmations,
      blockNumber: row.block_number,
      detectedAt: row.detected_at,
      confirmedAt: row.confirmed_at
    }));
  }
}

// Export singleton instance
export const paymentProcessingService = new PaymentProcessingService(
  process.env.TRANSACTION_QUEUE_URL || ''
);
