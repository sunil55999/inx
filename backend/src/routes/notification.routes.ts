/**
 * Notification Routes
 * API endpoints for user notifications
 * 
 * Requirements: 15.6, 15.7
 */

import { Router, Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/NotificationService';
import { authenticate } from '../middleware/auth.middleware';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/notifications
 * Get user's notifications
 * 
 * Authentication: Required
 * 
 * Query parameters:
 * - limit: number (optional, default 50)
 * - offset: number (optional, default 0)
 * 
 * Response:
 * - notifications: Array of Notification objects
 * - total: number
 * - unreadCount: number
 * 
 * Requirements: 15.6
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const [notifications, unreadCount] = await Promise.all([
      notificationService.getNotifications(userId, limit, offset),
      notificationService.getUnreadCount(userId)
    ]);

    res.status(200).json({
      notifications: notifications.map(notification => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        metadata: notification.metadata,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
      })),
      total: notifications.length,
      unreadCount,
    });
  } catch (error) {
    logger.error('Get notifications failed', { error, userId: req.user!.id });
    return next(error);
  }
});

/**
 * GET /api/notifications/unread-count
 * Get count of unread notifications
 * 
 * Authentication: Required
 * 
 * Response:
 * - count: number
 * 
 * Requirements: 15.6
 */
router.get('/unread-count', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const count = await notificationService.getUnreadCount(userId);

    res.status(200).json({
      count,
    });
  } catch (error) {
    logger.error('Get unread count failed', { error, userId: req.user!.id });
    return next(error);
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark notification as read
 * 
 * Authentication: Required
 * 
 * Response:
 * - notification: Updated notification object
 * 
 * Requirements: 15.6
 */
router.patch('/:id/read', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user!.id;

    const notification = await notificationService.markAsRead(notificationId, userId);

    logger.info('Notification marked as read', { notificationId, userId });

    res.status(200).json({
      notification: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        metadata: notification.metadata,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
      },
    });
  } catch (error) {
    logger.error('Mark notification as read failed', { error, notificationId: req.params.id });
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (errorMessage.includes('Unauthorized')) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this notification',
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
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read
 * 
 * Authentication: Required
 * 
 * Response:
 * - markedCount: number of notifications marked as read
 * 
 * Requirements: 15.6
 */
router.post('/mark-all-read', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const markedCount = await notificationService.markAllAsRead(userId);

    logger.info('All notifications marked as read', { userId, markedCount });

    res.status(200).json({
      markedCount,
    });
  } catch (error) {
    logger.error('Mark all notifications as read failed', { error, userId: req.user!.id });
    return next(error);
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete notification
 * 
 * Authentication: Required
 * 
 * Response:
 * - success: boolean
 * 
 * Requirements: 15.6
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user!.id;

    await notificationService.deleteNotification(notificationId, userId);

    logger.info('Notification deleted', { notificationId, userId });

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    logger.error('Delete notification failed', { error, notificationId: req.params.id });
    
    const errorMessage = (error as Error).message;
    
    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    if (errorMessage.includes('Unauthorized')) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this notification',
          retryable: false,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }

    return next(error);
  }
});

export default router;
