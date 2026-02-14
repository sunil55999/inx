/**
 * Subscription Service Tests
 * 
 * Tests subscription creation, activation, and lifecycle management.
 * 
 * Requirements: 2.2, 2.4, 3.5, 12.3, 12.4
 */

import { SubscriptionService } from '../SubscriptionService';
import { SubscriptionRepository } from '../../database/repositories/SubscriptionRepository';
import { OrderRepository } from '../../database/repositories/OrderRepository';
import { ListingRepository } from '../../database/repositories/ListingRepository';
import { botQueueProducer } from '../BotQueueProducer';
import {
  Order,
  OrderStatus,
  Listing,
  Subscription,
  SubscriptionStatus,
  CryptoCurrency
} from '../../types/models';

// Mock dependencies
jest.mock('../../database/repositories/SubscriptionRepository');
jest.mock('../../database/repositories/OrderRepository');
jest.mock('../../database/repositories/ListingRepository');
jest.mock('../BotQueueProducer');
jest.mock('../../database/connection', () => ({
  default: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    first: jest.fn()
  }))
}));

// Mock OrderService
const mockOrderService = {
  createOrder: jest.fn()
};

jest.mock('../OrderService', () => ({
  orderService: mockOrderService
}));

describe('SubscriptionService', () => {
  let subscriptionService: SubscriptionService;
  let mockSubscriptionRepo: jest.Mocked<SubscriptionRepository>;
  let mockOrderRepo: jest.Mocked<OrderRepository>;
  let mockListingRepo: jest.Mocked<ListingRepository>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup repository mocks before creating service
    mockSubscriptionRepo = {
      findById: jest.fn(),
      findByOrderId: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn(),
      findExpiredNeedingProcessing: jest.fn(),
      hasActiveSubscription: jest.fn(),
      count: jest.fn(),
      countByStatus: jest.fn()
    } as any;

    mockOrderRepo = {
      findById: jest.fn(),
      updateStatus: jest.fn()
    } as any;

    mockListingRepo = {
      findById: jest.fn()
    } as any;

    // Mock the repository constructors
    (SubscriptionRepository as jest.Mock).mockImplementation(() => mockSubscriptionRepo);
    (OrderRepository as jest.Mock).mockImplementation(() => mockOrderRepo);
    (ListingRepository as jest.Mock).mockImplementation(() => mockListingRepo);

    // Create service instance
    subscriptionService = new SubscriptionService();
  });

  describe('createSubscriptionFromOrder', () => {
    const mockOrder: Order = {
      id: 'order-123',
      buyerId: 'buyer-456',
      listingId: 'listing-789',
      depositAddress: '0xabc123',
      amount: 100,
      currency: 'USDT_BEP20' as CryptoCurrency,
      status: OrderStatus.PAYMENT_CONFIRMED,
      confirmations: 12,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      paidAt: new Date()
    };

    const mockListing: Listing = {
      id: 'listing-789',
      merchantId: 'merchant-001',
      channelId: 'channel-999',
      description: 'Test channel',
      price: 100,
      currency: 'USDT_BEP20' as CryptoCurrency,
      durationDays: 30,
      status: 'active' as any, // Use 'as any' to bypass type checking for test
      signalTypes: ['crypto'],
      viewCount: 0,
      purchaseCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should create subscription from confirmed order', async () => {
      // Setup mocks
      mockOrderRepo.findById = jest.fn().mockResolvedValue(mockOrder);
      mockSubscriptionRepo.findByOrderId = jest.fn().mockResolvedValue(null);
      mockListingRepo.findById = jest.fn().mockResolvedValue(mockListing);
      
      const mockSubscription: Subscription = {
        id: 'sub-123',
        buyerId: mockOrder.buyerId,
        listingId: mockListing.id,
        orderId: mockOrder.id,
        channelId: mockListing.channelId,
        status: SubscriptionStatus.PENDING_ACTIVATION,
        startDate: new Date(),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        durationDays: 30,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSubscriptionRepo.create = jest.fn().mockResolvedValue(mockSubscription);
      mockOrderRepo.updateStatus = jest.fn().mockResolvedValue(mockOrder);

      // Mock database query for Telegram user ID
      const db = require('../../database/connection').default;
      db.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ telegram_user_id: 123456 })
      });

      // Mock bot queue producer
      (botQueueProducer.enqueueInviteUser as jest.Mock).mockResolvedValue('msg-123');

      // Execute
      const result = await subscriptionService.createSubscriptionFromOrder(mockOrder.id);

      // Verify
      expect(result.subscription).toBeDefined();
      expect(result.subscription.buyerId).toBe(mockOrder.buyerId);
      expect(result.subscription.listingId).toBe(mockListing.id);
      expect(result.subscription.orderId).toBe(mockOrder.id);
      expect(result.subscription.channelId).toBe(mockListing.channelId);
      expect(result.subscription.status).toBe(SubscriptionStatus.PENDING_ACTIVATION);
      expect(result.subscription.durationDays).toBe(30);
      expect(result.botOperationQueued).toBe(true);
      expect(result.botOperationMessageId).toBe('msg-123');

      // Verify order status updated
      expect(mockOrderRepo.updateStatus).toHaveBeenCalledWith(
        mockOrder.id,
        'subscription_active'
      );

      // Verify bot operation queued
      expect(botQueueProducer.enqueueInviteUser).toHaveBeenCalledWith(
        123456,
        mockListing.channelId,
        expect.any(String),
        mockOrder.id
      );
    });

    it('should reject order with non-confirmed status', async () => {
      const pendingOrder = { ...mockOrder, status: OrderStatus.PENDING_PAYMENT };
      mockOrderRepo.findById = jest.fn().mockResolvedValue(pendingOrder);

      await expect(
        subscriptionService.createSubscriptionFromOrder(pendingOrder.id)
      ).rejects.toThrow('Cannot create subscription for order with status: pending_payment');
    });

    it('should return existing subscription if already created', async () => {
      const existingSubscription: Subscription = {
        id: 'sub-existing',
        buyerId: mockOrder.buyerId,
        listingId: mockListing.id,
        orderId: mockOrder.id,
        channelId: mockListing.channelId,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        durationDays: 30,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockOrderRepo.findById = jest.fn().mockResolvedValue(mockOrder);
      mockSubscriptionRepo.findByOrderId = jest.fn().mockResolvedValue(existingSubscription);

      const result = await subscriptionService.createSubscriptionFromOrder(mockOrder.id);

      expect(result.subscription).toEqual(existingSubscription);
      expect(result.botOperationQueued).toBe(false);
      expect(mockSubscriptionRepo.create).not.toHaveBeenCalled();
    });

    it('should throw error if order not found', async () => {
      mockOrderRepo.findById = jest.fn().mockResolvedValue(null);

      await expect(
        subscriptionService.createSubscriptionFromOrder('nonexistent')
      ).rejects.toThrow('Order not found: nonexistent');
    });

    it('should throw error if listing not found', async () => {
      mockOrderRepo.findById = jest.fn().mockResolvedValue(mockOrder);
      mockSubscriptionRepo.findByOrderId = jest.fn().mockResolvedValue(null);
      mockListingRepo.findById = jest.fn().mockResolvedValue(null);

      await expect(
        subscriptionService.createSubscriptionFromOrder(mockOrder.id)
      ).rejects.toThrow(`Listing not found: ${mockOrder.listingId}`);
    });

    it('should calculate correct expiry date', async () => {
      mockOrderRepo.findById = jest.fn().mockResolvedValue(mockOrder);
      mockSubscriptionRepo.findByOrderId = jest.fn().mockResolvedValue(null);
      mockListingRepo.findById = jest.fn().mockResolvedValue(mockListing);

      let capturedSubscription: Subscription | undefined;
      mockSubscriptionRepo.create = jest.fn().mockImplementation((sub: Subscription) => {
        capturedSubscription = sub;
        return Promise.resolve(sub);
      });

      mockOrderRepo.updateStatus = jest.fn().mockResolvedValue(mockOrder);

      const db = require('../../database/connection').default;
      db.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ telegram_user_id: null })
      });

      await subscriptionService.createSubscriptionFromOrder(mockOrder.id);

      expect(capturedSubscription).toBeDefined();
      if (capturedSubscription) {
        const expectedDuration = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
        const actualDuration = capturedSubscription.expiryDate.getTime() - 
                              capturedSubscription.startDate.getTime();
        
        // Allow 1 second tolerance for test execution time
        expect(Math.abs(actualDuration - expectedDuration)).toBeLessThan(1000);
      }
    });

    it('should handle bot queue failure gracefully', async () => {
      mockOrderRepo.findById = jest.fn().mockResolvedValue(mockOrder);
      mockSubscriptionRepo.findByOrderId = jest.fn().mockResolvedValue(null);
      mockListingRepo.findById = jest.fn().mockResolvedValue(mockListing);

      const mockSubscription: Subscription = {
        id: 'sub-123',
        buyerId: mockOrder.buyerId,
        listingId: mockListing.id,
        orderId: mockOrder.id,
        channelId: mockListing.channelId,
        status: SubscriptionStatus.PENDING_ACTIVATION,
        startDate: new Date(),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        durationDays: 30,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSubscriptionRepo.create = jest.fn().mockResolvedValue(mockSubscription);
      mockOrderRepo.updateStatus = jest.fn().mockResolvedValue(mockOrder);

      const db = require('../../database/connection').default;
      db.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ telegram_user_id: 123456 })
      });

      // Mock bot queue failure
      (botQueueProducer.enqueueInviteUser as jest.Mock).mockResolvedValue(null);

      const result = await subscriptionService.createSubscriptionFromOrder(mockOrder.id);

      // Subscription should still be created
      expect(result.subscription).toBeDefined();
      expect(result.botOperationQueued).toBe(false);
      expect(result.botOperationMessageId).toBeUndefined();
    });

    it('should handle missing Telegram user ID', async () => {
      mockOrderRepo.findById = jest.fn().mockResolvedValue(mockOrder);
      mockSubscriptionRepo.findByOrderId = jest.fn().mockResolvedValue(null);
      mockListingRepo.findById = jest.fn().mockResolvedValue(mockListing);

      const mockSubscription: Subscription = {
        id: 'sub-123',
        buyerId: mockOrder.buyerId,
        listingId: mockListing.id,
        orderId: mockOrder.id,
        channelId: mockListing.channelId,
        status: SubscriptionStatus.PENDING_ACTIVATION,
        startDate: new Date(),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        durationDays: 30,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSubscriptionRepo.create = jest.fn().mockResolvedValue(mockSubscription);
      mockOrderRepo.updateStatus = jest.fn().mockResolvedValue(mockOrder);

      const db = require('../../database/connection').default;
      db.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ telegram_user_id: null })
      });

      const result = await subscriptionService.createSubscriptionFromOrder(mockOrder.id);

      // Subscription should still be created
      expect(result.subscription).toBeDefined();
      expect(result.botOperationQueued).toBe(false);
      
      // Bot operation should not be queued
      expect(botQueueProducer.enqueueInviteUser).not.toHaveBeenCalled();
    });
  });

  describe('updateSubscriptionStatus', () => {
    it('should update subscription status', async () => {
      const mockSubscription: Subscription = {
        id: 'sub-123',
        buyerId: 'buyer-456',
        listingId: 'listing-789',
        orderId: 'order-123',
        channelId: 'channel-999',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        durationDays: 30,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSubscriptionRepo.updateStatus = jest.fn().mockResolvedValue(mockSubscription);

      const result = await subscriptionService.updateSubscriptionStatus(
        'sub-123',
        SubscriptionStatus.ACTIVE
      );

      expect(result).toEqual(mockSubscription);
      expect(mockSubscriptionRepo.updateStatus).toHaveBeenCalledWith(
        'sub-123',
        SubscriptionStatus.ACTIVE
      );
    });

    it('should throw error if subscription not found', async () => {
      mockSubscriptionRepo.updateStatus = jest.fn().mockResolvedValue(null);

      await expect(
        subscriptionService.updateSubscriptionStatus('nonexistent', SubscriptionStatus.ACTIVE)
      ).rejects.toThrow('Subscription not found: nonexistent');
    });
  });

  describe('activateSubscription', () => {
    it('should activate subscription', async () => {
      const mockSubscription: Subscription = {
        id: 'sub-123',
        buyerId: 'buyer-456',
        listingId: 'listing-789',
        orderId: 'order-123',
        channelId: 'channel-999',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        durationDays: 30,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSubscriptionRepo.updateStatus = jest.fn().mockResolvedValue(mockSubscription);

      const result = await subscriptionService.activateSubscription('sub-123');

      expect(result).toEqual(mockSubscription);
      expect(mockSubscriptionRepo.updateStatus).toHaveBeenCalledWith(
        'sub-123',
        SubscriptionStatus.ACTIVE
      );
    });
  });

  describe('expireSubscription', () => {
    it('should expire subscription and queue bot remove operation', async () => {
      const mockSubscription: Subscription = {
        id: 'sub-123',
        buyerId: 'buyer-456',
        listingId: 'listing-789',
        orderId: 'order-123',
        channelId: 'channel-999',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        expiryDate: new Date(Date.now() - 1000), // Expired
        durationDays: 30,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const expiredSubscription = { ...mockSubscription, status: SubscriptionStatus.EXPIRED };

      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(mockSubscription);
      mockSubscriptionRepo.updateStatus = jest.fn().mockResolvedValue(expiredSubscription);

      const db = require('../../database/connection').default;
      db.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ telegram_user_id: 123456 })
      });

      (botQueueProducer.enqueueRemoveUser as jest.Mock).mockResolvedValue('msg-456');

      const result = await subscriptionService.expireSubscription('sub-123');

      expect(result).toEqual(expiredSubscription);
      expect(mockSubscriptionRepo.updateStatus).toHaveBeenCalledWith(
        'sub-123',
        SubscriptionStatus.EXPIRED
      );
      expect(botQueueProducer.enqueueRemoveUser).toHaveBeenCalledWith(
        123456,
        mockSubscription.channelId,
        'sub-123',
        'expiry'
      );
    });

    it('should handle bot queue failure gracefully', async () => {
      const mockSubscription: Subscription = {
        id: 'sub-123',
        buyerId: 'buyer-456',
        listingId: 'listing-789',
        orderId: 'order-123',
        channelId: 'channel-999',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        expiryDate: new Date(Date.now() - 1000),
        durationDays: 30,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const expiredSubscription = { ...mockSubscription, status: SubscriptionStatus.EXPIRED };

      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(mockSubscription);
      mockSubscriptionRepo.updateStatus = jest.fn().mockResolvedValue(expiredSubscription);

      const db = require('../../database/connection').default;
      db.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ telegram_user_id: 123456 })
      });

      (botQueueProducer.enqueueRemoveUser as jest.Mock).mockRejectedValue(
        new Error('Queue error')
      );

      // Should not throw error
      const result = await subscriptionService.expireSubscription('sub-123');

      expect(result).toEqual(expiredSubscription);
    });
  });

  describe('processExpiredSubscriptions', () => {
    it('should process all expired subscriptions', async () => {
      const expiredSubs: Subscription[] = [
        {
          id: 'sub-1',
          buyerId: 'buyer-1',
          listingId: 'listing-1',
          orderId: 'order-1',
          channelId: 'channel-1',
          status: SubscriptionStatus.ACTIVE,
          startDate: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
          expiryDate: new Date(Date.now() - 1000),
          durationDays: 30,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'sub-2',
          buyerId: 'buyer-2',
          listingId: 'listing-2',
          orderId: 'order-2',
          channelId: 'channel-2',
          status: SubscriptionStatus.ACTIVE,
          startDate: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
          expiryDate: new Date(Date.now() - 1000),
          durationDays: 30,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockSubscriptionRepo.findExpiredNeedingProcessing = jest.fn().mockResolvedValue(expiredSubs);
      mockSubscriptionRepo.findById = jest.fn()
        .mockResolvedValueOnce(expiredSubs[0])
        .mockResolvedValueOnce(expiredSubs[1]);
      
      mockSubscriptionRepo.updateStatus = jest.fn()
        .mockResolvedValueOnce({ ...expiredSubs[0], status: SubscriptionStatus.EXPIRED })
        .mockResolvedValueOnce({ ...expiredSubs[1], status: SubscriptionStatus.EXPIRED });

      const db = require('../../database/connection').default;
      db.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ telegram_user_id: 123456 })
      });

      (botQueueProducer.enqueueRemoveUser as jest.Mock).mockResolvedValue('msg-123');

      const count = await subscriptionService.processExpiredSubscriptions();

      expect(count).toBe(2);
      expect(mockSubscriptionRepo.updateStatus).toHaveBeenCalledTimes(2);
    });

    it('should return 0 if no expired subscriptions', async () => {
      mockSubscriptionRepo.findExpiredNeedingProcessing = jest.fn().mockResolvedValue([]);

      const count = await subscriptionService.processExpiredSubscriptions();

      expect(count).toBe(0);
    });

    it('should continue processing if one subscription fails', async () => {
      const expiredSubs: Subscription[] = [
        {
          id: 'sub-1',
          buyerId: 'buyer-1',
          listingId: 'listing-1',
          orderId: 'order-1',
          channelId: 'channel-1',
          status: SubscriptionStatus.ACTIVE,
          startDate: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
          expiryDate: new Date(Date.now() - 1000),
          durationDays: 30,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'sub-2',
          buyerId: 'buyer-2',
          listingId: 'listing-2',
          orderId: 'order-2',
          channelId: 'channel-2',
          status: SubscriptionStatus.ACTIVE,
          startDate: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
          expiryDate: new Date(Date.now() - 1000),
          durationDays: 30,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockSubscriptionRepo.findExpiredNeedingProcessing = jest.fn().mockResolvedValue(expiredSubs);
      mockSubscriptionRepo.findById = jest.fn()
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce(expiredSubs[1]);
      
      mockSubscriptionRepo.updateStatus = jest.fn()
        .mockResolvedValueOnce({ ...expiredSubs[1], status: SubscriptionStatus.EXPIRED });

      const db = require('../../database/connection').default;
      db.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ telegram_user_id: 123456 })
      });

      (botQueueProducer.enqueueRemoveUser as jest.Mock).mockResolvedValue('msg-123');

      const count = await subscriptionService.processExpiredSubscriptions();

      // Should process the second subscription even though first failed
      expect(count).toBe(1);
    });
  });

  describe('hasActiveSubscription', () => {
    it('should return true if buyer has active subscription', async () => {
      mockSubscriptionRepo.hasActiveSubscription = jest.fn().mockResolvedValue(true);

      const result = await subscriptionService.hasActiveSubscription('buyer-123', 'channel-456');

      expect(result).toBe(true);
      expect(mockSubscriptionRepo.hasActiveSubscription).toHaveBeenCalledWith(
        'buyer-123',
        'channel-456'
      );
    });

    it('should return false if buyer has no active subscription', async () => {
      mockSubscriptionRepo.hasActiveSubscription = jest.fn().mockResolvedValue(false);

      const result = await subscriptionService.hasActiveSubscription('buyer-123', 'channel-456');

      expect(result).toBe(false);
    });
  });

  describe('isEligibleForRenewal', () => {
    it('should return true for active subscription within 7 days of expiry', async () => {
      const subscription: Subscription = {
        id: 'sub-123',
        buyerId: 'buyer-456',
        listingId: 'listing-789',
        orderId: 'order-123',
        channelId: 'channel-999',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // Started 25 days ago
        expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // Expires in 5 days
        durationDays: 30,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(subscription);

      const result = await subscriptionService.isEligibleForRenewal('sub-123');

      expect(result).toBe(true);
    });

    it('should return true for subscription expiring exactly in 7 days', async () => {
      const subscription: Subscription = {
        id: 'sub-123',
        buyerId: 'buyer-456',
        listingId: 'listing-789',
        orderId: 'order-123',
        channelId: 'channel-999',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(Date.now() - 23 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Expires in exactly 7 days
        durationDays: 30,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(subscription);

      const result = await subscriptionService.isEligibleForRenewal('sub-123');

      expect(result).toBe(true);
    });

    it('should return false for subscription expiring in more than 7 days', async () => {
      const subscription: Subscription = {
        id: 'sub-123',
        buyerId: 'buyer-456',
        listingId: 'listing-789',
        orderId: 'order-123',
        channelId: 'channel-999',
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // Expires in 10 days
        durationDays: 30,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(subscription);

      const result = await subscriptionService.isEligibleForRenewal('sub-123');

      expect(result).toBe(false);
    });

    it('should return true for already expired subscription', async () => {
      const subscription: Subscription = {
        id: 'sub-123',
        buyerId: 'buyer-456',
        listingId: 'listing-789',
        orderId: 'order-123',
        channelId: 'channel-999',
        status: SubscriptionStatus.EXPIRED,
        startDate: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Expired 1 day ago
        durationDays: 30,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(subscription);

      const result = await subscriptionService.isEligibleForRenewal('sub-123');

      expect(result).toBe(true);
    });

    it('should return false for refunded subscription', async () => {
      const subscription: Subscription = {
        id: 'sub-123',
        buyerId: 'buyer-456',
        listingId: 'listing-789',
        orderId: 'order-123',
        channelId: 'channel-999',
        status: SubscriptionStatus.REFUNDED,
        startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        durationDays: 30,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(subscription);

      const result = await subscriptionService.isEligibleForRenewal('sub-123');

      expect(result).toBe(false);
    });

    it('should return false for cancelled subscription', async () => {
      const subscription: Subscription = {
        id: 'sub-123',
        buyerId: 'buyer-456',
        listingId: 'listing-789',
        orderId: 'order-123',
        channelId: 'channel-999',
        status: SubscriptionStatus.CANCELLED,
        startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        durationDays: 30,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(subscription);

      const result = await subscriptionService.isEligibleForRenewal('sub-123');

      expect(result).toBe(false);
    });

    it('should return false for non-existent subscription', async () => {
      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(null);

      const result = await subscriptionService.isEligibleForRenewal('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('renewSubscription', () => {
    const mockSubscription: Subscription = {
      id: 'sub-123',
      buyerId: 'buyer-456',
      listingId: 'listing-789',
      orderId: 'order-123',
      channelId: 'channel-999',
      status: SubscriptionStatus.ACTIVE,
      startDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // Expires in 5 days
      durationDays: 30,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const mockListing: Listing = {
      id: 'listing-789',
      merchantId: 'merchant-001',
      channelId: 'channel-999',
      description: 'Test channel',
      price: 100,
      currency: 'USDT_BEP20' as CryptoCurrency,
      durationDays: 30,
      status: 'active' as any,
      signalTypes: ['crypto'],
      viewCount: 0,
      purchaseCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const mockOrder = {
      id: 'order-new-123',
      buyerId: 'buyer-456',
      listingId: 'listing-789',
      depositAddress: '0xnewaddress',
      amount: 100,
      currency: 'USDT_BEP20' as CryptoCurrency,
      status: OrderStatus.PENDING_PAYMENT,
      confirmations: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };

    beforeEach(() => {
      // Reset OrderService mock
      mockOrderService.createOrder.mockReset();
    });

    it('should create renewal order for eligible subscription', async () => {
      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(mockSubscription);
      mockListingRepo.findById = jest.fn().mockResolvedValue(mockListing);
      mockOrderService.createOrder.mockResolvedValue(mockOrder);

      const result = await subscriptionService.renewSubscription('sub-123');

      expect(result.eligible).toBe(true);
      expect(result.order).toBeDefined();
      expect(result.order.id).toBe('order-new-123');
      expect(result.order.buyerId).toBe(mockSubscription.buyerId);
      expect(result.order.listingId).toBe(mockListing.id);
      expect(mockOrderService.createOrder).toHaveBeenCalledWith(
        mockSubscription.buyerId,
        mockListing.id
      );
    });

    it('should reject renewal for non-existent subscription', async () => {
      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(null);

      const result = await subscriptionService.renewSubscription('nonexistent');

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Subscription not found');
      expect(result.order).toBeUndefined();
    });

    it('should reject renewal for subscription expiring in more than 7 days', async () => {
      const futureSubscription = {
        ...mockSubscription,
        expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) // Expires in 10 days
      };

      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(futureSubscription);

      const result = await subscriptionService.renewSubscription('sub-123');

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Renewal available within 7 days of expiry');
      expect(result.order).toBeUndefined();
    });

    it('should reject renewal for refunded subscription', async () => {
      const refundedSubscription = {
        ...mockSubscription,
        status: SubscriptionStatus.REFUNDED
      };

      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(refundedSubscription);

      const result = await subscriptionService.renewSubscription('sub-123');

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Subscription has been refunded');
      expect(result.order).toBeUndefined();
    });

    it('should reject renewal for cancelled subscription', async () => {
      const cancelledSubscription = {
        ...mockSubscription,
        status: SubscriptionStatus.CANCELLED
      };

      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(cancelledSubscription);

      const result = await subscriptionService.renewSubscription('sub-123');

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Subscription has been cancelled');
      expect(result.order).toBeUndefined();
    });

    it('should reject renewal if listing no longer exists', async () => {
      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(mockSubscription);
      mockListingRepo.findById = jest.fn().mockResolvedValue(null);

      const result = await subscriptionService.renewSubscription('sub-123');

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Listing no longer exists');
      expect(result.order).toBeUndefined();
    });

    it('should reject renewal if listing is no longer active', async () => {
      const inactiveListing = {
        ...mockListing,
        status: 'inactive' as any
      };

      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(mockSubscription);
      mockListingRepo.findById = jest.fn().mockResolvedValue(inactiveListing);

      const result = await subscriptionService.renewSubscription('sub-123');

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('Listing is no longer active');
      expect(result.order).toBeUndefined();
    });

    it('should allow renewal for expired subscription within reasonable time', async () => {
      const expiredSubscription = {
        ...mockSubscription,
        status: SubscriptionStatus.EXPIRED,
        expiryDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // Expired 1 day ago
      };

      mockSubscriptionRepo.findById = jest.fn().mockResolvedValue(expiredSubscription);
      mockListingRepo.findById = jest.fn().mockResolvedValue(mockListing);
      mockOrderService.createOrder.mockResolvedValue(mockOrder);

      const result = await subscriptionService.renewSubscription('sub-123');

      expect(result.eligible).toBe(true);
      expect(result.order).toBeDefined();
    });
  });
});
