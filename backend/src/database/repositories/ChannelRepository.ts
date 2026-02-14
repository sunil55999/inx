import { BaseRepository } from './BaseRepository';
import { Channel, ChannelType } from '../../types/models';

/**
 * Channel Repository
 * Handles CRUD operations for Telegram channels
 * 
 * Requirements: 1.1, 4.5
 */
export class ChannelRepository extends BaseRepository<Channel> {
  constructor() {
    super('channels');
  }

  /**
   * Find channel by Telegram channel ID
   */
  async findByTelegramChannelId(telegramChannelId: number): Promise<Channel | null> {
    const result = await this.query()
      .where({ telegram_channel_id: telegramChannelId })
      .first();
    return result || null;
  }

  /**
   * Find channel by username
   */
  async findByUsername(username: string): Promise<Channel | null> {
    const result = await this.query()
      .where({ channel_username: username })
      .first();
    return result || null;
  }

  /**
   * Update bot admin status
   */
  async updateBotAdminStatus(id: string, isAdmin: boolean): Promise<Channel | null> {
    return await this.update(id, {
      botIsAdmin: isAdmin,
      lastPermissionCheck: new Date()
    } as Partial<Channel>);
  }

  /**
   * Find channels where bot is admin
   */
  async findWhereBotIsAdmin(): Promise<Channel[]> {
    return await this.query()
      .where({ bot_is_admin: true })
      .select('*');
  }

  /**
   * Find channels where bot is not admin
   */
  async findWhereBotIsNotAdmin(): Promise<Channel[]> {
    return await this.query()
      .where({ bot_is_admin: false })
      .select('*');
  }

  /**
   * Find channels needing permission check
   * (last check was more than specified hours ago)
   */
  async findNeedingPermissionCheck(hoursAgo: number): Promise<Channel[]> {
    const cutoffDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    
    return await this.query()
      .where('last_permission_check', '<', cutoffDate)
      .orWhereNull('last_permission_check')
      .select('*');
  }

  /**
   * Update last permission check timestamp
   */
  async updateLastPermissionCheck(id: string): Promise<void> {
    await this.query()
      .where({ id })
      .update({ last_permission_check: this.db.fn.now() });
  }

  /**
   * Find channels by type
   */
  async findByType(channelType: ChannelType): Promise<Channel[]> {
    return await this.query()
      .where({ channel_type: channelType })
      .select('*');
  }

  /**
   * Check if Telegram channel ID exists
   */
  async telegramChannelIdExists(telegramChannelId: number): Promise<boolean> {
    const result = await this.query()
      .where({ telegram_channel_id: telegramChannelId })
      .first('id');
    return !!result;
  }

  /**
   * Find channels with active listings
   * Returns distinct channels that have at least one active listing
   */
  async findWithActiveListings(): Promise<Channel[]> {
    return await this.query()
      .distinct('channels.*')
      .join('listings', 'channels.id', 'listings.channel_id')
      .where('listings.status', 'active')
      .select('channels.*');
  }
}
