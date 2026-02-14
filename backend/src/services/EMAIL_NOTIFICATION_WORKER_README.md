# Email Notification Worker Implementation

## Overview

The Email Notification Worker is a standalone service that consumes notification messages from AWS SQS and sends emails to users via AWS SES. This implementation provides reliable, asynchronous email delivery for all system notifications.

**Requirements Validated:** 15.1, 15.2, 15.3, 15.4, 15.5

## Architecture

```
┌─────────────────────┐
│ NotificationService │
│  (Main Application) │
└──────────┬──────────┘
           │
           │ 1. Create notification in DB
           │ 2. Queue to SQS
           ▼
┌─────────────────────────┐
│ NotificationQueueProducer│
└──────────┬──────────────┘
           │
           │ SQS Message
           ▼
┌─────────────────────────┐
│   AWS SQS Queue         │
│  (Notifications Queue)  │
└──────────┬──────────────┘
           │
           │ Long Polling
           ▼
┌─────────────────────────┐
│NotificationQueueConsumer│
│  (Worker Process)       │
└──────────┬──────────────┘
           │
           │ 1. Generate email template
           │ 2. Send via SES
           ▼
┌─────────────────────────┐
│      AWS SES            │
│   (Email Delivery)      │
└─────────────────────────┘
```

## Components

### 1. NotificationQueueProducer

**File:** `src/services/NotificationQueueProducer.ts`

**Responsibilities:**
- Queue notification messages to AWS SQS
- Add message attributes for filtering and monitoring
- Handle queueing failures gracefully

**Key Methods:**
- `queueNotification()` - Queue a notification for email delivery

### 2. NotificationQueueConsumer

**File:** `src/services/NotificationQueueConsumer.ts`

**Responsibilities:**
- Poll messages from AWS SQS using long polling
- Process notifications and send emails via AWS SES
- Implement retry logic with exponential backoff
- Move failed messages to dead letter queue

**Key Methods:**
- `start()` - Start the consumer
- `stop()` - Stop the consumer gracefully
- `processNotification()` - Process a single notification

**Features:**
- Long polling (20 seconds) for efficient message retrieval
- Parallel processing of up to 10 messages at a time
- Exponential backoff retry (1s, 2s, 4s, 8s, ...)
- Maximum 3 retry attempts before moving to DLQ
- Graceful shutdown on SIGTERM/SIGINT

### 3. EmailTemplateService

**File:** `src/services/EmailTemplateService.ts`

**Responsibilities:**
- Generate HTML and text email templates
- Provide consistent branding and styling
- Support all notification event types

**Supported Notification Types:**
1. **Order Payment Detected** - Payment received, waiting for confirmations
2. **Order Payment Confirmed** - Payment confirmed, subscription activating
3. **Subscription Activated** - Access granted to channel
4. **Subscription Expiring Soon** - Reminder to renew (24 hours before expiry)
5. **Subscription Expired** - Access revoked
6. **Subscription Renewed** - Subscription extended
7. **Dispute Created** - New dispute opened
8. **Dispute Resolved** - Dispute resolved (approved/denied)
9. **Refund Processed** - Refund sent to user
10. **Payout Completed** - Merchant payout successful
11. **Payout Failed** - Merchant payout failed
12. **Listing Deactivated** - Bot lost permissions
13. **Merchant Suspended** - Account suspended
14. **Merchant Verified** - Account verified

**Template Features:**
- Responsive HTML design
- Dark theme branding
- Call-to-action buttons
- Transaction details
- Support contact information
- Plain text fallback

### 4. Worker Process

**File:** `src/workers/notificationWorker.ts`

**Responsibilities:**
- Start the notification consumer
- Handle graceful shutdown
- Log worker status

**Usage:**
```bash
# Development
npm run worker:notifications:dev

# Production
npm run worker:notifications
```

## Configuration

### Environment Variables

```bash
# AWS SES Configuration
AWS_SES_REGION=us-east-1
EMAIL_FROM=noreply@yourdomain.com
EMAIL_SUPPORT=support@yourdomain.com

# SQS Queue URLs
AWS_SQS_NOTIFICATIONS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/notifications
AWS_SQS_NOTIFICATIONS_DLQ_URL=https://sqs.us-east-1.amazonaws.com/123456789/notifications-dlq

# Frontend URL (for email links)
FRONTEND_URL=https://yourdomain.com

# LocalStack (for local development)
USE_LOCALSTACK=true
SES_ENDPOINT=http://localhost:4566
SQS_ENDPOINT=http://localhost:4566
```

### AWS SES Setup

1. **Verify Email Addresses** (Sandbox mode):
   ```bash
   aws ses verify-email-identity --email-address noreply@yourdomain.com
   aws ses verify-email-identity --email-address support@yourdomain.com
   ```

2. **Request Production Access**:
   - Go to AWS SES Console
   - Request production access to remove sandbox restrictions
   - Provide use case details

3. **Configure DKIM** (recommended):
   - Set up DKIM for your domain
   - Improves email deliverability

### AWS SQS Setup

1. **Create Notifications Queue**:
   ```bash
   aws sqs create-queue --queue-name notifications
   ```

2. **Create Dead Letter Queue**:
   ```bash
   aws sqs create-queue --queue-name notifications-dlq
   ```

3. **Configure DLQ on Main Queue**:
   ```json
   {
     "deadLetterTargetArn": "arn:aws:sqs:us-east-1:123456789:notifications-dlq",
     "maxReceiveCount": 3
   }
   ```

## Integration with NotificationService

The `NotificationService` has been updated to automatically queue notifications for email delivery:

```typescript
// Example: Send payment confirmed notification
await notificationService.sendOrderPaymentConfirmed(
  userId,
  orderId,
  channelName
);

// This will:
// 1. Create notification record in database
// 2. Get user email from database
// 3. Queue notification to SQS for email delivery
// 4. Worker picks up message and sends email via SES
```

## Error Handling

### Retryable Errors

The following errors trigger automatic retry with exponential backoff:
- **Throttling** - AWS SES rate limit exceeded
- **TooManyRequestsException** - Too many concurrent requests
- **ServiceUnavailable** - Temporary AWS service issue
- **InternalFailure** - AWS internal error
- **Network Errors** - Connection timeout, reset

### Non-Retryable Errors

The following errors cause immediate failure (no retry):
- **Invalid Email Address** - Malformed email
- **MessageRejected** - Email rejected by SES
- **AccountSuspended** - AWS SES account suspended
- **ConfigurationSetDoesNotExist** - Invalid SES configuration

### Dead Letter Queue

Messages that fail after 3 retry attempts are moved to the DLQ for manual investigation:
- Check DLQ regularly for failed notifications
- Investigate root cause (invalid email, SES issues, etc.)
- Manually reprocess or notify users via alternative channel

## Monitoring

### CloudWatch Metrics

Monitor the following metrics:
- **SQS Queue Depth** - Number of messages waiting
- **SQS Age of Oldest Message** - Detect processing delays
- **SES Bounce Rate** - Track email deliverability
- **SES Complaint Rate** - Track spam complaints
- **Worker CPU/Memory** - Resource utilization

### Logging

All operations are logged with structured data:
```typescript
logger.info('Email sent successfully', {
  notificationId: '...',
  userId: '...',
  email: '...',
  event: 'order_payment_confirmed',
  messageId: '...'
});
```

### Alerts

Set up CloudWatch alarms for:
- Queue depth > 1000 messages
- Age of oldest message > 5 minutes
- SES bounce rate > 5%
- SES complaint rate > 0.1%
- Worker process crashes

## Testing

### Local Development with LocalStack

1. **Start LocalStack**:
   ```bash
   docker run -d -p 4566:4566 localstack/localstack
   ```

2. **Create Local Queues**:
   ```bash
   aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name notifications
   aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name notifications-dlq
   ```

3. **Configure SES (LocalStack)**:
   ```bash
   aws --endpoint-url=http://localhost:4566 ses verify-email-identity --email-address noreply@example.com
   ```

4. **Set Environment Variables**:
   ```bash
   USE_LOCALSTACK=true
   SES_ENDPOINT=http://localhost:4566
   SQS_ENDPOINT=http://localhost:4566
   ```

5. **Start Worker**:
   ```bash
   npm run worker:notifications:dev
   ```

### Unit Tests

Test individual components:
```typescript
describe('EmailTemplateService', () => {
  it('should generate payment confirmed template', () => {
    const template = emailTemplateService.generateTemplate(
      NotificationEvent.ORDER_PAYMENT_CONFIRMED,
      'Payment Confirmed',
      'Your payment has been confirmed!',
      { orderId: '123', channelName: 'Test Channel' }
    );
    
    expect(template.subject).toContain('Payment Confirmed');
    expect(template.htmlBody).toContain('Test Channel');
    expect(template.textBody).toContain('123');
  });
});
```

### Integration Tests

Test end-to-end flow:
```typescript
describe('Notification Email Flow', () => {
  it('should send email when notification is created', async () => {
    // Create notification
    await notificationService.sendOrderPaymentConfirmed(
      userId,
      orderId,
      'Test Channel'
    );
    
    // Wait for worker to process
    await sleep(2000);
    
    // Verify email was sent (check SES or mock)
    expect(mockSES.sendEmail).toHaveBeenCalled();
  });
});
```

## Deployment

### Docker

```dockerfile
# Dockerfile.notification-worker
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

CMD ["node", "dist/workers/notificationWorker.js"]
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notification-worker
spec:
  replicas: 2
  selector:
    matchLabels:
      app: notification-worker
  template:
    metadata:
      labels:
        app: notification-worker
    spec:
      containers:
      - name: worker
        image: your-registry/notification-worker:latest
        env:
        - name: AWS_REGION
          value: "us-east-1"
        - name: AWS_SQS_NOTIFICATIONS_QUEUE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: notifications-queue-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

### AWS ECS

```json
{
  "family": "notification-worker",
  "taskRoleArn": "arn:aws:iam::123456789:role/notification-worker-role",
  "containerDefinitions": [
    {
      "name": "worker",
      "image": "your-registry/notification-worker:latest",
      "memory": 512,
      "cpu": 256,
      "essential": true,
      "environment": [
        {
          "name": "AWS_REGION",
          "value": "us-east-1"
        }
      ],
      "secrets": [
        {
          "name": "AWS_SQS_NOTIFICATIONS_QUEUE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:notifications-queue-url"
        }
      ]
    }
  ]
}
```

## Scaling

### Horizontal Scaling

Run multiple worker instances for higher throughput:
- Each worker polls independently
- SQS ensures each message is processed once
- Scale based on queue depth

### Vertical Scaling

Adjust worker configuration:
```typescript
// Increase parallel processing
private maxMessages: number = 20; // Process up to 20 messages at a time

// Reduce visibility timeout for faster retries
private visibilityTimeout: number = 15; // 15 seconds
```

## Best Practices

1. **Email Deliverability**:
   - Use verified domain with DKIM
   - Monitor bounce and complaint rates
   - Implement unsubscribe mechanism
   - Avoid spam trigger words

2. **Queue Management**:
   - Monitor queue depth regularly
   - Set up DLQ for failed messages
   - Use message attributes for filtering
   - Implement idempotency for retries

3. **Error Handling**:
   - Log all errors with context
   - Distinguish retryable vs non-retryable errors
   - Alert on high failure rates
   - Investigate DLQ messages regularly

4. **Performance**:
   - Use long polling to reduce API calls
   - Process messages in parallel
   - Cache email templates if needed
   - Monitor worker resource usage

5. **Security**:
   - Use IAM roles for AWS access
   - Encrypt sensitive data in messages
   - Validate email addresses
   - Rate limit email sending

## Troubleshooting

### Worker Not Processing Messages

1. Check queue URL configuration
2. Verify IAM permissions for SQS and SES
3. Check worker logs for errors
4. Verify worker is running

### Emails Not Being Sent

1. Check SES sandbox mode restrictions
2. Verify email addresses are verified
3. Check SES sending limits
4. Review SES bounce/complaint rates
5. Check worker logs for SES errors

### High Queue Depth

1. Scale up worker instances
2. Increase parallel processing
3. Check for processing bottlenecks
4. Verify SES rate limits

### Messages in DLQ

1. Review DLQ messages for patterns
2. Check for invalid email addresses
3. Investigate SES errors
4. Fix root cause and reprocess

## Future Enhancements

1. **Email Preferences**:
   - Allow users to opt-out of specific notification types
   - Support email frequency preferences (immediate, daily digest)

2. **Template Customization**:
   - Allow merchants to customize email templates
   - Support multiple languages

3. **Analytics**:
   - Track email open rates
   - Track click-through rates
   - A/B test email templates

4. **Alternative Channels**:
   - SMS notifications via AWS SNS
   - Push notifications via Firebase
   - In-app notifications

5. **Advanced Features**:
   - Email scheduling (send at specific time)
   - Batch email sending
   - Email attachments (receipts, invoices)

## References

- [AWS SES Documentation](https://docs.aws.amazon.com/ses/)
- [AWS SQS Documentation](https://docs.aws.amazon.com/sqs/)
- [Email Best Practices](https://docs.aws.amazon.com/ses/latest/dg/best-practices.html)
- [SQS Long Polling](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html)
