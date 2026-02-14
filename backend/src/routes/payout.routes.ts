/**
 * Payout Routes
 * API endpoints for merchant payout management
 * 
 * Requirements: 6.1, 6.7
 */

import { Router, Request, Response, NextFunction } from 'express';
import { payoutService } from '../services/PayoutService';
import { merchantBalanceRepository } from '../database/repositories/MerchantBalanceRepository';
import { CreatePayoutRequest, UserRole } from '../types/models';
import { authenticate } from '../middleware/auth.middleware';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/payouts
 * Request a payout
 * 
 * Authentication: Required (Merchant role)
 * 
 * Body:
 * - amount: number (USD equivalent)
 * - currency: string (BNB, BTC, USDT_TRC20)
 * - destinationAddress: string
 * 
 * Response:
 * - payout: Payout object
 * - balanceDeducted: number
 * - newAvailableBalance: number
 * 
 * Requirements: 6.1
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const merchantId = req.user!.id;

    const request: CreatePayoutRequest = {
      amount: parseFloat(req.body.amount),
      currency: req.body.currency,
      walletAddress: req.body.walletAddress,
    };

    // Validate required fields
    if (!request.amount || isNaN(request.amount)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Invalid or missing amount',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (!request.currency) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required field: currency',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (!request.walletAddress) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required field: walletAddress',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const result = await payoutService.createPayout(merchantId, request);

    logger.info('Payout created', { 
      payoutId: result.payout.id, 
      merchantId, 
      amount: request.amount 
    });

    res.status(201).json({
      payout: {
        id: result.payout.id,
        merchantId: result.payout.merchantId,
        amount: result.payout.amount,
        currency: result.payout.currency,
        walletAddress: result.payout.walletAddress,
        status: result.payout.status,
        transactionHash: result.payout.transactionHash,
        createdAt: result.payout.createdAt,
        processedAt: result.payout.processedAt,
      },
      balanceDeducted: result.balanceDeducted,
      newAvailableBalance: result.newAvailableBalance,
    });
  } catch (error) {
    logger.error('Create payout failed', { error, body: req.body });
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage.includes('balance not found')) {
      return res.status(404).json({
        error: {
          code: 'BALANCE_NOT_FOUND',
          message: 'Merchant balance not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (errorMessage.includes('Insufficient balance')) {
      return res.status(400).json({
        error: {
          code: 'INSUFFICIENT_BALANCE',
          message: errorMessage,
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (errorMessage.includes('minimum') || errorMessage.includes('threshold')) {
      return res.status(400).json({
        error: {
          code: 'BELOW_MINIMUM_THRESHOLD',
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
 * GET /api/payouts
 * List merchant's payouts
 * 
 * Authentication: Required (Merchant role)
 * 
 * Response:
 * - payouts: Array of Payout objects
 * - total: number
 * 
 * Requirements: 6.7
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const merchantId = req.user!.id;

    const payouts = await payoutService.getPayoutsByMerchant(merchantId);

    res.status(200).json({
      payouts: payouts.map(payout => ({
        id: payout.id,
        merchantId: payout.merchantId,
        amount: payout.amount,
        currency: payout.currency,
        walletAddress: payout.walletAddress,
        status: payout.status,
        transactionHash: payout.transactionHash,
        createdAt: payout.createdAt,
        processedAt: payout.processedAt,
      })),
      total: payouts.length,
    });
  } catch (error) {
    logger.error('List payouts failed', { error, userId: req.user!.id });
    return next(error);
  }
});

/**
 * GET /api/payouts/:id
 * Get payout details
 * 
 * Authentication: Required
 * 
 * Response:
 * - payout: Payout object
 * 
 * Requirements: 6.7
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payoutId = req.params.id;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const payout = await payoutService.getPayout(payoutId);

    if (!payout) {
      return res.status(404).json({
        error: {
          code: 'PAYOUT_NOT_FOUND',
          message: 'Payout not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Authorization: Only the merchant or admin can view
    if (payout.merchantId !== userId && userRole !== UserRole.ADMIN) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this payout',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    res.status(200).json({
      payout: {
        id: payout.id,
        merchantId: payout.merchantId,
        amount: payout.amount,
        currency: payout.currency,
        walletAddress: payout.walletAddress,
        status: payout.status,
        transactionHash: payout.transactionHash,
        createdAt: payout.createdAt,
        processedAt: payout.processedAt,
      },
    });
  } catch (error) {
    logger.error('Get payout failed', { error, payoutId: req.params.id });
    return next(error);
  }
});

/**
 * GET /api/merchant/balance
 * Get merchant balance breakdown
 * 
 * Authentication: Required (Merchant role)
 * 
 * Response:
 * - balance: MerchantBalance object
 * 
 * Requirements: 6.7
 */
router.get('/merchant/balance', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const merchantId = req.user!.id;

    const balanceBreakdown = await merchantBalanceRepository.getBalanceBreakdown(merchantId);

    res.status(200).json({
      balance: balanceBreakdown,
    });
  } catch (error) {
    logger.error('Get merchant balance failed', { error, userId: req.user!.id });
    return next(error);
  }
});

export default router;
