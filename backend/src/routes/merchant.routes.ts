/**
 * Merchant Routes
 * API endpoints for merchant profile management and storefronts
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.6
 */

import { Router, Request, Response, NextFunction } from 'express';
import { merchantService } from '../services/MerchantService';
import { UpdateMerchantProfileRequest } from '../types/models';
import { authenticate } from '../middleware/auth.middleware';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/store/:slug
 * Get merchant storefront with active listings
 * 
 * Authentication: Not required (public endpoint)
 * 
 * Response:
 * - merchant: Merchant profile
 * - listings: Array of active listings
 * - totalListings: Total number of listings
 * - activeListings: Number of active listings
 * - metaTags: SEO meta tags
 * 
 * Requirements: 7.1, 7.2, 7.4
 */
router.get('/store/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = req.params.slug;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

    const storefront = await merchantService.getStorefront(slug);

    if (!storefront) {
      return res.status(404).json({
        error: {
          code: 'STOREFRONT_NOT_FOUND',
          message: 'Merchant storefront not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Generate SEO meta tags
    const metaTags = merchantService.generateStorefrontMetaTags(storefront.merchant, baseUrl);

    res.status(200).json({
      merchant: {
        id: storefront.merchant.id,
        storefrontSlug: storefront.merchant.storefrontSlug,
        displayName: storefront.merchant.displayName,
        description: storefront.merchant.description,
        profileImageUrl: storefront.merchant.profileImageUrl,
        isVerified: storefront.merchant.isVerified,
        totalSales: storefront.merchant.totalSales,
        createdAt: storefront.merchant.createdAt,
      },
      listings: storefront.listings.map(listing => ({
        id: listing.id,
        channelId: listing.channelId,
        description: listing.description,
        price: listing.price,
        currency: listing.currency,
        durationDays: listing.durationDays,
        signalTypes: listing.signalTypes,
        createdAt: listing.createdAt,
      })),
      totalListings: storefront.totalListings,
      activeListings: storefront.activeListings,
      metaTags,
    });
  } catch (error) {
    logger.error('Get storefront failed', { error, slug: req.params.slug });
    return next(error);
  }
});

/**
 * PATCH /api/merchant/profile
 * Update merchant profile
 * 
 * Authentication: Required (Merchant role)
 * 
 * Body:
 * - displayName: string (optional)
 * - bio: string (optional)
 * - profileImageUrl: string (optional)
 * 
 * Response:
 * - merchant: Updated merchant profile
 * 
 * Requirements: 7.3, 7.6
 */
router.patch('/merchant/profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    // Get merchant by user ID
    const merchant = await merchantService.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json({
        error: {
          code: 'MERCHANT_NOT_FOUND',
          message: 'Merchant profile not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const updates: UpdateMerchantProfileRequest = {
      displayName: req.body.displayName,
      description: req.body.description,
      profileImageUrl: req.body.profileImageUrl,
    };

    const updatedMerchant = await merchantService.updateMerchantProfile(merchant.id, updates);

    logger.info('Merchant profile updated', { 
      merchantId: merchant.id, 
      userId 
    });

    res.status(200).json({
      merchant: {
        id: updatedMerchant.id,
        userId: updatedMerchant.userId,
        storefrontSlug: updatedMerchant.storefrontSlug,
        displayName: updatedMerchant.displayName,
        description: updatedMerchant.description,
        profileImageUrl: updatedMerchant.profileImageUrl,
        isVerified: updatedMerchant.isVerified,
        isSuspended: updatedMerchant.isSuspended,
        createdAt: updatedMerchant.createdAt,
        updatedAt: updatedMerchant.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Update merchant profile failed', { error, userId: req.user!.id });
    
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

    if (errorMessage.includes('must be') || errorMessage.includes('too long')) {
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
 * GET /api/merchant/profile
 * Get current merchant profile
 * 
 * Authentication: Required (Merchant role)
 * 
 * Response:
 * - merchant: Merchant profile
 * - storefrontUrl: Public storefront URL
 * 
 * Requirements: 7.6
 */
router.get('/merchant/profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

    const merchant = await merchantService.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(404).json({
        error: {
          code: 'MERCHANT_NOT_FOUND',
          message: 'Merchant profile not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const storefrontUrl = merchantService.getStorefrontUrl(merchant.storefrontSlug, baseUrl);

    res.status(200).json({
      merchant: {
        id: merchant.id,
        userId: merchant.userId,
        storefrontSlug: merchant.storefrontSlug,
        displayName: merchant.displayName,
        description: merchant.description,
        profileImageUrl: merchant.profileImageUrl,
        isVerified: merchant.isVerified,
        isSuspended: merchant.isSuspended,
        createdAt: merchant.createdAt,
        updatedAt: merchant.updatedAt,
      },
      storefrontUrl,
    });
  } catch (error) {
    logger.error('Get merchant profile failed', { error, userId: req.user!.id });
    return next(error);
  }
});

/**
 * GET /api/merchants/search
 * Search merchants by name or username
 * 
 * Authentication: Not required (public endpoint)
 * 
 * Query parameters:
 * - q: string (search query)
 * - limit: number (optional, default 20)
 * 
 * Response:
 * - merchants: Array of merchant profiles
 * - total: number
 * 
 * Requirements: 7.2
 */
router.get('/merchants/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Search query is required',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const merchants = await merchantService.searchMerchants(query, limit);

    res.status(200).json({
      merchants: merchants.map(merchant => ({
        id: merchant.id,
        storefrontSlug: merchant.storefrontSlug,
        displayName: merchant.displayName,
        description: merchant.description,
        profileImageUrl: merchant.profileImageUrl,
        isVerified: merchant.isVerified,
        createdAt: merchant.createdAt,
      })),
      total: merchants.length,
    });
  } catch (error) {
    logger.error('Search merchants failed', { error, query: req.query.q });
    return next(error);
  }
});

export default router;
