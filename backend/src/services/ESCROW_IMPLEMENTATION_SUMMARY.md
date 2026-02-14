# Escrow Service Implementation Summary

## Overview

The Escrow Service manages payment funds for subscription purchases, ensuring buyer protection and proper merchant payouts. It implements fund holding, release, and pro-rated refund calculations.

## Implementation Details

### Core Functions

#### 1. createEscrow(orderId, subscriptionId)
**Purpose**: Create escrow entry when subscription activates

**Process**:
1. Validates order and subscription exist
2. Checks if escrow already exists (idempotent)
3. Calculates platform fee (5% configurable via `PLATFORM_FEE_PERCENTAGE` env var)
4. Calculates merchant amount (payment - platform fee)
5. Creates escrow entry with HELD status
6. Updates merchant pending balance

**Requirements**: 4.1

**Example**:
```typescript
const result = await escrowService.createEscrow('order_123', 'sub_123');
// result = {
//   escrow: { id, orderId, subscriptionId, amount: 100, platformFee: 5, merchantAmount: 95, status: 'held' },
//   platformFee: 5,
//   merchantAmount: 95
// }
```

#### 2. releaseEscrow(subscriptionId)
**Purpose**: Release escrow funds to merchant when subscription completes

**Process**:
1. Finds escrow entry by subscription ID
2. Validates escrow is in HELD status
3. Updates escrow status to RELEASED
4. Moves funds from merchant pending to available balance

**Requirements**: 4.2

**Example**:
```typescript
const escrow = await escrowService.releaseEscrow('sub_123');
// Merchant balance updated: pending -95, available +95
```

#### 3. refundEscrow(subscriptionId)
**Purpose**: Process pro-rated refund when subscription is cancelled

**Process**:
1. Finds escrow entry by subscription ID
2. Validates escrow is in HELD status
3. Calculates pro-rated refund based on unused days
4. Updates escrow status to REFUNDED
5. Deducts merchant amount from pending balance

**Formula**: `refundAmount = paymentAmount × (unusedDays / totalDays)`

**Requirements**: 4.3, 4.4

**Example**:
```typescript
// Subscription: 30 days total, 10 days used, 20 days unused
const refund = await escrowService.refundEscrow('sub_123');
// refund = {
//   totalAmount: 100,
//   usedDays: 10,
//   unusedDays: 20,
//   totalDays: 30,
//   refundAmount: 66.67,
//   refundPercentage: 0.667
// }
```

### Platform Fee Configuration

The platform fee is configurable via environment variable:
- **Environment Variable**: `PLATFORM_FEE_PERCENTAGE`
- **Default**: `0.05` (5%)
- **Range**: 0.0 to 1.0 (0% to 100%)

**Setting the fee**:
```bash
# In .env file
PLATFORM_FEE_PERCENTAGE=0.05
```

**Updating at runtime** (admin function):
```typescript
escrowService.setPlatformFeePercentage(0.03); // 3%
```

### Pro-Rated Refund Calculation

The refund calculation uses the following logic:

1. **Calculate used days**: Days from subscription start to current date
2. **Calculate unused days**: Days from current date to expiry date
3. **Calculate refund percentage**: `unusedDays / totalDays`
4. **Calculate refund amount**: `paymentAmount × refundPercentage`

**Edge Cases**:
- **Full refund**: If refunded immediately at start (0 days used)
- **Zero refund**: If refunded at or after expiry (all days used)
- **Partial refund**: Proportional to unused time

**Examples**:
```typescript
// Example 1: Half-used subscription
// Start: Jan 1, Current: Jan 16, Expiry: Jan 31 (30 days total)
// Used: 15 days, Unused: 15 days
// Refund: 100 × (15/30) = 50

// Example 2: Barely used subscription
// Start: Jan 1, Current: Jan 2, Expiry: Jan 31 (30 days total)
// Used: 1 day, Unused: 29 days
// Refund: 100 × (29/30) = 96.67

// Example 3: Fully used subscription
// Start: Jan 1, Current: Jan 31, Expiry: Jan 31 (30 days total)
// Used: 30 days, Unused: 0 days
// Refund: 100 × (0/30) = 0
```

### Merchant Balance Updates

The escrow service coordinates with merchant balances:

1. **On Escrow Creation**:
   - Increment `pending_balance` by merchant amount
   - Funds are held in escrow, not yet available for withdrawal

2. **On Escrow Release**:
   - Move from `pending_balance` to `available_balance`
   - Merchant can now withdraw these funds

3. **On Escrow Refund**:
   - Decrement `pending_balance` by merchant amount
   - Merchant loses the pending funds due to refund

### Database Schema

**escrow_ledger table**:
```sql
CREATE TABLE escrow_ledger (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  subscription_id UUID REFERENCES subscriptions(id),
  amount DECIMAL(20, 8) NOT NULL,
  currency VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('held', 'released', 'refunded')),
  platform_fee DECIMAL(20, 8) NOT NULL DEFAULT 0,
  merchant_amount DECIMAL(20, 8),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  released_at TIMESTAMP
);
```

**Status Flow**:
```
HELD → RELEASED (on subscription completion)
HELD → REFUNDED (on refund approval)
```

## Testing

### Unit Tests

All 21 unit tests passing:

**createEscrow tests**:
- ✓ Creates escrow with correct platform fee calculation
- ✓ Returns existing escrow if already created (idempotent)
- ✓ Throws error if order not found
- ✓ Throws error if subscription not found

**releaseEscrow tests**:
- ✓ Releases escrow and moves funds to merchant available balance
- ✓ Throws error if escrow not found
- ✓ Throws error if escrow not in HELD status

**refundEscrow tests**:
- ✓ Calculates pro-rated refund and updates balances
- ✓ Returns zero refund if subscription fully used
- ✓ Returns full refund if subscription not started
- ✓ Throws error if escrow not in HELD status

**calculateProRatedRefund tests**:
- ✓ Calculates correct refund for half-used subscription
- ✓ Handles edge case of refund on last day

**Utility tests**:
- ✓ getPlatformFeePercentage returns default fee
- ✓ setPlatformFeePercentage updates fee
- ✓ setPlatformFeePercentage validates range (0-1)
- ✓ getEscrowBySubscriptionId retrieves escrow
- ✓ getEscrowByOrderId retrieves escrow
- ✓ getHeldEscrows returns all held escrows
- ✓ getTotalEscrowBalance returns total by currency
- ✓ getMerchantHeldAmount returns merchant's held amount

### Test Coverage

- **Platform fee calculation**: 5% default, configurable
- **Pro-rated refunds**: Full, partial, and zero refunds
- **Balance updates**: Pending and available balance coordination
- **Error handling**: Missing entities, invalid states
- **Edge cases**: Immediate refund, expired subscription refund

## Integration Points

### Called By
- **SubscriptionService**: Creates escrow when subscription activates
- **DisputeService**: Processes refunds when disputes are resolved
- **ScheduledJobs**: Releases escrow when subscriptions expire

### Calls
- **EscrowRepository**: Database operations for escrow entries
- **MerchantBalanceRepository**: Updates merchant balances
- **SubscriptionRepository**: Retrieves subscription details
- **OrderRepository**: Retrieves order details
- **ListingRepository**: Retrieves merchant ID from listing

## Usage Examples

### Creating Escrow on Subscription Activation

```typescript
// In SubscriptionService.createSubscriptionFromOrder()
import { escrowService } from './EscrowService';

// After subscription is created
const escrowResult = await escrowService.createEscrow(
  order.id,
  subscription.id
);

console.log(`Escrow created: ${escrowResult.escrow.id}`);
console.log(`Platform fee: ${escrowResult.platformFee}`);
console.log(`Merchant will receive: ${escrowResult.merchantAmount}`);
```

### Releasing Escrow on Subscription Completion

```typescript
// In scheduled job that processes expired subscriptions
import { escrowService } from './EscrowService';

// After subscription expires successfully
const releasedEscrow = await escrowService.releaseEscrow(subscription.id);

console.log(`Escrow released to merchant`);
console.log(`Merchant received: ${releasedEscrow.merchantAmount}`);
```

### Processing Refund

```typescript
// In DisputeService when refund is approved
import { escrowService } from './EscrowService';

// Calculate and process refund
const refundCalculation = await escrowService.refundEscrow(subscription.id);

console.log(`Refund calculation:`);
console.log(`  Total amount: ${refundCalculation.totalAmount}`);
console.log(`  Used days: ${refundCalculation.usedDays}`);
console.log(`  Unused days: ${refundCalculation.unusedDays}`);
console.log(`  Refund amount: ${refundCalculation.refundAmount}`);
console.log(`  Refund percentage: ${refundCalculation.refundPercentage * 100}%`);

// Process cryptocurrency refund to buyer
await processRefundTransaction(
  order.depositAddress,
  refundCalculation.refundAmount,
  order.currency
);
```

### Admin: Adjusting Platform Fee

```typescript
// In admin dashboard
import { escrowService } from './EscrowService';

// Get current fee
const currentFee = escrowService.getPlatformFeePercentage();
console.log(`Current platform fee: ${currentFee * 100}%`);

// Update fee to 3%
escrowService.setPlatformFeePercentage(0.03);
console.log(`Platform fee updated to 3%`);
```

## Error Handling

The service throws descriptive errors for:

1. **Missing entities**: Order, subscription, or escrow not found
2. **Invalid state**: Escrow not in HELD status for release/refund
3. **Invalid configuration**: Platform fee outside 0-1 range

All errors are logged with context for debugging.

## Logging

The service logs all operations:

- **Info**: Escrow creation, release, refund with amounts
- **Warn**: Duplicate escrow creation attempts
- **Error**: Failed operations with error details

## Next Steps

To complete the escrow integration:

1. **Update SubscriptionService**: Call `createEscrow()` after subscription creation
2. **Update Expiry Job**: Call `releaseEscrow()` when subscriptions expire
3. **Update DisputeService**: Call `refundEscrow()` when refunds are approved
4. **Add Admin API**: Expose platform fee configuration endpoint
5. **Add Monitoring**: Track escrow balances and release rates

## Files Created

- `backend/src/services/EscrowService.ts` - Main service implementation
- `backend/src/services/__tests__/EscrowService.test.ts` - Comprehensive unit tests
- `backend/src/services/ESCROW_IMPLEMENTATION_SUMMARY.md` - This document

## Requirements Satisfied

- ✓ **4.1**: Create escrow entries when subscriptions activate
- ✓ **4.2**: Release escrow funds to merchant balances on completion
- ✓ **4.3**: Process pro-rated refunds based on unused days
- ✓ **4.4**: Update merchant balances (available_balance, pending_balance)
- ✓ Platform fee calculation (5% configurable)
- ✓ Comprehensive error handling and logging
- ✓ Full test coverage (21 tests passing)
