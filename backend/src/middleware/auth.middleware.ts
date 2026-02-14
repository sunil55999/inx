/**
 * Authentication Middleware
 * Protects routes by validating JWT tokens
 * 
 * Requirements: 8.1
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { User, UserRole } from '../types/models';
import logger from '../utils/logger';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const authService = new AuthService();

/**
 * Middleware to authenticate requests using JWT token
 * Adds user object to request if authentication succeeds
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'No token provided',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
      return;
    }

    const token = authHeader.substring(7);
    const user = await authService.validateToken(token);

    // Add user to request
    req.user = user;

    next();
  } catch (error) {
    logger.error('Authentication failed', { error, path: req.path });

    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
        retryable: false,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  }
}

/**
 * Middleware to require specific user role
 * Must be used after authenticate middleware
 * 
 * @param roles - Required roles (user must have one of these roles)
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Insufficient permissions', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
      });

      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
          details: {
            requiredRoles: roles,
            userRole: req.user.role,
          },
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to require admin role
 * Shorthand for requireRole(UserRole.ADMIN)
 */
export const requireAdmin = requireRole(UserRole.ADMIN);

/**
 * Middleware to require merchant role
 * Shorthand for requireRole(UserRole.MERCHANT, UserRole.ADMIN)
 */
export const requireMerchant = requireRole(UserRole.MERCHANT, UserRole.ADMIN);

/**
 * Optional authentication middleware
 * Adds user to request if token is valid, but doesn't fail if no token
 */
export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const user = await authService.validateToken(token);
      req.user = user;
    }

    next();
  } catch (error) {
    // Ignore authentication errors for optional auth
    next();
  }
}
