/**
 * Order Service
 * 
 * Manages order creation, status updates, and lifecycle for cryptocurrency payments.
 * Coordinates with HD wallet service for address generation and payment processing.
 * 
 * Requirements: 3.1, 3.6, 12.1, 12.2 (Requirements 2.1, 5.2, 5.7)
 * 
 * Features:
 * - Create orders with unique deposit addresses
 * - Generate QR codes for payment
 * - Track order status through payment lifecycle
 * - Handle order expiration (24 hours)
 * - Calculate expected payment amounts
 */

import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import { OrderRepository } from '../database/repositories/OrderRepository';
import { ListingRepository } from '../database/repositories/ListingRepository';
import { hdWalletService } from './HDWalletService';
import { logger } from '../utils/logger';
import {
  Order,
  OrderStatus,
  CreateOrderRequest,
  CryptoCurrency,
  ORDER_EXPIRATION_MS,
  OrderWithRelations
} from '../types/models';

/**
 * Order creation response with payment details
 */
export interface OrderResponse {
  order: Order;
  paymentDetails: {
    depositAddress: string;
    amount: number;
    currency: CryptoCurrency;
    qrCode: string;
    expiresAt: Date;
  };
}

/**
 * Order Service
 * 
 * Handles order creation and management for channel subscription purchases.
 * Generates unique deposit addresses and tracks payment status.
 */
export class OrderService {
  private orderRepository: OrderRepository;
  private listingRepository: ListingRepository;

  constructor() {
    this.orderRepository = new OrderRepository();
    this.listingRepository = new ListingRepository();
  }

  /**
   * Create a new order for a listing purchase
   * 
   * Steps:
   * 1. Validate listing exists and is active
   * 2. Generate unique deposit address
   * 3. Calculate expected payment amount
   * 4. Create order record
   * 5. Generate QR code for payment
   * 6. Set expiration time (24 hours)
   * 
   * @param buyerId - User ID of the buyer
   * @param request - Order creation request
   * @returns Order with payment details
   */
  async createOrder(buyerId: string, request: CreateOrderRequest): Promise<OrderResponse> {
    try {
      logger.info('Creating order', { buyerId, listingId: request.listingId });

      // Validate listing
      const listing = await this.listingRepository.findById(request.listingId);
      if (!listing) {
        throw new Error(`Listing not found: ${request.listingId}`);
      }

      if (listing.status !== 'active') {
        throw new Error(`Listing is not active: ${listing.status}`);
      }

      // Generate order ID
      const orderId = uuidv4();

      // Generate unique deposit address
      const depositAddress = await hdWalletService.generateDepositAddress(
        orderId,
        listing.currency
      );

      // Calculate expected payment amount
      const amount = listing.price;

      // Calculate expiration time (24 hours from now)
      const expiresAt = new Date(Date.now() + ORDER_EXPIRATION_MS);

      // Create order
      const orderData: Partial<Order> = {
        id: orderId,
        buyerId,
        listingId: listing.id,
        depositAddress,
        amount,
        currency: listing.currency,
        status: OrderStatus.PENDING_PAYMENT,
        confirmations: 0,
        expiresAt
      };

      const order = await this.orderRepository.create(orderData as Order);

      if (!order) {
        throw new Error('Failed to create order');
      }

      // Generate QR code for payment
      const qrCode = await this.generatePaymentQRCode(
        depositAddress,
        amount,
        listing.currency
      );

      logger.info('Order created successfully', {
        orderId: order.id,
        buyerId,
        listingId: listing.id,
        amount,
        currency: listing.currency,
        depositAddress,
        expiresAt
      });

      return {
        order,
        paymentDetails: {
          depositAddress,
          amount,
          currency: listing.currency,
          qrCode,
          expiresAt
        }
      };

    } catch (error) {
      logger.error('Error creating order', { error, buyerId, request });
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<Order | null> {
    try {
      return await this.orderRepository.findById(orderId);
    } catch (error) {
      logger.error('Error getting order', { error, orderId });
      throw error;
    }
  }

  /**
   * Get order with relations (listing, buyer, subscription, transactions)
   */
  async getOrderWithRelations(orderId: string): Promise<OrderWithRelations | null> {
    try {
      return await this.orderRepository.findByIdWithRelations(orderId);
    } catch (error) {
      logger.error('Error getting order with relations', { error, orderId });
      throw error;
    }
  }

  /**
   * Get orders by buyer ID
   */
  async getBuyerOrders(buyerId: string): Promise<Order[]> {
    try {
      return await this.orderRepository.findByBuyerId(buyerId);
    } catch (error) {
      logger.error('Error getting buyer orders', { error, buyerId });
      throw error;
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | null> {
    try {
      logger.info('Updating order status', { orderId, status });

      const order = await this.orderRepository.updateStatus(orderId, status);

      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      logger.info('Order status updated', { orderId, status });
      return order;

    } catch (error) {
      logger.error('Error updating order status', { error, orderId, status });
      throw error;
    }
  }

  /**
   * Expire unpaid orders
   * 
   * Finds orders that are:
   * - Status: pending_payment
   * - Expiration time has passed
   * 
   * Updates their status to 'expired' and releases deposit addresses for reuse.
   * This should be called by a scheduled job every 15 minutes.
   */
  async expireUnpaidOrders(): Promise<number> {
    try {
      logger.info('Expiring unpaid orders');

      // Find expired unpaid orders
      const expiredOrders = await this.orderRepository.findExpiredUnpaid();

      if (expiredOrders.length === 0) {
        logger.info('No expired orders found');
        return 0;
      }

      logger.info('Found expired orders', { count: expiredOrders.length });

      // Mark orders as expired
      const orderIds = expiredOrders.map(order => order.id);
      const count = await this.orderRepository.markExpired(orderIds);

      logger.info('Expired orders marked', { count });

      // TODO: Release deposit addresses for reuse
      // This could be implemented by marking addresses as available in deposit_addresses table

      return count;

    } catch (error) {
      logger.error('Error expiring unpaid orders', { error });
      throw error;
    }
  }

  /**
   * Get order by deposit address
   */
  async getOrderByDepositAddress(depositAddress: string): Promise<Order | null> {
    try {
      return await this.orderRepository.findByDepositAddress(depositAddress);
    } catch (error) {
      logger.error('Error getting order by deposit address', { error, depositAddress });
      throw error;
    }
  }

  /**
   * Get orders by status
   */
  async getOrdersByStatus(status: OrderStatus): Promise<Order[]> {
    try {
      return await this.orderRepository.findByStatus(status);
    } catch (error) {
      logger.error('Error getting orders by status', { error, status });
      throw error;
    }
  }

  /**
   * Generate QR code for payment
   * 
   * Generates a QR code containing payment information in the appropriate format
   * for each cryptocurrency:
   * - BNB/BEP-20: ethereum:{address}?value={amount}
   * - Bitcoin: bitcoin:{address}?amount={amount}
   * - TRON: tron:{address}?amount={amount}
   * 
   * @param address - Deposit address
   * @param amount - Payment amount
   * @param currency - Cryptocurrency type
   * @returns Base64-encoded QR code image
   */
  private async generatePaymentQRCode(
    address: string,
    amount: number,
    currency: CryptoCurrency
  ): Promise<string> {
    try {
      // Generate payment URI based on currency
      let paymentUri: string;

      switch (currency) {
        case 'BNB':
        case 'USDT_BEP20':
        case 'USDC_BEP20':
          // Ethereum URI format (BNB Chain uses same format)
          paymentUri = `ethereum:${address}?value=${amount}`;
          break;

        case 'BTC':
          // Bitcoin URI format
          paymentUri = `bitcoin:${address}?amount=${amount}`;
          break;

        case 'USDT_TRC20':
          // TRON URI format
          paymentUri = `tron:${address}?amount=${amount}`;
          break;

        default:
          throw new Error(`Unsupported currency for QR code: ${currency}`);
      }

      // Generate QR code as base64 data URL
      const qrCode = await QRCode.toDataURL(paymentUri, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 300,
        margin: 2
      });

      return qrCode;

    } catch (error) {
      logger.error('Error generating QR code', { error, address, amount, currency });
      throw new Error(`Failed to generate QR code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate order statistics for admin dashboard
   */
  async getOrderStatistics(): Promise<{
    total: number;
    pendingPayment: number;
    paymentDetected: number;
    paymentConfirmed: number;
    active: number;
    expired: number;
    refunded: number;
  }> {
    try {
      const [
        total,
        pendingPayment,
        paymentDetected,
        paymentConfirmed,
        active,
        expired,
        refunded
      ] = await Promise.all([
        this.orderRepository.count({}),
        this.orderRepository.countByStatus(OrderStatus.PENDING_PAYMENT),
        this.orderRepository.countByStatus(OrderStatus.PAYMENT_DETECTED),
        this.orderRepository.countByStatus(OrderStatus.PAYMENT_CONFIRMED),
        this.orderRepository.countByStatus(OrderStatus.SUBSCRIPTION_ACTIVE),
        this.orderRepository.countByStatus(OrderStatus.EXPIRED),
        this.orderRepository.countByStatus(OrderStatus.REFUNDED)
      ]);

      return {
        total,
        pendingPayment,
        paymentDetected,
        paymentConfirmed,
        active,
        expired,
        refunded
      };

    } catch (error) {
      logger.error('Error getting order statistics', { error });
      throw error;
    }
  }

  /**
   * Get recent orders (for admin dashboard)
   */
  async getRecentOrders(limit: number = 10): Promise<Order[]> {
    try {
      return await this.orderRepository.getRecent(limit);
    } catch (error) {
      logger.error('Error getting recent orders', { error, limit });
      throw error;
    }
  }

  /**
   * Expire orders that have passed their expiration time
   * 
   * Finds orders where expires_at <= now AND status = 'pending_payment'
   * and updates their status to 'expired'.
   * 
   * Requirements: 3.6, 12.7
   * 
   * @returns Statistics about expired orders
   */
  async expireOrders(): Promise<{ expired: number; errors: number }> {
    try {
      logger.info('Expiring orders');

      const now = new Date();
      let expired = 0;
      let errors = 0;

      // Find pending orders that have expired
      const expiredOrders = await this.orderRepository.findExpired();

      logger.info('Found expired orders', { count: expiredOrders.length });

      for (const order of expiredOrders) {
        try {
          // Update order status to expired
          await this.orderRepository.updateStatus(order.id, OrderStatus.EXPIRED);

          logger.info('Order expired', {
            orderId: order.id,
            buyerId: order.buyerId,
            listingId: order.listingId,
            expiresAt: order.expiresAt
          });

          // TODO: Release deposit address for reuse
          // This would be implemented when we have address pool management

          expired++;
        } catch (error) {
          logger.error('Error expiring order', {
            error,
            orderId: order.id
          });
          errors++;
        }
      }

      logger.info('Order expiry completed', { expired, errors });

      return { expired, errors };
    } catch (error) {
      logger.error('Error in expireOrders', { error });
      throw error;
    }
  }
}

// Export singleton instance
export const orderService = new OrderService();
