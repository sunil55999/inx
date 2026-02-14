/**
 * Order Routes
 * API endpoints for order management and payment processing
 * 
 * Requirements: 12.1, 12.2, 12.5
 */

import { Router, Request, Response, NextFunction } from 'express';
import { orderService } from '../services/OrderService';
import { CreateOrderRequest, UserRole } from '../types/models';
import { authenticate } from '../middleware/auth.middleware';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/orders
 * Create a new order for a listing purchase
 * 
 * Authentication: Required (Buyer, Merchant, or Admin role)
 * 
 * Body:
 * - listingId: string
 * 
 * Response:
 * - order: Order object with payment details
 * - paymentDetails: { depositAddress, amount, currency, qrCode, expiresAt }
 * 
 * Requirements: 12.1, 12.2
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const buyerId = req.user!.id;

    const request: CreateOrderRequest = {
      listingId: req.body.listingId,
    };

    // Validate required fields
    if (!request.listingId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required field: listingId',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const result = await orderService.createOrder(buyerId, request);

    logger.info('Order created', { 
      orderId: result.order.id, 
      buyerId, 
      listingId: request.listingId 
    });

    res.status(201).json({
      order: {
        id: result.order.id,
        buyerId: result.order.buyerId,
        listingId: result.order.listingId,
        depositAddress: result.order.depositAddress,
        amount: result.order.amount,
        currency: result.order.currency,
        status: result.order.status,
        confirmations: result.order.confirmations,
        transactionHash: result.order.transactionHash,
        createdAt: result.order.createdAt,
        expiresAt: result.order.expiresAt,
        paidAt: result.order.paidAt,
      },
      paymentDetails: result.paymentDetails,
    });
  } catch (error) {
    logger.error('Create order failed', { error, body: req.body });
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage.includes('Listing not found')) {
      return res.status(404).json({
        error: {
          code: 'LISTING_NOT_FOUND',
          message: 'Listing not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (errorMessage.includes('not active')) {
      return res.status(400).json({
        error: {
          code: 'LISTING_INACTIVE',
          message: 'Cannot create order for inactive listing',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (errorMessage.includes('required') || errorMessage.includes('must be')) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: errorMessage,
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    return next(error);
  }
});

/**
 * GET /api/orders/:id
 * Get order details with payment status
 * 
 * Authentication: Required
 * 
 * Response:
 * - order: Order object with relations (listing, subscription, transactions)
 * 
 * Requirements: 12.2
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id;
    const userId = req.user!.id;

    const order = await orderService.getOrderWithRelations(orderId);

    if (!order) {
      return res.status(404).json({
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Authorization: Only the buyer or admin can view the order
    if (order.buyerId !== userId && req.user!.role !== UserRole.ADMIN) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this order',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    res.status(200).json({
      order: {
        id: order.id,
        buyerId: order.buyerId,
        listingId: order.listingId,
        depositAddress: order.depositAddress,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        confirmations: order.confirmations,
        transactionHash: order.transactionHash,
        createdAt: order.createdAt,
        expiresAt: order.expiresAt,
        paidAt: order.paidAt,
        listing: order.listing,
        subscription: order.subscription,
        transactions: order.transactions,
      },
    });
  } catch (error) {
    logger.error('Get order failed', { error, orderId: req.params.id });
    return next(error);
  }
});

/**
 * GET /api/orders
 * List user's orders
 * 
 * Authentication: Required
 * 
 * Query parameters:
 * - None (returns all orders for the authenticated user)
 * 
 * Response:
 * - orders: Array of Order objects
 * 
 * Requirements: 12.5
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    // If admin, they can query all orders or filter by buyer
    let orders;
    if (req.user!.role === UserRole.ADMIN && req.query.buyerId) {
      orders = await orderService.getBuyerOrders(req.query.buyerId as string);
    } else {
      orders = await orderService.getBuyerOrders(userId);
    }

    res.status(200).json({
      orders: orders.map(order => ({
        id: order.id,
        buyerId: order.buyerId,
        listingId: order.listingId,
        depositAddress: order.depositAddress,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        confirmations: order.confirmations,
        transactionHash: order.transactionHash,
        createdAt: order.createdAt,
        expiresAt: order.expiresAt,
        paidAt: order.paidAt,
      })),
      total: orders.length,
    });
  } catch (error) {
    logger.error('List orders failed', { error, userId: req.user!.id });
    return next(error);
  }
});

export default router;
