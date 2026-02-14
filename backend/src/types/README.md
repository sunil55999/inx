# Data Models and Types

This directory contains all TypeScript interfaces, types, and enums for the Telegram Signals Marketplace platform.

## Overview

The type definitions in this directory provide:
- **Type Safety**: Compile-time checking for all data structures
- **Documentation**: Self-documenting code through interface definitions
- **Consistency**: Shared types across all services and modules
- **Validation**: Foundation for runtime validation with libraries like Zod

## Files

### `models.ts`
Main file containing all data model interfaces, enums, and type definitions.

**Key Sections:**
- **Enums**: Status types, user roles, cryptocurrency types
- **Core Models**: User, Merchant, Channel, Listing, Order, Subscription, etc.
- **Request/Response DTOs**: API request and response structures
- **Service Types**: Bot operations, transaction verification, refund results
- **Extended Models**: Models with related entity information
- **Constants**: Platform configuration values

### `index.ts`
Central export point for all types. Import types from here:

```typescript
import { User, Order, OrderStatus } from '@/types'
```

## Core Data Models

### User Management
- `User` - Platform user account
- `WebAuthnCredential` - Biometric authentication credentials
- `Merchant` - Merchant profile and storefront information
- `UserRole` - Enum for user roles (buyer, merchant, admin)

### Channel and Listings
- `Channel` - Telegram channel information
- `Listing` - Channel subscription offering
- `ChannelType` - Enum for channel types
- `ListingStatus` - Enum for listing states

### Orders and Payments
- `Order` - Purchase order
- `Transaction` - Blockchain transaction record
- `OrderStatus` - Enum for order lifecycle states
- `CryptoCurrency` - Type for supported cryptocurrencies

### Subscriptions
- `Subscription` - Active channel access subscription
- `SubscriptionStatus` - Enum for subscription states

### Financial Management
- `EscrowEntry` - Payment escrow record
- `MerchantBalance` - Merchant balance by currency
- `Payout` - Merchant withdrawal request
- `EscrowStatus` - Enum for escrow states
- `PayoutStatus` - Enum for payout states

### Support and Disputes
- `Dispute` - Support ticket and dispute record
- `DisputeStatus` - Enum for dispute resolution states

### System
- `Notification` - User notification
- `AuditLog` - Admin action audit trail

## Enums

### OrderStatus
```typescript
enum OrderStatus {
  PENDING_PAYMENT = 'pending_payment',
  PAYMENT_DETECTED = 'payment_detected',
  PAYMENT_CONFIRMED = 'payment_confirmed',
  SUBSCRIPTION_ACTIVE = 'subscription_active',
  EXPIRED = 'expired',
  REFUNDED = 'refunded'
}
```

### SubscriptionStatus
```typescript
enum SubscriptionStatus {
  PENDING_ACTIVATION = 'pending_activation',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled'
}
```

### CryptoCurrency
```typescript
type CryptoCurrency = 
  | 'BNB'           // BNB Chain native token
  | 'USDT_BEP20'    // USDT on BNB Chain
  | 'USDC_BEP20'    // USDC on BNB Chain
  | 'BTC'           // Bitcoin
  | 'USDT_TRC20'    // USDT on TRON
```

## Constants

### Minimum Payout Thresholds
```typescript
MINIMUM_PAYOUT_THRESHOLDS = {
  BNB: 0.01,
  USDT_BEP20: 10,
  USDC_BEP20: 10,
  BTC: 0.001,
  USDT_TRC20: 10
}
```

### Required Confirmations
```typescript
REQUIRED_CONFIRMATIONS = {
  BNB: 12,
  USDT_BEP20: 12,
  USDC_BEP20: 12,
  BTC: 3,
  USDT_TRC20: 19
}
```

### Other Constants
- `PAYMENT_TOLERANCE = 0.001` (0.1% tolerance for payment amounts)
- `ORDER_EXPIRATION_MS = 24 * 60 * 60 * 1000` (24 hours)
- `DEFAULT_PLATFORM_FEE = 0.05` (5% platform fee)

## Usage Examples

### Creating a User
```typescript
import { User, UserRole } from '@/types'

const user: User = {
  id: 'user_123',
  username: 'john_doe',
  role: UserRole.BUYER,
  email: 'john@example.com',
  createdAt: new Date(),
  updatedAt: new Date()
}
```

### Creating an Order
```typescript
import { Order, OrderStatus } from '@/types'

const order: Order = {
  id: 'order_123',
  buyerId: 'user_123',
  listingId: 'listing_456',
  depositAddress: '0x1234567890abcdef',
  amount: 99.99,
  currency: 'USDT_BEP20',
  status: OrderStatus.PENDING_PAYMENT,
  confirmations: 0,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + ORDER_EXPIRATION_MS)
}
```

### Working with Extended Models
```typescript
import { OrderWithRelations } from '@/types'

const orderWithDetails: OrderWithRelations = {
  ...order,
  listing: {
    id: 'listing_456',
    merchantId: 'merchant_789',
    channelId: 'channel_101',
    description: 'Premium crypto signals',
    price: 99.99,
    currency: 'USDT_BEP20',
    durationDays: 30,
    status: ListingStatus.ACTIVE,
    viewCount: 100,
    purchaseCount: 10,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  buyer: {
    id: 'user_123',
    username: 'john_doe',
    role: UserRole.BUYER,
    createdAt: new Date(),
    updatedAt: new Date()
  }
}
```

### Using Constants
```typescript
import { REQUIRED_CONFIRMATIONS, MINIMUM_PAYOUT_THRESHOLDS } from '@/types'

// Check if transaction has enough confirmations
if (transaction.confirmations >= REQUIRED_CONFIRMATIONS[transaction.currency]) {
  // Process payment
}

// Validate payout amount
if (payoutAmount < MINIMUM_PAYOUT_THRESHOLDS[currency]) {
  throw new Error('Amount below minimum threshold')
}
```

## Type Guards

You can create type guards for runtime type checking:

```typescript
function isActiveSubscription(sub: Subscription): boolean {
  return sub.status === SubscriptionStatus.ACTIVE && 
         sub.expiryDate > new Date()
}

function isPendingOrder(order: Order): boolean {
  return order.status === OrderStatus.PENDING_PAYMENT &&
         order.expiresAt > new Date()
}
```

## Integration with Validation Libraries

These types can be used with validation libraries like Zod:

```typescript
import { z } from 'zod'
import { OrderStatus, CryptoCurrency } from '@/types'

const CreateOrderSchema = z.object({
  listingId: z.string().uuid(),
  // Zod will validate against the enum values
})

const OrderSchema = z.object({
  id: z.string(),
  buyerId: z.string(),
  listingId: z.string(),
  depositAddress: z.string(),
  amount: z.number().positive(),
  currency: z.enum(['BNB', 'USDT_BEP20', 'USDC_BEP20', 'BTC', 'USDT_TRC20']),
  status: z.nativeEnum(OrderStatus),
  confirmations: z.number().int().min(0),
  createdAt: z.date(),
  expiresAt: z.date()
})
```

## Testing

Unit tests for all type definitions are located in `__tests__/models.test.ts`.

Run tests:
```bash
npm test -- src/types/__tests__/models.test.ts
```

## Requirements Coverage

These type definitions satisfy the following requirements:
- **1.1, 1.5, 1.6**: Multi-vendor catalog and listing models
- **3.2**: Order and payment models
- **4.1**: Escrow system models
- **5.1**: Dispute and ticket models
- **6.1**: Payout and merchant balance models
- **12.1**: User interface data structures

## Related Documentation

- [Database Schema](../database/README.md) - Database table definitions
- [API Documentation](../api/README.md) - REST API endpoints
- [Design Document](../../../.kiro/specs/telegram-signals-marketplace/design.md) - System design
