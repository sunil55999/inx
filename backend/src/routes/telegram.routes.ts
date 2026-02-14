import { Router } from 'express';
import { telegramBotService } from '../services/TelegramBotService';
import { logger } from '../utils/logger';

const router = Router();

// Middleware to check if bot service is available
const checkBotService = (_req: any, res: any, next: any) => {
  if (!telegramBotService) {
    return res.status(503).json({
      error: {
        code: 'BOT_SERVICE_UNAVAILABLE',
        message: 'Telegram bot service is not configured',
        retryable: false,
        timestamp: new Date().toISOString(),
      },
    });
  }
  next();
};

/**
 * Telegram webhook endpoint
 * Receives updates from Telegram Bot API
 * 
 * POST /api/telegram/webhook
 */
router.post(
  '/webhook',
  checkBotService,
  (req, res, next) => {
    if (telegramBotService) {
      telegramBotService.getWebhookMiddleware()(req, res, next);
    }
  }
);

/**
 * Get bot information
 * Useful for debugging and verification
 * 
 * GET /api/telegram/bot-info
 */
router.get('/bot-info', checkBotService, async (_req, res): Promise<void> => {
  try {
    const botInfo = await telegramBotService!.getBotInfo();
    
    res.json({
      success: true,
      data: botInfo,
    });
  } catch (error: any) {
    logger.error('Failed to get bot info', { error });
    
    res.status(500).json({
      error: {
        code: 'BOT_INFO_ERROR',
        message: 'Failed to retrieve bot information',
        details: error.message,
        retryable: true,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * Verify bot admin permissions in a channel
 * Used by listing service before creating listings
 * 
 * POST /api/telegram/verify-permissions
 * Body: { channelId: string }
 */
router.post('/verify-permissions', checkBotService, async (req, res): Promise<void> => {
  try {
    const { channelId } = req.body;
    
    if (!channelId) {
      res.status(400).json({
        error: {
          code: 'MISSING_CHANNEL_ID',
          message: 'channelId is required',
          retryable: false,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }
    
    const permissions = await telegramBotService!.verifyAdminPermissions(channelId);
    
    res.json({
      success: true,
      data: permissions,
    });
  } catch (error: any) {
    logger.error('Failed to verify permissions', { error, channelId: req.body.channelId });
    
    res.status(500).json({
      error: {
        code: 'PERMISSION_CHECK_ERROR',
        message: 'Failed to verify bot permissions',
        details: error.message,
        retryable: true,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * Manually invite a user to a channel
 * Used for testing and manual operations
 * 
 * POST /api/telegram/invite
 * Body: { userId: number, channelId: string }
 */
router.post('/invite', checkBotService, async (req, res): Promise<void> => {
  try {
    const { userId, channelId } = req.body;
    
    if (!userId || !channelId) {
      res.status(400).json({
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'userId and channelId are required',
          retryable: false,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }
    
    const result = await telegramBotService!.inviteUserToChannel(userId, channelId);
    
    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(result.retryable ? 503 : 400).json({
        error: {
          code: 'INVITE_FAILED',
          message: result.error || 'Failed to invite user',
          retryable: result.retryable,
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (error: any) {
    logger.error('Failed to invite user', {
      error,
      userId: req.body.userId,
      channelId: req.body.channelId,
    });
    
    res.status(500).json({
      error: {
        code: 'INVITE_ERROR',
        message: 'Failed to invite user to channel',
        details: error.message,
        retryable: true,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * Manually remove a user from a channel
 * Used for testing and manual operations
 * 
 * POST /api/telegram/remove
 * Body: { userId: number, channelId: string }
 */
router.post('/remove', checkBotService, async (req, res): Promise<void> => {
  try {
    const { userId, channelId } = req.body;
    
    if (!userId || !channelId) {
      res.status(400).json({
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'userId and channelId are required',
          retryable: false,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }
    
    const result = await telegramBotService!.removeUserFromChannel(userId, channelId);
    
    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(result.retryable ? 503 : 400).json({
        error: {
          code: 'REMOVE_FAILED',
          message: result.error || 'Failed to remove user',
          retryable: result.retryable,
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (error: any) {
    logger.error('Failed to remove user', {
      error,
      userId: req.body.userId,
      channelId: req.body.channelId,
    });
    
    res.status(500).json({
      error: {
        code: 'REMOVE_ERROR',
        message: 'Failed to remove user from channel',
        details: error.message,
        retryable: true,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

export default router;
