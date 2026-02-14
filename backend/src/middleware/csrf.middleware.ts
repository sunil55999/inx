/**
 * CSRF Protection Middleware
 * 
 * Implements CSRF token generation and validation to prevent
 * Cross-Site Request Forgery attacks.
 * 
 * Requirements: 14.6
 * 
 * Features:
 * - CSRF token generation
 * - Token validation for state-changing requests
 * - Token storage in session/cookie
 * - Double-submit cookie pattern
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';

/**
 * CSRF token cookie name
 */
const CSRF_COOKIE_NAME = 'csrf-token';

/**
 * CSRF token header name
 */
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Generate CSRF token
 * 
 * @returns CSRF token string
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify CSRF token
 * 
 * @param token - Token from request
 * @param cookieToken - Token from cookie
 * @returns True if tokens match
 */
export function verifyCsrfToken(token: string, cookieToken: string): boolean {
  if (!token || !cookieToken) {
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(cookieToken)
    );
  } catch {
    return false;
  }
}

/**
 * Middleware to generate and set CSRF token
 * 
 * This should be applied to routes that render forms or
 * return the CSRF token to the client.
 */
export function setCsrfToken(req: Request, res: Response, next: NextFunction) {
  try {
    // Check if token already exists in cookie
    let token = req.cookies?.[CSRF_COOKIE_NAME];

    // Generate new token if not exists
    if (!token) {
      token = generateCsrfToken();
      
      // Set cookie with token
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
    }

    // Make token available to response
    res.locals.csrfToken = token;

    next();
  } catch (error) {
    logger.error('Error setting CSRF token', { error });
    next(error);
  }
}

/**
 * Middleware to validate CSRF token
 * 
 * This should be applied to all state-changing routes (POST, PUT, PATCH, DELETE).
 * GET and HEAD requests are not checked.
 */
export function validateCsrfToken(req: Request, res: Response, next: NextFunction) {
  try {
    // Skip validation for safe methods
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    // Get token from header or body
    const token = req.headers[CSRF_HEADER_NAME] as string || req.body?._csrf;

    // Get token from cookie
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];

    // Validate token
    if (!verifyCsrfToken(token, cookieToken)) {
      logger.warn('CSRF token validation failed', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        hasToken: !!token,
        hasCookie: !!cookieToken,
      });

      return res.status(403).json({
        error: {
          code: 'CSRF_TOKEN_INVALID',
          message: 'Invalid or missing CSRF token',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    next();
  } catch (error) {
    logger.error('Error validating CSRF token', { error });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while validating CSRF token',
        retryable: true,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  }
}

/**
 * Middleware to add CSRF token to response
 * 
 * Adds the CSRF token to the response body for API endpoints.
 */
export function addCsrfTokenToResponse(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    if (res.locals.csrfToken) {
      body.csrfToken = res.locals.csrfToken;
    }
    return originalJson(body);
  };

  next();
}

/**
 * Combined CSRF protection middleware
 * 
 * Sets token and validates it in one middleware.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  setCsrfToken(req, res, (err) => {
    if (err) return next(err);
    validateCsrfToken(req, res, next);
  });
}

/**
 * Get CSRF token endpoint handler
 * 
 * Returns the current CSRF token for the session.
 */
export function getCsrfToken(_req: Request, res: Response) {
  const token = res.locals.csrfToken;

  if (!token) {
    return res.status(500).json({
      error: {
        code: 'CSRF_TOKEN_NOT_FOUND',
        message: 'CSRF token not found',
        retryable: true,
        timestamp: new Date().toISOString(),
        requestId: 'unknown',
      },
    });
  }

  return res.json({
    csrfToken: token,
  });
}
