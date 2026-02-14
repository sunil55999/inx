/**
 * Authentication Routes
 * API endpoints for WebAuthn authentication
 * 
 * Requirements: 8.1, 8.2, 8.3
 */

import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { UserRole } from '../types/models';
import logger from '../utils/logger';

const router = Router();
const authService = new AuthService();

/**
 * POST /api/auth/register/begin
 * Begin WebAuthn registration process
 * 
 * Body:
 * - username: string
 * - role: 'buyer' | 'merchant' | 'admin' (optional, defaults to 'buyer')
 */
router.post('/register/begin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, role } = req.body;

    // Validate input
    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Username is required',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Validate username format
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({
        error: {
          code: 'INVALID_USERNAME',
          message: 'Username must be between 3 and 50 characters',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Validate role if provided
    const userRole = role || UserRole.BUYER;
    if (!Object.values(UserRole).includes(userRole)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ROLE',
          message: 'Invalid user role',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Generate registration options
    const result = await authService.beginRegistration(username, userRole);

    // Store challenge in session (in production, use Redis)
    // For now, we'll return it to the client to send back
    res.json({
      options: result.options,
      challenge: result.challenge,
    });
  } catch (error) {
    logger.error('Registration begin failed', { error, body: req.body });
    
    if ((error as Error).message === 'Username already exists') {
      return res.status(409).json({
        error: {
          code: 'USERNAME_EXISTS',
          message: 'Username already exists',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    next(error);
  }
});

/**
 * POST /api/auth/register/complete
 * Complete WebAuthn registration process
 * 
 * Body:
 * - username: string
 * - role: 'buyer' | 'merchant' | 'admin'
 * - response: RegistrationResponseJSON
 * - challenge: string
 */
router.post('/register/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, role, response, challenge } = req.body;

    // Validate input
    if (!username || !response || !challenge) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Username, response, and challenge are required',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Complete registration
    const result = await authService.completeRegistration(
      username,
      role || UserRole.BUYER,
      response,
      challenge
    );

    res.status(201).json({
      user: {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
        createdAt: result.user.createdAt,
      },
      credential: {
        id: result.credential.id,
        createdAt: result.credential.createdAt,
      },
    });
  } catch (error) {
    logger.error('Registration complete failed', { error, body: req.body });
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage.includes('verification failed')) {
      return res.status(400).json({
        error: {
          code: 'VERIFICATION_FAILED',
          message: errorMessage,
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (errorMessage === 'Credential already registered') {
      return res.status(409).json({
        error: {
          code: 'CREDENTIAL_EXISTS',
          message: 'Credential already registered',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    next(error);
  }
});

/**
 * POST /api/auth/login/begin
 * Begin WebAuthn authentication process
 * 
 * Body:
 * - username: string
 */
router.post('/login/begin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username } = req.body;

    // Validate input
    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Username is required',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Generate authentication options
    const result = await authService.beginAuthentication(username);

    res.json({
      options: result.options,
      challenge: result.challenge,
    });
  } catch (error) {
    logger.error('Login begin failed', { error, body: req.body });
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage === 'User not found' || errorMessage === 'No credentials registered for this user') {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found or no credentials registered',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    next(error);
  }
});

/**
 * POST /api/auth/login/complete
 * Complete WebAuthn authentication process
 * 
 * Body:
 * - username: string
 * - response: AuthenticationResponseJSON
 * - challenge: string
 */
router.post('/login/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, response, challenge } = req.body;

    // Validate input
    if (!username || !response || !challenge) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Username, response, and challenge are required',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    // Complete authentication
    const result = await authService.completeAuthentication(username, response, challenge);

    res.json({
      user: {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
      },
      token: result.token.token,
      expiresAt: result.token.expiresAt,
    });
  } catch (error) {
    logger.error('Login complete failed', { error, body: req.body });
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage.includes('verification failed') || errorMessage === 'User not found' || errorMessage === 'Credential not found') {
      return res.status(401).json({
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: 'Authentication failed',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Logout and revoke token
 * 
 * Headers:
 * - Authorization: Bearer <token>
 */
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'No token provided',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const token = authHeader.substring(7);
    await authService.revokeToken(token);

    res.json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Logout failed', { error });
    next(error);
  }
});

/**
 * GET /api/auth/validate
 * Validate JWT token
 * 
 * Headers:
 * - Authorization: Bearer <token>
 */
router.get('/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'No token provided',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const token = authHeader.substring(7);
    const user = await authService.validateToken(token);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Token validation failed', { error });
    
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
        retryable: false,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown',
      },
    });
  }
});

/**
 * GET /api/auth/credentials
 * List user's registered credentials
 * 
 * Headers:
 * - Authorization: Bearer <token>
 */
router.get('/credentials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'No token provided',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const token = authHeader.substring(7);
    const user = await authService.validateToken(token);
    const credentials = await authService.listCredentials(user.id);

    res.json({
      credentials,
    });
  } catch (error) {
    logger.error('List credentials failed', { error });
    next(error);
  }
});

/**
 * POST /api/auth/credentials/add
 * Add additional credential to user account
 * 
 * Headers:
 * - Authorization: Bearer <token>
 * 
 * Body:
 * - response: RegistrationResponseJSON
 * - challenge: string
 */
router.post('/credentials/add', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'No token provided',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const token = authHeader.substring(7);
    const user = await authService.validateToken(token);

    const { response, challenge } = req.body;

    if (!response || !challenge) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Response and challenge are required',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const credential = await authService.addCredential(user.id, response, challenge);

    res.status(201).json({
      credential: {
        id: credential.id,
        createdAt: credential.createdAt,
      },
    });
  } catch (error) {
    logger.error('Add credential failed', { error });
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage.includes('verification failed')) {
      return res.status(400).json({
        error: {
          code: 'VERIFICATION_FAILED',
          message: errorMessage,
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    next(error);
  }
});

/**
 * DELETE /api/auth/credentials/:credentialId
 * Remove credential from user account
 * 
 * Headers:
 * - Authorization: Bearer <token>
 */
router.delete('/credentials/:credentialId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'No token provided',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    const token = authHeader.substring(7);
    const user = await authService.validateToken(token);
    const { credentialId } = req.params;

    await authService.removeCredential(user.id, credentialId);

    res.json({
      message: 'Credential removed successfully',
    });
  } catch (error) {
    logger.error('Remove credential failed', { error });
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage === 'Cannot remove last credential') {
      return res.status(400).json({
        error: {
          code: 'LAST_CREDENTIAL',
          message: 'Cannot remove last credential',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (errorMessage === 'Credential not found' || errorMessage === 'Credential does not belong to user') {
      return res.status(404).json({
        error: {
          code: 'CREDENTIAL_NOT_FOUND',
          message: 'Credential not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    next(error);
  }
});

export default router;
