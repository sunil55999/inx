/**
 * Authentication Logging Middleware
 * 
 * Logs all authentication attempts with details for security monitoring.
 * Flags suspicious patterns like multiple failures or unusual locations.
 * 
 * Requirements: 14.7
 * 
 * Features:
 * - Log all authentication attempts
 * - Track success and failure rates
 * - Detect suspicious patterns
 * - Store authentication history
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import Redis from 'ioredis';

/**
 * Authentication event types
 */
export enum AuthEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  REGISTRATION_SUCCESS = 'registration_success',
  REGISTRATION_FAILURE = 'registration_failure',
  TOKEN_REFRESH = 'token_refresh',
  LOGOUT = 'logout',
  PASSWORD_RESET_REQUEST = 'password_reset_request',
  PASSWORD_RESET_SUCCESS = 'password_reset_success',
}

/**
 * Authentication log entry
 */
export interface AuthLogEntry {
  timestamp: Date;
  eventType: AuthEventType;
  userId?: string;
  username?: string;
  email?: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  failureReason?: string;
  metadata?: Record<string, any>;
}

/**
 * Suspicious pattern detection thresholds
 */
const SUSPICIOUS_THRESHOLDS = {
  MAX_FAILURES_PER_HOUR: 5,
  MAX_FAILURES_PER_DAY: 20,
  MAX_ATTEMPTS_PER_MINUTE: 10,
};

/**
 * Initialize Redis client for auth logging
 */
let redis: Redis | null = null;

try {
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
  });

  redis.on('error', (error) => {
    logger.error('Redis connection error for auth logging', { error });
  });
} catch (error) {
  logger.error('Failed to initialize Redis for auth logging', { error });
}

/**
 * Log authentication attempt
 * 
 * @param entry - Authentication log entry
 */
export async function logAuthAttempt(entry: AuthLogEntry): Promise<void> {
  try {
    // Log to application logger
    logger.info('Authentication attempt', {
      eventType: entry.eventType,
      userId: entry.userId,
      username: entry.username,
      email: entry.email,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      success: entry.success,
      failureReason: entry.failureReason,
      timestamp: entry.timestamp.toISOString(),
    });

    // Store in Redis for pattern detection
    if (redis) {
      const key = `auth:log:${entry.ipAddress}:${entry.eventType}`;
      await redis.lpush(key, JSON.stringify(entry));
      await redis.ltrim(key, 0, 99); // Keep last 100 entries
      await redis.expire(key, 24 * 60 * 60); // Expire after 24 hours
    }

    // Check for suspicious patterns
    if (!entry.success) {
      await checkSuspiciousPatterns(entry);
    }

  } catch (error) {
    logger.error('Error logging authentication attempt', { error, entry });
  }
}

/**
 * Check for suspicious authentication patterns
 * 
 * @param entry - Authentication log entry
 */
async function checkSuspiciousPatterns(entry: AuthLogEntry): Promise<void> {
  if (!redis) return;

  try {
    const ipAddress = entry.ipAddress;
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneMinuteAgo = now - 60 * 1000;

    // Get recent failures
    const key = `auth:log:${ipAddress}:${AuthEventType.LOGIN_FAILURE}`;
    const recentEntries = await redis.lrange(key, 0, -1);
    const parsedEntries = recentEntries.map(e => JSON.parse(e) as AuthLogEntry);

    // Count failures in different time windows
    const failuresLastHour = parsedEntries.filter(
      e => new Date(e.timestamp).getTime() > oneHourAgo
    ).length;

    const failuresLastDay = parsedEntries.filter(
      e => new Date(e.timestamp).getTime() > oneDayAgo
    ).length;

    const attemptsLastMinute = parsedEntries.filter(
      e => new Date(e.timestamp).getTime() > oneMinuteAgo
    ).length;

    // Flag suspicious patterns
    const isSuspicious = 
      failuresLastHour >= SUSPICIOUS_THRESHOLDS.MAX_FAILURES_PER_HOUR ||
      failuresLastDay >= SUSPICIOUS_THRESHOLDS.MAX_FAILURES_PER_DAY ||
      attemptsLastMinute >= SUSPICIOUS_THRESHOLDS.MAX_ATTEMPTS_PER_MINUTE;

    if (isSuspicious) {
      logger.warn('Suspicious authentication pattern detected', {
        ipAddress,
        failuresLastHour,
        failuresLastDay,
        attemptsLastMinute,
        thresholds: SUSPICIOUS_THRESHOLDS,
        latestAttempt: entry,
      });

      // Store suspicious IP in Redis
      const suspiciousKey = `auth:suspicious:${ipAddress}`;
      await redis.setex(suspiciousKey, 24 * 60 * 60, JSON.stringify({
        ipAddress,
        flaggedAt: new Date().toISOString(),
        failuresLastHour,
        failuresLastDay,
        attemptsLastMinute,
      }));

      // TODO: Send alert to admins
      // TODO: Consider temporary IP blocking
    }

  } catch (error) {
    logger.error('Error checking suspicious patterns', { error, entry });
  }
}

/**
 * Middleware to log authentication attempts
 * 
 * This should be applied after authentication logic to log the result.
 */
export function authLoggingMiddleware(eventType: AuthEventType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to log after response
    res.json = function (body: any) {
      // Determine if authentication was successful
      const success = res.statusCode >= 200 && res.statusCode < 300;

      // Extract user information
      const userId = req.user?.id || body.user?.id;
      const username = req.body?.username || body.user?.username;
      const email = req.body?.email || body.user?.email;

      // Get client information
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      // Extract failure reason from error response
      const failureReason = !success ? body.error?.message || body.message : undefined;

      // Create log entry
      const logEntry: AuthLogEntry = {
        timestamp: new Date(),
        eventType,
        userId,
        username,
        email,
        ipAddress,
        userAgent,
        success,
        failureReason,
        metadata: {
          statusCode: res.statusCode,
          path: req.path,
          method: req.method,
        },
      };

      // Log asynchronously (don't wait)
      logAuthAttempt(logEntry).catch(error => {
        logger.error('Failed to log auth attempt', { error });
      });

      // Call original json method
      return originalJson(body);
    };

    next();
  };
}

/**
 * Get authentication history for IP address
 * 
 * @param ipAddress - IP address
 * @param limit - Maximum number of entries
 * @returns Array of authentication log entries
 */
export async function getAuthHistory(
  ipAddress: string,
  limit: number = 50
): Promise<AuthLogEntry[]> {
  if (!redis) return [];

  try {
    const entries: AuthLogEntry[] = [];

    // Get entries for each event type
    for (const eventType of Object.values(AuthEventType)) {
      const key = `auth:log:${ipAddress}:${eventType}`;
      const rawEntries = await redis.lrange(key, 0, limit - 1);
      const parsedEntries = rawEntries.map(e => JSON.parse(e) as AuthLogEntry);
      entries.push(...parsedEntries);
    }

    // Sort by timestamp descending
    entries.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return entries.slice(0, limit);

  } catch (error) {
    logger.error('Error getting auth history', { error, ipAddress });
    return [];
  }
}

/**
 * Check if IP address is flagged as suspicious
 * 
 * @param ipAddress - IP address
 * @returns True if suspicious
 */
export async function isSuspiciousIp(ipAddress: string): Promise<boolean> {
  if (!redis) return false;

  try {
    const key = `auth:suspicious:${ipAddress}`;
    const data = await redis.get(key);
    return data !== null;
  } catch (error) {
    logger.error('Error checking suspicious IP', { error, ipAddress });
    return false;
  }
}

/**
 * Get suspicious IPs
 * 
 * @returns Array of suspicious IP addresses with details
 */
export async function getSuspiciousIps(): Promise<any[]> {
  if (!redis) return [];

  try {
    const keys = await redis.keys('auth:suspicious:*');
    const suspiciousIps = [];

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        suspiciousIps.push(JSON.parse(data));
      }
    }

    return suspiciousIps;

  } catch (error) {
    logger.error('Error getting suspicious IPs', { error });
    return [];
  }
}

/**
 * Clear suspicious flag for IP address
 * 
 * @param ipAddress - IP address
 */
export async function clearSuspiciousFlag(ipAddress: string): Promise<void> {
  if (!redis) return;

  try {
    const key = `auth:suspicious:${ipAddress}`;
    await redis.del(key);
    logger.info('Cleared suspicious flag', { ipAddress });
  } catch (error) {
    logger.error('Error clearing suspicious flag', { error, ipAddress });
  }
}
