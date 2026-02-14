import { BotAdminVerificationService } from '../BotAdminVerificationService';
import { TelegramBotService, PermissionCheck } from '../TelegramBotService';
import { ListingService } from '../ListingService';
import { ChannelRepository } from '../../database/repositories/ChannelRepository';
import { ListingRepository } from '../../database/repositories/ListingRepository';
import { MerchantRepository } from '../../database/repositories/MerchantRepository';
import { NotificationRepository } from '../../database/repositories/NotificationRepository';
import { Channel, Listing, Merchant, NotificationType } from '../../types/models';

// Mock dependencies
jest.mock('../TelegramBotService');
jest.mock('../ListingService');
jest.mock('../../database/repositories/ChannelRepository');
jest.mock('../../database/repositories/ListingRepository');
jest.mock('../../database/repositories/MerchantRepository');
jest.mock('../../database/repositories/NotificationRepository');

describe('BotAdminVerificationService', () => {
  let service: BotAdminVerificationService;
  let mockBotService: jest.Mocked<TelegramBotService>;
  let mockListingService: jest.Mocked<ListingService>;
  let mockChannelRepository: jest.Mocked<ChannelRepository>;
  let mockListingRepository: jest.Mocked<ListingRepository>;
  let mockMerchantRepository: jest.Mocked<MerchantRepository>;
  let mockNotificationRepository: jest.Mocked<NotificationRepository>;

  beforeEach(() => {
    // Create mock instances
    mockBotService = new TelegramBotService() as jest.Mocked<TelegramBotService>;
    mockListingService = new ListingService() as jest.Mocked<ListingService>;
    mockChannelRepository = new ChannelRepository() as jest.Mocked<ChannelRepository>;
    mockListingRepository = new ListingRepository() as jest.Mocked<ListingRepository>;
    mockMerchantRepository = new MerchantRepository() as jest.Mocked<MerchantRepository>;
    mockNotificationRepository = new NotificationRepository() as jest.Mocked<NotificationRepository>;

    // Create service with mocked dependencies
    service = new BotAdminVerificationService(
      mockBotService,
      mockListingService,
      mockChannelRepository,
      mockListingRepository,
      mockMerchantRepository,
      mockNotificationRepository
    );

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('verifyAllChannels', () => {
    it('should verify all channels with active listings', async () => {
      // Mock channels with active listings
      const mockChannels = [
        {
          id: 'channel-1',
          telegramChannelId: 123456,
          channelName: 'Test Channel 1',
          botIsAdmin: true,
        },
        {
          id: 'channel-2',
          telegramChannelId: 789012,
          channelName: 'Test Channel 2',
          botIsAdmin: true,
        },
      ];

      // Mock the getChannelsWithActiveListings method
      jest.spyOn(service as any, 'getChannelsWithActiveListings').mockResolvedValue(mockChannels);

      mockChannelRepository.findById = jest.fn()
        .mockResolvedValueOnce({
          id: 'channel-1',
          telegramChannelId: 123456,
          channelName: 'Test Channel 1',
          botIsAdmin: true,
        } as Channel)
        .mockResolvedValueOnce({
          id: 'channel-2',
          telegramChannelId: 789012,
          channelName: 'Test Channel 2',
          botIsAdmin: true,
        } as Channel);

      mockBotService.verifyAdminPermissions = jest.fn().mockResolvedValue({
        isAdmin: true,
        canInviteUsers: true,
        canRemoveUsers: true,
        channelExists: true,
      } as PermissionCheck);

      mockChannelRepository.updateBotAdminStatus = jest.fn().mockResolvedValue({} as Channel);

      const result = await service.verifyAllChannels();

      expect(result.totalChannels).toBe(2);
      expect(result.verified).toBe(2);
      expect(result.adminLost).toBe(0);
      expect(result.errors).toBe(0);
      expect(mockBotService.verifyAdminPermissions).toHaveBeenCalledTimes(2);
      expect(mockChannelRepository.updateBotAdminStatus).toHaveBeenCalledTimes(2);
    });

    it('should handle bot admin loss and deactivate listings', async () => {
      // Mock channel with active listings
      const mockChannels = [
        {
          id: 'channel-1',
          telegramChannelId: 123456,
          channelName: 'Test Channel 1',
          botIsAdmin: true,
        },
      ];

      // Mock the getChannelsWithActiveListings method
      jest.spyOn(service as any, 'getChannelsWithActiveListings').mockResolvedValue(mockChannels);

      mockChannelRepository.findById = jest.fn().mockResolvedValue({
        id: 'channel-1',
        telegramChannelId: 123456,
        channelName: 'Test Channel 1',
        botIsAdmin: true, // Was admin before
      } as Channel);

      // Bot lost admin permissions
      mockBotService.verifyAdminPermissions = jest.fn().mockResolvedValue({
        isAdmin: false,
        canInviteUsers: false,
        canRemoveUsers: false,
        channelExists: true,
      } as PermissionCheck);

      mockChannelRepository.updateBotAdminStatus = jest.fn().mockResolvedValue({} as Channel);

      // Mock active listings
      const mockListings = [
        {
          id: 'listing-1',
          merchantId: 'merchant-1',
          channelId: 'channel-1',
          status: 'active',
        } as Listing,
        {
          id: 'listing-2',
          merchantId: 'merchant-2',
          channelId: 'channel-1',
          status: 'active',
        } as Listing,
      ];

      mockListingRepository.findByChannelId = jest.fn().mockResolvedValue(mockListings);
      mockListingService.deactivateListingsByChannel = jest.fn().mockResolvedValue(2);

      // Mock merchants
      mockMerchantRepository.findById = jest.fn()
        .mockResolvedValueOnce({
          id: 'merchant-1',
          userId: 'user-1',
        } as Merchant)
        .mockResolvedValueOnce({
          id: 'merchant-2',
          userId: 'user-2',
        } as Merchant);

      mockNotificationRepository.create = jest.fn().mockResolvedValue({});

      const result = await service.verifyAllChannels();

      expect(result.totalChannels).toBe(1);
      expect(result.verified).toBe(1);
      expect(mockListingService.deactivateListingsByChannel).toHaveBeenCalledWith('channel-1');
      expect(mockNotificationRepository.create).toHaveBeenCalledTimes(2);
      expect(mockNotificationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: NotificationType.LISTING_INACTIVE,
          title: 'Listings Deactivated - Bot Admin Access Lost',
        })
      );
    });

    it('should handle bot regaining admin permissions', async () => {
      // Mock channel with active listings
      const mockChannels = [
        {
          id: 'channel-1',
          telegramChannelId: 123456,
          channelName: 'Test Channel 1',
          botIsAdmin: false,
        },
      ];

      // Mock the getChannelsWithActiveListings method
      jest.spyOn(service as any, 'getChannelsWithActiveListings').mockResolvedValue(mockChannels);

      mockChannelRepository.findById = jest.fn().mockResolvedValue({
        id: 'channel-1',
        telegramChannelId: 123456,
        channelName: 'Test Channel 1',
        botIsAdmin: false, // Was not admin before
      } as Channel);

      // Bot regained admin permissions
      mockBotService.verifyAdminPermissions = jest.fn().mockResolvedValue({
        isAdmin: true,
        canInviteUsers: true,
        canRemoveUsers: true,
        channelExists: true,
      } as PermissionCheck);

      mockChannelRepository.updateBotAdminStatus = jest.fn().mockResolvedValue({} as Channel);

      const result = await service.verifyAllChannels();

      expect(result.totalChannels).toBe(1);
      expect(result.verified).toBe(1);
      expect(mockChannelRepository.updateBotAdminStatus).toHaveBeenCalledWith('channel-1', true);
      // Should not deactivate listings when regaining admin
      expect(mockListingService.deactivateListingsByChannel).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully and continue with other channels', async () => {
      // Mock channels with active listings
      const mockChannels = [
        {
          id: 'channel-1',
          telegramChannelId: 123456,
          channelName: 'Test Channel 1',
          botIsAdmin: true,
        },
        {
          id: 'channel-2',
          telegramChannelId: 789012,
          channelName: 'Test Channel 2',
          botIsAdmin: true,
        },
      ];

      // Mock the getChannelsWithActiveListings method
      jest.spyOn(service as any, 'getChannelsWithActiveListings').mockResolvedValue(mockChannels);

      mockChannelRepository.findById = jest.fn()
        .mockResolvedValueOnce({
          id: 'channel-1',
          telegramChannelId: 123456,
          channelName: 'Test Channel 1',
          botIsAdmin: true,
        } as Channel)
        .mockResolvedValueOnce({
          id: 'channel-2',
          telegramChannelId: 789012,
          channelName: 'Test Channel 2',
          botIsAdmin: true,
        } as Channel);

      // First channel fails, second succeeds
      mockBotService.verifyAdminPermissions = jest.fn()
        .mockRejectedValueOnce(new Error('Telegram API error'))
        .mockResolvedValueOnce({
          isAdmin: true,
          canInviteUsers: true,
          canRemoveUsers: true,
          channelExists: true,
        } as PermissionCheck);

      mockChannelRepository.updateBotAdminStatus = jest.fn().mockResolvedValue({} as Channel);

      const result = await service.verifyAllChannels();

      expect(result.totalChannels).toBe(2);
      expect(result.verified).toBe(1);
      expect(result.errors).toBe(1);
    });

    it('should not deactivate listings if no active listings exist', async () => {
      // Mock channel with active listings
      const mockChannels = [
        {
          id: 'channel-1',
          telegramChannelId: 123456,
          channelName: 'Test Channel 1',
          botIsAdmin: true,
        },
      ];

      // Mock the getChannelsWithActiveListings method
      jest.spyOn(service as any, 'getChannelsWithActiveListings').mockResolvedValue(mockChannels);

      mockChannelRepository.findById = jest.fn().mockResolvedValue({
        id: 'channel-1',
        telegramChannelId: 123456,
        channelName: 'Test Channel 1',
        botIsAdmin: true,
      } as Channel);

      // Bot lost admin permissions
      mockBotService.verifyAdminPermissions = jest.fn().mockResolvedValue({
        isAdmin: false,
        canInviteUsers: false,
        canRemoveUsers: false,
        channelExists: true,
      } as PermissionCheck);

      mockChannelRepository.updateBotAdminStatus = jest.fn().mockResolvedValue({} as Channel);

      // No active listings
      mockListingRepository.findByChannelId = jest.fn().mockResolvedValue([]);

      const result = await service.verifyAllChannels();

      expect(result.totalChannels).toBe(1);
      expect(result.verified).toBe(1);
      expect(mockListingService.deactivateListingsByChannel).not.toHaveBeenCalled();
      expect(mockNotificationRepository.create).not.toHaveBeenCalled();
    });

    it('should handle notification failures gracefully', async () => {
      // Mock channel with active listings
      const mockChannels = [
        {
          id: 'channel-1',
          telegramChannelId: 123456,
          channelName: 'Test Channel 1',
          botIsAdmin: true,
        },
      ];

      // Mock the getChannelsWithActiveListings method
      jest.spyOn(service as any, 'getChannelsWithActiveListings').mockResolvedValue(mockChannels);

      mockChannelRepository.findById = jest.fn().mockResolvedValue({
        id: 'channel-1',
        telegramChannelId: 123456,
        channelName: 'Test Channel 1',
        botIsAdmin: true,
      } as Channel);

      // Bot lost admin permissions
      mockBotService.verifyAdminPermissions = jest.fn().mockResolvedValue({
        isAdmin: false,
        canInviteUsers: false,
        canRemoveUsers: false,
        channelExists: true,
      } as PermissionCheck);

      mockChannelRepository.updateBotAdminStatus = jest.fn().mockResolvedValue({} as Channel);

      // Mock active listings
      const mockListings = [
        {
          id: 'listing-1',
          merchantId: 'merchant-1',
          channelId: 'channel-1',
          status: 'active',
        } as Listing,
      ];

      mockListingRepository.findByChannelId = jest.fn().mockResolvedValue(mockListings);
      mockListingService.deactivateListingsByChannel = jest.fn().mockResolvedValue(1);

      // Mock merchant
      mockMerchantRepository.findById = jest.fn().mockResolvedValue({
        id: 'merchant-1',
        userId: 'user-1',
      } as Merchant);

      // Notification creation fails
      mockNotificationRepository.create = jest.fn().mockRejectedValue(new Error('Database error'));

      // Should not throw error
      const result = await service.verifyAllChannels();

      expect(result.totalChannels).toBe(1);
      expect(result.verified).toBe(1);
      expect(mockListingService.deactivateListingsByChannel).toHaveBeenCalled();
    });
  });
});
