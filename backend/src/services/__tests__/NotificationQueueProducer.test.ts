/**
 * Notification Queue Producer Tests
 * 
 * Tests notification queueing to SQS
 */

import { NotificationQueueProducer } from '../NotificationQueueProducer';
import { NotificationEvent } from '../NotificationService';
import { sqsClient } from '../../config/sqs';
import { SendMessageCommand } from '@aws-sdk/client-sqs';

// Mock SQS client
jest.mock('../../config/sqs', () => ({
  sqsClient: {
    send: jest.fn(),
  },
}));

describe('NotificationQueueProducer', () => {
  let producer: NotificationQueueProducer;
  const mockQueueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/notifications';

  beforeEach(() => {
    jest.clearAllMocks();
    producer = new NotificationQueueProducer(mockQueueUrl);
  });

  describe('queueNotification', () => {
    it('should queue notification successfully', async () => {
      const mockMessageId = 'msg_123';
      (sqsClient.send as jest.Mock).mockResolvedValue({
        MessageId: mockMessageId,
      });

      const result = await producer.queueNotification(
        'notif_123',
        'user_456',
        'user@example.com',
        NotificationEvent.ORDER_PAYMENT_CONFIRMED,
        'Payment Confirmed',
        'Your payment has been confirmed',
        { orderId: 'order_789' }
      );

      expect(result).toBe(true);
      expect(sqsClient.send).toHaveBeenCalledTimes(1);

      const command = (sqsClient.send as jest.Mock).mock.calls[0][0];
      expect(command).toBeInstanceOf(SendMessageCommand);
      expect(command.input.QueueUrl).toBe(mockQueueUrl);

      const messageBody = JSON.parse(command.input.MessageBody);
      expect(messageBody.notificationId).toBe('notif_123');
      expect(messageBody.userId).toBe('user_456');
      expect(messageBody.userEmail).toBe('user@example.com');
      expect(messageBody.event).toBe(NotificationEvent.ORDER_PAYMENT_CONFIRMED);
      expect(messageBody.title).toBe('Payment Confirmed');
      expect(messageBody.message).toBe('Your payment has been confirmed');
      expect(messageBody.metadata).toEqual({ orderId: 'order_789' });
      expect(messageBody.attemptCount).toBe(0);
      expect(messageBody.maxRetries).toBe(3);
      expect(messageBody.createdAt).toBeDefined();
    });

    it('should include message attributes', async () => {
      (sqsClient.send as jest.Mock).mockResolvedValue({
        MessageId: 'msg_456',
      });

      await producer.queueNotification(
        'notif_789',
        'user_abc',
        'test@example.com',
        NotificationEvent.SUBSCRIPTION_ACTIVATED,
        'Subscription Activated',
        'Your subscription is active',
        {}
      );

      const command = (sqsClient.send as jest.Mock).mock.calls[0][0];
      const attributes = command.input.MessageAttributes;

      expect(attributes.NotificationId.StringValue).toBe('notif_789');
      expect(attributes.UserId.StringValue).toBe('user_abc');
      expect(attributes.Event.StringValue).toBe(NotificationEvent.SUBSCRIPTION_ACTIVATED);
    });

    it('should handle queueing failure', async () => {
      (sqsClient.send as jest.Mock).mockRejectedValue(
        new Error('SQS error')
      );

      const result = await producer.queueNotification(
        'notif_fail',
        'user_fail',
        'fail@example.com',
        NotificationEvent.ORDER_PAYMENT_DETECTED,
        'Test',
        'Test message',
        {}
      );

      expect(result).toBe(false);
    });

    it('should return false if queue URL not configured', async () => {
      const producerWithoutUrl = new NotificationQueueProducer('');

      const result = await producerWithoutUrl.queueNotification(
        'notif_123',
        'user_456',
        'user@example.com',
        NotificationEvent.ORDER_PAYMENT_CONFIRMED,
        'Test',
        'Test message',
        {}
      );

      expect(result).toBe(false);
      expect(sqsClient.send).not.toHaveBeenCalled();
    });

    it('should handle metadata with various types', async () => {
      (sqsClient.send as jest.Mock).mockResolvedValue({
        MessageId: 'msg_metadata',
      });

      const metadata = {
        orderId: 'order_123',
        amount: 50.5,
        currency: 'USDT',
        confirmed: true,
        items: ['item1', 'item2'],
        nested: { key: 'value' },
      };

      await producer.queueNotification(
        'notif_metadata',
        'user_metadata',
        'metadata@example.com',
        NotificationEvent.ORDER_PAYMENT_CONFIRMED,
        'Test',
        'Test message',
        metadata
      );

      const command = (sqsClient.send as jest.Mock).mock.calls[0][0];
      const messageBody = JSON.parse(command.input.MessageBody);

      expect(messageBody.metadata).toEqual(metadata);
    });

    it('should handle notification without metadata', async () => {
      (sqsClient.send as jest.Mock).mockResolvedValue({
        MessageId: 'msg_no_metadata',
      });

      await producer.queueNotification(
        'notif_no_meta',
        'user_no_meta',
        'nometa@example.com',
        NotificationEvent.SUBSCRIPTION_EXPIRED,
        'Subscription Expired',
        'Your subscription has expired'
      );

      const command = (sqsClient.send as jest.Mock).mock.calls[0][0];
      const messageBody = JSON.parse(command.input.MessageBody);

      expect(messageBody.metadata).toBeUndefined();
    });
  });
});
