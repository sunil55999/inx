# Payment Processing Service

## Overview

The Payment Processing Service consumes blockchain transaction events from SQS and processes payments for orders. It verifies payment amounts, tracks confirmations, and updates order status accordingly.

## Features

- **SQS Event Consumption**: Polls SQS queue for transaction events from blockchain monitor
- **Payment Verification**: Validates payment amount within ±0.1% tolerance
- **Confirmation Tracking**: Monitors blockchain confirmations and updates order status
- **Partial Payment Support**: Tracks multiple transactions for a single order
- **Multi-Currency Support**: Handles BNB, USDT (BEP-20), USDC (BEP-20), Bitcoin, and USDT (TRC-20)
- **Automatic Status Updates**: Transitions orders from pending → detected → confirmed

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Blockchain Monitor Service                  │
│         (Detects transactions on blockchain networks)        │
└────────────────────────┬────────────────────────────────────┘
                         │ Publishes TransactionEvent
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                      SQS Transaction Queue                   │
│              (Buffers transaction events)                    │
└────────────────────────┬────────────────────────────────────┘
                         │ Polls for messages
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              Payment Processing Service                      │
│  • Verifies payment amount (±0.1% tolerance)                 │
│  • Checks destination address match                          │
│  • Tracks confirmation progress                              │
│  • Updates order status                                      │
│  • Handles partial payments                                  │
└────────────────────────┬────────────────────────────────────┘
                         │ Updates
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                     │
│              (Orders, Transactions tables)                   │
└─────────────────────────────────────────────────────────────┘
```

## Transaction Event Flow

### 1. Transaction Detected Event

When a transaction is first detected on the blockchain (0+ confirmations):

```typescript
{
  type: 'TRANSACTION_DETECTED',
  orderId: 'order_123',
  transaction: {
    hash: '0x...',
    from: '0xsender...',
    to: '0xdeposit...',
    amount: 100.0,
    currency: 'USDT_BEP20',
    confirmations: 0,
    timestamp: '2024-01-15T10:00:00Z'
  }
}
```

**Processing Steps:**
1. Retrieve order from database
2. Verify destination address matches order deposit address
3. Verify amount is within ±0.1% tolerance
4. Store transaction record
5. Update order status to `payment_detected`

### 2. Transaction Confirmed Event

When a transaction reaches required confirmations:

```typescript
{
  type: 'TRANSACTION_CONFIRMED',
  orderId: 'order_123',
  transaction: {
    hash: '0x...',
    from: '0xsender...',
    to: '0xdeposit...',
    amount: 100.0,
    currency: 'USDT_BEP20',
    confirmations: 12,
    timestamp: '2024-01-15T10:05:00Z'
  }
}
```

**Processing Steps:**
1. Retrieve order from database
2. Verify payment (amount, address, confirmations)
3. Update transaction confirmations
4. Update order status to `payment_confirmed`
5. Set `paidAt` timestamp
6. Trigger subscription activation (handled by Order Service)

## Payment Verification

### Amount Tolerance Check

Payments are accepted if the amount is within **±0.1%** of the expected amount:

```typescript
const tolerance = 0.001; // 0.1%
const difference = Math.abs(actualAmount - expectedAmount) / expectedAmount;
const amountMatch = difference <= tolerance;
```

**Examples:**
- Order amount: 100.0 USDT
- Accepted: 99.9 - 100.1 USDT
- Rejected: < 99.9 or > 100.1 USDT

### Confirmation Requirements

Different cryptocurrencies require different confirmation counts:

| Currency | Required Confirmations |
|----------|----------------------|
| BNB | 12 |
| USDT (BEP-20) | 12 |
| USDC (BEP-20) | 12 |
| Bitcoin | 3 |
| USDT (TRC-20) | 19 |

## Partial Payment Handling

The service supports multiple transactions for a single order:

```typescript
// Order amount: 100 USDT
// Transaction 1: 50 USDT → Tracked, order remains pending
// Transaction 2: 50 USDT → Total = 100 USDT, order updated to payment_detected
```

**Features:**
- Tracks all transactions for an order
- Sums total received amount
- Updates order when full amount received (within tolerance)
- Stores each transaction separately for audit trail

## Order Status Transitions

```
pending_payment
    ↓ (transaction detected, 0+ confirmations)
payment_detected
    ↓ (sufficient confirmations reached)
payment_confirmed
    ↓ (subscription created)
subscription_active
```

## Usage

### Starting the Service

```typescript
import { paymentProcessingService } from './services/PaymentProcessingService';

// Start consuming transaction events
await paymentProcessingService.start();

// Service will poll SQS queue every 5 seconds
// and process up to 10 messages per poll
```

### Stopping the Service

```typescript
// Graceful shutdown
await paymentProcessingService.stop();
```

### Manual Payment Processing

For testing or manual intervention:

```typescript
await paymentProcessingService.processPayment(
  'order_123',
  '0xtxhash...',
  100.0,
  12
);
```

### Handling Partial Payments

```typescript
await paymentProcessingService.handlePartialPayment(
  'order_123',
  '0xtxhash1...',
  50.0
);
```

## Configuration

### Environment Variables

```bash
# SQS Queue URL for transaction events
TRANSACTION_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/transactions

# Database connection
DATABASE_URL=postgresql://user:pass@localhost:5432/marketplace

# AWS Region
AWS_REGION=us-east-1
```

### Service Parameters

```typescript
class PaymentProcessingService {
  private readonly POLL_INTERVAL_MS = 5000;      // Poll every 5 seconds
  private readonly MAX_MESSAGES = 10;            // Process up to 10 messages per poll
  private readonly VISIBILITY_TIMEOUT = 30;      // 30 seconds to process message
}
```

## Database Schema

### Orders Table

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  buyer_id UUID NOT NULL,
  listing_id UUID NOT NULL,
  deposit_address VARCHAR(255) NOT NULL,
  amount DECIMAL(20, 8) NOT NULL,
  currency VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL,
  transaction_hash VARCHAR(255),
  confirmations INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  paid_at TIMESTAMP
);
```

### Transactions Table

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  transaction_hash VARCHAR(255) UNIQUE NOT NULL,
  from_address VARCHAR(255) NOT NULL,
  to_address VARCHAR(255) NOT NULL,
  amount DECIMAL(20, 8) NOT NULL,
  currency VARCHAR(20) NOT NULL,
  confirmations INTEGER DEFAULT 0,
  block_number BIGINT,
  detected_at TIMESTAMP NOT NULL,
  confirmed_at TIMESTAMP
);
```

## Error Handling

### Message Processing Errors

If message processing fails:
1. Error is logged with full context
2. Message remains in queue (visibility timeout expires)
3. SQS will retry delivery (up to maxReceiveCount)
4. Failed messages move to Dead Letter Queue (DLQ)

### Payment Verification Failures

- **Address Mismatch**: Transaction ignored, logged as error
- **Amount Mismatch**: Transaction stored but flagged for review
- **Order Not Found**: Transaction ignored, logged as error
- **Already Processed**: Transaction skipped, logged as info

## Monitoring

### Key Metrics

- **Messages Processed**: Count of transaction events processed
- **Payment Verifications**: Success/failure rate of payment verification
- **Order Status Updates**: Count of orders transitioned to each status
- **Processing Latency**: Time from transaction detection to order update
- **Error Rate**: Failed message processing attempts

### Logging

All operations are logged with structured data:

```typescript
logger.info('Processing transaction event', {
  messageId: 'msg_123',
  eventType: 'TRANSACTION_CONFIRMED',
  orderId: 'order_123',
  txHash: '0x...'
});
```

## Testing

### Unit Tests

Run the test suite:

```bash
npm test -- PaymentProcessingService.test.ts
```

**Test Coverage:**
- Payment verification with exact amounts
- Payment verification within tolerance
- Payment rejection outside tolerance
- Address matching (case-insensitive)
- Confirmation requirements per currency
- Partial payment tracking
- Order status transitions
- Edge cases (zero amounts, very small/large amounts)

### Integration Testing

Test with actual SQS queue:

```typescript
// 1. Start service
await paymentProcessingService.start();

// 2. Publish test transaction event to SQS
await publishTransactionEvent({
  type: 'TRANSACTION_DETECTED',
  orderId: 'test_order',
  transaction: { /* ... */ }
});

// 3. Verify order status updated
const order = await getOrder('test_order');
expect(order.status).toBe(OrderStatus.PAYMENT_DETECTED);
```

## Requirements Validation

This service validates the following requirements:

- **Requirement 3.3** (5.4): Payment amount verification with ±0.1% tolerance
- **Requirement 3.5** (5.5, 6.5): Confirmation tracking and order status updates
- **Requirement 3.7**: Partial payment handling

## Future Enhancements

1. **Webhook Notifications**: Send webhooks when payment confirmed
2. **Refund Detection**: Monitor for refund transactions
3. **Multi-Signature Support**: Handle multi-sig wallet payments
4. **Gas Fee Tracking**: Track and report gas fees paid
5. **Exchange Rate Conversion**: Convert amounts to USD for reporting
6. **Payment Analytics**: Track payment patterns and statistics

## Related Services

- **BlockchainMonitorService**: Detects transactions and publishes events
- **HDWalletService**: Generates unique deposit addresses
- **OrderService**: Creates orders and manages lifecycle
- **SubscriptionService**: Activates subscriptions when payment confirmed

## Support

For issues or questions:
- Check logs for error messages
- Verify SQS queue configuration
- Ensure database connectivity
- Review transaction events in SQS console
