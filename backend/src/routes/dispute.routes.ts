/**
 * Dispute Routes
 * API endpoints for dispute management and resolution
 * 
 * Requirements: 5.1, 5.3
 */

import { Router, Request, Response, NextFunction } from 'express';
import { disputeService } from '../services/DisputeService';
import { CreateDisputeRequest, ResolveDisputeRequest, UserRole } from '../types/models';
import { authenticate } from '../middleware/auth.middleware';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/disputes
 * Create a new dispute for an order
 * 
 * Authentication: Required (Buyer role)
 * 
 * Body:
 * - orderId: string
 * - issue: string (max 2000 characters)
 * 
 * Response:
 * - dispute: Dispute object
 * - withinTimeWindow: boolean
 * 
 * Requirements: 5.1
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const buyerId = req.user!.id;

    const request: CreateDisputeRequest = {
      orderId: req.body.orderId,
      issue: req.body.issue,
    };

    // Validate required fields
    if (!request.orderId) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required field: orderId',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (!request.issue) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required field: issue',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const result = await disputeService.createDispute(buyerId, request);

    logger.info('Dispute created', { 
      disputeId: result.dispute.id, 
      buyerId, 
      orderId: request.orderId 
    });

    res.status(201).json({
      dispute: {
        id: result.dispute.id,
        buyerId: result.dispute.buyerId,
        orderId: result.dispute.orderId,
        issue: result.dispute.issue,
        status: result.dispute.status,
        resolution: result.dispute.resolution,
        adminId: result.dispute.adminId,
        createdAt: result.dispute.createdAt,
        resolvedAt: result.dispute.resolvedAt,
      },
      withinTimeWindow: result.withinTimeWindow,
    });
  } catch (error) {
    logger.error('Create dispute failed', { error, body: req.body });
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage.includes('Order not found')) {
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

    if (errorMessage.includes('does not own')) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to create a dispute for this order',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (errorMessage.includes('time window')) {
      return res.status(400).json({
        error: {
          code: 'TIME_WINDOW_EXPIRED',
          message: errorMessage,
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (errorMessage.includes('already exists')) {
      return res.status(409).json({
        error: {
          code: 'DISPUTE_EXISTS',
          message: 'A dispute already exists for this order',
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
 * GET /api/disputes/:id
 * Get dispute details with relations
 * 
 * Authentication: Required
 * 
 * Response:
 * - dispute: Dispute object with order, buyer, and admin details
 * 
 * Requirements: 5.3
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.id;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const dispute = await disputeService.getDisputeWithRelations(disputeId);

    if (!dispute) {
      return res.status(404).json({
        error: {
          code: 'DISPUTE_NOT_FOUND',
          message: 'Dispute not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Authorization: Only the buyer, merchant (via listing), or admin can view
    const isAdmin = userRole === UserRole.ADMIN;
    const isBuyer = dispute.buyerId === userId;
    
    // Check if user is the merchant (need to check listing ownership)
    // For now, allow buyer and admin
    if (!isBuyer && !isAdmin) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this dispute',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    res.status(200).json({
      dispute: {
        id: dispute.id,
        buyerId: dispute.buyerId,
        orderId: dispute.orderId,
        issue: dispute.issue,
        status: dispute.status,
        resolution: dispute.resolution,
        adminId: dispute.adminId,
        createdAt: dispute.createdAt,
        resolvedAt: dispute.resolvedAt,
        buyer: dispute.buyer,
        order: dispute.order,
        admin: dispute.admin,
      },
    });
  } catch (error) {
    logger.error('Get dispute failed', { error, disputeId: req.params.id });
    return next(error);
  }
});

/**
 * POST /api/disputes/:id/respond
 * Merchant response to a dispute
 * 
 * Authentication: Required (Merchant role)
 * 
 * Body:
 * - response: string
 * 
 * Response:
 * - dispute: Updated dispute object
 * 
 * Note: This is a placeholder for merchant response functionality.
 * The actual implementation would store merchant responses and notify admins.
 */
router.post('/:id/respond', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.id;
    const merchantId = req.user!.id;
    const response = req.body.response;

    if (!response) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required field: response',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Get dispute to verify merchant ownership
    const dispute = await disputeService.getDisputeWithRelations(disputeId);

    if (!dispute) {
      return res.status(404).json({
        error: {
          code: 'DISPUTE_NOT_FOUND',
          message: 'Dispute not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // TODO: Verify merchant owns the listing associated with the order
    // For now, return a placeholder response

    logger.info('Merchant response to dispute', { 
      disputeId, 
      merchantId, 
      responseLength: response.length 
    });

    res.status(200).json({
      message: 'Merchant response recorded',
      dispute: {
        id: dispute.id,
        status: dispute.status,
      },
    });
  } catch (error) {
    logger.error('Merchant respond to dispute failed', { error, disputeId: req.params.id });
    return next(error);
  }
});

/**
 * POST /api/disputes/:id/resolve
 * Admin resolution of a dispute
 * 
 * Authentication: Required (Admin role only)
 * 
 * Body:
 * - resolution: string
 * - approveRefund: boolean
 * 
 * Response:
 * - dispute: Resolved dispute object
 * - refundProcessed: boolean
 * - refundAmount: number (if refund approved)
 * - refundTransactionQueued: boolean
 * - botOperationQueued: boolean
 * 
 * Requirements: 5.3
 */
router.post('/:id/resolve', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const disputeId = req.params.id;
    const adminId = req.user!.id;
    const userRole = req.user!.role;

    // Authorization: Only admins can resolve disputes
    if (userRole !== UserRole.ADMIN) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only admins can resolve disputes',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const request: ResolveDisputeRequest = {
      resolution: req.body.resolution,
      approveRefund: req.body.approveRefund === true,
    };

    // Validate required fields
    if (!request.resolution) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required field: resolution',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const result = await disputeService.resolveDispute(disputeId, adminId, request);

    logger.info('Dispute resolved', { 
      disputeId, 
      adminId, 
      approveRefund: request.approveRefund,
      refundProcessed: result.refundProcessed 
    });

    res.status(200).json({
      dispute: {
        id: result.dispute.id,
        buyerId: result.dispute.buyerId,
        orderId: result.dispute.orderId,
        issue: result.dispute.issue,
        status: result.dispute.status,
        resolution: result.dispute.resolution,
        adminId: result.dispute.adminId,
        createdAt: result.dispute.createdAt,
        resolvedAt: result.dispute.resolvedAt,
      },
      refundProcessed: result.refundProcessed,
      refundAmount: result.refundAmount,
      refundTransactionQueued: result.refundTransactionQueued,
      botOperationQueued: result.botOperationQueued,
    });
  } catch (error) {
    logger.error('Resolve dispute failed', { error, disputeId: req.params.id });
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        error: {
          code: 'DISPUTE_NOT_FOUND',
          message: 'Dispute not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (errorMessage.includes('already')) {
      return res.status(400).json({
        error: {
          code: 'DISPUTE_ALREADY_RESOLVED',
          message: errorMessage,
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
 * GET /api/disputes
 * List disputes filtered by role
 * 
 * Authentication: Required
 * 
 * Query parameters:
 * - status: string (optional) - Filter by dispute status
 * 
 * Response:
 * - disputes: Array of Dispute objects
 * - total: number
 * 
 * Behavior:
 * - Buyers see their own disputes
 * - Admins see all disputes or can filter by status
 * - Merchants see disputes for their listings (TODO)
 * 
 * Requirements: 5.3
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const status = req.query.status as string | undefined;

    let disputes;

    if (userRole === UserRole.ADMIN) {
      // Admins can see all disputes or filter by status
      if (status) {
        disputes = await disputeService.getDisputesByStatus(status as any);
      } else {
        disputes = await disputeService.getDisputesNeedingAttention();
      }
    } else {
      // Buyers see their own disputes
      disputes = await disputeService.getDisputesByBuyer(userId);
    }

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
    logger.error('List disputes failed', { error, userId: req.user!.id });
    return next(error);
  }
});

export default router;
