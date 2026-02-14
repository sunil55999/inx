/**
 * RefundTransactionQueue Unit Tests
 * 
 * Tests the refund transaction queueing service.
 * 
 * Requirements: 14.3, 14.4
 */

import { RefundTransactionQueue } from '../RefundTransactionQueue';
import { RefundTransactionStatus } from '../../types/refundQueue';
import db from '../../database/connection';

// Mock dependencies
jest.mock('../../database/connection');
jest.mock('../../config/sqs', () => ({
  sqsClient: {
    send: jest.fn()
  },
  BOT_OPERATIONS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123456789/bot-operations.fifo'
}));

describe('RefundTransactionQueue', () => {
  let refundQueue: RefundTransactionQueue;
  const mockQueueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/refund-transactions.fifo';

  beforeEach(() => {
    jest.clearAllMocks();
    refundQueue = new RefundTransactionQueue(mockQueueUrl);
    
    // Mock db.fn.now()
    (db as any).fn = {
      now: jest.fn().mockReturnValue('2024-01-01T00:00:00Z')
    };
  });

  describe('queueRefund', () => {
    it('should create refund record and queue refund transaction', async () => {
      // Mock database insert
      const mockInsert = jest.fn().mockResolvedValue([]);
      (db as any).mockReturnValue({
        insert: mockInsert
      });

      // Mock SQS send
      const { sqsClient } = require('../../config/sqs');
      sqsClient.send.mockResolvedValue({ MessageId: 'msg-123' });

      const result = await refundQueue.queueRefund(
        'order-123',
        'subscription-456',
        'buyer-789',
        '0x1234567890abcdef',
        50.5,
        'USDT_BEP20',
        'Dispute resolved - refund approved'
      );

      expect(result.refundId).toBeDefined();
      expect(result.messageId).toBe('msg-123');
      expect(result.queued).toBe(true);
      expect(mockInsert).toHaveBeenCalled();
      expect(sqsClient.send).toHaveBeenCalled();
    });

    it('should throw error for invalid refund address', async () => {
      await expect(
        refundQueue.queueRefund(
          'order-123',
          'subscription-456',
          'buyer-789',
          '', // Empty address
          50.5,
          'USDT_BEP20',
          'Test refund'
        )
      ).rejects.toThrow('Refund address is required');
    });

    it('should throw error for non-positive refund amount', async () => {
      await expect(
        refundQueue.queueRefund(
          'order-123',
          'subscription-456',
          'buyer-789',
          '0x1234567890abcdef',
          0, // Zero amount
          'USDT_BEP20',
          'Test refund'
        )
      ).rejects.toThrow('Refund amount must be positive');

      await expect(
        refundQueue.queueRefund(
          'order-123',
          'subscription-456',
          'buyer-789',
          '0x1234567890abcdef',
          -10, // Negative amount
          'USDT_BEP20',
          'Test refund'
        )
      ).rejects.toThrow('Refund amount must be positive');
    });

    it('should track refund even if queue is not configured', async () => {
      const queueWithoutUrl = new RefundTransactionQueue('');

      // Mock database insert
      const mockInsert = jest.fn().mockResolvedValue([]);
      (db as any).mockReturnValue({
        insert: mockInsert
      });

      const result = await queueWithoutUrl.queueRefund(
        'order-123',
        'subscription-456',
        'buyer-789',
        '0x1234567890abcdef',
        50.5,
        'USDT_BEP20',
        'Test refund'
      );

      expect(result.refundId).toBeDefined();
      expect(result.messageId).toBeNull();
      expect(result.queued).toBe(false);
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should handle SQS queueing failure gracefully', async () => {
      // Mock database insert
      const mockInsert = jest.fn().mockResolvedValue([]);
      (db as any).mockReturnValue({
        insert: mockInsert
      });

      // Mock SQS send failure
      const { sqsClient } = require('../../config/sqs');
      sqsClient.send.mockRejectedValue(new Error('SQS error'));

      const result = await refundQueue.queueRefund(
        'order-123',
        'subscription-456',
        'buyer-789',
        '0x1234567890abcdef',
        50.5,
        'USDT_BEP20',
        'Test refund'
      );

      expect(result.refundId).toBeDefined();
      expect(result.messageId).toBeNull();
      expect(result.queued).toBe(false);
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe('getRefund', () => {
    it('should retrieve refund transaction by ID', async () => {
      const mockRefund = {
        id: 'refund-123',
        order_id: 'order-123',
        subscription_id: 'subscription-456',
        buyer_id: 'buyer-789',
        to_address: '0x1234567890abcdef',
        amount: '50.5',
        currency: 'USDT_BEP20',
        status: RefundTransactionStatus.QUEUED,
        transaction_hash: null,
        error: null,
        attempt_count: 0,
        created_at: new Date(),
        processed_at: null,
        updated_at: new Date()
      };

      const mockFirst = jest.fn().mockResolvedValue(mockRefund);
      const mockWhere = jest.fn().mockReturnValue({ first: mockFirst });
      (db as any).mockReturnValue({ where: mockWhere });

      const result = await refundQueue.getRefund('refund-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('refund-123');
      expect(result?.amount).toBe(50.5);
      expect(result?.status).toBe(RefundTransactionStatus.QUEUED);
      expect(mockWhere).toHaveBeenCalledWith({ id: 'refund-123' });
    });

    it('should return null for non-existent refund', async () => {
      const mockFirst = jest.fn().mockResolvedValue(null);
      const mockWhere = jest.fn().mockReturnValue({ first: mockFirst });
      (db as any).mockReturnValue({ where: mockWhere });

      const result = await refundQueue.getRefund('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getRefundsByOrder', () => {
    it('should retrieve all refunds for an order', async () => {
      const mockRefunds = [
        {
          id: 'refund-1',
          order_id: 'order-123',
          subscription_id: 'subscription-456',
          buyer_id: 'buyer-789',
          to_address: '0x1234567890abcdef',
          amount: '50.5',
          currency: 'USDT_BEP20',
          status: RefundTransactionStatus.COMPLETED,
          transaction_hash: '0xabc123',
          error: null,
          attempt_count: 1,
          created_at: new Date(),
          processed_at: new Date(),
          updated_at: new Date()
        }
      ];

      const mockOrderBy = jest.fn().mockResolvedValue(mockRefunds);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      (db as any).mockReturnValue({ where: mockWhere });

      const result = await refundQueue.getRefundsByOrder('order-123');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('refund-1');
      expect(result[0].status).toBe(RefundTransactionStatus.COMPLETED);
      expect(mockWhere).toHaveBeenCalledWith({ order_id: 'order-123' });
    });
  });

  describe('getRefundsByStatus', () => {
    it('should retrieve refunds by status', async () => {
      const mockRefunds = [
        {
          id: 'refund-1',
          order_id: 'order-123',
          subscription_id: 'subscription-456',
          buyer_id: 'buyer-789',
          to_address: '0x1234567890abcdef',
          amount: '50.5',
          currency: 'USDT_BEP20',
          status: RefundTransactionStatus.QUEUED,
          transaction_hash: null,
          error: null,
          attempt_count: 0,
          created_at: new Date(),
          processed_at: null,
          updated_at: new Date()
        }
      ];

      const mockOrderBy = jest.fn().mockResolvedValue(mockRefunds);
      const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
      (db as any).mockReturnValue({ where: mockWhere });

      const result = await refundQueue.getRefundsByStatus(RefundTransactionStatus.QUEUED);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(RefundTransactionStatus.QUEUED);
      expect(mockWhere).toHaveBeenCalledWith({ status: RefundTransactionStatus.QUEUED });
    });
  });

  describe('updateRefundStatus', () => {
    it('should update refund status to completed with transaction hash', async () => {
      const mockUpdate = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ update: mockUpdate });
      (db as any).mockReturnValue({ where: mockWhere });

      await refundQueue.updateRefundStatus(
        'refund-123',
        RefundTransactionStatus.COMPLETED,
        '0xabc123def456'
      );

      expect(mockWhere).toHaveBeenCalledWith({ id: 'refund-123' });
      expect(mockUpdate).toHaveBeenCalled();
      
      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.status).toBe(RefundTransactionStatus.COMPLETED);
      expect(updateCall.transaction_hash).toBe('0xabc123def456');
      expect(updateCall.processed_at).toBeDefined();
    });

    it('should update refund status to failed with error message', async () => {
      const mockUpdate = jest.fn().mockResolvedValue([]);
      const mockWhere = jest.fn().mockReturnValue({ update: mockUpdate });
      (db as any).mockReturnValue({ where: mockWhere });

      await refundQueue.updateRefundStatus(
        'refund-123',
        RefundTransactionStatus.FAILED,
        undefined,
        'Insufficient funds in hot wallet'
      );

      expect(mockWhere).toHaveBeenCalledWith({ id: 'refund-123' });
      expect(mockUpdate).toHaveBeenCalled();
      
      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.status).toBe(RefundTransactionStatus.FAILED);
      expect(updateCall.error).toBe('Insufficient funds in hot wallet');
      expect(updateCall.processed_at).toBeDefined();
    });
  });

  describe('incrementAttemptCount', () => {
    it('should increment refund attempt count', async () => {
      const mockUpdate = jest.fn().mockResolvedValue([]);
      const mockIncrement = jest.fn().mockReturnValue({ update: mockUpdate });
      const mockWhere = jest.fn().mockReturnValue({ increment: mockIncrement });
      (db as any).mockReturnValue({ where: mockWhere });

      await refundQueue.incrementAttemptCount('refund-123');

      expect(mockWhere).toHaveBeenCalledWith({ id: 'refund-123' });
      expect(mockIncrement).toHaveBeenCalledWith('attempt_count', 1);
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe('isConfigured', () => {
    it('should return true when queue URL is configured', () => {
      expect(refundQueue.isConfigured()).toBe(true);
    });

    it('should return false when queue URL is not configured', () => {
      const queueWithoutUrl = new RefundTransactionQueue('');
      expect(queueWithoutUrl.isConfigured()).toBe(false);
    });
  });

  describe('getQueueUrl', () => {
    it('should return the configured queue URL', () => {
      expect(refundQueue.getQueueUrl()).toBe(mockQueueUrl);
    });
  });
});
