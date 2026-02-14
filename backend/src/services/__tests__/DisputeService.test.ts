/**
 * Dispute Service Unit Tests
 * 
 * Tests dispute creation, validation, status updates, and resolution.
 */

import { DisputeService } from '../DisputeService';
import { DisputeRepository } from '../../database/repositories/DisputeRepository';
import { OrderRepository } from '../../database/repositories/OrderRepository';
import { SubscriptionRepository } from '../../database/repositories/SubscriptionRepository';
import { escrowService } from '../EscrowService';
import { botQueueProducer } from '../BotQueueProducer';
import { refundTransactionQueue } from '../RefundTransactionQueue';
import {
  DisputeStatus,
  OrderStatus,
  SubscriptionStatus,
  CreateDisputeRequest,
  ResolveDisputeRequest
} from '../../types/models';

// Mock dependencies
jest.mock('../../database/repositories/DisputeRepository');
jest.mock('../../database/repositories/OrderRepository');
jest.mock('../../database/repositories/SubscriptionRepository');
jest.mock('../EscrowService');
jest.mock('../BotQueueProducer');
jest.mock('../RefundTransactionQueue');

describe('DisputeService', () => {
  let disputeService: DisputeService;
  let mockDisputeRepository: jest.Mocked<DisputeRepository>;
  let mockOrderRepository: jest.Mocked<OrderRepository>;
  let mockSubscriptionRepository: jest.Mocked<SubscriptionRepository>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create service instance
    disputeService = new DisputeService();

    // Get mocked repositories
    mockDisputeRepository = DisputeRepository.prototype as jest.Mocked<DisputeRepository>;
    mockOrderRepository = OrderRepository.prototype as jest.Mocked<OrderRepository>;
    mockSubscriptionRepository = SubscriptionRepository.prototype as jest.Mocked<SubscriptionRepository>;
  });

  describe('validateDisputeTimeWindow', () => {
    it('should allow dispute for active subscription', async () => {
      const orderId = 'order-123';
      const subscription = {
        id: 'sub-123',
        orderId,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        expiryDate: new Date('2024-02-01'),
        durationDays: 31
      };

      mockSubscriptionRepository.findByOrderId.mockResolvedValue(subscription as any);

      const result = await disputeService.validateDisputeTimeWindow(orderId);

      expect(result.isValid).toBe(true);
      expect(result.subscriptionStatus).toBe(SubscriptionStatus.ACTIVE);
      expect(mockSubscriptionRepository.findByOrderId).toHaveBeenCalledWith(orderId);
    });

    it('should allow dispute for subscription ended within 7 days', async () => {
      const orderId = 'order-123';
      const now = new Date();
      const expiryDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
      
      const subscription = {
        id: 'sub-123',
        orderId,
        status: SubscriptionStatus.EXPIRED,
        startDate: new Date(expiryDate.getTime() - 30 * 24 * 60 * 60 * 1000),
        expiryDate,
        durationDays: 30
      };

      mockSubscriptionRepository.findByOrderId.mockResolvedValue(subscription as any);

      const result = await disputeService.validateDisputeTimeWindow(orderId);

      expect(result.isValid).toBe(true);
      expect(result.subscriptionStatus).toBe(SubscriptionStatus.EXPIRED);
      expect(result.daysAfterExpiry).toBe(5);
    });

    it('should reject dispute for subscription ended more than 7 days ago', async () => {
      const orderId = 'order-123';
      const now = new Date();
      const expiryDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      
      const subscription = {
        id: 'sub-123',
        orderId,
        status: SubscriptionStatus.EXPIRED,
        startDate: new Date(expiryDate.getTime() - 30 * 24 * 60 * 60 * 1000),
        expiryDate,
        durationDays: 30
      };

      mockSubscriptionRepository.findByOrderId.mockResolvedValue(subscription as any);

      const result = await disputeService.validateDisputeTimeWindow(orderId);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Dispute time window expired');
      expect(result.daysAfterExpiry).toBe(10);
    });

    it('should reject dispute for refunded subscription', async () => {
      const orderId = 'order-123';
      const subscription = {
        id: 'sub-123',
        orderId,
        status: SubscriptionStatus.REFUNDED,
        startDate: new Date('2024-01-01'),
        expiryDate: new Date('2024-02-01'),
        durationDays: 31
      };

      mockSubscriptionRepository.findByOrderId.mockResolvedValue(subscription as any);

      const result = await disputeService.validateDisputeTimeWindow(orderId);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Cannot create dispute for subscription with status');
    });

    it('should reject dispute when no subscription exists', async () => {
      const orderId = 'order-123';

      mockSubscriptionRepository.findByOrderId.mockResolvedValue(null);

      const result = await disputeService.validateDisputeTimeWindow(orderId);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('No subscription found for this order');
    });
  });

  describe('createDispute', () => {
    const buyerId = 'buyer-123';
    const orderId = 'order-123';
    const request: CreateDisputeRequest = {
      orderId,
      issue: 'Channel is not posting signals as advertised'
    };

    it('should create dispute with valid data', async () => {
      const order = {
        id: orderId,
        buyerId,
        status: OrderStatus.SUBSCRIPTION_ACTIVE,
        listingId: 'listing-123'
      };

      const subscription = {
        id: 'sub-123',
        orderId,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        expiryDate: new Date('2024-02-01'),
        durationDays: 31
      };

      const createdDispute = {
        id: 'dispute-123',
        buyerId,
        orderId,
        issue: request.issue,
        status: DisputeStatus.OPEN,
        createdAt: new Date()
      };

      mockOrderRepository.findById.mockResolvedValue(order as any);
      mockSubscriptionRepository.findByOrderId.mockResolvedValue(subscription as any);
      mockDisputeRepository.hasDisputeForOrder.mockResolvedValue(false);
      mockDisputeRepository.create.mockResolvedValue(createdDispute as any);

      const result = await disputeService.createDispute(buyerId, request);

      expect(result.dispute).toEqual(createdDispute);
      expect(result.withinTimeWindow).toBe(true);
      expect(mockDisputeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          buyerId,
          orderId,
          issue: request.issue,
          status: DisputeStatus.OPEN
        })
      );
    });

    it('should reject dispute for non-existent order', async () => {
      mockOrderRepository.findById.mockResolvedValue(null);

      await expect(
        disputeService.createDispute(buyerId, request)
      ).rejects.toThrow('Order not found');
    });

    it('should reject dispute for order not owned by buyer', async () => {
      const order = {
        id: orderId,
        buyerId: 'different-buyer',
        status: OrderStatus.SUBSCRIPTION_ACTIVE
      };

      mockOrderRepository.findById.mockResolvedValue(order as any);

      await expect(
        disputeService.createDispute(buyerId, request)
      ).rejects.toThrow('Buyer does not own this order');
    });

    it('should reject dispute for unpaid order', async () => {
      const order = {
        id: orderId,
        buyerId,
        status: OrderStatus.PENDING_PAYMENT
      };

      mockOrderRepository.findById.mockResolvedValue(order as any);

      await expect(
        disputeService.createDispute(buyerId, request)
      ).rejects.toThrow('Cannot create dispute for unpaid or expired order');
    });

    it('should reject dispute outside time window', async () => {
      const order = {
        id: orderId,
        buyerId,
        status: OrderStatus.SUBSCRIPTION_ACTIVE
      };

      const now = new Date();
      const expiryDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      
      const subscription = {
        id: 'sub-123',
        orderId,
        status: SubscriptionStatus.EXPIRED,
        startDate: new Date(expiryDate.getTime() - 30 * 24 * 60 * 60 * 1000),
        expiryDate,
        durationDays: 30
      };

      mockOrderRepository.findById.mockResolvedValue(order as any);
      mockSubscriptionRepository.findByOrderId.mockResolvedValue(subscription as any);

      await expect(
        disputeService.createDispute(buyerId, request)
      ).rejects.toThrow('Dispute time window expired');
    });

    it('should reject dispute when one already exists', async () => {
      const order = {
        id: orderId,
        buyerId,
        status: OrderStatus.SUBSCRIPTION_ACTIVE
      };

      const subscription = {
        id: 'sub-123',
        orderId,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        expiryDate: new Date('2024-02-01'),
        durationDays: 31
      };

      mockOrderRepository.findById.mockResolvedValue(order as any);
      mockSubscriptionRepository.findByOrderId.mockResolvedValue(subscription as any);
      mockDisputeRepository.hasDisputeForOrder.mockResolvedValue(true);

      await expect(
        disputeService.createDispute(buyerId, request)
      ).rejects.toThrow('An open dispute already exists for this order');
    });

    it('should reject dispute with empty issue', async () => {
      const order = {
        id: orderId,
        buyerId,
        status: OrderStatus.SUBSCRIPTION_ACTIVE
      };

      const subscription = {
        id: 'sub-123',
        orderId,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        expiryDate: new Date('2024-02-01'),
        durationDays: 31
      };

      mockOrderRepository.findById.mockResolvedValue(order as any);
      mockSubscriptionRepository.findByOrderId.mockResolvedValue(subscription as any);
      mockDisputeRepository.hasDisputeForOrder.mockResolvedValue(false);

      await expect(
        disputeService.createDispute(buyerId, { orderId, issue: '   ' })
      ).rejects.toThrow('Issue description is required');
    });

    it('should reject dispute with issue too long', async () => {
      const order = {
        id: orderId,
        buyerId,
        status: OrderStatus.SUBSCRIPTION_ACTIVE
      };

      const subscription = {
        id: 'sub-123',
        orderId,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        expiryDate: new Date('2024-02-01'),
        durationDays: 31
      };

      mockOrderRepository.findById.mockResolvedValue(order as any);
      mockSubscriptionRepository.findByOrderId.mockResolvedValue(subscription as any);
      mockDisputeRepository.hasDisputeForOrder.mockResolvedValue(false);

      const longIssue = 'a'.repeat(2001);

      await expect(
        disputeService.createDispute(buyerId, { orderId, issue: longIssue })
      ).rejects.toThrow('Issue description must be 2000 characters or less');
    });
  });

  describe('updateDisputeStatus', () => {
    it('should update status from OPEN to IN_PROGRESS', async () => {
      const disputeId = 'dispute-123';
      const adminId = 'admin-123';
      
      const currentDispute = {
        id: disputeId,
        status: DisputeStatus.OPEN
      };

      const updatedDispute = {
        ...currentDispute,
        status: DisputeStatus.IN_PROGRESS,
        adminId
      };

      mockDisputeRepository.findById.mockResolvedValue(currentDispute as any);
      mockDisputeRepository.assignToAdmin.mockResolvedValue(updatedDispute as any);

      const result = await disputeService.updateDisputeStatus(
        disputeId,
        DisputeStatus.IN_PROGRESS,
        adminId
      );

      expect(result.status).toBe(DisputeStatus.IN_PROGRESS);
      expect(mockDisputeRepository.assignToAdmin).toHaveBeenCalledWith(disputeId, adminId);
    });

    it('should update status from IN_PROGRESS to RESOLVED', async () => {
      const disputeId = 'dispute-123';
      
      const currentDispute = {
        id: disputeId,
        status: DisputeStatus.IN_PROGRESS
      };

      const updatedDispute = {
        ...currentDispute,
        status: DisputeStatus.RESOLVED
      };

      mockDisputeRepository.findById.mockResolvedValue(currentDispute as any);
      mockDisputeRepository.updateStatus.mockResolvedValue(updatedDispute as any);

      const result = await disputeService.updateDisputeStatus(
        disputeId,
        DisputeStatus.RESOLVED
      );

      expect(result.status).toBe(DisputeStatus.RESOLVED);
      expect(mockDisputeRepository.updateStatus).toHaveBeenCalledWith(
        disputeId,
        DisputeStatus.RESOLVED
      );
    });

    it('should reject transition from RESOLVED', async () => {
      const disputeId = 'dispute-123';
      
      const currentDispute = {
        id: disputeId,
        status: DisputeStatus.RESOLVED
      };

      mockDisputeRepository.findById.mockResolvedValue(currentDispute as any);

      await expect(
        disputeService.updateDisputeStatus(disputeId, DisputeStatus.CLOSED)
      ).rejects.toThrow('Cannot transition from resolved status');
    });

    it('should reject invalid transition', async () => {
      const disputeId = 'dispute-123';
      
      const currentDispute = {
        id: disputeId,
        status: DisputeStatus.OPEN
      };

      mockDisputeRepository.findById.mockResolvedValue(currentDispute as any);

      // Can't go from OPEN to OPEN
      await expect(
        disputeService.updateDisputeStatus(disputeId, DisputeStatus.OPEN)
      ).rejects.toThrow('Dispute is already in open status');
    });
  });

  describe('resolveDispute', () => {
    const disputeId = 'dispute-123';
    const adminId = 'admin-123';
    const orderId = 'order-123';
    const subscriptionId = 'sub-123';

    it('should resolve dispute with refund approval', async () => {
      const disputeWithRelations = {
        id: disputeId,
        buyerId: 'buyer-123',
        orderId,
        status: DisputeStatus.IN_PROGRESS,
        buyer: {
          id: 'buyer-123',
          telegramUserId: 123456789
        }
      };

      const order = {
        id: orderId,
        depositAddress: '0x1234567890abcdef',
        currency: 'USDT_BEP20',
        amount: 100
      };

      const subscription = {
        id: subscriptionId,
        orderId,
        channelId: 'channel-123',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        expiryDate: new Date('2024-02-01'),
        durationDays: 31
      };

      const refundCalculation = {
        totalAmount: 100,
        usedDays: 10,
        unusedDays: 21,
        totalDays: 31,
        refundAmount: 67.74,
        refundPercentage: 0.6774
      };

      const resolvedDispute = {
        ...disputeWithRelations,
        status: DisputeStatus.RESOLVED,
        resolution: 'Refund approved',
        adminId
      };

      const request: ResolveDisputeRequest = {
        resolution: 'Refund approved',
        approveRefund: true
      };

      mockDisputeRepository.findByIdWithRelations.mockResolvedValue(disputeWithRelations as any);
      mockOrderRepository.findById.mockResolvedValue(order as any);
      mockSubscriptionRepository.findByOrderId.mockResolvedValue(subscription as any);
      mockDisputeRepository.resolve.mockResolvedValue(resolvedDispute as any);
      
      (escrowService.refundEscrow as jest.Mock).mockResolvedValue(refundCalculation);
      (refundTransactionQueue.queueRefund as jest.Mock).mockResolvedValue({
        refundId: 'refund-123',
        messageId: 'msg-456',
        queued: true
      });
      mockSubscriptionRepository.updateStatus.mockResolvedValue(subscription as any);
      mockOrderRepository.updateStatus.mockResolvedValue({} as any);
      (botQueueProducer.enqueueRemoveUser as jest.Mock).mockResolvedValue('msg-123');

      const result = await disputeService.resolveDispute(disputeId, adminId, request);

      expect(result.dispute.status).toBe(DisputeStatus.RESOLVED);
      expect(result.refundProcessed).toBe(true);
      expect(result.refundAmount).toBe(67.74);
      expect(result.refundTransactionQueued).toBeDefined();
      expect(result.refundTransactionId).toBeDefined();
      expect(result.botOperationQueued).toBe(true);

      expect(escrowService.refundEscrow).toHaveBeenCalledWith(subscriptionId);
      expect(mockSubscriptionRepository.updateStatus).toHaveBeenCalledWith(
        subscriptionId,
        SubscriptionStatus.REFUNDED
      );
      expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith(
        orderId,
        OrderStatus.REFUNDED
      );
      expect(botQueueProducer.enqueueRemoveUser).toHaveBeenCalledWith(
        123456789,
        'channel-123',
        subscriptionId,
        'refund'
      );
    });

    it('should resolve dispute without refund', async () => {
      const disputeWithRelations = {
        id: disputeId,
        buyerId: 'buyer-123',
        orderId,
        status: DisputeStatus.IN_PROGRESS
      };

      const resolvedDispute = {
        ...disputeWithRelations,
        status: DisputeStatus.RESOLVED,
        resolution: 'Dispute denied - service was provided as described',
        adminId
      };

      const request: ResolveDisputeRequest = {
        resolution: 'Dispute denied - service was provided as described',
        approveRefund: false
      };

      mockDisputeRepository.findByIdWithRelations.mockResolvedValue(disputeWithRelations as any);
      mockDisputeRepository.resolve.mockResolvedValue(resolvedDispute as any);

      const result = await disputeService.resolveDispute(disputeId, adminId, request);

      expect(result.dispute.status).toBe(DisputeStatus.RESOLVED);
      expect(result.refundProcessed).toBe(false);
      expect(result.refundAmount).toBeUndefined();
      expect(result.botOperationQueued).toBe(false);

      expect(escrowService.refundEscrow).not.toHaveBeenCalled();
    });

    it('should reject resolution of already resolved dispute', async () => {
      const disputeWithRelations = {
        id: disputeId,
        status: DisputeStatus.RESOLVED
      };

      mockDisputeRepository.findByIdWithRelations.mockResolvedValue(disputeWithRelations as any);

      const request: ResolveDisputeRequest = {
        resolution: 'Test',
        approveRefund: false
      };

      await expect(
        disputeService.resolveDispute(disputeId, adminId, request)
      ).rejects.toThrow('Dispute already resolved');
    });

    it('should reject resolution with empty resolution text', async () => {
      const disputeWithRelations = {
        id: disputeId,
        status: DisputeStatus.IN_PROGRESS
      };

      mockDisputeRepository.findByIdWithRelations.mockResolvedValue(disputeWithRelations as any);

      const request: ResolveDisputeRequest = {
        resolution: '   ',
        approveRefund: false
      };

      await expect(
        disputeService.resolveDispute(disputeId, adminId, request)
      ).rejects.toThrow('Resolution description is required');
    });
  });

  describe('getDispute methods', () => {
    it('should get dispute by ID', async () => {
      const dispute = {
        id: 'dispute-123',
        status: DisputeStatus.OPEN
      };

      mockDisputeRepository.findById.mockResolvedValue(dispute as any);

      const result = await disputeService.getDispute('dispute-123');

      expect(result).toEqual(dispute);
      expect(mockDisputeRepository.findById).toHaveBeenCalledWith('dispute-123');
    });

    it('should get disputes by buyer', async () => {
      const disputes = [
        { id: 'dispute-1', buyerId: 'buyer-123' },
        { id: 'dispute-2', buyerId: 'buyer-123' }
      ];

      mockDisputeRepository.findByBuyerId.mockResolvedValue(disputes as any);

      const result = await disputeService.getDisputesByBuyer('buyer-123');

      expect(result).toEqual(disputes);
      expect(mockDisputeRepository.findByBuyerId).toHaveBeenCalledWith('buyer-123');
    });

    it('should get open disputes', async () => {
      const disputes = [
        { id: 'dispute-1', status: DisputeStatus.OPEN },
        { id: 'dispute-2', status: DisputeStatus.OPEN }
      ];

      mockDisputeRepository.findOpen.mockResolvedValue(disputes as any);

      const result = await disputeService.getOpenDisputes();

      expect(result).toEqual(disputes);
      expect(mockDisputeRepository.findOpen).toHaveBeenCalled();
    });

    it('should count open disputes', async () => {
      mockDisputeRepository.countOpen.mockResolvedValue(5);

      const result = await disputeService.countOpenDisputes();

      expect(result).toBe(5);
      expect(mockDisputeRepository.countOpen).toHaveBeenCalled();
    });
  });

  describe('getDisputeTimeWindowDays', () => {
    it('should return 7 days', () => {
      expect(DisputeService.getDisputeTimeWindowDays()).toBe(7);
    });
  });
});
