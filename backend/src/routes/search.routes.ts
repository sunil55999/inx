/**
 * Search Routes
 * API endpoints for search and autocomplete functionality
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ListingService } from '../services/ListingService';
import { SearchQuery } from '../types/models';
import { optionalAuthenticate } from '../middleware/auth.middleware';
import logger from '../utils/logger';

const router = Router();
const listingService = new ListingService();

/**
 * GET /api/search
 * Search listings with full-text search and filters
 * 
 * Authentication: Optional
 * 
 * Query parameters:
 * - text: string (search text) - searches across channel names, descriptions, and merchant usernames
 * - merchantId: string (filter by merchant)
 * - minPrice: number (minimum price filter)
 * - maxPrice: number (maximum price filter)
 * - currency: CryptoCurrency (filter by currency)
 * - signalTypes: string (comma-separated signal types)
 * - sortBy: 'price_asc' | 'price_desc' | 'popularity' | 'newest'
 * - limit: number (default: 20, max: 100)
 * - offset: number (default: 0)
 * 
 * Features:
 * - Multi-field matching across channel names, descriptions, merchant usernames
 * - Fuzzy matching with edit distance ≤ 2
 * - Relevance scoring and ranking
 * - Filter application (merchant, price range, duration, signal type)
 * 
 * Requirements: 9.1, 9.2, 9.4, 9.5
 */
router.get('/', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const query: SearchQuery = {
      text: req.query.text as string,
      merchantId: req.query.merchantId as string,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      currency: req.query.currency as any,
      signalTypes: req.query.signalTypes ? (req.query.signalTypes as string).split(',') : undefined,
      sortBy: req.query.sortBy as any,
      limit,
      offset,
    };

    // Validate price range
    if (query.minPrice !== undefined && query.minPrice < 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PRICE_RANGE',
          message: 'Minimum price cannot be negative',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (query.maxPrice !== undefined && query.maxPrice < 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PRICE_RANGE',
          message: 'Maximum price cannot be negative',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (query.minPrice !== undefined && query.maxPrice !== undefined && query.minPrice > query.maxPrice) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PRICE_RANGE',
          message: 'Minimum price cannot be greater than maximum price',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Track search query for popular searches (async, don't wait)
    if (query.text) {
      listingService.trackSearch(query.text).catch(err => {
        logger.error('Failed to track search', { error: err, query: query.text });
      });
    }

    const result = await listingService.listListings(query);

    logger.debug('Search completed', { 
      query: query.text, 
      filters: {
        merchantId: query.merchantId,
        priceRange: query.minPrice || query.maxPrice ? `${query.minPrice || 0}-${query.maxPrice || '∞'}` : undefined,
        currency: query.currency,
        signalTypes: query.signalTypes,
      },
      resultsCount: result.items.length,
      total: result.total,
    });

    res.status(200).json({
      results: result.items,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
      query: {
        text: query.text,
        filters: {
          merchantId: query.merchantId,
          minPrice: query.minPrice,
          maxPrice: query.maxPrice,
          currency: query.currency,
          signalTypes: query.signalTypes,
        },
        sortBy: query.sortBy || 'newest',
      },
    });
  } catch (error) {
    logger.error('Search failed', { error, query: req.query });
    next(error);
  }
});

/**
 * GET /api/search/autocomplete
 * Get autocomplete suggestions for search
 * 
 * Authentication: Optional
 * 
 * Query parameters:
 * - q: string (search prefix) - required
 * - limit: number (default: 10, max: 20)
 * 
 * Returns channel names and merchant usernames that match the prefix
 * 
 * Requirements: 9.3
 */
router.get('/autocomplete', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prefix = req.query.q as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);

    if (!prefix || prefix.trim().length === 0) {
      return res.status(400).json({
        error: {
          code: 'MISSING_QUERY',
          message: 'Query parameter "q" is required',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (prefix.length < 2) {
      // Return empty suggestions for very short queries
      return res.status(200).json({
        suggestions: [],
        query: prefix,
      });
    }

    const suggestions = await listingService.getAutocompleteSuggestions(prefix, limit);

    logger.debug('Autocomplete completed', { 
      prefix, 
      suggestionsCount: suggestions.length 
    });

    res.status(200).json({
      suggestions,
      query: prefix,
    });
  } catch (error) {
    logger.error('Autocomplete failed', { error, query: req.query });
    
    // Return empty suggestions on error instead of failing
    res.status(200).json({
      suggestions: [],
      query: req.query.q || '',
    });
  }
});

export default router;
