import { ListingService } from '../ListingService';
import { ListingRepository } from '../../database/repositories/ListingRepository';
import { ChannelRepository } from '../../database/repositories/ChannelRepository';
import { MerchantRepository } from '../../database/repositories/MerchantRepository';
import {
  Listing,
  ListingStatus,
  CreateListingRequest,
  UpdateListingRequest,
  ChannelType,
  Merchant,
  Channel
} from '../../types/models';

// Mock the repositories
jest.mock('../../database/repositories/ListingRepository');
jest.mock('../../database/repositories/ChannelRepository');
jest.mock('../../database/repositories/MerchantRepository');

describe('ListingService', () => {
  let listingService: ListingService;
  let mockListingRepository: jest.Mocked<ListingRepository>;
  let mockChannelRepository: jest.Mocked<ChannelRepository>;
  let mockMerchantRepository: jest.Mocked<MerchantRepository>;

  // Test data
  const mockMerchantId = 'merchant-123';
  const mockChannelId = 'channel-456';
  const mockListingId = 'listing-789';

  const mockMerchant: Merchant = {
    id: mockMerchantId,
    userId: 'user-123',
    storefrontSlug: 'test-merchant',
    displayName: 'Test Merchant',
    description: 'Test description',
    profileImageUrl: undefined,
    totalSales: 0,
    isVerified: false,
    isSuspended: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockChannel: Channel = {
    id: mockChannelId,
    telegramChannelId: 123456789,
    channelName: 'Test Channel',
    channelUsername: 'testchannel',
    channelType: ChannelType.CHANNEL,
    botIsAdmin: true,
    lastPermissionCheck: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockListing: Listing = {
    id: mockListingId,
    merchantId: mockMerchantId,
    channelId: mockChannelId,
    description: 'Test listing description',
    price: 50,
    currency: 'USDT_BEP20',
    durationDays: 30,
    signalTypes: ['crypto', 'forex'],
    status: ListingStatus.ACTIVE,
    viewCount: 0,
    purchaseCount: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock instances
    mockListingRepository = new ListingRepository() as jest.Mocked<ListingRepository>;
    mockChannelRepository = new ChannelRepository() as jest.Mocked<ChannelRepository>;
    mockMerchantRepository = new MerchantRepository() as jest.Mocked<MerchantRepository>;

    // Create service with mocked repositories
    listingService = new ListingService(
      mockListingRepository,
      mockChannelRepository,
      mockMerchantRepository
    );
  });

  describe('createListing', () => {
    const validRequest: CreateListingRequest = {
      channelId: mockChannelId,
      channelName: 'Test Channel',
      description: 'Test listing description',
      price: 50,
      currency: 'USDT_BEP20',
      durationDays: 30,
      signalTypes: ['crypto', 'forex']
    };

    it('should create a listing with valid data', async () => {
      // Setup mocks
      mockMerchantRepository.findById.mockResolvedValue(mockMerchant);
      mockChannelRepository.findById.mockResolvedValue(mockChannel);
      mockListingRepository.findByMerchantAndChannel.mockResolvedValue([]);
      mockListingRepository.create.mockResolvedValue(mockListing);

      // Execute
      const result = await listingService.createListing(mockMerchantId, validRequest);

      // Verify
      expect(result).toEqual(mockListing);
      expect(mockMerchantRepository.findById).toHaveBeenCalledWith(mockMerchantId);
      expect(mockChannelRepository.findById).toHaveBeenCalledWith(mockChannelId);
      expect(mockListingRepository.findByMerchantAndChannel).toHaveBeenCalledWith(
        mockMerchantId,
        mockChannelId
      );
      expect(mockListingRepository.create).toHaveBeenCalled();
    });

    it('should throw error if merchant does not exist', async () => {
      mockMerchantRepository.findById.mockResolvedValue(null);

      await expect(
        listingService.createListing(mockMerchantId, validRequest)
      ).rejects.toThrow('Merchant not found');
    });

    it('should throw error if channel does not exist', async () => {
      mockMerchantRepository.findById.mockResolvedValue(mockMerchant);
      mockChannelRepository.findById.mockResolvedValue(null);

      await expect(
        listingService.createListing(mockMerchantId, validRequest)
      ).rejects.toThrow('Channel not found');
    });

    it('should throw error if bot does not have admin permissions', async () => {
      const channelWithoutAdmin = { ...mockChannel, botIsAdmin: false };
      mockMerchantRepository.findById.mockResolvedValue(mockMerchant);
      mockChannelRepository.findById.mockResolvedValue(channelWithoutAdmin);

      await expect(
        listingService.createListing(mockMerchantId, validRequest)
      ).rejects.toThrow('Bot does not have admin permissions in this channel');
    });

    it('should throw error for duplicate listing with same price and duration', async () => {
      const existingListing = { ...mockListing, status: ListingStatus.ACTIVE };
      mockMerchantRepository.findById.mockResolvedValue(mockMerchant);
      mockChannelRepository.findById.mockResolvedValue(mockChannel);
      mockListingRepository.findByMerchantAndChannel.mockResolvedValue([existingListing]);

      await expect(
        listingService.createListing(mockMerchantId, validRequest)
      ).rejects.toThrow('A listing with the same price, duration, and currency already exists');
    });

    it('should allow duplicate listing if existing one is inactive', async () => {
      const inactiveListing = { ...mockListing, status: ListingStatus.INACTIVE };
      mockMerchantRepository.findById.mockResolvedValue(mockMerchant);
      mockChannelRepository.findById.mockResolvedValue(mockChannel);
      mockListingRepository.findByMerchantAndChannel.mockResolvedValue([inactiveListing]);
      mockListingRepository.create.mockResolvedValue(mockListing);

      const result = await listingService.createListing(mockMerchantId, validRequest);

      expect(result).toEqual(mockListing);
      expect(mockListingRepository.create).toHaveBeenCalled();
    });

    it('should allow multiple listings with different prices', async () => {
      const existingListing = { ...mockListing, price: 100 };
      mockMerchantRepository.findById.mockResolvedValue(mockMerchant);
      mockChannelRepository.findById.mockResolvedValue(mockChannel);
      mockListingRepository.findByMerchantAndChannel.mockResolvedValue([existingListing]);
      mockListingRepository.create.mockResolvedValue(mockListing);

      const result = await listingService.createListing(mockMerchantId, validRequest);

      expect(result).toEqual(mockListing);
      expect(mockListingRepository.create).toHaveBeenCalled();
    });

    it('should throw error for empty description', async () => {
      const invalidRequest = { ...validRequest, description: '' };
      mockMerchantRepository.findById.mockResolvedValue(mockMerchant);
      mockChannelRepository.findById.mockResolvedValue(mockChannel);
      mockListingRepository.findByMerchantAndChannel.mockResolvedValue([]);

      await expect(
        listingService.createListing(mockMerchantId, invalidRequest)
      ).rejects.toThrow('Description is required');
    });

    it('should throw error for negative price', async () => {
      const invalidRequest = { ...validRequest, price: -10 };
      mockMerchantRepository.findById.mockResolvedValue(mockMerchant);
      mockChannelRepository.findById.mockResolvedValue(mockChannel);
      mockListingRepository.findByMerchantAndChannel.mockResolvedValue([]);

      await expect(
        listingService.createListing(mockMerchantId, invalidRequest)
      ).rejects.toThrow('Price must be greater than 0');
    });

    it('should throw error for zero duration', async () => {
      const invalidRequest = { ...validRequest, durationDays: 0 };
      mockMerchantRepository.findById.mockResolvedValue(mockMerchant);
      mockChannelRepository.findById.mockResolvedValue(mockChannel);
      mockListingRepository.findByMerchantAndChannel.mockResolvedValue([]);

      await expect(
        listingService.createListing(mockMerchantId, invalidRequest)
      ).rejects.toThrow('Duration must be greater than 0');
    });

    it('should create listing with default empty signal types', async () => {
      const requestWithoutSignalTypes = { ...validRequest };
      delete requestWithoutSignalTypes.signalTypes;

      mockMerchantRepository.findById.mockResolvedValue(mockMerchant);
      mockChannelRepository.findById.mockResolvedValue(mockChannel);
      mockListingRepository.findByMerchantAndChannel.mockResolvedValue([]);
      mockListingRepository.create.mockResolvedValue(mockListing);

      await listingService.createListing(mockMerchantId, requestWithoutSignalTypes);

      expect(mockListingRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          signalTypes: []
        })
      );
    });
  });

  describe('updateListing', () => {
    const validUpdates: UpdateListingRequest = {
      description: 'Updated description',
      price: 75,
      durationDays: 60
    };

    it('should update listing with valid data', async () => {
      const updatedListing = { ...mockListing, ...validUpdates };
      mockListingRepository.findById.mockResolvedValue(mockListing);
      mockListingRepository.update.mockResolvedValue(updatedListing);

      const result = await listingService.updateListing(
        mockListingId,
        mockMerchantId,
        validUpdates
      );

      expect(result).toEqual(updatedListing);
      expect(mockListingRepository.update).toHaveBeenCalledWith(mockListingId, validUpdates);
    });

    it('should throw error if listing does not exist', async () => {
      mockListingRepository.findById.mockResolvedValue(null);

      await expect(
        listingService.updateListing(mockListingId, mockMerchantId, validUpdates)
      ).rejects.toThrow('Listing not found');
    });

    it('should throw error if merchant does not own listing', async () => {
      const otherMerchantListing = { ...mockListing, merchantId: 'other-merchant' };
      mockListingRepository.findById.mockResolvedValue(otherMerchantListing);

      await expect(
        listingService.updateListing(mockListingId, mockMerchantId, validUpdates)
      ).rejects.toThrow('Unauthorized: You do not own this listing');
    });

    it('should throw error for negative price update', async () => {
      mockListingRepository.findById.mockResolvedValue(mockListing);

      await expect(
        listingService.updateListing(mockListingId, mockMerchantId, { price: -10 })
      ).rejects.toThrow('Price must be greater than 0');
    });

    it('should throw error for zero duration update', async () => {
      mockListingRepository.findById.mockResolvedValue(mockListing);

      await expect(
        listingService.updateListing(mockListingId, mockMerchantId, { durationDays: 0 })
      ).rejects.toThrow('Duration must be greater than 0');
    });

    it('should throw error for empty description update', async () => {
      mockListingRepository.findById.mockResolvedValue(mockListing);

      await expect(
        listingService.updateListing(mockListingId, mockMerchantId, { description: '' })
      ).rejects.toThrow('Description cannot be empty');
    });

    it('should allow partial updates', async () => {
      const partialUpdate = { price: 100 };
      const updatedListing = { ...mockListing, price: 100 };
      mockListingRepository.findById.mockResolvedValue(mockListing);
      mockListingRepository.update.mockResolvedValue(updatedListing);

      const result = await listingService.updateListing(
        mockListingId,
        mockMerchantId,
        partialUpdate
      );

      expect(result.price).toBe(100);
      expect(mockListingRepository.update).toHaveBeenCalledWith(mockListingId, partialUpdate);
    });
  });

  describe('deactivateListing', () => {
    it('should deactivate listing successfully', async () => {
      const deactivatedListing = { ...mockListing, status: ListingStatus.INACTIVE };
      mockListingRepository.findById.mockResolvedValue(mockListing);
      mockListingRepository.updateStatus.mockResolvedValue(deactivatedListing);

      const result = await listingService.deactivateListing(mockListingId, mockMerchantId);

      expect(result.status).toBe(ListingStatus.INACTIVE);
      expect(mockListingRepository.updateStatus).toHaveBeenCalledWith(
        mockListingId,
        ListingStatus.INACTIVE
      );
    });

    it('should throw error if listing does not exist', async () => {
      mockListingRepository.findById.mockResolvedValue(null);

      await expect(
        listingService.deactivateListing(mockListingId, mockMerchantId)
      ).rejects.toThrow('Listing not found');
    });

    it('should throw error if merchant does not own listing', async () => {
      const otherMerchantListing = { ...mockListing, merchantId: 'other-merchant' };
      mockListingRepository.findById.mockResolvedValue(otherMerchantListing);

      await expect(
        listingService.deactivateListing(mockListingId, mockMerchantId)
      ).rejects.toThrow('Unauthorized: You do not own this listing');
    });
  });

  describe('getListingById', () => {
    it('should return listing if found', async () => {
      mockListingRepository.findById.mockResolvedValue(mockListing);

      const result = await listingService.getListingById(mockListingId);

      expect(result).toEqual(mockListing);
      expect(mockListingRepository.findById).toHaveBeenCalledWith(mockListingId);
    });

    it('should return null if listing not found', async () => {
      mockListingRepository.findById.mockResolvedValue(null);

      const result = await listingService.getListingById(mockListingId);

      expect(result).toBeNull();
    });
  });

  describe('listListings', () => {
    it('should return search results with pagination', async () => {
      const searchQuery = {
        text: 'crypto',
        limit: 10,
        offset: 0
      };

      const searchResult = {
        items: [mockListing],
        total: 1,
        hasMore: false,
        limit: 10,
        offset: 0
      };

      mockListingRepository.search.mockResolvedValue(searchResult);

      const result = await listingService.listListings(searchQuery);

      expect(result).toEqual(searchResult);
      expect(mockListingRepository.search).toHaveBeenCalledWith(searchQuery);
    });
  });

  describe('getMerchantListings', () => {
    it('should return all listings for a merchant', async () => {
      const merchantListings = [mockListing, { ...mockListing, id: 'listing-2' }];
      mockListingRepository.findByMerchantId.mockResolvedValue(merchantListings);

      const result = await listingService.getMerchantListings(mockMerchantId);

      expect(result).toEqual(merchantListings);
      expect(mockListingRepository.findByMerchantId).toHaveBeenCalledWith(mockMerchantId);
    });
  });

  describe('getActiveListings', () => {
    it('should return only active listings', async () => {
      const activeListings = [mockListing];
      mockListingRepository.findActive.mockResolvedValue(activeListings);

      const result = await listingService.getActiveListings();

      expect(result).toEqual(activeListings);
      expect(mockListingRepository.findActive).toHaveBeenCalled();
    });
  });

  describe('incrementViewCount', () => {
    it('should increment view count', async () => {
      mockListingRepository.incrementViewCount.mockResolvedValue();

      await listingService.incrementViewCount(mockListingId);

      expect(mockListingRepository.incrementViewCount).toHaveBeenCalledWith(mockListingId);
    });
  });

  describe('incrementPurchaseCount', () => {
    it('should increment purchase count', async () => {
      mockListingRepository.incrementPurchaseCount.mockResolvedValue();

      await listingService.incrementPurchaseCount(mockListingId);

      expect(mockListingRepository.incrementPurchaseCount).toHaveBeenCalledWith(mockListingId);
    });
  });

  describe('deactivateListingsByChannel', () => {
    it('should deactivate all listings for a channel', async () => {
      mockListingRepository.deactivateByChannelId.mockResolvedValue(3);

      const result = await listingService.deactivateListingsByChannel(mockChannelId);

      expect(result).toBe(3);
      expect(mockListingRepository.deactivateByChannelId).toHaveBeenCalledWith(mockChannelId);
    });
  });

  describe('validateBotPermissions', () => {
    it('should return true if bot has admin permissions', async () => {
      mockChannelRepository.findById.mockResolvedValue(mockChannel);

      const result = await listingService.validateBotPermissions(mockChannelId);

      expect(result).toBe(true);
    });

    it('should return false if bot does not have admin permissions', async () => {
      const channelWithoutAdmin = { ...mockChannel, botIsAdmin: false };
      mockChannelRepository.findById.mockResolvedValue(channelWithoutAdmin);

      const result = await listingService.validateBotPermissions(mockChannelId);

      expect(result).toBe(false);
    });

    it('should return false if channel does not exist', async () => {
      mockChannelRepository.findById.mockResolvedValue(null);

      const result = await listingService.validateBotPermissions(mockChannelId);

      expect(result).toBe(false);
    });
  });

  describe('reactivateListing', () => {
    it('should reactivate listing if bot has permissions', async () => {
      const inactiveListing = { ...mockListing, status: ListingStatus.INACTIVE };
      const reactivatedListing = { ...mockListing, status: ListingStatus.ACTIVE };
      
      mockListingRepository.findById.mockResolvedValue(inactiveListing);
      mockChannelRepository.findById.mockResolvedValue(mockChannel);
      mockListingRepository.updateStatus.mockResolvedValue(reactivatedListing);

      const result = await listingService.reactivateListing(mockListingId, mockMerchantId);

      expect(result.status).toBe(ListingStatus.ACTIVE);
      expect(mockListingRepository.updateStatus).toHaveBeenCalledWith(
        mockListingId,
        ListingStatus.ACTIVE
      );
    });

    it('should throw error if bot does not have permissions', async () => {
      const inactiveListing = { ...mockListing, status: ListingStatus.INACTIVE };
      const channelWithoutAdmin = { ...mockChannel, botIsAdmin: false };
      
      mockListingRepository.findById.mockResolvedValue(inactiveListing);
      mockChannelRepository.findById.mockResolvedValue(channelWithoutAdmin);

      await expect(
        listingService.reactivateListing(mockListingId, mockMerchantId)
      ).rejects.toThrow('Cannot reactivate listing: Bot does not have admin permissions');
    });

    it('should throw error if merchant does not own listing', async () => {
      const otherMerchantListing = { ...mockListing, merchantId: 'other-merchant' };
      mockListingRepository.findById.mockResolvedValue(otherMerchantListing);

      await expect(
        listingService.reactivateListing(mockListingId, mockMerchantId)
      ).rejects.toThrow('Unauthorized: You do not own this listing');
    });
  });

  describe('canCreateListing', () => {
    it('should return true if merchant can create listing', async () => {
      mockMerchantRepository.findById.mockResolvedValue(mockMerchant);
      mockChannelRepository.findById.mockResolvedValue(mockChannel);

      const result = await listingService.canCreateListing(mockMerchantId, mockChannelId);

      expect(result.canCreate).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return false if merchant does not exist', async () => {
      mockMerchantRepository.findById.mockResolvedValue(null);

      const result = await listingService.canCreateListing(mockMerchantId, mockChannelId);

      expect(result.canCreate).toBe(false);
      expect(result.reason).toBe('Merchant not found');
    });

    it('should return false if channel does not exist', async () => {
      mockMerchantRepository.findById.mockResolvedValue(mockMerchant);
      mockChannelRepository.findById.mockResolvedValue(null);

      const result = await listingService.canCreateListing(mockMerchantId, mockChannelId);

      expect(result.canCreate).toBe(false);
      expect(result.reason).toBe('Channel not found');
    });

    it('should return false if bot does not have admin permissions', async () => {
      const channelWithoutAdmin = { ...mockChannel, botIsAdmin: false };
      mockMerchantRepository.findById.mockResolvedValue(mockMerchant);
      mockChannelRepository.findById.mockResolvedValue(channelWithoutAdmin);

      const result = await listingService.canCreateListing(mockMerchantId, mockChannelId);

      expect(result.canCreate).toBe(false);
      expect(result.reason).toBe('Bot does not have admin permissions in this channel');
    });
  });

  describe('getListingsByChannel', () => {
    it('should return all listings for a channel', async () => {
      const channelListings = [mockListing, { ...mockListing, id: 'listing-2' }];
      mockListingRepository.findByChannelId.mockResolvedValue(channelListings);

      const result = await listingService.getListingsByChannel(mockChannelId);

      expect(result).toEqual(channelListings);
      expect(mockListingRepository.findByChannelId).toHaveBeenCalledWith(mockChannelId);
    });
  });

  describe('getListingsByStatus', () => {
    it('should return listings filtered by status', async () => {
      const inactiveListings = [{ ...mockListing, status: ListingStatus.INACTIVE }];
      mockListingRepository.findByStatus.mockResolvedValue(inactiveListings);

      const result = await listingService.getListingsByStatus(ListingStatus.INACTIVE);

      expect(result).toEqual(inactiveListings);
      expect(mockListingRepository.findByStatus).toHaveBeenCalledWith(ListingStatus.INACTIVE);
    });
  });

  describe('getPopularListings', () => {
    it('should return popular listings with default limit', async () => {
      const popularListings = [mockListing];
      mockListingRepository.getPopular.mockResolvedValue(popularListings);

      const result = await listingService.getPopularListings();

      expect(result).toEqual(popularListings);
      expect(mockListingRepository.getPopular).toHaveBeenCalledWith(10);
    });

    it('should return popular listings with custom limit', async () => {
      const popularListings = [mockListing];
      mockListingRepository.getPopular.mockResolvedValue(popularListings);

      const result = await listingService.getPopularListings(5);

      expect(result).toEqual(popularListings);
      expect(mockListingRepository.getPopular).toHaveBeenCalledWith(5);
    });
  });

  describe('getNewestListings', () => {
    it('should return newest listings with default limit', async () => {
      const newestListings = [mockListing];
      mockListingRepository.getNewest.mockResolvedValue(newestListings);

      const result = await listingService.getNewestListings();

      expect(result).toEqual(newestListings);
      expect(mockListingRepository.getNewest).toHaveBeenCalledWith(10);
    });

    it('should return newest listings with custom limit', async () => {
      const newestListings = [mockListing];
      mockListingRepository.getNewest.mockResolvedValue(newestListings);

      const result = await listingService.getNewestListings(20);

      expect(result).toEqual(newestListings);
      expect(mockListingRepository.getNewest).toHaveBeenCalledWith(20);
    });
  });
});
