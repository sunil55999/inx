import { BaseRepository } from './BaseRepository';
import { Merchant, MerchantWithUser } from '../../types/models';

/**
 * Merchant Repository
 * Handles CRUD operations for merchants
 * 
 * Requirements: 1.1, 4.5
 */
export class MerchantRepository extends BaseRepository<Merchant> {
  constructor() {
    super('merchants');
  }

  /**
   * Find merchant by user ID
   */
  async findByUserId(userId: string): Promise<Merchant | null> {
    const result = await this.query()
      .where({ user_id: userId })
      .first();
    
    if (!result) return null;
    
    return this.mapToModel(result);
  }

  /**
   * Find merchant by storefront slug
   */
  async findByStorefrontSlug(slug: string): Promise<Merchant | null> {
    const result = await this.query()
      .where({ storefront_slug: slug })
      .first();
    
    if (!result) return null;
    
    return this.mapToModel(result);
  }

  /**
   * Map database row to Merchant model
   */
  private mapToModel(row: any): Merchant {
    return {
      id: row.id,
      userId: row.user_id,
      storefrontSlug: row.storefront_slug,
      displayName: row.display_name,
      description: row.description,
      profileImageUrl: row.profile_image_url,
      totalSales: row.total_sales,
      isVerified: row.is_verified || false,
      isSuspended: row.is_suspended || false,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Find merchant with user information
   */
  async findByIdWithUser(id: string): Promise<MerchantWithUser | null> {
    const result = await this.query()
      .where({ 'merchants.id': id })
      .leftJoin('users', 'merchants.user_id', 'users.id')
      .select(
        'merchants.*',
        'users.id as user_id',
        'users.username as user_username',
        'users.email as user_email',
        'users.role as user_role'
      )
      .first();

    if (!result) return null;

    return {
      id: result.id,
      userId: result.user_id,
      storefrontSlug: result.storefront_slug,
      displayName: result.display_name,
      description: result.description,
      profileImageUrl: result.profile_image_url,
      totalSales: result.total_sales,
      isVerified: result.is_verified,
      isSuspended: result.is_suspended,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
      user: {
        id: result.user_id,
        username: result.user_username,
        email: result.user_email,
        role: result.user_role,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      }
    };
  }

  /**
   * Check if storefront slug exists
   */
  async storefrontSlugExists(slug: string): Promise<boolean> {
    const result = await this.query()
      .where({ storefront_slug: slug })
      .first('id');
    return !!result;
  }

  /**
   * Update merchant profile
   */
  async updateProfile(
    id: string,
    data: {
      displayName?: string;
      description?: string;
      profileImageUrl?: string;
    }
  ): Promise<Merchant | null> {
    return await this.update(id, {
      displayName: data.displayName,
      description: data.description,
      profileImageUrl: data.profileImageUrl
    } as Partial<Merchant>);
  }

  /**
   * Increment total sales count
   */
  async incrementSales(id: string): Promise<void> {
    await this.query()
      .where({ id })
      .increment('total_sales', 1);
  }

  /**
   * Get top merchants by sales
   */
  async getTopMerchants(limit: number): Promise<Merchant[]> {
    const results = await this.query()
      .orderBy('total_sales', 'desc')
      .limit(limit)
      .select('*');
    
    return results.map((row: any) => this.mapToModel(row));
  }

  /**
   * Search merchants by display name or storefront slug
   */
  async search(query: string, limit: number = 20): Promise<Merchant[]> {
    const results = await this.query()
      .where('display_name', 'ilike', `%${query}%`)
      .orWhere('storefront_slug', 'ilike', `%${query}%`)
      .limit(limit)
      .select('*');
    
    return results.map((row: any) => this.mapToModel(row));
  }

  /**
   * Find all merchants with pagination
   * @override
   */
  async findAll(limit: number = 50, offset: number = 0): Promise<Merchant[]> {
    const results = await this.query()
      .limit(limit)
      .offset(offset)
      .orderBy('created_at', 'desc')
      .select('*');
    
    return results.map((row: any) => this.mapToModel(row));
  }
}
