import { BaseRepository } from './BaseRepository';
import { User, UserRole } from '../../types/models';

/**
 * User Repository
 * Handles CRUD operations for users
 * 
 * Requirements: 1.1, 4.5
 */
export class UserRepository extends BaseRepository<User> {
  constructor() {
    super('users');
  }

  /**
   * Find user by username
   */
  async findByUsername(username: string): Promise<User | null> {
    const result = await this.query()
      .where({ username })
      .first();
    return result || null;
  }

  /**
   * Find user by Telegram user ID
   */
  async findByTelegramUserId(telegramUserId: number): Promise<User | null> {
    const result = await this.query()
      .where({ telegram_user_id: telegramUserId })
      .first();
    return result || null;
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.query()
      .where({ email })
      .first();
    return result || null;
  }

  /**
   * Find users by role
   */
  async findByRole(role: UserRole): Promise<User[]> {
    return await this.query()
      .where({ role })
      .select('*');
  }

  /**
   * Check if username exists
   */
  async usernameExists(username: string): Promise<boolean> {
    const result = await this.query()
      .where({ username })
      .first('id');
    return !!result;
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string): Promise<boolean> {
    const result = await this.query()
      .where({ email })
      .first('id');
    return !!result;
  }

  /**
   * Update user role
   */
  async updateRole(id: string, role: UserRole): Promise<User | null> {
    return await this.update(id, { role } as Partial<User>);
  }

  /**
   * Link Telegram user ID to user account
   */
  async linkTelegramAccount(id: string, telegramUserId: number): Promise<User | null> {
    return await this.update(id, { telegramUserId } as Partial<User>);
  }
}
