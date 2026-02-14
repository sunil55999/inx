# Database Repository Layer

This directory contains the repository layer for the Telegram Signals Marketplace. The repository pattern provides a clean abstraction over database operations, making the codebase more maintainable and testable.

## Architecture

### Base Repository

All repositories extend `BaseRepository<T>`, which provides common CRUD operations:

- `findById(id)` - Find a record by ID
- `findAll(filters?)` - Find all records with optional filters
- `findWithPagination(filters, limit, offset)` - Find records with pagination
- `create(data)` - Create a new record
- `update(id, data)` - Update a record by ID
- `delete(id)` - Delete a record by ID
- `exists(id)` - Check if a record exists
- `count(filters?)` - Count records with optional filters
- `transaction(callback)` - Execute operations within a transaction

### Repository Classes

Each data model has its own repository class with model-specific query methods:

1. **UserRepository** - User account management
2. **MerchantRepository** - Merchant profile management
3. **ChannelRepository** - Telegram channel management
4. **ListingRepository** - Channel listing management with search
5. **OrderRepository** - Order and payment tracking
6. **SubscriptionRepository** - Subscription lifecycle management
7. **EscrowRepository** - Escrow ledger operations
8. **DisputeRepository** - Dispute/ticket management
9. **PayoutRepository** - Merchant payout processing
10. **TransactionRepository** - Blockchain transaction tracking
11. **MerchantBalanceRepository** - Merchant balance management
12. **WebAuthnCredentialRepository** - WebAuthn credential storage
13. **NotificationRepository** - User notification management
14. **AuditLogRepository** - Admin action audit logging

## Usage

### Basic CRUD Operations

```typescript
import { userRepository } from './database/repositories';

// Create a user
const user = await userRepository.create({
  username: 'john_doe',
  role: UserRole.BUYER,
  email: 'john@example.com'
});

// Find by ID
const foundUser = await userRepository.findById(user.id);

// Update
const updatedUser = await userRepository.update(user.id, {
  email: 'newemail@example.com'
});

// Delete
await userRepository.delete(user.id);
```

### Model-Specific Queries

```typescript
import { listingRepository, orderRepository } from './database/repositories';

// Find listings by merchant
const merchantListings = await listingRepository.findByMerchantId(merchantId);

// Search listings with filters
const searchResults = await listingRepository.search({
  text: 'crypto signals',
  minPrice: 10,
  maxPrice: 100,
  currency: 'USDT_BEP20',
  sortBy: 'popularity',
  limit: 20,
  offset: 0
});

// Find expired unpaid orders
const expiredOrders = await orderRepository.findExpiredUnpaid();
```

### Transactions

Use transactions for operations that modify multiple tables:

```typescript
import { orderRepository, escrowRepository } from './database/repositories';

await orderRepository.transaction(async (trx) => {
  // Create order
  const order = await trx('orders')
    .insert(orderData)
    .returning('*');

  // Create escrow entry
  await trx('escrow_ledger')
    .insert({
      order_id: order[0].id,
      amount: order[0].amount,
      currency: order[0].currency,
      status: 'held'
    });
});
```

### Pagination

```typescript
import { subscriptionRepository } from './database/repositories';

const { data, total } = await subscriptionRepository.findWithPagination(
  { status: SubscriptionStatus.ACTIVE },
  20,  // limit
  0    // offset
);

console.log(`Found ${data.length} of ${total} active subscriptions`);
```

### Relations

Some repositories provide methods to fetch records with related data:

```typescript
import { orderRepository, disputeRepository } from './database/repositories';

// Get order with listing, buyer, subscription, and transactions
const orderWithRelations = await orderRepository.findByIdWithRelations(orderId);

// Get dispute with order, buyer, and admin details
const disputeWithRelations = await disputeRepository.findByIdWithRelations(disputeId);
```

## Common Access Patterns

### User Management

```typescript
// Find user by username
const user = await userRepository.findByUsername('john_doe');

// Find user by Telegram ID
const user = await userRepository.findByTelegramUserId(123456789);

// Check if username exists
const exists = await userRepository.usernameExists('john_doe');
```

### Listing Management

```typescript
// Find active listings
const activeListings = await listingRepository.findActive();

// Increment view count
await listingRepository.incrementViewCount(listingId);

// Deactivate all listings for a channel
await listingRepository.deactivateByChannelId(channelId);
```

### Order Processing

```typescript
// Find order by deposit address
const order = await orderRepository.findByDepositAddress(depositAddress);

// Update order status
await orderRepository.updateStatus(orderId, OrderStatus.PAYMENT_CONFIRMED);

// Mark expired orders
const expiredOrders = await orderRepository.findExpiredUnpaid();
await orderRepository.markExpired(expiredOrders.map(o => o.id));
```

### Subscription Lifecycle

```typescript
// Find subscriptions expiring soon
const expiringSoon = await subscriptionRepository.findExpiringSoon(24); // 24 hours

// Check if buyer has active subscription
const hasAccess = await subscriptionRepository.hasActiveSubscription(buyerId, channelId);

// Mark subscriptions as expired
await subscriptionRepository.markExpired(subscriptionIds);
```

### Escrow Management

```typescript
// Get total escrow balance by currency
const balance = await escrowRepository.getTotalBalanceByCurrency('USDT_BEP20');

// Release escrow to merchant
await escrowRepository.release(escrowId, merchantAmount);

// Get held amount for merchant
const heldAmount = await escrowRepository.getHeldAmountForMerchant(merchantId, currency);
```

### Balance Operations

```typescript
// Increment merchant available balance
await merchantBalanceRepository.incrementAvailable(merchantId, currency, amount);

// Check sufficient balance
const hasFunds = await merchantBalanceRepository.hasSufficientBalance(
  merchantId,
  currency,
  withdrawalAmount
);

// Move from pending to available
await merchantBalanceRepository.movePendingToAvailable(merchantId, currency, amount);
```

### Dispute Handling

```typescript
// Find open disputes
const openDisputes = await disputeRepository.findOpen();

// Assign to admin
await disputeRepository.assignToAdmin(disputeId, adminId);

// Resolve dispute
await disputeRepository.resolve(disputeId, resolution, adminId);
```

### Audit Logging

```typescript
// Log admin action
await auditLogRepository.logAction(
  adminId,
  'suspend_merchant',
  'merchant',
  merchantId,
  { reason: 'Terms violation' },
  ipAddress
);

// Get audit trail for entity
const logs = await auditLogRepository.findByEntity('merchant', merchantId);
```

## Testing

Repositories can be easily mocked for unit testing:

```typescript
import { UserRepository } from './database/repositories';

// Mock the repository
jest.mock('./database/repositories/UserRepository');

const mockUserRepository = UserRepository as jest.MockedClass<typeof UserRepository>;
mockUserRepository.prototype.findById.mockResolvedValue(mockUser);
```

For integration tests, use a test database:

```typescript
import db from './database/connection';
import { userRepository } from './database/repositories';

beforeAll(async () => {
  await db.migrate.latest();
});

afterAll(async () => {
  await db.destroy();
});

test('should create and find user', async () => {
  const user = await userRepository.create({
    username: 'test_user',
    role: UserRole.BUYER
  });

  const found = await userRepository.findById(user.id);
  expect(found).toEqual(user);
});
```

## Best Practices

1. **Use Transactions**: Always use transactions for operations that modify multiple tables
2. **Avoid N+1 Queries**: Use joins or batch queries instead of loops
3. **Index Frequently Queried Columns**: Ensure database indexes exist for common query patterns
4. **Handle Null Results**: Always check for null when using `findById` or similar methods
5. **Use Type Safety**: Leverage TypeScript types for compile-time safety
6. **Keep Business Logic in Services**: Repositories should only handle data access, not business logic
7. **Use Pagination**: Always paginate large result sets
8. **Cache When Appropriate**: Consider caching frequently accessed, rarely changing data

## Requirements Satisfied

- **Requirement 1.1**: Multi-vendor product catalog with unified listing management
- **Requirement 4.5**: Database transaction support for data integrity
- **Requirement 6.7**: Comprehensive CRUD operations for all models
