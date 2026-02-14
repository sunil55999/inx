import { TelegramBotService } from '../TelegramBotService';

// Mock telegraf
jest.mock('telegraf', () => {
  const mockBot = {
    telegram: {
      setWebhook: jest.fn(),
      getMe: jest.fn(),
      getChatMember: jest.fn(),
      unbanChatMember: jest.fn(),
      createChatInviteLink: jest.fn(),
      banChatMember: jest.fn(),
    },
    command: jest.fn(),
    on: jest.fn(),
    catch: jest.fn(),
    webhookCallback: jest.fn(),
    stop: jest.fn(),
  };

  return {
    Telegraf: jest.fn(() => mockBot),
  };
});

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('TelegramBotService', () => {
  let service: TelegramBotService;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      TELEGRAM_BOT_TOKEN: 'test-bot-token',
      EMAIL_SUPPORT: 'support@test.com',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with bot token from environment', () => {
      service = new TelegramBotService();
      expect(service).toBeDefined();
    });

    it('should throw error if bot token is missing', () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      expect(() => new TelegramBotService()).toThrow('TELEGRAM_BOT_TOKEN environment variable is required');
    });
  });

  describe('initializeWebhook', () => {
    beforeEach(() => {
      service = new TelegramBotService();
    });

    it('should set webhook with provided URL', async () => {
      const webhookUrl = 'https://example.com/api/telegram/webhook';
      const mockSetWebhook = (service as any).bot.telegram.setWebhook;

      await service.initializeWebhook(webhookUrl);

      expect(mockSetWebhook).toHaveBeenCalledWith(webhookUrl);
    });

    it('should throw error if webhook setup fails', async () => {
      const webhookUrl = 'https://example.com/api/telegram/webhook';
      const mockSetWebhook = (service as any).bot.telegram.setWebhook;
      mockSetWebhook.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.initializeWebhook(webhookUrl)).rejects.toThrow('Network error');
    });
  });

  describe('getBotInfo', () => {
    beforeEach(() => {
      service = new TelegramBotService();
    });

    it('should return bot information', async () => {
      const mockGetMe = (service as any).bot.telegram.getMe;
      mockGetMe.mockResolvedValueOnce({
        id: 123456789,
        username: 'test_bot',
        first_name: 'Test Bot',
      });

      const botInfo = await service.getBotInfo();

      expect(botInfo).toEqual({
        id: 123456789,
        username: 'test_bot',
        isActive: false,
      });
    });

    it('should throw error if getting bot info fails', async () => {
      const mockGetMe = (service as any).bot.telegram.getMe;
      mockGetMe.mockRejectedValueOnce(new Error('API error'));

      await expect(service.getBotInfo()).rejects.toThrow('API error');
    });
  });

  describe('verifyAdminPermissions', () => {
    beforeEach(() => {
      service = new TelegramBotService();
    });

    it('should return true for admin with all permissions', async () => {
      const mockGetMe = (service as any).bot.telegram.getMe;
      const mockGetChatMember = (service as any).bot.telegram.getChatMember;

      mockGetMe.mockResolvedValueOnce({ id: 123456789 });
      mockGetChatMember.mockResolvedValueOnce({
        status: 'administrator',
        can_invite_users: true,
        can_restrict_members: true,
      });

      const result = await service.verifyAdminPermissions('@testchannel');

      expect(result).toEqual({
        isAdmin: true,
        canInviteUsers: true,
        canRemoveUsers: true,
        channelExists: true,
      });
    });

    it('should return true for creator with all permissions', async () => {
      const mockGetMe = (service as any).bot.telegram.getMe;
      const mockGetChatMember = (service as any).bot.telegram.getChatMember;

      mockGetMe.mockResolvedValueOnce({ id: 123456789 });
      mockGetChatMember.mockResolvedValueOnce({
        status: 'creator',
      });

      const result = await service.verifyAdminPermissions('@testchannel');

      expect(result).toEqual({
        isAdmin: true,
        canInviteUsers: true,
        canRemoveUsers: true,
        channelExists: true,
      });
    });

    it('should return false for non-admin member', async () => {
      const mockGetMe = (service as any).bot.telegram.getMe;
      const mockGetChatMember = (service as any).bot.telegram.getChatMember;

      mockGetMe.mockResolvedValueOnce({ id: 123456789 });
      mockGetChatMember.mockResolvedValueOnce({
        status: 'member',
      });

      const result = await service.verifyAdminPermissions('@testchannel');

      expect(result).toEqual({
        isAdmin: false,
        canInviteUsers: false,
        canRemoveUsers: false,
        channelExists: true,
      });
    });

    it('should return false for non-existent channel', async () => {
      const mockGetMe = (service as any).bot.telegram.getMe;
      const mockGetChatMember = (service as any).bot.telegram.getChatMember;

      mockGetMe.mockResolvedValueOnce({ id: 123456789 });
      mockGetChatMember.mockRejectedValueOnce({
        response: {
          error_code: 400,
          description: 'chat not found',
        },
      });

      const result = await service.verifyAdminPermissions('@nonexistent');

      expect(result).toEqual({
        isAdmin: false,
        canInviteUsers: false,
        canRemoveUsers: false,
        channelExists: false,
      });
    });
  });

  describe('inviteUserToChannel', () => {
    beforeEach(() => {
      service = new TelegramBotService();
    });

    it('should successfully invite user to channel', async () => {
      const mockUnbanChatMember = (service as any).bot.telegram.unbanChatMember;
      const mockCreateChatInviteLink = (service as any).bot.telegram.createChatInviteLink;

      mockUnbanChatMember.mockResolvedValueOnce(true);
      mockCreateChatInviteLink.mockResolvedValueOnce({
        invite_link: 'https://t.me/+abc123',
      });

      const result = await service.inviteUserToChannel(987654321, '@testchannel');

      expect(result).toEqual({
        success: true,
        retryable: false,
      });
      expect(mockUnbanChatMember).toHaveBeenCalledWith('@testchannel', 987654321);
    });

    it('should return error for permission denied', async () => {
      const mockUnbanChatMember = (service as any).bot.telegram.unbanChatMember;

      mockUnbanChatMember.mockRejectedValueOnce({
        response: {
          error_code: 403,
          description: 'not enough rights',
        },
      });

      const result = await service.inviteUserToChannel(987654321, '@testchannel');

      expect(result).toEqual({
        success: false,
        error: 'Bot lacks permissions to invite users',
        retryable: false,
      });
    });

    it('should return error for user not found', async () => {
      const mockUnbanChatMember = (service as any).bot.telegram.unbanChatMember;

      mockUnbanChatMember.mockRejectedValueOnce({
        response: {
          error_code: 400,
          description: 'USER_NOT_FOUND',
        },
      });

      const result = await service.inviteUserToChannel(987654321, '@testchannel');

      expect(result).toEqual({
        success: false,
        error: 'Telegram user not found',
        retryable: false,
      });
    });

    it('should retry on rate limit and succeed', async () => {
      const mockUnbanChatMember = (service as any).bot.telegram.unbanChatMember;
      const mockCreateChatInviteLink = (service as any).bot.telegram.createChatInviteLink;

      // First call fails with rate limit
      mockUnbanChatMember.mockRejectedValueOnce({
        response: {
          error_code: 429,
          parameters: { retry_after: 1 },
        },
      });

      // Second call succeeds
      mockUnbanChatMember.mockResolvedValueOnce(true);
      mockCreateChatInviteLink.mockResolvedValueOnce({
        invite_link: 'https://t.me/+abc123',
      });

      const result = await service.inviteUserToChannel(987654321, '@testchannel', 2);

      expect(result.success).toBe(true);
      expect(mockUnbanChatMember).toHaveBeenCalledTimes(2);
    });

    it('should return error after max retries on rate limit', async () => {
      const mockUnbanChatMember = (service as any).bot.telegram.unbanChatMember;

      mockUnbanChatMember.mockRejectedValue({
        response: {
          error_code: 429,
          parameters: { retry_after: 1 },
        },
      });

      const result = await service.inviteUserToChannel(987654321, '@testchannel', 2);

      expect(result).toEqual({
        success: false,
        error: 'Rate limit exceeded',
        retryable: true,
      });
      expect(mockUnbanChatMember).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeUserFromChannel', () => {
    beforeEach(() => {
      service = new TelegramBotService();
    });

    it('should successfully remove user from channel', async () => {
      const mockBanChatMember = (service as any).bot.telegram.banChatMember;
      const mockUnbanChatMember = (service as any).bot.telegram.unbanChatMember;

      mockBanChatMember.mockResolvedValueOnce(true);
      mockUnbanChatMember.mockResolvedValueOnce(true);

      const result = await service.removeUserFromChannel(987654321, '@testchannel');

      expect(result).toEqual({
        success: true,
        retryable: false,
      });
      expect(mockBanChatMember).toHaveBeenCalledWith('@testchannel', 987654321);
      expect(mockUnbanChatMember).toHaveBeenCalledWith('@testchannel', 987654321);
    });

    it('should return error for permission denied', async () => {
      const mockBanChatMember = (service as any).bot.telegram.banChatMember;

      mockBanChatMember.mockRejectedValueOnce({
        response: {
          error_code: 403,
          description: 'not enough rights',
        },
      });

      const result = await service.removeUserFromChannel(987654321, '@testchannel');

      expect(result).toEqual({
        success: false,
        error: 'Bot lacks permissions to remove users',
        retryable: false,
      });
    });

    it('should consider success if user not in channel', async () => {
      const mockBanChatMember = (service as any).bot.telegram.banChatMember;

      mockBanChatMember.mockRejectedValueOnce({
        response: {
          error_code: 400,
          description: 'USER_NOT_PARTICIPANT',
        },
      });

      const result = await service.removeUserFromChannel(987654321, '@testchannel');

      expect(result).toEqual({
        success: true,
        retryable: false,
      });
    });

    it('should retry on rate limit and succeed', async () => {
      const mockBanChatMember = (service as any).bot.telegram.banChatMember;
      const mockUnbanChatMember = (service as any).bot.telegram.unbanChatMember;

      // First call fails with rate limit
      mockBanChatMember.mockRejectedValueOnce({
        response: {
          error_code: 429,
          parameters: { retry_after: 1 },
        },
      });

      // Second call succeeds
      mockBanChatMember.mockResolvedValueOnce(true);
      mockUnbanChatMember.mockResolvedValueOnce(true);

      const result = await service.removeUserFromChannel(987654321, '@testchannel', 2);

      expect(result.success).toBe(true);
      expect(mockBanChatMember).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop', () => {
    beforeEach(() => {
      service = new TelegramBotService();
    });

    it('should stop the bot successfully', async () => {
      const mockStop = (service as any).bot.stop;
      mockStop.mockResolvedValueOnce(undefined);

      await service.stop();

      expect(mockStop).toHaveBeenCalled();
    });

    it('should throw error if stop fails', async () => {
      const mockStop = (service as any).bot.stop;
      mockStop.mockRejectedValueOnce(new Error('Stop error'));

      await expect(service.stop()).rejects.toThrow('Stop error');
    });
  });

  describe('getWebhookPath', () => {
    it('should return webhook path', () => {
      service = new TelegramBotService();
      expect(service.getWebhookPath()).toBe('/api/telegram/webhook');
    });
  });
});
