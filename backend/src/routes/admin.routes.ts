/**
 * Admin Routes
 * API endpoints for administrative functions
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.6
 */

import { Router, Request, Response, NextFunction } from 'express';
import { adminService } from '../services/AdminService';
import { merchantService } from '../services/MerchantService';
import { UserRole } from '../types/models';
import { authenticate } from '../middleware/auth.middleware';
import logger from '../utils/logger';

const router = Router();

/**
 * Middleware to check if user is admin
 */
const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user?.role !== UserRole.ADMIN) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required',
        retryable: false,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
    return;
  }
  next();
};

/**
 * GET /api/admin/disputes
 * Get disputes for review
 * 
 * Authentication: Required (Admin role)
 * 
 * Query parameters:
 * - status: string (optional)
 * - limit: number (optional, default 50)
 * - offset: number (optional, default 0)
 * 
 * Response:
 * - disputes: Array of Dispute objects
 * - total: number
 * 
 * Requirements: 13.1, 13.2
 */
router.get('/disputes', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const disputes = await adminService.getDisputesForReview(status as any, limit, offset);

    res.status(200).json({
      disputes: disputes.map(dispute => ({
        id: dispute.id,
        buyerId: dispute.buyerId,
        orderId: dispute.orderId,
        issue: dispute.issue,
        status: dispute.status,
        resolution: dispute.resolution,
        adminId: dispute.adminId,
        createdAt: dispute.createdAt,
        resolvedAt: dispute.resolvedAt,
      })),
      total: disputes.length,
    });
  } catch (error) {
    logger.error('Get disputes for review failed', { error });
    return next(error);
  }
});

/**
 * GET /api/admin/payouts
 * Get pending payouts
 * 
 * Authentication: Required (Admin role)
 * 
 * Query parameters:
 * - limit: number (optional, default 50)
 * 
 * Response:
 * - payouts: Array of Payout objects
 * - total: number
 * 
 * Requirements: 13.1, 13.3
 */
router.get('/payouts', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const payouts = await adminService.getPendingPayouts(limit);

    res.status(200).json({
      payouts: payouts.map(payout => ({
        id: payout.id,
        merchantId: payout.merchantId,
        amount: payout.amount,
        currency: payout.currency,
        walletAddress: payout.walletAddress,
        status: payout.status,
        createdAt: payout.createdAt,
      })),
      total: payouts.length,
    });
  } catch (error) {
    logger.error('Get pending payouts failed', { error });
    return next(error);
  }
});

/**
 * GET /api/admin/metrics
 * Get platform metrics
 * 
 * Authentication: Required (Admin role)
 * 
 * Response:
 * - metrics: Platform metrics object
 * 
 * Requirements: 13.1, 13.3
 */
router.get('/metrics', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics = await adminService.getPlatformMetrics();

    res.status(200).json({
      metrics,
    });
  } catch (error) {
    logger.error('Get platform metrics failed', { error });
    return next(error);
  }
});

/**
 * POST /api/admin/merchants/:id/suspend
 * Suspend merchant account
 * 
 * Authentication: Required (Admin role)
 * 
 * Body:
 * - reason: string
 * 
 * Response:
 * - merchant: Updated merchant object
 * 
 * Requirements: 13.4, 13.6
 */
router.post('/merchants/:id/suspend', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const merchantId = req.params.id;
    const adminId = req.user!.id;
    const reason = req.body.reason;

    if (!reason) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Suspension reason is required',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const merchant = await merchantService.suspendMerchant(merchantId, reason);

    // Log admin action
    await adminService.logAdminAction(
      adminId,
      'SUSPEND_MERCHANT',
      'merchant',
      merchantId,
      { reason }
    );

    logger.info('Merchant suspended by admin', { merchantId, adminId, reason });

    res.status(200).json({
      merchant: {
        id: merchant.id,
        storefrontSlug: merchant.storefrontSlug,
        displayName: merchant.displayName,
        isSuspended: merchant.isSuspended,
        updatedAt: merchant.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Suspend merchant failed', { error, merchantId: req.params.id });
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        error: {
          code: 'MERCHANT_NOT_FOUND',
          message: 'Merchant not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (errorMessage.includes('already suspended')) {
      return res.status(400).json({
        error: {
          code: 'ALREADY_SUSPENDED',
          message: 'Merchant is already suspended',
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
 * POST /api/admin/merchants/:id/unsuspend
 * Unsuspend merchant account
 * 
 * Authentication: Required (Admin role)
 * 
 * Response:
 * - merchant: Updated merchant object
 * 
 * Requirements: 13.4, 13.6
 */
router.post('/merchants/:id/unsuspend', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const merchantId = req.params.id;
    const adminId = req.user!.id;

    const merchant = await merchantService.unsuspendMerchant(merchantId);

    // Log admin action
    await adminService.logAdminAction(
      adminId,
      'UNSUSPEND_MERCHANT',
      'merchant',
      merchantId
    );

    logger.info('Merchant unsuspended by admin', { merchantId, adminId });

    res.status(200).json({
      merchant: {
        id: merchant.id,
        storefrontSlug: merchant.storefrontSlug,
        displayName: merchant.displayName,
        isSuspended: merchant.isSuspended,
        updatedAt: merchant.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Unsuspend merchant failed', { error, merchantId: req.params.id });
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        error: {
          code: 'MERCHANT_NOT_FOUND',
          message: 'Merchant not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (errorMessage.includes('not suspended')) {
      return res.status(400).json({
        error: {
          code: 'NOT_SUSPENDED',
          message: 'Merchant is not suspended',
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
 * GET /api/admin/audit-log
 * Get audit log entries
 * 
 * Authentication: Required (Admin role)
 * 
 * Query parameters:
 * - limit: number (optional, default 100)
 * - offset: number (optional, default 0)
 * 
 * Response:
 * - entries: Array of audit log entries
 * - total: number
 * 
 * Requirements: 13.6
 */
router.get('/audit-log', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const entries = await adminService.getAuditLog(limit, offset);

    res.status(200).json({
      entries,
      total: entries.length,
    });
  } catch (error) {
    logger.error('Get audit log failed', { error });
    return next(error);
  }
});

/**
 * GET /api/admin/statistics
 * Get platform statistics
 * 
 * Authentication: Required (Admin role)
 * 
 * Response:
 * - statistics: Statistics object
 * 
 * Requirements: 13.3
 */
router.get('/statistics', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const statistics = await adminService.getStatistics();

    res.status(200).json({
      statistics,
    });
  } catch (error) {
    logger.error('Get statistics failed', { error });
    return next(error);
  }
});

/**
 * GET /api/admin/orders/recent
 * Get recent orders
 * 
 * Authentication: Required (Admin role)
 * 
 * Query parameters:
 * - limit: number (optional, default 20)
 * 
 * Response:
 * - orders: Array of recent orders
 * - total: number
 * 
 * Requirements: 13.3
 */
router.get('/orders/recent', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    const orders = await adminService.getRecentOrders(limit);

    res.status(200).json({
      orders,
      total: orders.length,
    });
  } catch (error) {
    logger.error('Get recent orders failed', { error });
    return next(error);
  }
});

export default router;
