import { Telegraf, Context } from 'telegraf';
import { logger } from '../utils/logger';

/**
 * Result of a bot invite operation
 */
export interface InviteResult {
  success: boolean;
  error?: string;
  retryable: boolean;
}

/**
 * Result of a bot remove operation
 */
export interface RemoveResult {
  success: boolean;
  error?: string;
  retryable: boolean;
}

/**
 * Bot permission check result
 */
export interface PermissionCheck {
  isAdmin: boolean;
  canInviteUsers: boolean;
  canRemoveUsers: boolean;
  channelExists: boolean;
}

/**
 * Bot information
 */
export interface BotInfo {
  id: number;
  username: string;
  isActive: boolean;
}

/**
 * TelegramBotService handles all Telegram Bot API operations
 * 
 * Responsibilities:
 * - Initialize bot with API token
 * - Set up webhook endpoint for bot events
 * - Implement bot command handlers
 * - Invite users to channels
 * - Remove users from channels
 * - Verify admin permissions
 * - Handle rate limits with exponential backoff
 * 
 * Requirements: 2.1, 2.2, 2.3
 */
export class TelegramBotService {
  private bot: Telegraf;
  private webhookPath: string;
  private isInitialized: boolean = false;

  constructor() {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
    }

    this.bot = new Telegraf(botToken);
    this.webhookPath = '/api/telegram/webhook';
    
    this.setupCommandHandlers();
    
    logger.info('TelegramBotService initialized');
  }

  /**
   * Set up bot command handlers
   * Handles basic bot commands for user interaction
   */
  private setupCommandHandlers(): void {
    // Start command - welcome message
    this.bot.command('start', async (ctx: Context) => {
      try {
        const username = ctx.from?.username || 'there';
        await ctx.reply(
          `Welcome to Telegram Signals Marketplace, @${username}! 🚀\n\n` +
          `This bot manages your access to signal channels.\n\n` +
          `Commands:\n` +
          `/help - Show available commands\n` +
          `/status - Check your subscription status\n` +
          `/support - Get support information`
        );
        
        logger.info('Start command executed', {
          userId: ctx.from?.id,
          username: ctx.from?.username,
        });
      } catch (error) {
        logger.error('Error handling start command', { error });
        await ctx.reply('Sorry, an error occurred. Please try again later.');
      }
    });

    // Help command - show available commands
    this.bot.command('help', async (ctx: Context) => {
      try {
        await ctx.reply(
          `📚 Available Commands:\n\n` +
          `/start - Welcome message\n` +
          `/help - Show this help message\n` +
          `/status - Check your subscription status\n` +
          `/support - Get support information\n\n` +
          `For more information, visit our website.`
        );
        
        logger.info('Help command executed', {
          userId: ctx.from?.id,
          username: ctx.from?.username,
        });
      } catch (error) {
        logger.error('Error handling help command', { error });
      }
    });

    // Status command - check subscription status
    this.bot.command('status', async (ctx: Context) => {
      try {
        await ctx.reply(
          `📊 Subscription Status\n\n` +
          `To check your subscription status, please visit your dashboard on our website.\n\n` +
          `Your Telegram ID: ${ctx.from?.id}`
        );
        
        logger.info('Status command executed', {
          userId: ctx.from?.id,
          username: ctx.from?.username,
        });
      } catch (error) {
        logger.error('Error handling status command', { error });
      }
    });

    // Support command - get support information
    this.bot.command('support', async (ctx: Context) => {
      try {
        await ctx.reply(
          `🆘 Support Information\n\n` +
          `If you need help, please:\n` +
          `1. Visit our support page\n` +
          `2. Create a ticket through your dashboard\n` +
          `3. Email: ${process.env.EMAIL_SUPPORT || 'support@example.com'}\n\n` +
          `We typically respond within 24 hours.`
        );
        
        logger.info('Support command executed', {
          userId: ctx.from?.id,
          username: ctx.from?.username,
        });
      } catch (error) {
        logger.error('Error handling support command', { error });
      }
    });

    // Handle unknown commands
    this.bot.on('text', async (ctx: Context) => {
      const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      
      // Only respond to messages that look like commands
      if (text.startsWith('/')) {
        await ctx.reply(
          `Unknown command. Type /help to see available commands.`
        );
        
        logger.info('Unknown command received', {
          userId: ctx.from?.id,
          command: text,
        });
      }
    });

    // Error handler
    this.bot.catch((err: any, ctx: Context) => {
      logger.error('Bot error occurred', {
        error: err.message,
        stack: err.stack,
        updateType: ctx.updateType,
        userId: ctx.from?.id,
      });
    });
  }

  /**
   * Initialize webhook for receiving bot updates
   * Should be called after server starts
   * 
   * @param webhookUrl - Full webhook URL (e.g., https://yourdomain.com/api/telegram/webhook)
   */
  async initializeWebhook(webhookUrl: string): Promise<void> {
    try {
      // Set webhook
      await this.bot.telegram.setWebhook(webhookUrl);
      
      this.isInitialized = true;
      
      logger.info('Telegram webhook initialized', { webhookUrl });
    } catch (error) {
      logger.error('Failed to initialize webhook', { error, webhookUrl });
      throw error;
    }
  }

  /**
   * Get webhook middleware for Express
   * Use this to handle incoming webhook requests
   * 
   * @returns Express middleware function
   */
  getWebhookMiddleware() {
    return this.bot.webhookCallback(this.webhookPath);
  }

  /**
   * Get webhook path
   * 
   * @returns Webhook path (e.g., /api/telegram/webhook)
   */
  getWebhookPath(): string {
    return this.webhookPath;
  }

  /**
   * Get bot information
   * 
   * @returns Bot information including ID and username
   */
  async getBotInfo(): Promise<BotInfo> {
    try {
      const me = await this.bot.telegram.getMe();
      
      return {
        id: me.id,
        username: me.username || '',
        isActive: this.isInitialized,
      };
    } catch (error) {
      logger.error('Failed to get bot info', { error });
      throw error;
    }
  }

  /**
   * Verify bot has admin permissions in a channel
   * 
   * @param channelId - Telegram channel ID (can be @username or numeric ID)
   * @returns Permission check result
   */
  async verifyAdminPermissions(channelId: string): Promise<PermissionCheck> {
    try {
      const botInfo = await this.bot.telegram.getMe();
      const chatMember = await this.bot.telegram.getChatMember(channelId, botInfo.id);
      
      const isAdmin = chatMember.status === 'administrator' || chatMember.status === 'creator';
      
      // Check specific permissions if admin
      let canInviteUsers = false;
      let canRemoveUsers = false;
      
      if (isAdmin && chatMember.status === 'administrator') {
        canInviteUsers = chatMember.can_invite_users || false;
        canRemoveUsers = chatMember.can_restrict_members || false;
      } else if (chatMember.status === 'creator') {
        // Creator has all permissions
        canInviteUsers = true;
        canRemoveUsers = true;
      }
      
      logger.info('Admin permissions verified', {
        channelId,
        isAdmin,
        canInviteUsers,
        canRemoveUsers,
        status: chatMember.status,
      });
      
      return {
        isAdmin,
        canInviteUsers,
        canRemoveUsers,
        channelExists: true,
      };
    } catch (error: any) {
      logger.error('Failed to verify admin permissions', {
        channelId,
        error: error.message,
      });
      
      // Check if channel doesn't exist
      if (error.response?.error_code === 400 || error.response?.description?.includes('chat not found')) {
        return {
          isAdmin: false,
          canInviteUsers: false,
          canRemoveUsers: false,
          channelExists: false,
        };
      }
      
      throw error;
    }
  }

  /**
   * Invite a user to a channel
   * Implements exponential backoff for rate limits
   * 
   * @param userId - Telegram user ID (numeric)
   * @param channelId - Telegram channel ID (can be @username or numeric ID)
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Invite result
   */
  async inviteUserToChannel(
    userId: number,
    channelId: string,
    maxRetries: number = 3
  ): Promise<InviteResult> {
    const baseDelay = 1000; // 1 second
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Invite user to channel
        await this.bot.telegram.unbanChatMember(channelId, userId);
        
        // Try to create an invite link for the user
        const inviteLink = await this.bot.telegram.createChatInviteLink(channelId, {
          member_limit: 1,
        });
        
        logger.info('User invited to channel', {
          userId,
          channelId,
          inviteLink: inviteLink.invite_link,
          attempt: attempt + 1,
        });
        
        return {
          success: true,
          retryable: false,
        };
      } catch (error: any) {
        const errorCode = error.response?.error_code;
        const errorDescription = error.response?.description || error.message;
        
        logger.warn('Failed to invite user to channel', {
          userId,
          channelId,
          attempt: attempt + 1,
          errorCode,
          errorDescription,
        });
        
        // Handle rate limiting
        if (errorCode === 429) {
          const retryAfter = error.response?.parameters?.retry_after || Math.pow(2, attempt);
          const delay = retryAfter * 1000;
          
          if (attempt < maxRetries - 1) {
            logger.info('Rate limited, retrying after delay', {
              userId,
              channelId,
              delay,
              attempt: attempt + 1,
            });
            
            await this.sleep(delay);
            continue;
          }
          
          return {
            success: false,
            error: 'Rate limit exceeded',
            retryable: true,
          };
        }
        
        // Handle permission errors
        if (errorCode === 403 || errorDescription.includes('not enough rights')) {
          return {
            success: false,
            error: 'Bot lacks permissions to invite users',
            retryable: false,
          };
        }
        
        // Handle user not found
        if (errorDescription.includes('user not found') || errorDescription.includes('USER_NOT_FOUND')) {
          return {
            success: false,
            error: 'Telegram user not found',
            retryable: false,
          };
        }
        
        // Handle channel not found
        if (errorDescription.includes('chat not found') || errorDescription.includes('CHAT_NOT_FOUND')) {
          return {
            success: false,
            error: 'Channel not found',
            retryable: false,
          };
        }
        
        // Retry on other errors
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
        }
        
        return {
          success: false,
          error: errorDescription,
          retryable: true,
        };
      }
    }
    
    return {
      success: false,
      error: 'Max retries exceeded',
      retryable: true,
    };
  }

  /**
   * Remove a user from a channel
   * Implements exponential backoff for rate limits
   * 
   * @param userId - Telegram user ID (numeric)
   * @param channelId - Telegram channel ID (can be @username or numeric ID)
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Remove result
   */
  async removeUserFromChannel(
    userId: number,
    channelId: string,
    maxRetries: number = 3
  ): Promise<RemoveResult> {
    const baseDelay = 1000; // 1 second
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Kick user from channel (ban and immediately unban to remove)
        await this.bot.telegram.banChatMember(channelId, userId);
        await this.bot.telegram.unbanChatMember(channelId, userId);
        
        logger.info('User removed from channel', {
          userId,
          channelId,
          attempt: attempt + 1,
        });
        
        return {
          success: true,
          retryable: false,
        };
      } catch (error: any) {
        const errorCode = error.response?.error_code;
        const errorDescription = error.response?.description || error.message;
        
        logger.warn('Failed to remove user from channel', {
          userId,
          channelId,
          attempt: attempt + 1,
          errorCode,
          errorDescription,
        });
        
        // Handle rate limiting
        if (errorCode === 429) {
          const retryAfter = error.response?.parameters?.retry_after || Math.pow(2, attempt);
          const delay = retryAfter * 1000;
          
          if (attempt < maxRetries - 1) {
            logger.info('Rate limited, retrying after delay', {
              userId,
              channelId,
              delay,
              attempt: attempt + 1,
            });
            
            await this.sleep(delay);
            continue;
          }
          
          return {
            success: false,
            error: 'Rate limit exceeded',
            retryable: true,
          };
        }
        
        // Handle permission errors
        if (errorCode === 403 || errorDescription.includes('not enough rights')) {
          return {
            success: false,
            error: 'Bot lacks permissions to remove users',
            retryable: false,
          };
        }
        
        // Handle user not found or not a member (consider success)
        if (
          errorDescription.includes('user not found') ||
          errorDescription.includes('USER_NOT_PARTICIPANT') ||
          errorDescription.includes('user is not a member')
        ) {
          logger.info('User not in channel, considering removal successful', {
            userId,
            channelId,
          });
          
          return {
            success: true,
            retryable: false,
          };
        }
        
        // Handle channel not found
        if (errorDescription.includes('chat not found') || errorDescription.includes('CHAT_NOT_FOUND')) {
          return {
            success: false,
            error: 'Channel not found',
            retryable: false,
          };
        }
        
        // Retry on other errors
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
        }
        
        return {
          success: false,
          error: errorDescription,
          retryable: true,
        };
      }
    }
    
    return {
      success: false,
      error: 'Max retries exceeded',
      retryable: true,
    };
  }

  /**
   * Sleep for a specified duration
   * 
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop the bot and clean up resources
   */
  async stop(): Promise<void> {
    try {
      await this.bot.stop();
      this.isInitialized = false;
      logger.info('TelegramBotService stopped');
    } catch (error) {
      logger.error('Error stopping bot', { error });
      throw error;
    }
  }
}

// Export singleton instance only if bot token is available
let telegramBotService: TelegramBotService | null = null;

try {
  if (process.env.TELEGRAM_BOT_TOKEN) {
    telegramBotService = new TelegramBotService();
  }
} catch (error) {
  // Ignore error during module load (e.g., in tests)
}

export { telegramBotService };
