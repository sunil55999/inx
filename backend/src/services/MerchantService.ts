/**
 * Merchant Service
 * 
 * Manages merchant profiles, storefronts, and merchant-related operations.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 * 
 * Features:
 * - Create merchant profiles
 * - Update merchant information
 * - Generate unique storefront URLs
 * - Get merchant by username
 * - Get merchant storefront with active listings
 */

import { v4 as uuidv4 } from 'uuid';
import { MerchantRepository } from '../database/repositories/MerchantRepository';
import { ListingRepository } from '../database/repositories/ListingRepository';
import { logger } from '../utils/logger';
import {
  Merchant,
  Listing,
  UpdateMerchantProfileRequest
} from '../types/models';

/**
 * Merchant storefront data
 */
export interface MerchantStorefront {
  merchant: Merchant;
  listings: Listing[];
  totalListings: number;
  activeListings: number;
}

/**
 * SEO meta tags for storefront
 */
export interface StorefrontMetaTags {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage?: string;
  ogUrl: string;
  twitterCard: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage?: string;
}

/**
 * Merchant Service
 * 
 * Handles merchant profile management and storefront operations.
 */
export class MerchantService {
  private merchantRepository: MerchantRepository;
  private listingRepository: ListingRepository;

  constructor() {
    this.merchantRepository = new MerchantRepository();
    this.listingRepository = new ListingRepository();
  }

  /**
   * Create a merchant profile
   * 
   * Called during user registration when user selects merchant role.
   * 
   * Requirements: 7.1, 7.6
   * 
   * @param userId - User ID
   * @param storefrontSlug - Unique slug for storefront URL
   * @param displayName - Display name for the merchant
   * @returns Created merchant
   */
  async createMerchant(
    userId: string,
    storefrontSlug: string,
    displayName?: string
  ): Promise<Merchant> {
    try {
      logger.info('Creating merchant', { userId, storefrontSlug });

      // Validate storefront slug format (alphanumeric, hyphens, underscores)
      const slugRegex = /^[a-zA-Z0-9_-]{3,30}$/;
      if (!slugRegex.test(storefrontSlug)) {
        throw new Error(
          'Storefront slug must be 3-30 characters and contain only letters, numbers, hyphens, and underscores'
        );
      }

      // Check if slug is already taken
      const existingMerchant = await this.merchantRepository.findByStorefrontSlug(storefrontSlug);
      if (existingMerchant) {
        throw new Error('Storefront slug is already taken');
      }

      // Create merchant
      const merchantId = uuidv4();
      const merchantData: Partial<Merchant> = {
        id: merchantId,
        userId,
        storefrontSlug: storefrontSlug.toLowerCase(),
        displayName: displayName || storefrontSlug,
        description: undefined,
        profileImageUrl: undefined,
        isVerified: false,
        isSuspended: false
      };

      const merchant = await this.merchantRepository.create(merchantData as Merchant);

      if (!merchant) {
        throw new Error('Failed to create merchant');
      }

      logger.info('Merchant created', {
        merchantId: merchant.id,
        userId,
        storefrontSlug: merchant.storefrontSlug
      });

      return merchant;

    } catch (error) {
      logger.error('Error creating merchant', { error, userId, storefrontSlug });
      throw error;
    }
  }

  /**
   * Update merchant profile
   * 
   * Requirements: 7.3, 7.6
   * 
   * @param merchantId - Merchant ID
   * @param updates - Profile updates
   * @returns Updated merchant
   */
  async updateMerchantProfile(
    merchantId: string,
    updates: UpdateMerchantProfileRequest
  ): Promise<Merchant> {
    try {
      logger.info('Updating merchant profile', { merchantId });

      const merchant = await this.merchantRepository.findById(merchantId);
      if (!merchant) {
        throw new Error('Merchant not found');
      }

      // Validate display name length
      if (updates.displayName && updates.displayName.length > 100) {
        throw new Error('Display name must be 100 characters or less');
      }

      // Validate description length
      if (updates.description && updates.description.length > 500) {
        throw new Error('Description must be 500 characters or less');
      }

      // Validate profile image URL
      if (updates.profileImageUrl && updates.profileImageUrl.length > 500) {
        throw new Error('Profile image URL is too long');
      }

      const updateData: Partial<Merchant> = {};
      
      if (updates.displayName !== undefined) {
        updateData.displayName = updates.displayName;
      }
      
      if (updates.description !== undefined) {
        updateData.description = updates.description;
      }
      
      if (updates.profileImageUrl !== undefined) {
        updateData.profileImageUrl = updates.profileImageUrl;
      }

      const updatedMerchant = await this.merchantRepository.update(merchantId, updateData);

      if (!updatedMerchant) {
        throw new Error('Failed to update merchant profile');
      }

      logger.info('Merchant profile updated', { merchantId });

      return updatedMerchant;

    } catch (error) {
      logger.error('Error updating merchant profile', { error, merchantId });
      throw error;
    }
  }

  /**
   * Get merchant by storefront slug
   * 
   * Requirements: 7.1
   * 
   * @param slug - Merchant storefront slug
   * @returns Merchant or null
   */
  async getMerchantByStorefrontSlug(slug: string): Promise<Merchant | null> {
    try {
      return await this.merchantRepository.findByStorefrontSlug(slug.toLowerCase());
    } catch (error) {
      logger.error('Error getting merchant by storefront slug', { error, slug });
      throw error;
    }
  }

  /**
   * Get merchant by user ID
   * 
   * @param userId - User ID
   * @returns Merchant or null
   */
  async getMerchantByUserId(userId: string): Promise<Merchant | null> {
    try {
      return await this.merchantRepository.findByUserId(userId);
    } catch (error) {
      logger.error('Error getting merchant by user ID', { error, userId });
      throw error;
    }
  }

  /**
   * Get merchant storefront with active listings
   * 
   * Requirements: 7.2, 7.5
   * 
   * @param slug - Merchant storefront slug
   * @returns Storefront data or null
   */
  async getStorefront(slug: string): Promise<MerchantStorefront | null> {
    try {
      logger.info('Getting merchant storefront', { slug });

      const merchant = await this.getMerchantByStorefrontSlug(slug);
      if (!merchant) {
        return null;
      }

      // Check if merchant is suspended
      if (merchant.isSuspended) {
        logger.warn('Attempted to access suspended merchant storefront', {
          merchantId: merchant.id,
          slug
        });
        return null;
      }

      // Get active listings for this merchant
      const listings = await this.listingRepository.findByMerchantId(merchant.id);
      const activeListings = listings.filter(listing => listing.status === 'active');

      logger.info('Storefront retrieved', {
        merchantId: merchant.id,
        slug,
        totalListings: listings.length,
        activeListings: activeListings.length
      });

      return {
        merchant,
        listings: activeListings,
        totalListings: listings.length,
        activeListings: activeListings.length
      };

    } catch (error) {
      logger.error('Error getting storefront', { error, slug });
      throw error;
    }
  }

  /**
   * Generate SEO meta tags for storefront
   * 
   * Requirements: 7.4
   * 
   * @param merchant - Merchant data
   * @param baseUrl - Base URL of the application
   * @returns SEO meta tags
   */
  generateStorefrontMetaTags(merchant: Merchant, baseUrl: string): StorefrontMetaTags {
    const storefrontUrl = `${baseUrl}/store/${merchant.storefrontSlug}`;
    const title = `${merchant.displayName} - Telegram Signals Marketplace`;
    const description = merchant.description 
      ? merchant.description.substring(0, 160) 
      : `Browse premium Telegram signal channels from ${merchant.displayName}`;

    return {
      title,
      description,
      ogTitle: title,
      ogDescription: description,
      ogImage: merchant.profileImageUrl || undefined,
      ogUrl: storefrontUrl,
      twitterCard: 'summary_large_image',
      twitterTitle: title,
      twitterDescription: description,
      twitterImage: merchant.profileImageUrl || undefined
    };
  }

  /**
   * Get storefront URL for merchant
   * 
   * Requirements: 7.1
   * 
   * @param slug - Merchant storefront slug
   * @param baseUrl - Base URL of the application
   * @returns Storefront URL
   */
  getStorefrontUrl(slug: string, baseUrl: string): string {
    return `${baseUrl}/store/${slug}`;
  }

  /**
   * Suspend merchant account
   * 
   * @param merchantId - Merchant ID
   * @param reason - Suspension reason
   * @returns Updated merchant
   */
  async suspendMerchant(merchantId: string, reason: string): Promise<Merchant> {
    try {
      logger.info('Suspending merchant', { merchantId, reason });

      const merchant = await this.merchantRepository.findById(merchantId);
      if (!merchant) {
        throw new Error('Merchant not found');
      }

      if (merchant.isSuspended) {
        throw new Error('Merchant is already suspended');
      }

      const updatedMerchant = await this.merchantRepository.update(merchantId, {
        isSuspended: true
      });

      if (!updatedMerchant) {
        throw new Error('Failed to suspend merchant');
      }

      logger.info('Merchant suspended', { merchantId });

      // TODO: Deactivate all merchant listings
      // TODO: Send notification to merchant

      return updatedMerchant;

    } catch (error) {
      logger.error('Error suspending merchant', { error, merchantId });
      throw error;
    }
  }

  /**
   * Unsuspend merchant account
   * 
   * @param merchantId - Merchant ID
   * @returns Updated merchant
   */
  async unsuspendMerchant(merchantId: string): Promise<Merchant> {
    try {
      logger.info('Unsuspending merchant', { merchantId });

      const merchant = await this.merchantRepository.findById(merchantId);
      if (!merchant) {
        throw new Error('Merchant not found');
      }

      if (!merchant.isSuspended) {
        throw new Error('Merchant is not suspended');
      }

      const updatedMerchant = await this.merchantRepository.update(merchantId, {
        isSuspended: false
      });

      if (!updatedMerchant) {
        throw new Error('Failed to unsuspend merchant');
      }

      logger.info('Merchant unsuspended', { merchantId });

      // TODO: Send notification to merchant

      return updatedMerchant;

    } catch (error) {
      logger.error('Error unsuspending merchant', { error, merchantId });
      throw error;
    }
  }

  /**
   * Verify merchant account
   * 
   * @param merchantId - Merchant ID
   * @returns Updated merchant
   */
  async verifyMerchant(merchantId: string): Promise<Merchant> {
    try {
      logger.info('Verifying merchant', { merchantId });

      const merchant = await this.merchantRepository.findById(merchantId);
      if (!merchant) {
        throw new Error('Merchant not found');
      }

      if (merchant.isVerified) {
        throw new Error('Merchant is already verified');
      }

      const updatedMerchant = await this.merchantRepository.update(merchantId, {
        isVerified: true
      });

      if (!updatedMerchant) {
        throw new Error('Failed to verify merchant');
      }

      logger.info('Merchant verified', { merchantId });

      // TODO: Send notification to merchant

      return updatedMerchant;

    } catch (error) {
      logger.error('Error verifying merchant', { error, merchantId });
      throw error;
    }
  }

  /**
   * Get all merchants (for admin)
   * 
   * @param limit - Maximum number of merchants to return
   * @param offset - Number of merchants to skip
   * @returns Array of merchants
   */
  async getAllMerchants(limit: number = 50, offset: number = 0): Promise<Merchant[]> {
    try {
      return await this.merchantRepository.findAll(limit, offset);
    } catch (error) {
      logger.error('Error getting all merchants', { error, limit, offset });
      throw error;
    }
  }

  /**
   * Search merchants by display name or username
   * 
   * @param query - Search query
   * @param limit - Maximum number of results
   * @returns Array of merchants
   */
  async searchMerchants(query: string, limit: number = 20): Promise<Merchant[]> {
    try {
      return await this.merchantRepository.search(query, limit);
    } catch (error) {
      logger.error('Error searching merchants', { error, query, limit });
      throw error;
    }
  }
}

// Export singleton instance
export const merchantService = new MerchantService();
