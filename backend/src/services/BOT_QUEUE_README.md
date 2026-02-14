# Bot Operation Queue System

## Overview

The Bot Operation Queue System provides reliable, asynchronous processing of Telegram bot operations using AWS SQS. This system ensures that bot operations (invite, remove, verify permissions) are processed reliably with automatic retry logic and dead letter queue handling.

## Architecture

```
┌─────────────────────┐
│   Application       │
│   (API/Services)    │
└──────────┬──────────┘
           │
           │ Enqueue Operation
           ▼
┌─────────────────────┐
│  BotQueueProducer   │
│  - Enqueue invite   │
│  - Enqueue remove   │
│  - Enqueue verify   │
└──────────┬──────────┘
           │
           │ Send Message
           ▼
┌─────────────────────┐
│   SQS Queue         │
│   (FIFO Queue)      │
│   - Deduplication   │
│   - Ordering        │
└──────────┬──────────┘
           │
           │ Poll Messages
           ▼
┌─────────────────────┐
│  BotQueueConsumer   │
│  - Process ops      │
│  - Retry logic      │
│  - Error handling   │
└──────────┬──────────┘
           │
           │ On Max Retries
           ▼
┌─────────────────────┐
│   Dead Letter       │
│   Queue (DLQ)       │
│   - Failed ops      │
│   - Manual review   │
└─────────────────────┘
```

## Components

### 1. BotQueueProducer

**Purpose**: Enqueue bot operations to SQS for asynchronous processing.

**Features**:
- Enqueue invite user operations
- Enqueue remove user operations
- Enqueue permission verification operations
- Message deduplication
- Error handling and logging

**Usage**:

```typescript
import { botQueueProducer } from './services/BotQueueProducer';

// Enqueue invite user operation
await botQueueProducer.enqueueInviteUser(
  userId,
  channelId,
  subscriptionId,
  orderId,
  maxRetries // optional, default: 3
);

// Enqueue remove user operation
await botQueueProducer.enqueueRemoveUser(
  userId,
  channelId,
  subscriptionId,
  'expiry', // reason: 'expiry' | 'refund' | 'cancellation'
  maxRetries // optional, default: 3
);

// Enqueue verify permissions operation
await botQueueProducer.enqueueVerifyPermissions(
  channelId,
  listingId, // optional
  maxRetries // optional, default: 3
);
```

### 2. BotQueueConsumer

**Purpose**: Consume and process bot operations from SQS.

**Features**:
- Long polling for efficient message retrieval
- Parallel message processing (up to 10 messages at a time)
- Exponential backoff retry logic
- Dead letter queue for failed operations
- Graceful shutdown

**Retry Logic**:
- 1st retry: 1 second delay
- 2nd retry: 2 seconds delay
- 3rd retry: 4 seconds delay
- 4th retry: 8 seconds delay
- Max delay: 15 minutes

**Usage**:

```typescript
import { TelegramBotService } from './services/TelegramBotService';
import { BotQueueConsumer } from './services/BotQueueConsumer';

// Initialize bot service
const botService = new TelegramBotService();

// Initialize consumer
const consumer = new BotQueueConsumer(botService);

// Start consuming
await consumer.start();

// Stop consuming (graceful shutdown)
await consumer.stop();
```

### 3. Bot Queue Worker

**Purpose**: Standalone worker process for consuming bot operations.

**Usage**:

```bash
# Development mode with auto-reload
npm run worker:bot-queue:dev

# Production mode
npm run worker:bot-queue

# Or directly with ts-node
ts-node src/workers/botQueueWorker.ts
```

**Environment Variables**:
- `BOT_OPERATIONS_QUEUE_URL` - SQS queue URL for bot operations
- `BOT_OPERATIONS_DLQ_URL` - SQS dead letter queue URL
- `TELEGRAM_BOT_TOKEN` - Telegram bot API token
- `AWS_REGION` - AWS region (default: us-east-1)

## Operation Types

### 1. Invite User Operation

Invites a user to a Telegram channel when a subscription is activated.

```typescript
interface InviteUserOperation {
  operationType: 'INVITE_USER';
  userId: number;
  channelId: string;
  subscriptionId: string;
  orderId: string;
  timestamp: string;
  attemptCount: number;
  maxRetries: number;
}
```

### 2. Remove User Operation

Removes a user from a Telegram channel when a subscription expires, is refunded, or cancelled.

```typescript
interface RemoveUserOperation {
  operationType: 'REMOVE_USER';
  userId: number;
  channelId: string;
  subscriptionId: string;
  reason: 'expiry' | 'refund' | 'cancellation';
  timestamp: string;
  attemptCount: number;
  maxRetries: number;
}
```

### 3. Verify Permissions Operation

Verifies that the bot has admin permissions in a channel.

```typescript
interface VerifyPermissionsOperation {
  operationType: 'VERIFY_PERMISSIONS';
  channelId: string;
  listingId?: string;
  timestamp: string;
  attemptCount: number;
  maxRetries: number;
}
```

## Error Handling

### Retryable Errors

Operations that fail with retryable errors are automatically retried with exponential backoff:

- Rate limit errors (429)
- Network errors
- Temporary Telegram API errors
- Timeout errors

### Non-Retryable Errors

Operations that fail with non-retryable errors are immediately deleted from the queue:

- Permission errors (bot lacks admin rights)
- User not found
- Channel not found
- Invalid operation type

### Dead Letter Queue

Operations that exceed the maximum retry count are moved to the dead letter queue for manual review:

- Max retries exceeded
- Persistent rate limiting
- Unresolved errors

## SQS Queue Configuration

### Main Queue (FIFO)

```yaml
Queue Name: bot-operations.fifo
Queue Type: FIFO
Message Retention: 4 days
Visibility Timeout: 30 seconds
Receive Message Wait Time: 20 seconds (long polling)
Content-Based Deduplication: Enabled
```

### Dead Letter Queue (FIFO)

```yaml
Queue Name: bot-operations-dlq.fifo
Queue Type: FIFO
Message Retention: 14 days
Max Receive Count: 1
```

### Redrive Policy

```json
{
  "deadLetterTargetArn": "arn:aws:sqs:region:account:bot-operations-dlq.fifo",
  "maxReceiveCount": 3
}
```

## Local Development

### Using LocalStack

For local development, you can use LocalStack to simulate AWS SQS:

1. **Install LocalStack**:

```bash
pip install localstack
```

2. **Start LocalStack**:

```bash
localstack start
```

3. **Create Queues**:

```bash
# Create main queue
aws --endpoint-url=http://localhost:4566 sqs create-queue \
  --queue-name bot-operations.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=true

# Create dead letter queue
aws --endpoint-url=http://localhost:4566 sqs create-queue \
  --queue-name bot-operations-dlq.fifo \
  --attributes FifoQueue=true
```

4. **Configure Environment**:

```bash
USE_LOCALSTACK=true
SQS_ENDPOINT=http://localhost:4566
BOT_OPERATIONS_QUEUE_URL=http://localhost:4566/000000000000/bot-operations.fifo
BOT_OPERATIONS_DLQ_URL=http://localhost:4566/000000000000/bot-operations-dlq.fifo
```

## Monitoring

### Metrics to Monitor

1. **Queue Depth**: Number of messages in the queue
2. **Age of Oldest Message**: How long the oldest message has been in the queue
3. **Number of Messages Sent**: Rate of messages being enqueued
4. **Number of Messages Received**: Rate of messages being processed
5. **Number of Messages Deleted**: Rate of successful operations
6. **DLQ Depth**: Number of messages in the dead letter queue

### CloudWatch Alarms

Set up CloudWatch alarms for:

- Queue depth > 1000 (backlog building up)
- Age of oldest message > 5 minutes (processing delays)
- DLQ depth > 0 (failed operations requiring attention)

### Logging

All operations are logged with structured logging:

```typescript
logger.info('Bot operation enqueued', {
  operationType: 'INVITE_USER',
  messageId: 'abc123',
  subscriptionId: 'sub-456',
});

logger.error('Bot operation failed', {
  operationType: 'REMOVE_USER',
  error: 'Rate limit exceeded',
  attemptCount: 3,
});
```

## Production Deployment

### AWS Infrastructure

1. **Create SQS Queues**:

```bash
# Create main queue
aws sqs create-queue \
  --queue-name bot-operations.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=true,MessageRetentionPeriod=345600

# Create dead letter queue
aws sqs create-queue \
  --queue-name bot-operations-dlq.fifo \
  --attributes FifoQueue=true,MessageRetentionPeriod=1209600

# Set redrive policy
aws sqs set-queue-attributes \
  --queue-url <main-queue-url> \
  --attributes RedrivePolicy='{"deadLetterTargetArn":"<dlq-arn>","maxReceiveCount":"3"}'
```

2. **IAM Permissions**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:ChangeMessageVisibility",
        "sqs:GetQueueAttributes"
      ],
      "Resource": [
        "arn:aws:sqs:region:account:bot-operations.fifo",
        "arn:aws:sqs:region:account:bot-operations-dlq.fifo"
      ]
    }
  ]
}
```

3. **Deploy Worker**:

Deploy the worker as:
- ECS Fargate task
- EC2 instance with systemd service
- Lambda function (for low-volume scenarios)

### Scaling

- **Horizontal Scaling**: Run multiple worker instances
- **Vertical Scaling**: Increase `maxMessages` parameter
- **Auto Scaling**: Scale based on queue depth metric

## Testing

### Unit Tests

Test individual components:

```typescript
describe('BotQueueProducer', () => {
  it('should enqueue invite user operation', async () => {
    const messageId = await botQueueProducer.enqueueInviteUser(
      123456,
      '@testchannel',
      'sub-123',
      'order-456'
    );
    
    expect(messageId).toBeDefined();
  });
});
```

### Integration Tests

Test end-to-end flow:

```typescript
describe('Bot Queue Integration', () => {
  it('should process invite operation successfully', async () => {
    // Enqueue operation
    await botQueueProducer.enqueueInviteUser(...);
    
    // Wait for processing
    await sleep(5000);
    
    // Verify user was invited
    // ...
  });
});
```

## Troubleshooting

### Queue Backlog

**Symptom**: Messages accumulating in the queue

**Solutions**:
- Scale up worker instances
- Check worker logs for errors
- Verify Telegram API is responsive
- Check for rate limiting issues

### High DLQ Depth

**Symptom**: Many messages in dead letter queue

**Solutions**:
- Review DLQ messages for common errors
- Check bot permissions in channels
- Verify Telegram user IDs are valid
- Consider increasing max retries

### Worker Not Processing

**Symptom**: Worker running but not processing messages

**Solutions**:
- Verify queue URL is correct
- Check IAM permissions
- Verify AWS credentials
- Check network connectivity to SQS

## Best Practices

1. **Always use the queue for bot operations** - Don't call bot service directly from API endpoints
2. **Monitor DLQ regularly** - Set up alerts for DLQ depth > 0
3. **Use appropriate retry limits** - Balance between reliability and cost
4. **Log all operations** - Include context for debugging
5. **Test with LocalStack** - Validate queue behavior before deploying
6. **Scale workers based on load** - Monitor queue depth and adjust
7. **Handle graceful shutdown** - Ensure workers finish processing before stopping

## Requirements

This implementation satisfies:

- **Requirement 2.6**: Bot operation queue with retry logic
- **Requirement 3.6**: Exponential backoff for rate limits
- **Requirement 4.5**: Retry logic for failed tasks

## Related Documentation

- [TelegramBotService README](./TELEGRAM_BOT_README.md)
- [AWS SQS Documentation](https://docs.aws.amazon.com/sqs/)
- [Telegraf Documentation](https://telegraf.js.org/)
