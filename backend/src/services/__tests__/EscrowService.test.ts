/**
 * Escrow Service Tests
 * 
 * Tests for escrow fund management including creation, release, and refunds.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import { EscrowService } from '../EscrowService';
import { EscrowRepository } from '../../database/repositories/EscrowRepository';
import { MerchantBalanceRepository } from '../../database/repositories/MerchantBalanceRepository';
import { SubscriptionRepository } from '../../database/repositories/SubscriptionRepository';
import { OrderRepository } from '../../database/repositories/OrderRepository';
import { ListingRepository } from '../../database/repositories/ListingRepository';
import { AuditLogRepository } from '../../database/repositories/AuditLogRepository';
import {
  EscrowStatus,
  OrderStatus,
  SubscriptionStatus,
  DEFAULT_PLATFORM_FEE
} from '../../types/models';

// Mock repositories
jest.mock('../../database/repositories/EscrowRepository');
jest.mock('../../database/repositories/MerchantBalanceRepository');
jest.mock('../../database/repositories/SubscriptionRepository');
jest.mock('../../database/repositories/OrderRepository');
jest.mock('../../database/repositories/ListingRepository');
jest.mock('../../database/repositories/AuditLogRepository');

describe('EscrowService', () => {
  let escrowService: EscrowService;
  let mockEscrowRepository: jest.Mocked<EscrowRepository>;
  let mockMerchantBalanceRepository: jest.Mocked<MerchantBalanceRepository>;
  let mockSubscriptionRepository: jest.Mocked<SubscriptionRepository>;
  let mockOrderRepository: jest.Mocked<OrderRepository>;
  let mockListingRepository: jest.Mocked<ListingRepository>;
  let mockAuditLogRepository: jest.Mocked<AuditLogRepository>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create service instance
    escrowService = new EscrowService();

    // Get mocked repository instances
    mockEscrowRepository = EscrowRepository.prototype as jest.Mocked<EscrowRepository>;
    mockMerchantBalanceRepository = MerchantBalanceRepository.prototype as jest.Mocked<MerchantBalanceRepository>;
    mockSubscriptionRepository = SubscriptionRepository.prototype as jest.Mocked<SubscriptionRepository>;
    mockOrderRepository = OrderRepository.prototype as jest.Mocked<OrderRepository>;
    mockListingRepository = ListingRepository.prototype as jest.Mocked<ListingRepository>;
    mockAuditLogRepository = AuditLogRepository.prototype as jest.Mocked<AuditLogRepository>;
  });

  describe('createEscrow', () => {
    it('should create escrow entry with correct platform fee calculation', async () => {
      // Arrange
      const orderId = 'order_123';
      const subscriptionId = 'sub_123';
      const merchantId = 'merchant_123';
      const amount = 100;
      const currency = 'USDT_BEP20';

      const mockOrder = {
        id: orderId,
        buyerId: 'buyer_123',
        listingId: 'listing_123',
        amount,
        currency,
        status: OrderStatus.PAYMENT_CONFIRMED
      };

      const mockSubscription = {
        id: subscriptionId,
        buyerId: 'buyer_123',
        listingId: 'listing_123',
        orderId,
        status: SubscriptionStatus.PENDING_ACTIVATION
      };

      const mockListing = {
        id: 'listing_123',
        merchantId,
        price: amount,
        currency
      };

      const expectedPlatformFee = amount * DEFAULT_PLATFORM_FEE; // 5
      const expectedMerchantAmount = amount - expectedPlatformFee; // 95

      mockOrderRepository.findById.mockResolvedValue(mockOrder as any);
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription as any);
      mockEscrowRepository.findByOrderId.mockResolvedValue(null);
      mockListingRepository.findById.mockResolvedValue(mockListing as any);
      
      mockEscrowRepository.create.mockResolvedValue({
        id: 'escrow_123',
        orderId,
        subscriptionId,
        amount,
        currency,
        status: EscrowStatus.HELD,
        platformFee: expectedPlatformFee,
        merchantAmount: expectedMerchantAmount,
        createdAt: new Date()
      } as any);

      mockMerchantBalanceRepository.incrementPending.mockResolvedValue({} as any);

      // Act
      const result = await escrowService.createEscrow(orderId, subscriptionId);

      // Assert
      expect(result.escrow).toBeDefined();
      expect(result.platformFee).toBe(expectedPlatformFee);
      expect(result.merchantAmount).toBe(expectedMerchantAmount);
      expect(mockEscrowRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId,
          subscriptionId,
          amount,
          currency,
          status: EscrowStatus.HELD,
          platformFee: expectedPlatformFee,
          merchantAmount: expectedMerchantAmount
        })
      );
      expect(mockMerchantBalanceRepository.incrementPending).toHaveBeenCalledWith(
        merchantId,
        currency,
        expectedMerchantAmount
      );
    });

    it('should return existing escrow if already created for order', async () => {
      // Arrange
      const orderId = 'order_123';
      const subscriptionId = 'sub_123';

      const mockOrder = {
        id: orderId,
        amount: 100,
        currency: 'USDT_BEP20'
      };

      const mockSubscription = {
        id: subscriptionId
      };

      const existingEscrow = {
        id: 'escrow_123',
        orderId,
        subscriptionId,
        amount: 100,
        platformFee: 5,
        merchantAmount: 95,
        status: EscrowStatus.HELD
      };

      mockOrderRepository.findById.mockResolvedValue(mockOrder as any);
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription as any);
      mockEscrowRepository.findByOrderId.mockResolvedValue(existingEscrow as any);

      // Act
      const result = await escrowService.createEscrow(orderId, subscriptionId);

      // Assert
      expect(result.escrow).toEqual(existingEscrow);
      expect(mockEscrowRepository.create).not.toHaveBeenCalled();
      expect(mockMerchantBalanceRepository.incrementPending).not.toHaveBeenCalled();
    });

    it('should throw error if order not found', async () => {
      // Arrange
      const orderId = 'nonexistent_order';
      const subscriptionId = 'sub_123';

      mockOrderRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        escrowService.createEscrow(orderId, subscriptionId)
      ).rejects.toThrow(`Order not found: ${orderId}`);
    });

    it('should throw error if subscription not found', async () => {
      // Arrange
      const orderId = 'order_123';
      const subscriptionId = 'nonexistent_sub';

      mockOrderRepository.findById.mockResolvedValue({ id: orderId } as any);
      mockSubscriptionRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        escrowService.createEscrow(orderId, subscriptionId)
      ).rejects.toThrow(`Subscription not found: ${subscriptionId}`);
    });
  });

  describe('releaseEscrow', () => {
    it('should release escrow and move funds to merchant available balance', async () => {
      // Arrange
      const subscriptionId = 'sub_123';
      const orderId = 'order_123';
      const merchantId = 'merchant_123';
      const merchantAmount = 95;
      const currency = 'USDT_BEP20';

      const mockEscrow = {
        id: 'escrow_123',
        orderId,
        subscriptionId,
        amount: 100,
        currency,
        status: EscrowStatus.HELD,
        platformFee: 5,
        merchantAmount
      };

      const mockOrder = {
        id: orderId,
        listingId: 'listing_123',
        currency
      };

      const mockListing = {
        id: 'listing_123',
        merchantId
      };

      mockEscrowRepository.findBySubscriptionId.mockResolvedValue(mockEscrow as any);
      mockOrderRepository.findById.mockResolvedValue(mockOrder as any);
      mockListingRepository.findById.mockResolvedValue(mockListing as any);
      mockEscrowRepository.release.mockResolvedValue({
        ...mockEscrow,
        status: EscrowStatus.RELEASED,
        releasedAt: new Date()
      } as any);
      mockMerchantBalanceRepository.movePendingToAvailable.mockResolvedValue({} as any);

      // Act
      const result = await escrowService.releaseEscrow(subscriptionId);

      // Assert
      expect(result.status).toBe(EscrowStatus.RELEASED);
      expect(mockEscrowRepository.release).toHaveBeenCalledWith(
        mockEscrow.id,
        merchantAmount
      );
      expect(mockMerchantBalanceRepository.movePendingToAvailable).toHaveBeenCalledWith(
        merchantId,
        currency,
        merchantAmount
      );
    });

    it('should throw error if escrow not found', async () => {
      // Arrange
      const subscriptionId = 'nonexistent_sub';

      mockEscrowRepository.findBySubscriptionId.mockResolvedValue(null);

      // Act & Assert
      await expect(
        escrowService.releaseEscrow(subscriptionId)
      ).rejects.toThrow(`Escrow not found for subscription: ${subscriptionId}`);
    });

    it('should throw error if escrow is not in HELD status', async () => {
      // Arrange
      const subscriptionId = 'sub_123';

      const mockEscrow = {
        id: 'escrow_123',
        subscriptionId,
        status: EscrowStatus.RELEASED
      };

      mockEscrowRepository.findBySubscriptionId.mockResolvedValue(mockEscrow as any);

      // Act & Assert
      await expect(
        escrowService.releaseEscrow(subscriptionId)
      ).rejects.toThrow('Cannot release escrow with status: released');
    });
  });

  describe('refundEscrow', () => {
    it('should calculate pro-rated refund and update balances', async () => {
      // Arrange
      const subscriptionId = 'sub_123';
      const orderId = 'order_123';
      const merchantId = 'merchant_123';
      const amount = 100;
      const merchantAmount = 95;
      const currency = 'USDT_BEP20';

      // Subscription: 30 days total, 10 days used, 20 days unused
      const startDate = new Date('2024-01-01');
      const now = new Date('2024-01-11'); // 10 days after start
      const expiryDate = new Date('2024-01-31'); // 30 days after start

      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockEscrow = {
        id: 'escrow_123',
        orderId,
        subscriptionId,
        amount,
        currency,
        status: EscrowStatus.HELD,
        platformFee: 5,
        merchantAmount
      };

      const mockSubscription = {
        id: subscriptionId,
        startDate,
        expiryDate,
        durationDays: 30
      };

      const mockOrder = {
        id: orderId,
        listingId: 'listing_123',
        currency
      };

      const mockListing = {
        id: 'listing_123',
        merchantId
      };

      mockEscrowRepository.findBySubscriptionId.mockResolvedValue(mockEscrow as any);
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription as any);
      mockEscrowRepository.refund.mockResolvedValue({
        ...mockEscrow,
        status: EscrowStatus.REFUNDED
      } as any);
      mockOrderRepository.findById.mockResolvedValue(mockOrder as any);
      mockListingRepository.findById.mockResolvedValue(mockListing as any);
      mockMerchantBalanceRepository.findByMerchantAndCurrency.mockResolvedValue({
        id: 'balance_123',
        merchantId,
        currency,
        pendingBalance: merchantAmount,
        availableBalance: 0
      } as any);
      mockMerchantBalanceRepository.update.mockResolvedValue({} as any);

      // Act
      const result = await escrowService.refundEscrow(subscriptionId);

      // Assert
      expect(result.totalAmount).toBe(amount);
      expect(result.totalDays).toBe(30);
      expect(result.usedDays).toBe(10);
      expect(result.unusedDays).toBe(20);
      expect(result.refundPercentage).toBeCloseTo(20 / 30, 5);
      expect(result.refundAmount).toBeCloseTo((20 / 30) * amount, 2);
      expect(mockEscrowRepository.refund).toHaveBeenCalledWith(mockEscrow.id);
      expect(mockMerchantBalanceRepository.update).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should return zero refund if subscription fully used', async () => {
      // Arrange
      const subscriptionId = 'sub_123';
      const orderId = 'order_123';
      const merchantId = 'merchant_123';
      const amount = 100;
      const merchantAmount = 95;

      // Subscription: 30 days total, 30 days used (at expiry)
      const startDate = new Date('2024-01-01');
      const now = new Date('2024-01-31'); // At expiry
      const expiryDate = new Date('2024-01-31');

      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockEscrow = {
        id: 'escrow_123',
        orderId,
        subscriptionId,
        amount,
        status: EscrowStatus.HELD,
        merchantAmount
      };

      const mockSubscription = {
        id: subscriptionId,
        startDate,
        expiryDate,
        durationDays: 30
      };

      const mockOrder = {
        id: orderId,
        listingId: 'listing_123',
        currency: 'USDT_BEP20'
      };

      const mockListing = {
        id: 'listing_123',
        merchantId
      };

      mockEscrowRepository.findBySubscriptionId.mockResolvedValue(mockEscrow as any);
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription as any);
      mockEscrowRepository.refund.mockResolvedValue({
        ...mockEscrow,
        status: EscrowStatus.REFUNDED
      } as any);
      mockOrderRepository.findById.mockResolvedValue(mockOrder as any);
      mockListingRepository.findById.mockResolvedValue(mockListing as any);
      mockMerchantBalanceRepository.findByMerchantAndCurrency.mockResolvedValue({
        id: 'balance_123',
        merchantId,
        currency: 'USDT_BEP20',
        pendingBalance: merchantAmount,
        availableBalance: 0
      } as any);
      mockMerchantBalanceRepository.update.mockResolvedValue({} as any);

      // Act
      const result = await escrowService.refundEscrow(subscriptionId);

      // Assert
      expect(result.unusedDays).toBe(0);
      expect(result.refundAmount).toBe(0);

      jest.useRealTimers();
    });

    it('should return full refund if subscription not started', async () => {
      // Arrange
      const subscriptionId = 'sub_123';
      const orderId = 'order_123';
      const merchantId = 'merchant_123';
      const amount = 100;
      const merchantAmount = 95;

      // Subscription: 30 days total, refund immediately at start
      const startDate = new Date('2024-01-01');
      const now = new Date('2024-01-01'); // Same as start
      const expiryDate = new Date('2024-01-31');

      jest.useFakeTimers();
      jest.setSystemTime(now);

      const mockEscrow = {
        id: 'escrow_123',
        orderId,
        subscriptionId,
        amount,
        status: EscrowStatus.HELD,
        merchantAmount
      };

      const mockSubscription = {
        id: subscriptionId,
        startDate,
        expiryDate,
        durationDays: 30
      };

      const mockOrder = {
        id: orderId,
        listingId: 'listing_123',
        currency: 'USDT_BEP20'
      };

      const mockListing = {
        id: 'listing_123',
        merchantId
      };

      mockEscrowRepository.findBySubscriptionId.mockResolvedValue(mockEscrow as any);
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription as any);
      mockEscrowRepository.refund.mockResolvedValue({
        ...mockEscrow,
        status: EscrowStatus.REFUNDED
      } as any);
      mockOrderRepository.findById.mockResolvedValue(mockOrder as any);
      mockListingRepository.findById.mockResolvedValue(mockListing as any);
      mockMerchantBalanceRepository.findByMerchantAndCurrency.mockResolvedValue({
        id: 'balance_123',
        merchantId,
        currency: 'USDT_BEP20',
        pendingBalance: merchantAmount,
        availableBalance: 0
      } as any);
      mockMerchantBalanceRepository.update.mockResolvedValue({} as any);

      // Act
      const result = await escrowService.refundEscrow(subscriptionId);

      // Assert
      expect(result.usedDays).toBe(0);
      expect(result.unusedDays).toBe(30);
      expect(result.refundAmount).toBe(amount);

      jest.useRealTimers();
    });

    it('should throw error if escrow not in HELD status', async () => {
      // Arrange
      const subscriptionId = 'sub_123';

      const mockEscrow = {
        id: 'escrow_123',
        subscriptionId,
        status: EscrowStatus.REFUNDED
      };

      mockEscrowRepository.findBySubscriptionId.mockResolvedValue(mockEscrow as any);

      // Act & Assert
      await expect(
        escrowService.refundEscrow(subscriptionId)
      ).rejects.toThrow('Cannot refund escrow with status: refunded');
    });
  });

  describe('calculateProRatedRefund', () => {
    it('should calculate correct refund for half-used subscription', () => {
      // Arrange
      const subscription = {
        startDate: new Date('2024-01-01'),
        expiryDate: new Date('2024-01-31'),
        durationDays: 30
      };
      const paymentAmount = 100;
      const now = new Date('2024-01-16'); // 15 days used, 15 days unused

      jest.useFakeTimers();
      jest.setSystemTime(now);

      // Act
      const result = escrowService.calculateProRatedRefund(
        subscription as any,
        paymentAmount
      );

      // Assert
      expect(result.totalDays).toBe(30);
      expect(result.usedDays).toBe(15);
      expect(result.unusedDays).toBe(15);
      expect(result.refundPercentage).toBeCloseTo(0.5, 5);
      expect(result.refundAmount).toBeCloseTo(50, 2);

      jest.useRealTimers();
    });

    it('should handle edge case of refund on last day', () => {
      // Arrange
      const subscription = {
        startDate: new Date('2024-01-01'),
        expiryDate: new Date('2024-01-31'),
        durationDays: 30
      };
      const paymentAmount = 100;
      const now = new Date('2024-01-30'); // 1 day before expiry

      jest.useFakeTimers();
      jest.setSystemTime(now);

      // Act
      const result = escrowService.calculateProRatedRefund(
        subscription as any,
        paymentAmount
      );

      // Assert
      expect(result.unusedDays).toBe(1);
      expect(result.refundAmount).toBeCloseTo(100 / 30, 2);

      jest.useRealTimers();
    });
  });

  describe('getPlatformFeePercentage', () => {
    it('should return default platform fee percentage', () => {
      // Act
      const fee = escrowService.getPlatformFeePercentage();

      // Assert
      expect(fee).toBe(DEFAULT_PLATFORM_FEE);
    });
  });

  describe('setPlatformFeePercentage', () => {
    it('should update platform fee percentage', () => {
      // Arrange
      const newFee = 0.03; // 3%

      // Act
      escrowService.setPlatformFeePercentage(newFee);

      // Assert
      expect(escrowService.getPlatformFeePercentage()).toBe(newFee);
    });

    it('should throw error for invalid fee percentage', () => {
      // Act & Assert
      expect(() => {
        escrowService.setPlatformFeePercentage(-0.01);
      }).toThrow('Platform fee percentage must be between 0 and 1');

      expect(() => {
        escrowService.setPlatformFeePercentage(1.5);
      }).toThrow('Platform fee percentage must be between 0 and 1');
    });
  });

  describe('getEscrowBySubscriptionId', () => {
    it('should return escrow entry for subscription', async () => {
      // Arrange
      const subscriptionId = 'sub_123';
      const mockEscrow = {
        id: 'escrow_123',
        subscriptionId,
        status: EscrowStatus.HELD
      };

      mockEscrowRepository.findBySubscriptionId.mockResolvedValue(mockEscrow as any);

      // Act
      const result = await escrowService.getEscrowBySubscriptionId(subscriptionId);

      // Assert
      expect(result).toEqual(mockEscrow);
      expect(mockEscrowRepository.findBySubscriptionId).toHaveBeenCalledWith(subscriptionId);
    });
  });

  describe('getEscrowByOrderId', () => {
    it('should return escrow entry for order', async () => {
      // Arrange
      const orderId = 'order_123';
      const mockEscrow = {
        id: 'escrow_123',
        orderId,
        status: EscrowStatus.HELD
      };

      mockEscrowRepository.findByOrderId.mockResolvedValue(mockEscrow as any);

      // Act
      const result = await escrowService.getEscrowByOrderId(orderId);

      // Assert
      expect(result).toEqual(mockEscrow);
      expect(mockEscrowRepository.findByOrderId).toHaveBeenCalledWith(orderId);
    });
  });

  describe('getHeldEscrows', () => {
    it('should return all held escrow entries', async () => {
      // Arrange
      const mockEscrows = [
        { id: 'escrow_1', status: EscrowStatus.HELD },
        { id: 'escrow_2', status: EscrowStatus.HELD }
      ];

      mockEscrowRepository.findHeld.mockResolvedValue(mockEscrows as any);

      // Act
      const result = await escrowService.getHeldEscrows();

      // Assert
      expect(result).toEqual(mockEscrows);
      expect(mockEscrowRepository.findHeld).toHaveBeenCalled();
    });
  });

  describe('getTotalEscrowBalance', () => {
    it('should return total escrow balance for currency', async () => {
      // Arrange
      const currency = 'USDT_BEP20';
      const totalBalance = 1000;

      mockEscrowRepository.getTotalBalanceByCurrency.mockResolvedValue(totalBalance);

      // Act
      const result = await escrowService.getTotalEscrowBalance(currency);

      // Assert
      expect(result).toBe(totalBalance);
      expect(mockEscrowRepository.getTotalBalanceByCurrency).toHaveBeenCalledWith(currency);
    });
  });

  describe('getMerchantHeldAmount', () => {
    it('should return held amount for merchant', async () => {
      // Arrange
      const merchantId = 'merchant_123';
      const currency = 'USDT_BEP20';
      const heldAmount = 500;

      mockEscrowRepository.getHeldAmountForMerchant.mockResolvedValue(heldAmount);

      // Act
      const result = await escrowService.getMerchantHeldAmount(merchantId, currency);

      // Assert
      expect(result).toBe(heldAmount);
      expect(mockEscrowRepository.getHeldAmountForMerchant).toHaveBeenCalledWith(
        merchantId,
        currency
      );
    });
  });

  describe('Escrow Transaction Logging - Requirements 4.5', () => {
    describe('createEscrow - audit logging', () => {
      it('should log escrow creation to audit trail', async () => {
        // Arrange
        const orderId = 'order_123';
        const subscriptionId = 'sub_123';
        const merchantId = 'merchant_123';
        const amount = 100;
        const currency = 'USDT_BEP20';

        const mockOrder = {
          id: orderId,
          buyerId: 'buyer_123',
          listingId: 'listing_123',
          amount,
          currency,
          status: OrderStatus.PAYMENT_CONFIRMED
        };

        const mockSubscription = {
          id: subscriptionId,
          buyerId: 'buyer_123',
          listingId: 'listing_123',
          orderId,
          status: SubscriptionStatus.PENDING_ACTIVATION
        };

        const mockListing = {
          id: 'listing_123',
          merchantId,
          price: amount,
          currency
        };

        const expectedPlatformFee = amount * DEFAULT_PLATFORM_FEE;
        const expectedMerchantAmount = amount - expectedPlatformFee;

        mockOrderRepository.findById.mockResolvedValue(mockOrder as any);
        mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription as any);
        mockEscrowRepository.findByOrderId.mockResolvedValue(null);
        mockListingRepository.findById.mockResolvedValue(mockListing as any);
        
        mockEscrowRepository.create.mockResolvedValue({
          id: 'escrow_123',
          orderId,
          subscriptionId,
          amount,
          currency,
          status: EscrowStatus.HELD,
          platformFee: expectedPlatformFee,
          merchantAmount: expectedMerchantAmount,
          createdAt: new Date()
        } as any);

        mockMerchantBalanceRepository.incrementPending.mockResolvedValue({} as any);
        mockAuditLogRepository.create.mockResolvedValue({
          id: 'audit_123',
          adminId: 'system',
          action: 'escrow_created',
          entityType: 'escrow',
          entityId: 'escrow_123',
          createdAt: new Date()
        } as any);

        // Act
        await escrowService.createEscrow(orderId, subscriptionId);

        // Assert
        expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: 'system',
            action: 'escrow_created',
            entityType: 'escrow',
            entityId: 'escrow_123',
            changes: expect.objectContaining({
              oldStatus: null,
              newStatus: EscrowStatus.HELD,
              orderId,
              subscriptionId,
              amount,
              currency,
              platformFee: expectedPlatformFee,
              merchantAmount: expectedMerchantAmount
            })
          })
        );
      });
    });

    describe('releaseEscrow - audit logging', () => {
      it('should log escrow release to audit trail', async () => {
        // Arrange
        const subscriptionId = 'sub_123';
        const orderId = 'order_123';
        const merchantId = 'merchant_123';
        const merchantAmount = 95;
        const currency = 'USDT_BEP20';

        const mockEscrow = {
          id: 'escrow_123',
          orderId,
          subscriptionId,
          amount: 100,
          currency,
          status: EscrowStatus.HELD,
          platformFee: 5,
          merchantAmount
        };

        const mockOrder = {
          id: orderId,
          listingId: 'listing_123',
          currency
        };

        const mockListing = {
          id: 'listing_123',
          merchantId
        };

        mockEscrowRepository.findBySubscriptionId.mockResolvedValue(mockEscrow as any);
        mockOrderRepository.findById.mockResolvedValue(mockOrder as any);
        mockListingRepository.findById.mockResolvedValue(mockListing as any);
        mockEscrowRepository.release.mockResolvedValue({
          ...mockEscrow,
          status: EscrowStatus.RELEASED,
          releasedAt: new Date()
        } as any);
        mockMerchantBalanceRepository.movePendingToAvailable.mockResolvedValue({} as any);
        mockAuditLogRepository.create.mockResolvedValue({
          id: 'audit_123',
          adminId: 'system',
          action: 'escrow_released',
          entityType: 'escrow',
          entityId: 'escrow_123',
          createdAt: new Date()
        } as any);

        // Act
        await escrowService.releaseEscrow(subscriptionId);

        // Assert
        expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: 'system',
            action: 'escrow_released',
            entityType: 'escrow',
            entityId: 'escrow_123',
            changes: expect.objectContaining({
              oldStatus: EscrowStatus.HELD,
              newStatus: EscrowStatus.RELEASED,
              subscriptionId,
              merchantAmount,
              merchantId,
              currency
            })
          })
        );
      });
    });

    describe('refundEscrow - audit logging', () => {
      it('should log escrow refund to audit trail with pro-rated details', async () => {
        // Arrange
        const subscriptionId = 'sub_123';
        const orderId = 'order_123';
        const merchantId = 'merchant_123';
        const amount = 100;
        const merchantAmount = 95;
        const currency = 'USDT_BEP20';

        const startDate = new Date('2024-01-01');
        const now = new Date('2024-01-11');
        const expiryDate = new Date('2024-01-31');

        jest.useFakeTimers();
        jest.setSystemTime(now);

        const mockEscrow = {
          id: 'escrow_123',
          orderId,
          subscriptionId,
          amount,
          currency,
          status: EscrowStatus.HELD,
          platformFee: 5,
          merchantAmount
        };

        const mockSubscription = {
          id: subscriptionId,
          startDate,
          expiryDate,
          durationDays: 30
        };

        const mockOrder = {
          id: orderId,
          listingId: 'listing_123',
          currency
        };

        const mockListing = {
          id: 'listing_123',
          merchantId
        };

        mockEscrowRepository.findBySubscriptionId.mockResolvedValue(mockEscrow as any);
        mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription as any);
        mockEscrowRepository.refund.mockResolvedValue({
          ...mockEscrow,
          status: EscrowStatus.REFUNDED
        } as any);
        mockOrderRepository.findById.mockResolvedValue(mockOrder as any);
        mockListingRepository.findById.mockResolvedValue(mockListing as any);
        mockMerchantBalanceRepository.findByMerchantAndCurrency.mockResolvedValue({
          id: 'balance_123',
          merchantId,
          currency,
          pendingBalance: merchantAmount,
          availableBalance: 0
        } as any);
        mockMerchantBalanceRepository.update.mockResolvedValue({} as any);
        mockAuditLogRepository.create.mockResolvedValue({
          id: 'audit_123',
          adminId: 'system',
          action: 'escrow_refunded',
          entityType: 'escrow',
          entityId: 'escrow_123',
          createdAt: new Date()
        } as any);

        // Act
        await escrowService.refundEscrow(subscriptionId);

        // Assert
        expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            adminId: 'system',
            action: 'escrow_refunded',
            entityType: 'escrow',
            entityId: 'escrow_123',
            changes: expect.objectContaining({
              oldStatus: EscrowStatus.HELD,
              newStatus: EscrowStatus.REFUNDED,
              subscriptionId,
              usedDays: 10,
              unusedDays: 20,
              totalDays: 30
            })
          })
        );

        jest.useRealTimers();
      });
    });

    describe('getEscrowAuditTrail', () => {
      it('should retrieve audit trail by escrow ID', async () => {
        // Arrange
        const escrowId = 'escrow_123';
        const mockAuditLogs = [
          {
            id: 'audit_1',
            adminId: 'system',
            action: 'escrow_created',
            entityType: 'escrow',
            entityId: escrowId,
            createdAt: new Date('2024-01-01')
          },
          {
            id: 'audit_2',
            adminId: 'system',
            action: 'escrow_released',
            entityType: 'escrow',
            entityId: escrowId,
            createdAt: new Date('2024-01-31')
          }
        ];

        mockAuditLogRepository.findByEntity.mockResolvedValue(mockAuditLogs as any);

        // Act
        const result = await escrowService.getEscrowAuditTrail({ escrowId });

        // Assert
        expect(result).toEqual(mockAuditLogs);
        expect(mockAuditLogRepository.findByEntity).toHaveBeenCalledWith('escrow', escrowId);
      });

      it('should retrieve audit trail by order ID', async () => {
        // Arrange
        const orderId = 'order_123';
        const escrowId = 'escrow_123';
        const mockEscrow = {
          id: escrowId,
          orderId,
          status: EscrowStatus.HELD
        };
        const mockAuditLogs = [
          {
            id: 'audit_1',
            adminId: 'system',
            action: 'escrow_created',
            entityType: 'escrow',
            entityId: escrowId,
            createdAt: new Date()
          }
        ];

        mockEscrowRepository.findByOrderId.mockResolvedValue(mockEscrow as any);
        mockAuditLogRepository.findByEntity.mockResolvedValue(mockAuditLogs as any);

        // Act
        const result = await escrowService.getEscrowAuditTrail({ orderId });

        // Assert
        expect(result).toEqual(mockAuditLogs);
        expect(mockEscrowRepository.findByOrderId).toHaveBeenCalledWith(orderId);
        expect(mockAuditLogRepository.findByEntity).toHaveBeenCalledWith('escrow', escrowId);
      });

      it('should retrieve audit trail by subscription ID', async () => {
        // Arrange
        const subscriptionId = 'sub_123';
        const escrowId = 'escrow_123';
        const mockEscrow = {
          id: escrowId,
          subscriptionId,
          status: EscrowStatus.HELD
        };
        const mockAuditLogs = [
          {
            id: 'audit_1',
            adminId: 'system',
            action: 'escrow_created',
            entityType: 'escrow',
            entityId: escrowId,
            createdAt: new Date()
          }
        ];

        mockEscrowRepository.findBySubscriptionId.mockResolvedValue(mockEscrow as any);
        mockAuditLogRepository.findByEntity.mockResolvedValue(mockAuditLogs as any);

        // Act
        const result = await escrowService.getEscrowAuditTrail({ subscriptionId });

        // Assert
        expect(result).toEqual(mockAuditLogs);
        expect(mockEscrowRepository.findBySubscriptionId).toHaveBeenCalledWith(subscriptionId);
        expect(mockAuditLogRepository.findByEntity).toHaveBeenCalledWith('escrow', escrowId);
      });

      it('should filter audit trail by action', async () => {
        // Arrange
        const action = 'released';
        const mockSearchResult = {
          data: [
            {
              id: 'audit_1',
              adminId: 'system',
              action: 'escrow_released',
              entityType: 'escrow',
              entityId: 'escrow_123',
              createdAt: new Date()
            }
          ],
          total: 1
        };

        mockAuditLogRepository.search.mockResolvedValue(mockSearchResult as any);

        // Act
        const result = await escrowService.getEscrowAuditTrail({ action });

        // Assert
        expect(result).toEqual(mockSearchResult.data);
        expect(mockAuditLogRepository.search).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'escrow',
            action: 'escrow_released'
          }),
          1000,
          0
        );
      });

      it('should filter audit trail by date range', async () => {
        // Arrange
        const startDate = new Date('2024-01-01');
        const endDate = new Date('2024-01-31');
        const mockSearchResult = {
          data: [
            {
              id: 'audit_1',
              adminId: 'system',
              action: 'escrow_created',
              entityType: 'escrow',
              entityId: 'escrow_123',
              createdAt: new Date('2024-01-15')
            }
          ],
          total: 1
        };

        mockAuditLogRepository.search.mockResolvedValue(mockSearchResult as any);

        // Act
        const result = await escrowService.getEscrowAuditTrail({ startDate, endDate });

        // Assert
        expect(result).toEqual(mockSearchResult.data);
        expect(mockAuditLogRepository.search).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'escrow',
            startDate,
            endDate
          }),
          1000,
          0
        );
      });
    });

    describe('getMerchantEscrowAuditTrail', () => {
      it('should retrieve audit trail for all merchant escrows', async () => {
        // Arrange
        const merchantId = 'merchant_123';
        const mockEscrows = [
          { id: 'escrow_1', orderId: 'order_1' },
          { id: 'escrow_2', orderId: 'order_2' }
        ];
        const mockAuditLogs1 = [
          {
            id: 'audit_1',
            adminId: 'system',
            action: 'escrow_created',
            entityType: 'escrow',
            entityId: 'escrow_1',
            createdAt: new Date('2024-01-01')
          }
        ];
        const mockAuditLogs2 = [
          {
            id: 'audit_2',
            adminId: 'system',
            action: 'escrow_created',
            entityType: 'escrow',
            entityId: 'escrow_2',
            createdAt: new Date('2024-01-02')
          }
        ];

        mockEscrowRepository.findByMerchantId.mockResolvedValue(mockEscrows as any);
        mockAuditLogRepository.findByEntity
          .mockResolvedValueOnce(mockAuditLogs1 as any)
          .mockResolvedValueOnce(mockAuditLogs2 as any);

        // Act
        const result = await escrowService.getMerchantEscrowAuditTrail(merchantId);

        // Assert
        expect(result).toHaveLength(2);
        expect(result[0].entityId).toBe('escrow_2'); // Most recent first
        expect(result[1].entityId).toBe('escrow_1');
        expect(mockEscrowRepository.findByMerchantId).toHaveBeenCalledWith(merchantId);
      });

      it('should filter merchant audit trail by date range', async () => {
        // Arrange
        const merchantId = 'merchant_123';
        const startDate = new Date('2024-01-10');
        const endDate = new Date('2024-01-20');
        const mockEscrows = [
          { id: 'escrow_1', orderId: 'order_1' }
        ];
        const mockAuditLogs = [
          {
            id: 'audit_1',
            adminId: 'system',
            action: 'escrow_created',
            entityType: 'escrow',
            entityId: 'escrow_1',
            createdAt: new Date('2024-01-05') // Before range
          },
          {
            id: 'audit_2',
            adminId: 'system',
            action: 'escrow_released',
            entityType: 'escrow',
            entityId: 'escrow_1',
            createdAt: new Date('2024-01-15') // Within range
          }
        ];

        mockEscrowRepository.findByMerchantId.mockResolvedValue(mockEscrows as any);
        mockAuditLogRepository.findByEntity.mockResolvedValue(mockAuditLogs as any);

        // Act
        const result = await escrowService.getMerchantEscrowAuditTrail(
          merchantId,
          startDate,
          endDate
        );

        // Assert
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('audit_2');
      });

      it('should return empty array if merchant has no escrows', async () => {
        // Arrange
        const merchantId = 'merchant_123';

        mockEscrowRepository.findByMerchantId.mockResolvedValue([]);

        // Act
        const result = await escrowService.getMerchantEscrowAuditTrail(merchantId);

        // Assert
        expect(result).toEqual([]);
      });
    });

    describe('getEscrowStatistics', () => {
      it('should calculate escrow transaction statistics', async () => {
        // Arrange
        const mockAuditLogs = [
          {
            id: 'audit_1',
            action: 'escrow_created',
            changes: { amount: 100, currency: 'USDT_BEP20' }
          },
          {
            id: 'audit_2',
            action: 'escrow_created',
            changes: { amount: 200, currency: 'BNB' }
          },
          {
            id: 'audit_3',
            action: 'escrow_released',
            changes: { merchantAmount: 95, currency: 'USDT_BEP20' }
          },
          {
            id: 'audit_4',
            action: 'escrow_refunded',
            changes: { refundAmount: 50, currency: 'BNB' }
          }
        ];

        mockAuditLogRepository.search.mockResolvedValue({
          data: mockAuditLogs,
          total: 4
        } as any);

        // Act
        const result = await escrowService.getEscrowStatistics();

        // Assert
        expect(result.totalCreated).toBe(2);
        expect(result.totalReleased).toBe(1);
        expect(result.totalRefunded).toBe(1);
        expect(result.totalAmount['USDT_BEP20']).toBe(100);
        expect(result.totalAmount['BNB']).toBe(200);
        expect(result.releasedAmount['USDT_BEP20']).toBe(95);
        expect(result.refundedAmount['BNB']).toBe(50);
      });

      it('should filter statistics by date range', async () => {
        // Arrange
        const startDate = new Date('2024-01-01');
        const endDate = new Date('2024-01-31');

        mockAuditLogRepository.search.mockResolvedValue({
          data: [],
          total: 0
        } as any);

        // Act
        await escrowService.getEscrowStatistics(startDate, endDate);

        // Assert
        expect(mockAuditLogRepository.search).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'escrow',
            startDate,
            endDate
          }),
          10000,
          0
        );
      });
    });
  });
});
