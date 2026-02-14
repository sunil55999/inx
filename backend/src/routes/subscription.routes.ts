/**
 * Subscription Routes
 * API endpoints for subscription management and renewal
 * 
 * Requirements: 10.5, 10.6
 */

import { Router, Request, Response, NextFunction } from 'express';
import { subscriptionService } from '../services/SubscriptionService';
import { UserRole } from '../types/models';
import { authenticate } from '../middleware/auth.middleware';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/subscriptions
 * List user's subscriptions
 * 
 * Authentication: Required
 * 
 * Response:
 * - subscriptions: Array of Subscription objects
 * 
 * Requirements: 10.5
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    // If admin, they can query all subscriptions or filter by buyer
    let subscriptions;
    if (req.user!.role === UserRole.ADMIN && req.query.buyerId) {
      subscriptions = await subscriptionService.getBuyerSubscriptions(req.query.buyerId as string);
    } else {
      subscriptions = await subscriptionService.getBuyerSubscriptions(userId);
    }

    res.status(200).json({
      subscriptions: subscriptions.map(sub => ({
        id: sub.id,
        buyerId: sub.buyerId,
        listingId: sub.listingId,
        orderId: sub.orderId,
        channelId: sub.channelId,
        status: sub.status,
        startDate: sub.startDate,
        expiryDate: sub.expiryDate,
        durationDays: sub.durationDays,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      })),
      total: subscriptions.length,
    });
  } catch (error) {
    logger.error('List subscriptions failed', { error, userId: req.user!.id });
    return next(error);
  }
});

/**
 * GET /api/subscriptions/:id
 * Get subscription details
 * 
 * Authentication: Required
 * 
 * Response:
 * - subscription: Subscription object with relations (listing, order)
 * 
 * Requirements: 10.5
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriptionId = req.params.id;
    const userId = req.user!.id;

    const subscription = await subscriptionService.getSubscriptionWithRelations(subscriptionId);

    if (!subscription) {
      return res.status(404).json({
        error: {
          code: 'SUBSCRIPTION_NOT_FOUND',
          message: 'Subscription not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Authorization: Only the buyer or admin can view the subscription
    if (subscription.buyerId !== userId && req.user!.role !== UserRole.ADMIN) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this subscription',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    res.status(200).json({
      subscription: {
        id: subscription.id,
        buyerId: subscription.buyerId,
        listingId: subscription.listingId,
        orderId: subscription.orderId,
        channelId: subscription.channelId,
        status: subscription.status,
        startDate: subscription.startDate,
        expiryDate: subscription.expiryDate,
        durationDays: subscription.durationDays,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
        listing: subscription.listing,
        order: subscription.order,
      },
    });
  } catch (error) {
    logger.error('Get subscription failed', { error, subscriptionId: req.params.id });
    return next(error);
  }
});

/**
 * POST /api/subscriptions/:id/renew
 * Renew a subscription
 * 
 * Creates a new order for the same listing to extend the subscription.
 * The subscription must be within 7 days of expiry to be eligible for renewal.
 * 
 * Authentication: Required
 * 
 * Response:
 * - eligible: boolean - Whether the subscription is eligible for renewal
 * - reason: string (optional) - Reason if not eligible
 * - order: Order object (if eligible) - New order for renewal payment
 * 
 * Requirements: 10.5, 10.6
 */
router.post('/:id/renew', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriptionId = req.params.id;
    const userId = req.user!.id;

    // Get subscription to verify ownership
    const subscription = await subscriptionService.getSubscription(subscriptionId);

    if (!subscription) {
      return res.status(404).json({
        error: {
          code: 'SUBSCRIPTION_NOT_FOUND',
          message: 'Subscription not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Authorization: Only the buyer can renew their subscription
    if (subscription.buyerId !== userId) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to renew this subscription',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Attempt renewal
    const result = await subscriptionService.renewSubscription(subscriptionId);

    if (!result.eligible) {
      return res.status(400).json({
        error: {
          code: 'RENEWAL_NOT_ELIGIBLE',
          message: result.reason || 'Subscription is not eligible for renewal',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    logger.info('Subscription renewal initiated', {
      subscriptionId,
      orderId: result.order.id,
      buyerId: userId,
    });

    res.status(201).json({
      eligible: true,
      order: {
        id: result.order.id,
        buyerId: result.order.buyerId,
        listingId: result.order.listingId,
        depositAddress: result.order.depositAddress,
        amount: result.order.amount,
        currency: result.order.currency,
        status: result.order.status,
        confirmations: result.order.confirmations,
        createdAt: result.order.createdAt,
        expiresAt: result.order.expiresAt,
      },
      paymentDetails: result.order.paymentDetails,
    });
  } catch (error) {
    logger.error('Subscription renewal failed', { error, subscriptionId: req.params.id });
    return next(error);
  }
});

/**
 * GET /api/subscriptions/:id/renewal-eligibility
 * Check if a subscription is eligible for renewal
 * 
 * Authentication: Required
 * 
 * Response:
 * - eligible: boolean
 * - reason: string (optional) - Reason if not eligible
 * - daysUntilExpiry: number - Days until subscription expires
 * 
 * Requirements: 10.5, 10.6
 */
router.get('/:id/renewal-eligibility', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subscriptionId = req.params.id;
    const userId = req.user!.id;

    // Get subscription to verify ownership
    const subscription = await subscriptionService.getSubscription(subscriptionId);

    if (!subscription) {
      return res.status(404).json({
        error: {
          code: 'SUBSCRIPTION_NOT_FOUND',
          message: 'Subscription not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Authorization: Only the buyer or admin can check eligibility
    if (subscription.buyerId !== userId && req.user!.role !== UserRole.ADMIN) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to check this subscription',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Check eligibility
    const eligible = await subscriptionService.isEligibleForRenewal(subscriptionId);

    // Calculate days until expiry
    const now = new Date();
    const daysUntilExpiry = Math.ceil(
      (subscription.expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );

    let reason: string | undefined;
    if (!eligible) {
      if (subscription.status === 'refunded') {
        reason = 'Subscription has been refunded';
      } else if (subscription.status === 'cancelled') {
        reason = 'Subscription has been cancelled';
      } else if (daysUntilExpiry > 7) {
        reason = `Subscription expires in ${daysUntilExpiry} days. Renewal available within 7 days of expiry.`;
      } else {
        reason = 'Subscription is not eligible for renewal';
      }
    }

    res.status(200).json({
      eligible,
      reason,
      daysUntilExpiry,
      expiryDate: subscription.expiryDate,
      status: subscription.status,
    });
  } catch (error) {
    logger.error('Check renewal eligibility failed', { error, subscriptionId: req.params.id });
    return next(error);
  }
});

export default router;
