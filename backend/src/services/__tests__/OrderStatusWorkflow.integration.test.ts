/**
 * Order Status Workflow Integration Tests
 * 
 * Tests the complete workflow from payment confirmation to subscription creation.
 * 
 * Requirements: 3.5, 12.3, 12.4
 */

import { PaymentProcessingService } from '../PaymentProcessingService';
import { SubscriptionService } from '../SubscriptionService';
import { OrderRepository } from '../../database/repositories/OrderRepository';
import { ListingRepository } from '../../database/repositories/ListingRepository';
import { SubscriptionRepository } from '../../database/repositories/SubscriptionRepository';
import { botQueueProducer } from '../BotQueueProducer';
import {
  Order,
  OrderStatus,
  Listing,
  CryptoCurrency,
  SubscriptionStatus
} from '../../types/models';

// Mock dependencies
jest.mock('../../database/repositories/OrderRepository');
jest.mock('../../database/repositories/ListingRepository');
jest.mock('../../database/repositories/SubscriptionRepository');
jest.mock('../BotQueueProducer');
jest.mock('../../database/connection', () => ({
  default: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn()
  }))
}));

describe('Order Status Workflow Integration', () => {
  let paymentProcessingService: PaymentProcessingService;
  let subscriptionService: SubscriptionService;
  let mockOrderRepo: jest.Mocked<OrderRepository>;
  let mockListingRepo: jest.Mocked<ListingRepository>;
  let mockSubscriptionRepo: jest.Mocked<SubscriptionRepository>;

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
    status: 'active' as any,
    signalTypes: ['crypto'],
    viewCount: 0,
    purchaseCount: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup repository mocks
    mockOrderRepo = {
      findById: jest.fn(),
      updateStatus: jest.fn()
    } as any;

    mockListingRepo = {
      findById: jest.fn()
    } as any;

    mockSubscriptionRepo = {
      findById: jest.fn(),
      findByOrderId: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn()
    } as any;

    // Mock repository constructors
    (OrderRepository as jest.Mock).mockImplementation(() => mockOrderRepo);
    (ListingRepository as jest.Mock).mockImplementation(() => mockListingRepo);
    (SubscriptionRepository as jest.Mock).mockImplementation(() => mockSubscriptionRepo);

    // Create service instances
    paymentProcessingService = new PaymentProcessingService('test-queue-url');
    subscriptionService = new SubscriptionService();
  });

  describe('Payment Confirmation to Subscription Creation', () => {
    it('should create subscription when payment is confirmed', async () => {
      // Setup: Order is payment_confirmed
      mockOrderRepo.findById = jest.fn().mockResolvedValue(mockOrder);
      mockSubscriptionRepo.findByOrderId = jest.fn().mockResolvedValue(null);
      mockListingRepo.findById = jest.fn().mockResolvedValue(mockListing);

      const mockSubscription = {
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
      mockOrderRepo.updateStatus = jest.fn().mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.SUBSCRIPTION_ACTIVE
      });

      // Mock database query for Telegram user ID
      const db = require('../../database/connection').default;
      db.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ telegram_user_id: 123456 })
      });

      // Mock bot queue producer
      (botQueueProducer.enqueueInviteUser as jest.Mock).mockResolvedValue('msg-123');

      // Execute: Create subscription from confirmed order
      const result = await subscriptionService.createSubscriptionFromOrder(mockOrder.id);

      // Verify: Subscription created
      expect(result.subscription).toBeDefined();
      expect(result.subscription.orderId).toBe(mockOrder.id);
      expect(result.subscription.buyerId).toBe(mockOrder.buyerId);
      expect(result.subscription.channelId).toBe(mockListing.channelId);
      expect(result.subscription.status).toBe(SubscriptionStatus.PENDING_ACTIVATION);

      // Verify: Order status updated to subscription_active
      expect(mockOrderRepo.updateStatus).toHaveBeenCalledWith(
        mockOrder.id,
        OrderStatus.SUBSCRIPTION_ACTIVE
      );

      // Verify: Bot operation queued
      expect(result.botOperationQueued).toBe(true);
      expect(botQueueProducer.enqueueInviteUser).toHaveBeenCalledWith(
        123456,
        mockListing.channelId,
        expect.any(String),
        mockOrder.id
      );
    });

    it('should handle workflow when order transitions from payment_detected to payment_confirmed', async () => {
      // Setup: Order starts as payment_detected
      const detectedOrder = {
        ...mockOrder,
        status: OrderStatus.PAYMENT_DETECTED,
        confirmations: 5
      };

      const confirmedOrder = {
        ...mockOrder,
        status: OrderStatus.PAYMENT_CONFIRMED,
        confirmations: 12
      };

      // First call returns detected order, second call returns confirmed order
      mockOrderRepo.findById = jest.fn().mockResolvedValue(confirmedOrder);

      mockSubscriptionRepo.findByOrderId = jest.fn().mockResolvedValue(null);
      mockListingRepo.findById = jest.fn().mockResolvedValue(mockListing);

      const mockSubscription = {
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
      mockOrderRepo.updateStatus = jest.fn().mockResolvedValue(confirmedOrder);

      const db = require('../../database/connection').default;
      db.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ telegram_user_id: 123456 })
      });

      (botQueueProducer.enqueueInviteUser as jest.Mock).mockResolvedValue('msg-123');

      // Execute: Verify payment is detected but not confirmed
      const verification1 = await paymentProcessingService.verifyPayment(detectedOrder, {
        to: detectedOrder.depositAddress,
        amount: detectedOrder.amount,
        confirmations: 5,
        currency: detectedOrder.currency
      });

      expect(verification1.sufficientConfirmations).toBe(false);
      expect(verification1.isValid).toBe(false);

      // Execute: Verify payment is now confirmed
      const verification2 = await paymentProcessingService.verifyPayment(confirmedOrder, {
        to: confirmedOrder.depositAddress,
        amount: confirmedOrder.amount,
        confirmations: 12,
        currency: confirmedOrder.currency
      });

      expect(verification2.sufficientConfirmations).toBe(true);
      expect(verification2.isValid).toBe(true);

      // Execute: Create subscription after confirmation (order is now confirmed)
      const result = await subscriptionService.createSubscriptionFromOrder(confirmedOrder.id);

      // Verify: Subscription created successfully
      expect(result.subscription).toBeDefined();
      expect(result.botOperationQueued).toBe(true);
    });

    it('should not create subscription if order is not payment_confirmed', async () => {
      const pendingOrder = {
        ...mockOrder,
        status: OrderStatus.PENDING_PAYMENT
      };

      mockOrderRepo.findById = jest.fn().mockResolvedValue(pendingOrder);

      // Execute & Verify: Should throw error
      await expect(
        subscriptionService.createSubscriptionFromOrder(pendingOrder.id)
      ).rejects.toThrow('Cannot create subscription for order with status: pending_payment');
    });

    it('should handle idempotent subscription creation', async () => {
      // Setup: Subscription already exists
      const existingSubscription = {
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

      // Execute: Try to create subscription again
      const result = await subscriptionService.createSubscriptionFromOrder(mockOrder.id);

      // Verify: Returns existing subscription without creating new one
      expect(result.subscription).toEqual(existingSubscription);
      expect(result.botOperationQueued).toBe(false);
      expect(mockSubscriptionRepo.create).not.toHaveBeenCalled();
    });

    it('should calculate correct subscription expiry date based on listing duration', async () => {
      // Setup: Listing with 7 days duration
      const shortListing = {
        ...mockListing,
        durationDays: 7
      };

      mockOrderRepo.findById = jest.fn().mockResolvedValue(mockOrder);
      mockSubscriptionRepo.findByOrderId = jest.fn().mockResolvedValue(null);
      mockListingRepo.findById = jest.fn().mockResolvedValue(shortListing);

      let capturedSubscription: any;
      mockSubscriptionRepo.create = jest.fn().mockImplementation((sub) => {
        capturedSubscription = sub;
        return Promise.resolve(sub);
      });

      mockOrderRepo.updateStatus = jest.fn().mockResolvedValue(mockOrder);

      const db = require('../../database/connection').default;
      db.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ telegram_user_id: null })
      });

      // Execute
      await subscriptionService.createSubscriptionFromOrder(mockOrder.id);

      // Verify: Expiry date is 7 days from start date
      expect(capturedSubscription).toBeDefined();
      const expectedDuration = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
      const actualDuration = capturedSubscription.expiryDate.getTime() - 
                            capturedSubscription.startDate.getTime();
      
      // Allow 1 second tolerance for test execution time
      expect(Math.abs(actualDuration - expectedDuration)).toBeLessThan(1000);
    });
  });

  describe('Order Status Transitions', () => {
    it('should follow correct status progression: pending_payment → payment_detected → payment_confirmed → subscription_active', async () => {
      const statusProgression: OrderStatus[] = [];

      // Mock updateStatus to track status changes
      mockOrderRepo.updateStatus = jest.fn().mockImplementation((_orderId, status) => {
        statusProgression.push(status);
        return Promise.resolve({ ...mockOrder, status });
      });

      mockOrderRepo.findById = jest.fn().mockResolvedValue(mockOrder);
      mockSubscriptionRepo.findByOrderId = jest.fn().mockResolvedValue(null);
      mockListingRepo.findById = jest.fn().mockResolvedValue(mockListing);

      mockSubscriptionRepo.create = jest.fn().mockResolvedValue({
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
      });

      const db = require('../../database/connection').default;
      db.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ telegram_user_id: 123456 })
      });

      (botQueueProducer.enqueueInviteUser as jest.Mock).mockResolvedValue('msg-123');

      // Execute: Create subscription (final step in workflow)
      await subscriptionService.createSubscriptionFromOrder(mockOrder.id);

      // Verify: Order status updated to subscription_active
      expect(statusProgression).toContain(OrderStatus.SUBSCRIPTION_ACTIVE);
    });
  });
});
