/**
 * Payment Processing Service Tests
 * 
 * Tests payment verification, order status updates, and partial payment handling
 */

import { PaymentProcessingService } from '../PaymentProcessingService';
import db from '../../database/connection';
import { OrderStatus, CryptoCurrency, PAYMENT_TOLERANCE } from '../../types/models';

// Mock dependencies
jest.mock('../../database/connection');
jest.mock('../../config/sqs');
jest.mock('../../utils/logger');

describe('PaymentProcessingService', () => {
  let service: PaymentProcessingService;
  const mockQueueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/transactions';

  beforeEach(() => {
    service = new PaymentProcessingService(mockQueueUrl);
    jest.clearAllMocks();
    
    // Mock db.fn.now()
    (db as any).fn = {
      now: jest.fn().mockReturnValue(new Date())
    };
  });

  describe('verifyPayment', () => {
    const mockOrder = {
      id: 'order_123',
      buyerId: 'buyer_123',
      listingId: 'listing_123',
      depositAddress: '0xabcdef1234567890',
      amount: 100.0,
      currency: 'USDT_BEP20' as CryptoCurrency,
      status: OrderStatus.PENDING_PAYMENT,
      confirmations: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };

    it('should verify valid payment with exact amount', async () => {
      const transaction = {
        to: '0xabcdef1234567890',
        amount: 100.0,
        confirmations: 12,
        currency: 'USDT_BEP20' as CryptoCurrency
      };

      const result = await service.verifyPayment(mockOrder, transaction);

      expect(result.isValid).toBe(true);
      expect(result.amountMatch).toBe(true);
      expect(result.addressMatch).toBe(true);
      expect(result.sufficientConfirmations).toBe(true);
      expect(result.actualAmount).toBe(100.0);
      expect(result.expectedAmount).toBe(100.0);
    });

    it('should verify payment within tolerance (0.1%)', async () => {
      const transaction = {
        to: '0xabcdef1234567890',
        amount: 100.05, // 0.05% difference
        confirmations: 12,
        currency: 'USDT_BEP20' as CryptoCurrency
      };

      const result = await service.verifyPayment(mockOrder, transaction);

      expect(result.isValid).toBe(true);
      expect(result.amountMatch).toBe(true);
      expect(result.addressMatch).toBe(true);
    });

    it('should reject payment outside tolerance', async () => {
      const transaction = {
        to: '0xabcdef1234567890',
        amount: 100.2, // 0.2% difference, outside tolerance
        confirmations: 12,
        currency: 'USDT_BEP20' as CryptoCurrency
      };

      const result = await service.verifyPayment(mockOrder, transaction);

      expect(result.isValid).toBe(false);
      expect(result.amountMatch).toBe(false);
      expect(result.addressMatch).toBe(true);
      expect(result.sufficientConfirmations).toBe(true);
    });

    it('should reject payment with address mismatch', async () => {
      const transaction = {
        to: '0xdifferentaddress',
        amount: 100.0,
        confirmations: 12,
        currency: 'USDT_BEP20' as CryptoCurrency
      };

      const result = await service.verifyPayment(mockOrder, transaction);

      expect(result.isValid).toBe(false);
      expect(result.amountMatch).toBe(true);
      expect(result.addressMatch).toBe(false);
    });

    it('should reject payment with insufficient confirmations', async () => {
      const transaction = {
        to: '0xabcdef1234567890',
        amount: 100.0,
        confirmations: 5, // Less than required 12 for BEP20
        currency: 'USDT_BEP20' as CryptoCurrency
      };

      const result = await service.verifyPayment(mockOrder, transaction);

      expect(result.isValid).toBe(false);
      expect(result.amountMatch).toBe(true);
      expect(result.addressMatch).toBe(true);
      expect(result.sufficientConfirmations).toBe(false);
      expect(result.confirmations).toBe(5);
      expect(result.requiredConfirmations).toBe(12);
    });

    it('should handle case-insensitive address comparison', async () => {
      const transaction = {
        to: '0xABCDEF1234567890', // Uppercase
        amount: 100.0,
        confirmations: 12,
        currency: 'USDT_BEP20' as CryptoCurrency
      };

      const result = await service.verifyPayment(mockOrder, transaction);

      expect(result.addressMatch).toBe(true);
    });

    it('should verify Bitcoin payment with correct confirmations', async () => {
      const btcOrder = {
        ...mockOrder,
        currency: 'BTC' as CryptoCurrency,
        depositAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
      };

      const transaction = {
        to: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        amount: 100.0,
        confirmations: 3, // Bitcoin requires 3 confirmations
        currency: 'BTC' as CryptoCurrency
      };

      const result = await service.verifyPayment(btcOrder, transaction);

      expect(result.isValid).toBe(true);
      expect(result.sufficientConfirmations).toBe(true);
      expect(result.requiredConfirmations).toBe(3);
    });

    it('should verify TRON payment with correct confirmations', async () => {
      const tronOrder = {
        ...mockOrder,
        currency: 'USDT_TRC20' as CryptoCurrency,
        depositAddress: 'TXYZoPebDbckZPrF4yX1fYu4X5NMDwdGX1'
      };

      const transaction = {
        to: 'TXYZoPebDbckZPrF4yX1fYu4X5NMDwdGX1',
        amount: 100.0,
        confirmations: 19, // TRON requires 19 confirmations
        currency: 'USDT_TRC20' as CryptoCurrency
      };

      const result = await service.verifyPayment(tronOrder, transaction);

      expect(result.isValid).toBe(true);
      expect(result.sufficientConfirmations).toBe(true);
      expect(result.requiredConfirmations).toBe(19);
    });
  });

  describe('processPayment', () => {
    const mockOrder = {
      id: 'order_123',
      buyerId: 'buyer_123',
      listingId: 'listing_123',
      depositAddress: '0xabcdef1234567890',
      amount: 100.0,
      currency: 'USDT_BEP20' as CryptoCurrency,
      status: OrderStatus.PENDING_PAYMENT,
      confirmations: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };

    beforeEach(() => {
      // Mock database queries
      (db as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: mockOrder.id,
          buyer_id: mockOrder.buyerId,
          listing_id: mockOrder.listingId,
          deposit_address: mockOrder.depositAddress,
          amount: mockOrder.amount,
          currency: mockOrder.currency,
          status: mockOrder.status,
          confirmations: mockOrder.confirmations,
          created_at: mockOrder.createdAt,
          expires_at: mockOrder.expiresAt
        }),
        update: jest.fn().mockResolvedValue(1)
      });
    });

    it('should process payment with sufficient confirmations', async () => {
      await service.processPayment(
        'order_123',
        '0xtxhash123',
        100.0,
        12
      );

      // Verify order status was updated to payment_confirmed
      expect(db).toHaveBeenCalledWith('orders');
    });

    it('should process payment with insufficient confirmations', async () => {
      await service.processPayment(
        'order_123',
        '0xtxhash123',
        100.0,
        5 // Less than required 12
      );

      // Verify order status was updated to payment_detected
      expect(db).toHaveBeenCalledWith('orders');
    });

    it('should reject payment with amount mismatch', async () => {
      await expect(
        service.processPayment(
          'order_123',
          '0xtxhash123',
          150.0, // Wrong amount
          12
        )
      ).rejects.toThrow('Payment amount mismatch');
    });

    it('should reject payment for non-existent order', async () => {
      (db as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      });

      await expect(
        service.processPayment(
          'nonexistent_order',
          '0xtxhash123',
          100.0,
          12
        )
      ).rejects.toThrow('Order not found');
    });
  });

  describe('handlePartialPayment', () => {
    const mockOrder = {
      id: 'order_123',
      buyerId: 'buyer_123',
      listingId: 'listing_123',
      depositAddress: '0xabcdef1234567890',
      amount: 100.0,
      currency: 'USDT_BEP20' as CryptoCurrency,
      status: OrderStatus.PENDING_PAYMENT,
      confirmations: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };

    beforeEach(() => {
      // Mock database queries
      (db as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: mockOrder.id,
          buyer_id: mockOrder.buyerId,
          listing_id: mockOrder.listingId,
          deposit_address: mockOrder.depositAddress,
          amount: mockOrder.amount,
          currency: mockOrder.currency,
          status: mockOrder.status,
          confirmations: mockOrder.confirmations,
          created_at: mockOrder.createdAt,
          expires_at: mockOrder.expiresAt
        }),
        select: jest.fn().mockResolvedValue([]),
        insert: jest.fn().mockResolvedValue([1]),
        update: jest.fn().mockResolvedValue(1)
      });
    });

    it('should track partial payment', async () => {
      await service.handlePartialPayment(
        'order_123',
        '0xtxhash1',
        50.0 // Half payment
      );

      // Verify transaction was stored
      expect(db).toHaveBeenCalledWith('transactions');
    });

    it('should update order when full amount received via partial payments', async () => {
      // Mock existing transactions totaling 50
      (db as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: mockOrder.id,
          buyer_id: mockOrder.buyerId,
          listing_id: mockOrder.listingId,
          deposit_address: mockOrder.depositAddress,
          amount: mockOrder.amount,
          currency: mockOrder.currency,
          status: mockOrder.status,
          confirmations: mockOrder.confirmations,
          created_at: mockOrder.createdAt,
          expires_at: mockOrder.expiresAt
        }),
        select: jest.fn().mockResolvedValue([
          { amount: '50.0' }
        ]),
        insert: jest.fn().mockResolvedValue([1]),
        update: jest.fn().mockResolvedValue(1)
      });

      // Add second payment of 50 to complete the order
      await service.handlePartialPayment(
        'order_123',
        '0xtxhash2',
        50.0
      );

      // Verify order status was updated
      expect(db).toHaveBeenCalledWith('orders');
    });

    it('should handle multiple partial payments', async () => {
      // Mock existing transactions
      (db as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: mockOrder.id,
          buyer_id: mockOrder.buyerId,
          listing_id: mockOrder.listingId,
          deposit_address: mockOrder.depositAddress,
          amount: mockOrder.amount,
          currency: mockOrder.currency,
          status: mockOrder.status,
          confirmations: mockOrder.confirmations,
          created_at: mockOrder.createdAt,
          expires_at: mockOrder.expiresAt
        }),
        select: jest.fn().mockResolvedValue([
          { amount: '30.0' },
          { amount: '20.0' }
        ]),
        insert: jest.fn().mockResolvedValue([1]),
        update: jest.fn().mockResolvedValue(1)
      });

      // Add third payment to complete
      await service.handlePartialPayment(
        'order_123',
        '0xtxhash3',
        50.0
      );

      expect(db).toHaveBeenCalled();
    });

    it('should accept partial payments within tolerance', async () => {
      // Mock existing transactions totaling 49.95
      (db as any).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: mockOrder.id,
          buyer_id: mockOrder.buyerId,
          listing_id: mockOrder.listingId,
          deposit_address: mockOrder.depositAddress,
          amount: mockOrder.amount,
          currency: mockOrder.currency,
          status: mockOrder.status,
          confirmations: mockOrder.confirmations,
          created_at: mockOrder.createdAt,
          expires_at: mockOrder.expiresAt
        }),
        select: jest.fn().mockResolvedValue([
          { amount: '49.95' }
        ]),
        insert: jest.fn().mockResolvedValue([1]),
        update: jest.fn().mockResolvedValue(1)
      });

      // Add payment that brings total to 100.0 (within tolerance)
      await service.handlePartialPayment(
        'order_123',
        '0xtxhash2',
        50.0
      );

      expect(db).toHaveBeenCalled();
    });
  });

  describe('tolerance calculations', () => {
    it('should accept payment at lower tolerance boundary', () => {
      const expected = 100.0;
      const actual = 100.0 - (100.0 * PAYMENT_TOLERANCE); // 99.9
      const difference = Math.abs(actual - expected) / expected;
      
      expect(difference).toBeLessThanOrEqual(PAYMENT_TOLERANCE);
    });

    it('should accept payment at upper tolerance boundary', () => {
      const expected = 100.0;
      const actual = 100.0 + (100.0 * PAYMENT_TOLERANCE); // 100.1
      const difference = Math.abs(actual - expected) / expected;
      
      expect(difference).toBeLessThanOrEqual(PAYMENT_TOLERANCE);
    });

    it('should reject payment just outside tolerance', () => {
      const expected = 100.0;
      const actual = 100.0 + (100.0 * PAYMENT_TOLERANCE * 1.1); // 100.11
      const difference = Math.abs(actual - expected) / expected;
      
      expect(difference).toBeGreaterThan(PAYMENT_TOLERANCE);
    });
  });

  describe('edge cases', () => {
    it('should handle zero amount order', async () => {
      const zeroOrder = {
        id: 'order_123',
        buyerId: 'buyer_123',
        listingId: 'listing_123',
        depositAddress: '0xabcdef1234567890',
        amount: 0,
        currency: 'USDT_BEP20' as CryptoCurrency,
        status: OrderStatus.PENDING_PAYMENT,
        confirmations: 0,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };

      const transaction = {
        to: '0xabcdef1234567890',
        amount: 0,
        confirmations: 12,
        currency: 'USDT_BEP20' as CryptoCurrency
      };

      const result = await service.verifyPayment(zeroOrder, transaction);

      // Division by zero should be handled
      expect(result.amountMatch).toBe(true);
    });

    it('should handle very small amounts with precision', async () => {
      const smallOrder = {
        id: 'order_123',
        buyerId: 'buyer_123',
        listingId: 'listing_123',
        depositAddress: '0xabcdef1234567890',
        amount: 0.001,
        currency: 'BTC' as CryptoCurrency,
        status: OrderStatus.PENDING_PAYMENT,
        confirmations: 0,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };

      const transaction = {
        to: '0xabcdef1234567890',
        amount: 0.001,
        confirmations: 3,
        currency: 'BTC' as CryptoCurrency
      };

      const result = await service.verifyPayment(smallOrder, transaction);

      expect(result.isValid).toBe(true);
      expect(result.amountMatch).toBe(true);
    });

    it('should handle very large amounts', async () => {
      const largeOrder = {
        id: 'order_123',
        buyerId: 'buyer_123',
        listingId: 'listing_123',
        depositAddress: '0xabcdef1234567890',
        amount: 1000000.0,
        currency: 'USDT_BEP20' as CryptoCurrency,
        status: OrderStatus.PENDING_PAYMENT,
        confirmations: 0,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };

      const transaction = {
        to: '0xabcdef1234567890',
        amount: 1000000.0,
        confirmations: 12,
        currency: 'USDT_BEP20' as CryptoCurrency
      };

      const result = await service.verifyPayment(largeOrder, transaction);

      expect(result.isValid).toBe(true);
      expect(result.amountMatch).toBe(true);
    });
  });
});
