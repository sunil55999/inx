import { BotQueueProducer } from '../BotQueueProducer';
import { sqsClient } from '../../config/sqs';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { BotOperationType } from '../../types/botQueue';

// Mock SQS client
jest.mock('../../config/sqs', () => ({
  sqsClient: {
    send: jest.fn(),
  },
  BOT_OPERATIONS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123456789/bot-operations.fifo',
  BOT_OPERATIONS_DLQ_URL: 'https://sqs.us-east-1.amazonaws.com/123456789/bot-operations-dlq.fifo',
}));

describe('BotQueueProducer', () => {
  let producer: BotQueueProducer;
  const mockSend = sqsClient.send as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    producer = new BotQueueProducer('https://sqs.us-east-1.amazonaws.com/123456789/bot-operations.fifo');
  });

  describe('enqueueInviteUser', () => {
    it('should enqueue invite user operation successfully', async () => {
      const mockMessageId = 'msg-123';
      mockSend.mockResolvedValueOnce({
        MessageId: mockMessageId,
        $metadata: {},
      });

      const messageId = await producer.enqueueInviteUser(
        123456,
        '@testchannel',
        'sub-123',
        'order-456',
        3
      );

      expect(messageId).toBe(mockMessageId);
      expect(mockSend).toHaveBeenCalledTimes(1);
      
      const command = mockSend.mock.calls[0][0] as SendMessageCommand;
      const input = command.input;
      
      expect(input.QueueUrl).toBe('https://sqs.us-east-1.amazonaws.com/123456789/bot-operations.fifo');
      expect(input.MessageGroupId).toBe(BotOperationType.INVITE_USER);
      
      const body = JSON.parse(input.MessageBody!);
      expect(body.operationType).toBe(BotOperationType.INVITE_USER);
      expect(body.userId).toBe(123456);
      expect(body.channelId).toBe('@testchannel');
      expect(body.subscriptionId).toBe('sub-123');
      expect(body.orderId).toBe('order-456');
      expect(body.attemptCount).toBe(0);
      expect(body.maxRetries).toBe(3);
    });

    it('should use default maxRetries if not provided', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'msg-123',
        $metadata: {},
      });

      await producer.enqueueInviteUser(
        123456,
        '@testchannel',
        'sub-123',
        'order-456'
      );

      const command = mockSend.mock.calls[0][0] as SendMessageCommand;
      const body = JSON.parse(command.input.MessageBody!);
      
      expect(body.maxRetries).toBe(3);
    });

    it('should return null on error', async () => {
      mockSend.mockRejectedValueOnce(new Error('SQS error'));

      const messageId = await producer.enqueueInviteUser(
        123456,
        '@testchannel',
        'sub-123',
        'order-456'
      );

      expect(messageId).toBeNull();
    });
  });

  describe('enqueueRemoveUser', () => {
    it('should enqueue remove user operation successfully', async () => {
      const mockMessageId = 'msg-456';
      mockSend.mockResolvedValueOnce({
        MessageId: mockMessageId,
        $metadata: {},
      });

      const messageId = await producer.enqueueRemoveUser(
        123456,
        '@testchannel',
        'sub-123',
        'expiry',
        3
      );

      expect(messageId).toBe(mockMessageId);
      expect(mockSend).toHaveBeenCalledTimes(1);
      
      const command = mockSend.mock.calls[0][0] as SendMessageCommand;
      const input = command.input;
      
      expect(input.MessageGroupId).toBe(BotOperationType.REMOVE_USER);
      
      const body = JSON.parse(input.MessageBody!);
      expect(body.operationType).toBe(BotOperationType.REMOVE_USER);
      expect(body.userId).toBe(123456);
      expect(body.channelId).toBe('@testchannel');
      expect(body.subscriptionId).toBe('sub-123');
      expect(body.reason).toBe('expiry');
      expect(body.attemptCount).toBe(0);
      expect(body.maxRetries).toBe(3);
    });

    it('should handle different removal reasons', async () => {
      mockSend.mockResolvedValue({
        MessageId: 'msg-123',
        $metadata: {},
      });

      const reasons: Array<'expiry' | 'refund' | 'cancellation'> = ['expiry', 'refund', 'cancellation'];

      for (const reason of reasons) {
        await producer.enqueueRemoveUser(
          123456,
          '@testchannel',
          'sub-123',
          reason
        );

        const command = mockSend.mock.calls[mockSend.mock.calls.length - 1][0] as SendMessageCommand;
        const body = JSON.parse(command.input.MessageBody!);
        
        expect(body.reason).toBe(reason);
      }
    });
  });

  describe('enqueueVerifyPermissions', () => {
    it('should enqueue verify permissions operation successfully', async () => {
      const mockMessageId = 'msg-789';
      mockSend.mockResolvedValueOnce({
        MessageId: mockMessageId,
        $metadata: {},
      });

      const messageId = await producer.enqueueVerifyPermissions(
        '@testchannel',
        'listing-123',
        3
      );

      expect(messageId).toBe(mockMessageId);
      expect(mockSend).toHaveBeenCalledTimes(1);
      
      const command = mockSend.mock.calls[0][0] as SendMessageCommand;
      const input = command.input;
      
      expect(input.MessageGroupId).toBe(BotOperationType.VERIFY_PERMISSIONS);
      
      const body = JSON.parse(input.MessageBody!);
      expect(body.operationType).toBe(BotOperationType.VERIFY_PERMISSIONS);
      expect(body.channelId).toBe('@testchannel');
      expect(body.listingId).toBe('listing-123');
      expect(body.attemptCount).toBe(0);
      expect(body.maxRetries).toBe(3);
    });

    it('should work without listingId', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'msg-789',
        $metadata: {},
      });

      await producer.enqueueVerifyPermissions('@testchannel');

      const command = mockSend.mock.calls[0][0] as SendMessageCommand;
      const body = JSON.parse(command.input.MessageBody!);
      
      expect(body.listingId).toBeUndefined();
    });
  });

  describe('configuration', () => {
    it('should return queue URL', () => {
      expect(producer.getQueueUrl()).toBe('https://sqs.us-east-1.amazonaws.com/123456789/bot-operations.fifo');
    });

    it('should check if configured', () => {
      expect(producer.isConfigured()).toBe(true);
    });

    it('should handle missing queue URL', () => {
      const unconfiguredProducer = new BotQueueProducer('');
      
      expect(unconfiguredProducer.isConfigured()).toBe(false);
      expect(unconfiguredProducer.getQueueUrl()).toBe('');
    });
  });

  describe('message attributes', () => {
    it('should include operation type in message attributes', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'msg-123',
        $metadata: {},
      });

      await producer.enqueueInviteUser(123456, '@testchannel', 'sub-123', 'order-456');

      const command = mockSend.mock.calls[0][0] as SendMessageCommand;
      const attributes = command.input.MessageAttributes;
      
      expect(attributes?.OperationType).toBeDefined();
      expect(attributes?.OperationType.StringValue).toBe(BotOperationType.INVITE_USER);
      expect(attributes?.OperationType.DataType).toBe('String');
    });

    it('should include attempt count in message attributes', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'msg-123',
        $metadata: {},
      });

      await producer.enqueueInviteUser(123456, '@testchannel', 'sub-123', 'order-456');

      const command = mockSend.mock.calls[0][0] as SendMessageCommand;
      const attributes = command.input.MessageAttributes;
      
      expect(attributes?.AttemptCount).toBeDefined();
      expect(attributes?.AttemptCount.StringValue).toBe('0');
      expect(attributes?.AttemptCount.DataType).toBe('Number');
    });
  });

  describe('message deduplication', () => {
    it('should include deduplication ID for FIFO queue', async () => {
      mockSend.mockResolvedValueOnce({
        MessageId: 'msg-123',
        $metadata: {},
      });

      await producer.enqueueInviteUser(123456, '@testchannel', 'sub-123', 'order-456');

      const command = mockSend.mock.calls[0][0] as SendMessageCommand;
      
      expect(command.input.MessageDeduplicationId).toBeDefined();
      expect(command.input.MessageDeduplicationId).toContain('invite-sub-123');
    });
  });
});
