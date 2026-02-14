/**
 * Rate Limiting Middleware
 * 
 * Implements rate limiting using Redis to prevent abuse.
 * 
 * Requirements: 14.4
 * 
 * Features:
 * - Rate limit by IP address
 * - Configurable limits per endpoint
 * - Redis-based distributed rate limiting
 * - Returns HTTP 429 when limit exceeded
 */

import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Maximum requests per window
  message?: string;  // Custom error message
  skipSuccessfulRequests?: boolean;  // Don't count successful requests
  skipFailedRequests?: boolean;  // Don't count failed requests
}

/**
 * Default rate limit: 100 requests per minute
 */
const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 100,
  message: 'Too many requests, please try again later.'
};

/**
 * Create rate limiter middleware
 * 
 * @param config - Rate limit configuration
 * @returns Express middleware function
 */
export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const finalConfig: RateLimitConfig = {
    ...DEFAULT_CONFIG,
    ...config
  };

  // Initialize Redis client
  let redis: Redis | null = null;
  
  try {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    redis.on('error', (error) => {
      logger.error('Redis connection error for rate limiter', { error });
    });

    logger.info('Rate limiter Redis client initialized', {
      windowMs: finalConfig.windowMs,
      maxRequests: finalConfig.maxRequests
    });

  } catch (error) {
    logger.error('Failed to initialize Redis for rate limiter', { error });
    // Continue without Redis - rate limiting will be disabled
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    // If Redis is not available, skip rate limiting
    if (!redis) {
      logger.warn('Rate limiting skipped - Redis not available');
      return next();
    }

    try {
      // Get client identifier (IP address)
      const identifier = req.ip || req.socket.remoteAddress || 'unknown';
      
      // Create Redis key
      const key = `ratelimit:${identifier}:${req.path}`;
      
      // Get current count
      const current = await redis.get(key);
      const count = current ? parseInt(current) : 0;

      // Check if limit exceeded
      if (count >= finalConfig.maxRequests) {
        logger.warn('Rate limit exceeded', {
          identifier,
          path: req.path,
          count,
          limit: finalConfig.maxRequests
        });

        return res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: finalConfig.message,
            retryable: true,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
      }

      // Increment counter
      const newCount = await redis.incr(key);

      // Set expiry on first request
      if (newCount === 1) {
        await redis.pexpire(key, finalConfig.windowMs);
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', finalConfig.maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, finalConfig.maxRequests - newCount).toString());
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + finalConfig.windowMs).toISOString());

      next();

    } catch (error) {
      logger.error('Rate limiting error', { error });
      // On error, allow the request through
      next();
    }
  };
}

/**
 * Strict rate limiter for sensitive endpoints (e.g., auth)
 * 10 requests per minute
 */
export const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  message: 'Too many attempts, please try again later.'
});

/**
 * Standard rate limiter for API endpoints
 * 100 requests per minute
 */
export const standardRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100
});

/**
 * Lenient rate limiter for public endpoints
 * 200 requests per minute
 */
export const lenientRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 200
});
