import { TelegramBotService } from './TelegramBotService';
import { ListingService } from './ListingService';
import { ChannelRepository } from '../database/repositories/ChannelRepository';
import { ListingRepository } from '../database/repositories/ListingRepository';
import { MerchantRepository } from '../database/repositories/MerchantRepository';
import { NotificationRepository } from '../database/repositories/NotificationRepository';
import { NotificationType } from '../types/models';
import { logger } from '../utils/logger';

/**
 * Bot Admin Verification Service
 * 
 * Handles scheduled verification of bot admin status across all channels
 * with active listings. When bot loses admin permissions, deactivates
 * listings and notifies affected merchants.
 * 
 * Requirements: 2.5
 */
export class BotAdminVerificationService {
  private botService: TelegramBotService;
  private listingService: ListingService;
  private channelRepository: ChannelRepository;
  private listingRepository: ListingRepository;
  private merchantRepository: MerchantRepository;
  private notificationRepository: NotificationRepository;

  constructor(
    botService?: TelegramBotService,
    listingService?: ListingService,
    channelRepository?: ChannelRepository,
    listingRepository?: ListingRepository,
    merchantRepository?: MerchantRepository,
    notificationRepository?: NotificationRepository
  ) {
    this.botService = botService || new TelegramBotService();
    this.listingService = listingService || new ListingService();
    this.channelRepository = channelRepository || new ChannelRepository();
    this.listingRepository = listingRepository || new ListingRepository();
    this.merchantRepository = merchantRepository || new MerchantRepository();
    this.notificationRepository = notificationRepository || new NotificationRepository();
  }

  /**
   * Verify bot admin status for all channels with active listings
   * 
   * This method:
   * 1. Gets all channels with active listings
   * 2. Verifies bot admin permissions for each channel
   * 3. Updates channel bot_is_admin status
   * 4. Deactivates listings when bot loses admin
   * 5. Sends notifications to affected merchants
   * 
   * Requirements: 2.5
   */
  async verifyAllChannels(): Promise<{
    totalChannels: number;
    verified: number;
    adminLost: number;
    errors: number;
  }> {
    logger.info('Starting bot admin verification for all channels');

    const stats = {
      totalChannels: 0,
      verified: 0,
      adminLost: 0,
      errors: 0,
    };

    try {
      // Get all channels with active listings
      const channels = await this.getChannelsWithActiveListings();
      stats.totalChannels = channels.length;

      logger.info('Found channels to verify', { count: channels.length });

      // Verify each channel
      for (const channel of channels) {
        try {
          await this.verifyChannel(channel.id, channel.telegramChannelId.toString());
          stats.verified++;
        } catch (error: any) {
          logger.error('Error verifying channel', {
            channelId: channel.id,
            telegramChannelId: channel.telegramChannelId,
            error: error.message,
          });
          stats.errors++;
        }
      }

      logger.info('Bot admin verification completed', stats);

      return stats;
    } catch (error: any) {
      logger.error('Failed to verify channels', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Verify bot admin status for a specific channel
   * 
   * @param channelId - Internal channel ID
   * @param telegramChannelId - Telegram channel ID
   */
  private async verifyChannel(channelId: string, telegramChannelId: string): Promise<void> {
    logger.info('Verifying channel', { channelId, telegramChannelId });

    try {
      // Get current channel state
      const channel = await this.channelRepository.findById(channelId);
      if (!channel) {
        logger.warn('Channel not found', { channelId });
        return;
      }

      const previousAdminStatus = channel.botIsAdmin;

      // Verify bot admin permissions
      const permissionCheck = await this.botService.verifyAdminPermissions(telegramChannelId);

      // Update channel bot admin status
      await this.channelRepository.updateBotAdminStatus(
        channelId,
        permissionCheck.isAdmin && permissionCheck.canInviteUsers && permissionCheck.canRemoveUsers
      );

      // If bot lost admin permissions, deactivate listings and notify merchants
      if (previousAdminStatus && !permissionCheck.isAdmin) {
        logger.warn('Bot lost admin permissions in channel', {
          channelId,
          telegramChannelId,
          channelName: channel.channelName,
        });

        await this.handleAdminLoss(channelId, channel.channelName);
      } else if (!previousAdminStatus && permissionCheck.isAdmin) {
        logger.info('Bot regained admin permissions in channel', {
          channelId,
          telegramChannelId,
          channelName: channel.channelName,
        });
      }
    } catch (error: any) {
      logger.error('Failed to verify channel', {
        channelId,
        telegramChannelId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Handle bot admin loss for a channel
   * 
   * Deactivates all listings for the channel and notifies affected merchants
   * 
   * @param channelId - Internal channel ID
   * @param channelName - Channel name for notifications
   */
  private async handleAdminLoss(channelId: string, channelName: string): Promise<void> {
    logger.info('Handling admin loss for channel', { channelId, channelName });

    try {
      // Get all active listings for this channel
      const listings = await this.listingRepository.findByChannelId(channelId);
      const activeListings = listings.filter(listing => listing.status === 'active');

      if (activeListings.length === 0) {
        logger.info('No active listings to deactivate', { channelId });
        return;
      }

      logger.info('Deactivating listings', {
        channelId,
        count: activeListings.length,
      });

      // Deactivate all listings for this channel
      const deactivatedCount = await this.listingService.deactivateListingsByChannel(channelId);

      logger.info('Listings deactivated', {
        channelId,
        count: deactivatedCount,
      });

      // Get unique merchant IDs from affected listings
      const merchantIds = [...new Set(activeListings.map(listing => listing.merchantId))];

      // Send notifications to affected merchants
      await this.notifyMerchants(merchantIds, channelName, deactivatedCount);

      logger.info('Merchants notified', {
        channelId,
        merchantCount: merchantIds.length,
      });
    } catch (error: any) {
      logger.error('Failed to handle admin loss', {
        channelId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send notifications to merchants about listing deactivation
   * 
   * @param merchantIds - Array of merchant IDs to notify
   * @param channelName - Channel name for notification message
   * @param listingCount - Number of listings deactivated
   */
  private async notifyMerchants(
    merchantIds: string[],
    channelName: string,
    listingCount: number
  ): Promise<void> {
    logger.info('Sending notifications to merchants', {
      merchantCount: merchantIds.length,
      channelName,
      listingCount,
    });

    for (const merchantId of merchantIds) {
      try {
        // Get merchant to find user ID
        const merchant = await this.merchantRepository.findById(merchantId);
        if (!merchant) {
          logger.warn('Merchant not found', { merchantId });
          continue;
        }

        // Create notification
        await this.notificationRepository.create({
          id: '', // Will be generated by repository
          userId: merchant.userId,
          type: NotificationType.LISTING_INACTIVE,
          title: 'Listings Deactivated - Bot Admin Access Lost',
          message: `Your ${listingCount} listing(s) for channel "${channelName}" have been deactivated because our bot lost admin permissions. Please ensure the bot has admin access and reactivate your listings.`,
          relatedEntityId: merchantId,
          isRead: false,
          createdAt: new Date(),
        });

        logger.info('Notification sent to merchant', {
          merchantId,
          userId: merchant.userId,
          channelName,
        });
      } catch (error: any) {
        logger.error('Failed to send notification to merchant', {
          merchantId,
          error: error.message,
        });
        // Continue with other merchants even if one fails
      }
    }
  }

  /**
   * Get all channels that have active listings
   * 
   * @returns Array of channels with active listings
   */
  async getChannelsWithActiveListings(): Promise<Array<{
    id: string;
    telegramChannelId: number;
    channelName: string;
    botIsAdmin: boolean;
  }>> {
    try {
      const channels = await this.channelRepository.findWithActiveListings();

      return channels.map((channel) => ({
        id: channel.id,
        telegramChannelId: channel.telegramChannelId,
        channelName: channel.channelName,
        botIsAdmin: channel.botIsAdmin,
      }));
    } catch (error: any) {
      logger.error('Failed to get channels with active listings', {
        error: error.message,
      });
      throw error;
    }
  }
}
