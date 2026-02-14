import { BaseRepository } from './BaseRepository';
import { Notification, NotificationType } from '../../types/models';

/**
 * Notification Repository
 * Handles CRUD operations for user notifications
 * 
 * Requirements: 1.1, 4.5
 */
export class NotificationRepository extends BaseRepository<Notification> {
  constructor() {
    super('notifications');
  }

  /**
   * Find notifications by user ID
   */
  async findByUserId(userId: string): Promise<Notification[]> {
    return await this.query()
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find unread notifications by user ID
   */
  async findUnreadByUserId(userId: string): Promise<Notification[]> {
    return await this.query()
      .where({ 
        user_id: userId,
        is_read: false 
      })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find notifications by type
   */
  async findByType(type: NotificationType): Promise<Notification[]> {
    return await this.query()
      .where({ type })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: string): Promise<Notification | null> {
    return await this.update(id, { isRead: true } as Partial<Notification>);
  }

  /**
   * Mark all notifications as read for user
   */
  async markAllAsReadForUser(userId: string): Promise<number> {
    return await this.query()
      .where({ 
        user_id: userId,
        is_read: false 
      })
      .update({ 
        is_read: true,
        updated_at: this.db.fn.now()
      });
  }

  /**
   * Count unread notifications for user
   */
  async countUnreadByUserId(userId: string): Promise<number> {
    const result = await this.query()
      .where({ 
        user_id: userId,
        is_read: false 
      })
      .count('* as count')
      .first();
    
    return parseInt(result?.count as string || '0', 10);
  }

  /**
   * Get recent notifications for user with pagination
   */
  async getRecentForUser(
    userId: string,
    limit: number,
    offset: number
  ): Promise<{ data: Notification[]; total: number }> {
    return await this.findWithPagination(
      { userId } as Partial<Notification>,
      limit,
      offset
    );
  }

  /**
   * Delete old notifications (older than specified date)
   */
  async deleteOlderThan(date: Date): Promise<number> {
    return await this.query()
      .where('created_at', '<', date)
      .delete();
  }

  /**
   * Find notifications by related entity
   */
  async findByRelatedEntity(relatedEntityId: string): Promise<Notification[]> {
    return await this.query()
      .where({ related_entity_id: relatedEntityId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Get notification statistics for user
   */
  async getStatisticsForUser(userId: string): Promise<{
    total: number;
    unread: number;
    byType: Record<string, number>;
  }> {
    const [totalResult, unreadResult, byTypeResults] = await Promise.all([
      this.query().where({ user_id: userId }).count('* as count').first(),
      this.query().where({ user_id: userId, is_read: false }).count('* as count').first(),
      this.query()
        .where({ user_id: userId })
        .select('type')
        .count('* as count')
        .groupBy('type')
    ]);

    const byType: Record<string, number> = {};
    byTypeResults.forEach((row: any) => {
      byType[row.type] = parseInt(row.count, 10);
    });

    return {
      total: parseInt(totalResult?.count as string || '0', 10),
      unread: parseInt(unreadResult?.count as string || '0', 10),
      byType
    };
  }
}
