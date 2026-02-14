# Design Document: Telegram Signals Marketplace

## Overview

The Telegram Signals Marketplace is a multi-vendor cryptocurrency-based platform that connects signal channel merchants with buyers. The system automates subscription management through Telegram Bot API integration, processes cryptocurrency payments across multiple blockchains, and implements an escrow system to protect both buyers and merchants.

### Key Design Principles

1. **Automation First**: Minimize manual intervention through automated bot operations, blockchain monitoring, and scheduled tasks
2. **Security by Design**: Use AWS KMS for secrets, implement WebAuthn for authentication, and maintain audit logs
3. **Buyer Protection**: Escrow funds until service delivery, support pro-rated refunds, and provide dispute resolution
4. **Scalability**: Serverless architecture for bot operations, queue-based blockchain monitoring, and horizontal scaling
5. **Multi-Chain Support**: Abstract blockchain operations to support BNB Chain, Bitcoin, and TRON networks

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web Frontend                             │
│              (React/Vue + Dark Theme UI)                         │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS/REST API
┌────────────────────────┴────────────────────────────────────────┐
│                      API Gateway / Backend                       │
│                  (Node.js/Express or Python/FastAPI)             │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│   Auth       │   Listing    │   Order      │   Payment          │
│   Service    │   Service    │   Service    │   Service          │
└──────┬───────┴──────┬───────┴──────┬───────┴────────┬───────────┘
       │              │              │                │
       │              │              │                │
┌──────┴──────────────┴──────────────┴────────────────┴───────────┐
│                     PostgreSQL Database                          │
│        (Users, Merchants, Listings, Orders, Subscriptions)       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    Telegram Bot Service                          │
│              (AWS Lambda or Container + Webhook)                 │
│         - Invite users to channels                               │
│         - Remove users on expiry/refund                          │
│         - Verify admin permissions                               │
└────────────────────────┬─────────────────────────────────────────┘
                         │ Telegram Bot API
                         │
┌────────────────────────┴─────────────────────────────────────────┐
│                   Telegram Channels/Groups                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│              Blockchain Monitoring Service                       │
│         (WebSocket/RPC connections to blockchain nodes)          │
│    - BNB Chain (BscScan API or hosted node)                      │
│    - Bitcoin (node RPC)                                          │
│    - TRON (TronGrid API)                                         │
└────────────────────────┬─────────────────────────────────────────┘
                         │ Transaction events
┌────────────────────────┴─────────────────────────────────────────┐
│                    Task Queue / Scheduler                        │
│         - Process payment confirmations                          │
│         - Schedule subscription expiries                         │
│         - Execute merchant payouts                               │
└──────────────────────────────────────────────────────────────────┘
```

### Deployment Architecture

- **Frontend**: Static hosting (AWS S3 + CloudFront or Vercel)
- **Backend API**: AWS ECS/Fargate containers or EC2 instances behind ALB
- **Database**: Amazon Aurora PostgreSQL with read replicas
- **Bot Service**: AWS Lambda functions triggered by Telegram webhooks
- **Blockchain Monitoring**: Long-running container service or Lambda with SQS
- **Task Scheduler**: AWS EventBridge + Lambda or containerized APScheduler
- **Secrets**: AWS KMS and Secrets Manager
- **Search**: PostgreSQL full-text search or Amazon OpenSearch


## Components and Interfaces

### 1. Authentication Service

**Responsibilities:**
- User registration and login via WebAuthn (FIDO2)
- Session management and JWT token generation
- Multi-factor authentication for merchants and admins
- Password-based authentication as fallback option

**Key Interfaces:**

```typescript
interface AuthService {
  // WebAuthn registration
  registerWebAuthn(username: string, authenticatorData: PublicKeyCredential): Promise<User>
  
  // WebAuthn authentication
  authenticateWebAuthn(credential: PublicKeyCredential): Promise<SessionToken>
  
  // Password fallback
  registerPassword(username: string, password: string): Promise<User>
  authenticatePassword(username: string, password: string): Promise<SessionToken>
  
  // Session management
  validateToken(token: string): Promise<User>
  revokeToken(token: string): Promise<void>
}

interface User {
  id: string
  username: string
  role: 'buyer' | 'merchant' | 'admin'
  webauthnCredentials: WebAuthnCredential[]
  createdAt: Date
}

interface WebAuthnCredential {
  credentialId: string
  publicKey: string
  counter: number
  createdAt: Date
}
```

### 2. Listing Service

**Responsibilities:**
- Create, read, update, delete channel listings
- Validate bot admin permissions before listing creation
- Manage listing status (active, inactive, suspended)
- Generate merchant storefront pages

**Key Interfaces:**

```typescript
interface ListingService {
  createListing(merchantId: string, listing: CreateListingRequest): Promise<Listing>
  updateListing(listingId: string, updates: Partial<Listing>): Promise<Listing>
  deleteListing(listingId: string): Promise<void>
  getListing(listingId: string): Promise<Listing>
  getMerchantListings(merchantId: string): Promise<Listing[]>
  searchListings(query: SearchQuery): Promise<SearchResult>
  validateBotPermissions(channelId: string): Promise<boolean>
}

interface Listing {
  id: string
  merchantId: string
  channelId: string
  channelName: string
  description: string
  price: number
  currency: CryptoCurrency
  durationDays: number
  status: 'active' | 'inactive' | 'suspended'
  signalType: string[]
  createdAt: Date
  updatedAt: Date
}

interface CreateListingRequest {
  channelId: string
  channelName: string
  description: string
  price: number
  currency: CryptoCurrency
  durationDays: number
  signalType: string[]
}

interface SearchQuery {
  text?: string
  merchantId?: string
  minPrice?: number
  maxPrice?: number
  currency?: CryptoCurrency
  signalType?: string[]
  sortBy?: 'price_asc' | 'price_desc' | 'popularity' | 'newest'
  limit: number
  offset: number
}

interface SearchResult {
  listings: Listing[]
  total: number
  hasMore: boolean
}

type CryptoCurrency = 'BNB' | 'USDT_BEP20' | 'USDC_BEP20' | 'BTC' | 'USDT_TRC20'
```

### 3. Order Service

**Responsibilities:**
- Create orders and generate unique deposit addresses
- Track order status through payment lifecycle
- Create subscriptions upon payment confirmation
- Handle order expiration for unpaid orders

**Key Interfaces:**

```typescript
interface OrderService {
  createOrder(buyerId: string, listingId: string): Promise<Order>
  getOrder(orderId: string): Promise<Order>
  updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order>
  expireUnpaidOrders(): Promise<void>
  getBuyerOrders(buyerId: string): Promise<Order[]>
}

interface Order {
  id: string
  buyerId: string
  listingId: string
  depositAddress: string
  amount: number
  currency: CryptoCurrency
  status: OrderStatus
  transactionHash?: string
  confirmations: number
  createdAt: Date
  expiresAt: Date
  paidAt?: Date
}

type OrderStatus = 
  | 'pending_payment'
  | 'payment_detected'
  | 'payment_confirmed'
  | 'subscription_active'
  | 'expired'
  | 'refunded'
```


### 4. Subscription Service

**Responsibilities:**
- Create subscriptions upon payment confirmation
- Schedule expiry tasks for active subscriptions
- Process subscription renewals and extensions
- Coordinate with bot service for access control

**Key Interfaces:**

```typescript
interface SubscriptionService {
  createSubscription(orderId: string): Promise<Subscription>
  getSubscription(subscriptionId: string): Promise<Subscription>
  renewSubscription(subscriptionId: string, orderId: string): Promise<Subscription>
  expireSubscription(subscriptionId: string): Promise<void>
  getBuyerSubscriptions(buyerId: string): Promise<Subscription[]>
  scheduleExpiry(subscriptionId: string, expiryDate: Date): Promise<void>
}

interface Subscription {
  id: string
  buyerId: string
  listingId: string
  orderId: string
  channelId: string
  status: SubscriptionStatus
  startDate: Date
  expiryDate: Date
  durationDays: number
  createdAt: Date
  updatedAt: Date
}

type SubscriptionStatus = 
  | 'pending_activation'
  | 'active'
  | 'expired'
  | 'refunded'
  | 'cancelled'
```

### 5. Payment Service

**Responsibilities:**
- Generate unique deposit addresses for orders
- Monitor blockchain networks for incoming transactions
- Verify payment amounts and confirmation counts
- Coordinate payment confirmation with order service

**Key Interfaces:**

```typescript
interface PaymentService {
  generateDepositAddress(orderId: string, currency: CryptoCurrency): Promise<string>
  monitorAddress(address: string, expectedAmount: number, currency: CryptoCurrency): Promise<void>
  verifyTransaction(txHash: string, currency: CryptoCurrency): Promise<TransactionVerification>
  getRequiredConfirmations(currency: CryptoCurrency): number
}

interface TransactionVerification {
  isValid: boolean
  amount: number
  confirmations: number
  fromAddress: string
  toAddress: string
  timestamp: Date
}

interface BlockchainMonitor {
  connect(network: BlockchainNetwork): Promise<void>
  subscribeToAddress(address: string, callback: TransactionCallback): Promise<void>
  unsubscribeFromAddress(address: string): Promise<void>
  getTransaction(txHash: string): Promise<Transaction>
}

interface Transaction {
  hash: string
  from: string
  to: string
  amount: number
  confirmations: number
  blockNumber: number
  timestamp: Date
}

type BlockchainNetwork = 'BNB_CHAIN' | 'BITCOIN' | 'TRON'
type TransactionCallback = (tx: Transaction) => Promise<void>
```

### 6. Telegram Bot Service

**Responsibilities:**
- Invite buyers to channels upon subscription activation
- Remove buyers from channels upon expiry or refund
- Verify bot admin permissions in channels
- Handle Telegram API rate limits and errors

**Key Interfaces:**

```typescript
interface TelegramBotService {
  inviteUserToChannel(userId: string, channelId: string): Promise<InviteResult>
  removeUserFromChannel(userId: string, channelId: string): Promise<RemoveResult>
  verifyAdminPermissions(channelId: string): Promise<PermissionCheck>
  getBotInfo(): Promise<BotInfo>
}

interface InviteResult {
  success: boolean
  error?: string
  retryable: boolean
}

interface RemoveResult {
  success: boolean
  error?: string
  retryable: boolean
}

interface PermissionCheck {
  isAdmin: boolean
  canInviteUsers: boolean
  canRemoveUsers: boolean
  channelExists: boolean
}

interface BotInfo {
  id: string
  username: string
  isActive: boolean
}
```

### 7. Escrow Service

**Responsibilities:**
- Hold funds in escrow until subscription completion
- Calculate and process refunds with pro-rating
- Release funds to merchant balances
- Maintain escrow ledger for audit

**Key Interfaces:**

```typescript
interface EscrowService {
  holdFunds(orderId: string, amount: number, currency: CryptoCurrency): Promise<EscrowEntry>
  releaseFunds(subscriptionId: string): Promise<void>
  processRefund(subscriptionId: string, reason: string): Promise<RefundResult>
  calculateProRatedRefund(subscription: Subscription): Promise<number>
  getMerchantBalance(merchantId: string): Promise<Balance>
}

interface EscrowEntry {
  id: string
  orderId: string
  subscriptionId: string
  amount: number
  currency: CryptoCurrency
  status: 'held' | 'released' | 'refunded'
  createdAt: Date
  releasedAt?: Date
}

interface RefundResult {
  refundAmount: number
  merchantPenalty: number
  buyerReceives: number
  transactionHash?: string
}

interface Balance {
  merchantId: string
  balances: Record<CryptoCurrency, number>
  pendingWithdrawals: Record<CryptoCurrency, number>
}
```


### 8. Payout Service

**Responsibilities:**
- Process merchant withdrawal requests
- Execute cryptocurrency transfers to merchant wallets
- Validate minimum withdrawal amounts
- Handle payout failures and retries

**Key Interfaces:**

```typescript
interface PayoutService {
  requestPayout(merchantId: string, amount: number, currency: CryptoCurrency, walletAddress: string): Promise<Payout>
  processPayout(payoutId: string): Promise<PayoutResult>
  getPayoutStatus(payoutId: string): Promise<Payout>
  getMerchantPayouts(merchantId: string): Promise<Payout[]>
  validateMinimumAmount(amount: number, currency: CryptoCurrency): boolean
}

interface Payout {
  id: string
  merchantId: string
  amount: number
  currency: CryptoCurrency
  walletAddress: string
  status: PayoutStatus
  transactionHash?: string
  createdAt: Date
  processedAt?: Date
  error?: string
}

type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface PayoutResult {
  success: boolean
  transactionHash?: string
  error?: string
}
```

### 9. Ticket Service

**Responsibilities:**
- Create and manage support tickets
- Handle dispute resolution workflow
- Notify admins of new tickets
- Track ticket status and resolution

**Key Interfaces:**

```typescript
interface TicketService {
  createTicket(buyerId: string, orderId: string, issue: string): Promise<Ticket>
  getTicket(ticketId: string): Promise<Ticket>
  updateTicketStatus(ticketId: string, status: TicketStatus, resolution?: string): Promise<Ticket>
  approveRefund(ticketId: string, adminId: string): Promise<void>
  denyRefund(ticketId: string, adminId: string, reason: string): Promise<void>
  getOpenTickets(): Promise<Ticket[]>
}

interface Ticket {
  id: string
  buyerId: string
  orderId: string
  issue: string
  status: TicketStatus
  resolution?: string
  adminId?: string
  createdAt: Date
  resolvedAt?: Date
}

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
```

### 10. Search Service

**Responsibilities:**
- Index listings for full-text search
- Provide autocomplete suggestions
- Execute filtered and sorted queries
- Maintain search relevance ranking

**Key Interfaces:**

```typescript
interface SearchService {
  indexListing(listing: Listing): Promise<void>
  removeListing(listingId: string): Promise<void>
  search(query: SearchQuery): Promise<SearchResult>
  autocomplete(prefix: string, limit: number): Promise<string[]>
  updateSearchIndex(): Promise<void>
}
```

## Data Models

### Database Schema

**Users Table:**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('buyer', 'merchant', 'admin')),
  email VARCHAR(255),
  telegram_user_id BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_telegram_id ON users(telegram_user_id);
```

**WebAuthn Credentials Table:**
```sql
CREATE TABLE webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webauthn_user ON webauthn_credentials(user_id);
```

**Merchants Table:**
```sql
CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storefront_slug VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  description TEXT,
  profile_image_url TEXT,
  total_sales INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merchants_slug ON merchants(storefront_slug);
CREATE INDEX idx_merchants_user ON merchants(user_id);
```

**Channels Table:**
```sql
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_channel_id BIGINT UNIQUE NOT NULL,
  channel_name VARCHAR(255) NOT NULL,
  channel_username VARCHAR(100),
  channel_type VARCHAR(20) NOT NULL CHECK (channel_type IN ('channel', 'group', 'supergroup')),
  bot_is_admin BOOLEAN NOT NULL DEFAULT false,
  last_permission_check TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channels_telegram_id ON channels(telegram_channel_id);
```

**Listings Table:**
```sql
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  price DECIMAL(20, 8) NOT NULL,
  currency VARCHAR(20) NOT NULL,
  duration_days INTEGER NOT NULL,
  signal_types TEXT[],
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  view_count INTEGER NOT NULL DEFAULT 0,
  purchase_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listings_merchant ON listings(merchant_id);
CREATE INDEX idx_listings_channel ON listings(channel_id);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_price ON listings(price);
```


**Orders Table:**
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  deposit_address VARCHAR(255) NOT NULL,
  amount DECIMAL(20, 8) NOT NULL,
  currency VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL,
  transaction_hash VARCHAR(255),
  confirmations INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  paid_at TIMESTAMP
);

CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_listing ON orders(listing_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_deposit_address ON orders(deposit_address);
CREATE INDEX idx_orders_expires_at ON orders(expires_at);
```

**Subscriptions Table:**
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL,
  start_date TIMESTAMP NOT NULL,
  expiry_date TIMESTAMP NOT NULL,
  duration_days INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_buyer ON subscriptions(buyer_id);
CREATE INDEX idx_subscriptions_listing ON subscriptions(listing_id);
CREATE INDEX idx_subscriptions_order ON subscriptions(order_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_expiry ON subscriptions(expiry_date);
```

**Escrow Ledger Table:**
```sql
CREATE TABLE escrow_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  amount DECIMAL(20, 8) NOT NULL,
  currency VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('held', 'released', 'refunded')),
  platform_fee DECIMAL(20, 8) NOT NULL DEFAULT 0,
  merchant_amount DECIMAL(20, 8),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  released_at TIMESTAMP
);

CREATE INDEX idx_escrow_order ON escrow_ledger(order_id);
CREATE INDEX idx_escrow_subscription ON escrow_ledger(subscription_id);
CREATE INDEX idx_escrow_status ON escrow_ledger(status);
```

**Merchant Balances Table:**
```sql
CREATE TABLE merchant_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  currency VARCHAR(20) NOT NULL,
  available_balance DECIMAL(20, 8) NOT NULL DEFAULT 0,
  pending_balance DECIMAL(20, 8) NOT NULL DEFAULT 0,
  total_earned DECIMAL(20, 8) NOT NULL DEFAULT 0,
  total_withdrawn DECIMAL(20, 8) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, currency)
);

CREATE INDEX idx_balances_merchant ON merchant_balances(merchant_id);
```

**Payouts Table:**
```sql
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  amount DECIMAL(20, 8) NOT NULL,
  currency VARCHAR(20) NOT NULL,
  wallet_address VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL,
  transaction_hash VARCHAR(255),
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE INDEX idx_payouts_merchant ON payouts(merchant_id);
CREATE INDEX idx_payouts_status ON payouts(status);
```

**Tickets Table:**
```sql
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  issue TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  resolution TEXT,
  admin_id UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE INDEX idx_tickets_buyer ON tickets(buyer_id);
CREATE INDEX idx_tickets_order ON tickets(order_id);
CREATE INDEX idx_tickets_status ON tickets(status);
```

**Transactions Table:**
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  transaction_hash VARCHAR(255) UNIQUE NOT NULL,
  from_address VARCHAR(255) NOT NULL,
  to_address VARCHAR(255) NOT NULL,
  amount DECIMAL(20, 8) NOT NULL,
  currency VARCHAR(20) NOT NULL,
  confirmations INTEGER NOT NULL DEFAULT 0,
  block_number BIGINT,
  detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMP
);

CREATE INDEX idx_transactions_order ON transactions(order_id);
CREATE INDEX idx_transactions_hash ON transactions(transaction_hash);
```

### Entity Relationships

```
User (1) ──< (N) Orders
User (1) ──< (N) Subscriptions
User (1) ──< (N) Tickets
User (1) ──< (1) Merchant

Merchant (1) ──< (N) Listings
Merchant (1) ──< (N) Payouts
Merchant (1) ──< (N) MerchantBalances

Channel (1) ──< (N) Listings
Channel (1) ──< (N) Subscriptions

Listing (1) ──< (N) Orders
Listing (1) ──< (N) Subscriptions

Order (1) ──< (1) Subscription
Order (1) ──< (N) Transactions
Order (1) ──< (N) Tickets
Order (1) ──< (1) EscrowLedger

Subscription (1) ──< (1) EscrowLedger
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified the following redundancies to eliminate:

- **Catalog queries**: Properties 1.1, 1.4, and 1.6 all test catalog retrieval - consolidated into Property 1
- **Data completeness**: Properties 1.3, 2.3, and similar field validation - consolidated into data integrity properties
- **Bot operations**: Properties 3.1, 3.2, and 3.5 all test bot API calls - consolidated into Property 3
- **Expiry workflow**: Properties 2.5 and 4.4 duplicate expiry logic - consolidated into Property 4
- **Refund calculation**: Properties 7.4 and 14.1 both test pro-rating - consolidated into Property 14
- **Permission validation**: Properties 3.4 and 15.1 duplicate permission checks - consolidated into Property 8
- **Currency support**: Properties 5.1, 5.6, and 8.5 test configuration - consolidated into examples

The following properties provide unique validation value:

### Listing and Catalog Properties

**Property 1: Unified catalog completeness**
*For any* set of merchants with listings, querying the unified catalog should return listings from all merchants, and each listing should be accessible by its ID.
**Validates: Requirements 1.1, 1.2**

**Property 2: Multi-vendor channel support**
*For any* channel, multiple merchants should be able to create listings for that channel with different prices and durations, and all listings should coexist in the system.
**Validates: Requirements 1.5**

**Property 3: Listing data integrity**
*For any* created listing, it should contain all required fields (channel ID, merchant ID, price, duration, description) with non-null values.
**Validates: Requirements 1.3**

### Order and Subscription Properties

**Property 4: Order creation completeness**
*For any* purchase initiation, the created order should link the buyer ID, listing ID, and a unique deposit address.
**Validates: Requirements 2.1**

**Property 5: Subscription expiry calculation**
*For any* subscription created from a confirmed payment, the expiry timestamp should equal the start timestamp plus the listing's duration in days.
**Validates: Requirements 2.2**

**Property 6: Subscription data integrity**
*For any* created subscription, it should contain all required fields (buyer ID, listing ID, order ID, start date, expiry date, status) with non-null values.
**Validates: Requirements 2.3**

**Property 7: Subscription activation triggers bot invite**
*For any* subscription activation, the system should invoke the bot service to invite the buyer to the channel.
**Validates: Requirements 2.4**

**Property 8: Subscription expiry workflow**
*For any* expired subscription, the system should update the subscription status to "expired" and invoke the bot service to remove the buyer from the channel.
**Validates: Requirements 2.5**

**Property 9: Subscription renewal linkage**
*For any* subscription renewal, the new subscription should reference the original subscription and extend access for the specified duration.
**Validates: Requirements 2.6**

### Telegram Bot Properties

**Property 10: Bot invite operation**
*For any* subscription activation, the bot should call the Telegram API inviteChatMember or addChatMember method with the correct buyer user ID and channel ID.
**Validates: Requirements 3.1**

**Property 11: Bot removal operation**
*For any* subscription expiry or refund, the bot should call the Telegram API kickChatMember method with the correct buyer user ID and channel ID.
**Validates: Requirements 3.2, 3.5**

**Property 12: Bot permission failure handling**
*For any* bot operation that fails with a permission error, the system should mark all associated listings as inactive and record the failure reason.
**Validates: Requirements 3.3**

**Property 13: Bot permission validation**
*For any* listing creation attempt, if the bot lacks admin privileges in the specified channel, the system should reject the listing creation.
**Validates: Requirements 3.4, 15.2**

**Property 14: Bot retry with exponential backoff**
*For any* bot operation that fails with a rate limit error, the system should retry the operation with exponentially increasing delays (e.g., 1s, 2s, 4s, 8s).
**Validates: Requirements 3.6**

### Scheduling and Task Properties

**Property 15: Expiry task scheduling**
*For any* created subscription, the system should schedule an expiry task with a timestamp matching the subscription's expiry date.
**Validates: Requirements 4.2**

**Property 16: Task retry on failure**
*For any* expiry task that fails, the system should retry up to 3 times with exponential backoff before marking it as permanently failed.
**Validates: Requirements 4.5**

### Payment and Blockchain Properties

**Property 17: Deposit address uniqueness**
*For any* set of orders, all generated deposit addresses should be unique across the entire system.
**Validates: Requirements 5.2**

**Property 18: Payment amount tolerance**
*For any* detected transaction, if the amount is within 0.1% of the order total, the payment should be accepted; if outside this tolerance, it should be rejected.
**Validates: Requirements 5.4**

**Property 19: Payment confirmation threshold**
*For any* detected transaction, the subscription should only be activated when confirmations reach the required threshold for that currency (12 for BNB, 3 for BTC, 19 for TRON).
**Validates: Requirements 5.5, 5.6**

**Property 20: Order expiration timeout**
*For any* order that remains unpaid for 24 hours, the system should automatically mark it as expired.
**Validates: Requirements 5.7**

**Property 21: Transaction data extraction**
*For any* detected blockchain transaction, the system should extract and store the sender address, amount, token type, and confirmation count.
**Validates: Requirements 6.4**

**Property 22: Order status progression**
*For any* order with an incoming transaction, as confirmations accumulate, the order status should progress from "payment_detected" to "payment_confirmed" when the threshold is reached.
**Validates: Requirements 6.5**

### Escrow Properties

**Property 23: Escrow fund holding**
*For any* confirmed payment, the system should create an escrow entry with status "held" for the full payment amount.
**Validates: Requirements 7.1**

**Property 24: Escrow-subscription linkage**
*For any* active subscription, there should exist exactly one escrow entry with status "held" linked to that subscription.
**Validates: Requirements 7.2**

**Property 25: Escrow release on completion**
*For any* subscription that completes successfully (reaches expiry without refund), the system should release the escrow funds to the merchant's balance and update escrow status to "released".
**Validates: Requirements 7.3**

**Property 26: Pro-rated refund calculation**
*For any* refund approval, the refund amount should equal: (payment amount) × (unused days / total subscription days), where unused days = expiry date - current date.
**Validates: Requirements 7.4, 14.1**

**Property 27: Platform fee deduction**
*For any* escrow release to merchant, the amount added to merchant balance should equal escrow amount minus platform fee percentage.
**Validates: Requirements 7.5**

### Merchant Balance and Payout Properties

**Property 28: Merchant balance ledger**
*For any* merchant, the system should maintain a balance record for each supported cryptocurrency tracking available and pending amounts.
**Validates: Requirements 8.1**

**Property 29: Withdrawal balance validation**
*For any* withdrawal request, if the requested amount exceeds the merchant's available balance in that currency, the system should reject the request.
**Validates: Requirements 8.2**

**Property 30: Payout record creation**
*For any* approved withdrawal request, the system should create a payout record with the merchant ID, amount, currency, and destination wallet address.
**Validates: Requirements 8.3**

**Property 31: Payout balance deduction**
*For any* processed payout, the merchant's available balance should decrease by the payout amount.
**Validates: Requirements 8.4**

**Property 32: Payout failure recovery**
*For any* payout that fails to execute, the system should restore the full amount to the merchant's available balance.
**Validates: Requirements 8.7**

### Authentication Properties

**Property 33: WebAuthn credential storage**
*For any* user registration with WebAuthn, the system should store the credential ID, public key, and counter value.
**Validates: Requirements 9.2, 9.4**

**Property 34: WebAuthn authentication**
*For any* login attempt with valid WebAuthn credentials, the system should grant access and issue a session token.
**Validates: Requirements 9.3**

**Property 35: Multiple authenticators support**
*For any* user, the system should allow registration of multiple WebAuthn credentials, and any valid credential should grant access.
**Validates: Requirements 9.5**

**Property 36: MFA enforcement for privileged accounts**
*For any* merchant or admin account, login should require successful completion of multi-factor authentication.
**Validates: Requirements 9.7**

### Merchant Storefront Properties

**Property 37: Unique storefront URL generation**
*For any* merchant, the system should generate a unique storefront URL in the format /store/{merchant_username}, and no two merchants should have the same URL.
**Validates: Requirements 10.1**

**Property 38: Storefront listing filtering**
*For any* merchant storefront query, the returned listings should include only active listings belonging to that specific merchant.
**Validates: Requirements 10.2**

**Property 39: Merchant profile completeness**
*For any* merchant profile, it should contain username, description, and total sales count fields.
**Validates: Requirements 10.3**

**Property 40: Profile update persistence**
*For any* merchant profile update, the changes should be immediately retrievable in subsequent queries.
**Validates: Requirements 10.4**

### Search and Discovery Properties

**Property 41: Full-text search coverage**
*For any* search query, the results should include all listings where the query text appears in the channel name, description, or merchant username.
**Validates: Requirements 11.1**

**Property 42: Search result relevance ranking**
*For any* search query with multiple matches, results should be ordered by relevance score (exact matches ranked higher than partial matches).
**Validates: Requirements 11.2**

**Property 43: Autocomplete suggestions**
*For any* search prefix, the autocomplete should return suggestions that start with that prefix, limited to the specified count.
**Validates: Requirements 11.3**

**Property 44: Listing filter application**
*For any* search with filters (merchant, price range, duration, signal type), all returned listings should satisfy all specified filter criteria.
**Validates: Requirements 11.4**

**Property 45: Listing sort order**
*For any* search with sort parameter, results should be ordered according to the specified sort field (price ascending/descending, popularity, or newest first).
**Validates: Requirements 11.5**

**Property 46: Price formatting precision**
*For any* displayed cryptocurrency price, the decimal precision should match the currency standard (8 decimals for BTC/BNB, 6 for USDT/USDC).
**Validates: Requirements 12.5**

### Ticket and Dispute Properties

**Property 47: Ticket creation**
*For any* buyer with an order, the buyer should be able to create a ticket linked to that order with an issue description.
**Validates: Requirements 13.1**

**Property 48: Ticket data completeness**
*For any* created ticket, it should contain the order ID, buyer ID, issue description, and creation timestamp.
**Validates: Requirements 13.2**

**Property 49: Ticket detail retrieval**
*For any* ticket query by admin, the response should include the ticket details plus related order, subscription, and transaction information.
**Validates: Requirements 13.4**

**Property 50: Admin refund approval**
*For any* ticket, an admin should be able to approve or deny the refund request, updating the ticket status accordingly.
**Validates: Requirements 13.5**

### Refund Processing Properties

**Property 51: Refund fee allocation**
*For any* approved refund, the buyer's refund amount should equal the pro-rated amount without platform fee deduction, and the merchant should bear the fee cost.
**Validates: Requirements 14.2**

**Property 52: Refund address routing**
*For any* processed refund, the cryptocurrency should be sent to the original deposit address used for the payment.
**Validates: Requirements 14.3**

**Property 53: Refund subscription status update**
*For any* processed refund, the subscription status should be updated to "refunded" and the bot should remove the buyer from the channel.
**Validates: Requirements 14.4**

**Property 54: Merchant violation refund protection**
*For any* refund caused by merchant violation (bot permission loss), the buyer's refund amount should not be reduced.
**Validates: Requirements 14.5**

### Listing Validation Properties

**Property 55: Inactive listing purchase prevention**
*For any* listing with status "inactive", purchase attempts should be rejected with an appropriate error message.
**Validates: Requirements 15.5**

**Property 56: Batch listing inactivation**
*For any* channel where the bot loses admin privileges, all listings associated with that channel should be marked as inactive.
**Validates: Requirements 15.3**

**Property 57: Listing reactivation**
*For any* inactive listing where the bot regains admin privileges, the merchant should be able to reactivate the listing, changing its status to "active".
**Validates: Requirements 15.6**

### Admin Dashboard Properties

**Property 58: Dashboard metrics accuracy**
*For any* admin dashboard query, the displayed counts (active subscriptions, pending tickets, escrow balance) should match the actual database counts.
**Validates: Requirements 16.1**

**Property 59: Admin global data access**
*For any* admin user, they should be able to query and view all orders, subscriptions, and transactions across all users.
**Validates: Requirements 16.2**

**Property 60: Admin bot operation invocation**
*For any* admin user, they should be able to manually trigger bot operations (invite, remove) for testing and recovery purposes.
**Validates: Requirements 16.3**

**Property 61: Platform fee configuration**
*For any* admin fee adjustment, the new fee percentage should be applied to all subsequent escrow releases.
**Validates: Requirements 16.4**

**Property 62: Admin access restriction**
*For any* non-admin user, attempts to access admin endpoints should be rejected with an authorization error.
**Validates: Requirements 16.6**

### Security Properties

**Property 63: Sensitive data exclusion from logs**
*For any* log entry, it should not contain private keys, API tokens, passwords, or other sensitive credentials in plain text.
**Validates: Requirements 17.4**

**Property 64: Authentication rate limiting**
*For any* authentication endpoint, if more than N requests are made from the same IP within a time window, subsequent requests should be throttled or rejected.
**Validates: Requirements 17.6**

### Database Integrity Properties

**Property 65: Foreign key constraint enforcement**
*For any* attempt to create a record with an invalid foreign key reference, the database should reject the operation with a constraint violation error.
**Validates: Requirements 18.3**

**Property 66: Multi-table operation atomicity**
*For any* operation that modifies multiple tables (e.g., order creation + escrow entry), either all changes should succeed or all should be rolled back.
**Validates: Requirements 18.4**

### Performance Properties

**Property 67: Cache consistency**
*For any* cached data (listings, merchant profiles), the cached value should match the current database value or be invalidated within the cache TTL.
**Validates: Requirements 19.3**

### Compliance Properties

**Property 68: TOS acceptance requirement**
*For any* user registration attempt, if the user has not accepted the Terms of Service, the registration should be rejected.
**Validates: Requirements 20.2**

**Property 69: TOS acceptance record**
*For any* user who accepts the Terms of Service, the system should store a record with the user ID, TOS version, and acceptance timestamp.
**Validates: Requirements 20.4**

**Property 70: User data export completeness**
*For any* user data export request, the exported data should include all personal information, orders, subscriptions, and tickets associated with that user.
**Validates: Requirements 20.5**

**Property 71: Account suspension enforcement**
*For any* suspended user account, all attempts to perform actions (create orders, listings, tickets) should be rejected.
**Validates: Requirements 20.6**


## Error Handling

### Error Categories

**1. Validation Errors (4xx)**
- Invalid input data (missing fields, wrong formats)
- Business rule violations (insufficient balance, inactive listing)
- Authentication/authorization failures
- Response: Return descriptive error message to client

**2. External Service Errors (5xx)**
- Telegram Bot API failures (rate limits, permission errors)
- Blockchain node connection failures
- Payment gateway errors
- Response: Retry with exponential backoff, log for investigation

**3. Database Errors (5xx)**
- Connection pool exhaustion
- Constraint violations
- Transaction deadlocks
- Response: Retry transient errors, rollback transactions, alert on persistent failures

**4. System Errors (5xx)**
- Unexpected exceptions
- Resource exhaustion (memory, disk)
- Configuration errors
- Response: Log with full context, alert operations team, return generic error to client

### Error Handling Strategies

**Telegram Bot Operations:**
```typescript
async function inviteUserWithRetry(userId: string, channelId: string): Promise<InviteResult> {
  const maxRetries = 3
  const baseDelay = 1000 // 1 second
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await telegramBot.inviteChatMember(channelId, userId)
      return { success: true, retryable: false }
    } catch (error) {
      if (error.code === 'RATE_LIMIT') {
        const delay = baseDelay * Math.pow(2, attempt)
        await sleep(delay)
        continue
      } else if (error.code === 'PERMISSION_DENIED') {
        await markListingsInactive(channelId)
        return { success: false, error: 'Bot lacks permissions', retryable: false }
      } else if (error.code === 'USER_NOT_FOUND') {
        return { success: false, error: 'Telegram user not found', retryable: false }
      } else {
        // Unexpected error, retry
        if (attempt < maxRetries - 1) {
          await sleep(baseDelay * Math.pow(2, attempt))
          continue
        }
        return { success: false, error: error.message, retryable: true }
      }
    }
  }
  
  return { success: false, error: 'Max retries exceeded', retryable: true }
}
```

**Blockchain Monitoring:**
```typescript
async function monitorBlockchainWithReconnect(network: BlockchainNetwork): Promise<void> {
  while (true) {
    try {
      const connection = await connectToBlockchain(network)
      
      connection.on('transaction', handleTransaction)
      connection.on('error', (error) => {
        logger.error('Blockchain connection error', { network, error })
        connection.close()
      })
      
      // Keep connection alive
      await connection.waitForClose()
      
    } catch (error) {
      logger.error('Failed to connect to blockchain', { network, error })
      await sleep(5000) // Wait 5 seconds before reconnecting
    }
  }
}
```

**Database Transactions:**
```typescript
async function createOrderWithEscrow(orderData: CreateOrderData): Promise<Order> {
  const client = await pool.connect()
  
  try {
    await client.query('BEGIN')
    
    // Create order
    const order = await client.query(
      'INSERT INTO orders (...) VALUES (...) RETURNING *',
      [orderData.buyerId, orderData.listingId, ...]
    )
    
    // Create escrow entry
    await client.query(
      'INSERT INTO escrow_ledger (...) VALUES (...)',
      [order.id, orderData.amount, ...]
    )
    
    await client.query('COMMIT')
    return order.rows[0]
    
  } catch (error) {
    await client.query('ROLLBACK')
    logger.error('Failed to create order with escrow', { error, orderData })
    throw new DatabaseError('Order creation failed', error)
    
  } finally {
    client.release()
  }
}
```

**Payment Verification:**
```typescript
async function verifyPayment(orderId: string, txHash: string): Promise<boolean> {
  try {
    const order = await getOrder(orderId)
    const transaction = await blockchainService.getTransaction(txHash)
    
    // Verify amount within tolerance
    const tolerance = 0.001 // 0.1%
    const expectedAmount = order.amount
    const actualAmount = transaction.amount
    const difference = Math.abs(actualAmount - expectedAmount) / expectedAmount
    
    if (difference > tolerance) {
      logger.warn('Payment amount mismatch', {
        orderId,
        expected: expectedAmount,
        actual: actualAmount,
        difference: difference * 100 + '%'
      })
      return false
    }
    
    // Verify destination address
    if (transaction.to.toLowerCase() !== order.depositAddress.toLowerCase()) {
      logger.warn('Payment address mismatch', {
        orderId,
        expected: order.depositAddress,
        actual: transaction.to
      })
      return false
    }
    
    // Verify confirmations
    const requiredConfirmations = getRequiredConfirmations(order.currency)
    if (transaction.confirmations < requiredConfirmations) {
      logger.info('Payment pending confirmations', {
        orderId,
        current: transaction.confirmations,
        required: requiredConfirmations
      })
      return false
    }
    
    return true
    
  } catch (error) {
    logger.error('Payment verification failed', { orderId, txHash, error })
    throw error
  }
}
```

### Error Response Format

All API errors should follow a consistent format:

```typescript
interface ErrorResponse {
  error: {
    code: string           // Machine-readable error code
    message: string        // Human-readable error message
    details?: any          // Additional error context
    retryable: boolean     // Whether the client should retry
    timestamp: string      // ISO 8601 timestamp
    requestId: string      // Unique request identifier for tracing
  }
}
```

Example error responses:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Merchant balance insufficient for withdrawal",
    "details": {
      "requested": 100.5,
      "available": 50.25,
      "currency": "USDT_BEP20"
    },
    "retryable": false,
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req_abc123"
  }
}
```

```json
{
  "error": {
    "code": "BOT_PERMISSION_DENIED",
    "message": "Bot lacks admin permissions in channel",
    "details": {
      "channelId": "ch_xyz789",
      "requiredPermissions": ["can_invite_users", "can_restrict_members"]
    },
    "retryable": false,
    "timestamp": "2024-01-15T10:31:00Z",
    "requestId": "req_def456"
  }
}
```


## Testing Strategy

### Dual Testing Approach

The platform requires both unit tests and property-based tests for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs through randomization

Both testing approaches are complementary and necessary. Unit tests catch concrete bugs in specific scenarios, while property tests verify general correctness across a wide input space.

### Property-Based Testing Configuration

**Library Selection:**
- **TypeScript/JavaScript**: fast-check
- **Python**: Hypothesis

**Configuration Requirements:**
- Minimum 100 iterations per property test (due to randomization)
- Each property test must reference its design document property
- Tag format: `Feature: telegram-signals-marketplace, Property {number}: {property_text}`
- Each correctness property must be implemented by a SINGLE property-based test

**Example Property Test (TypeScript with fast-check):**

```typescript
import fc from 'fast-check'

describe('Listing Properties', () => {
  // Feature: telegram-signals-marketplace, Property 1: Unified catalog completeness
  it('should return listings from all merchants in unified catalog', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(merchantWithListingsArbitrary(), { minLength: 1, maxLength: 10 }),
        async (merchants) => {
          // Setup: Create merchants and their listings
          for (const merchant of merchants) {
            await createMerchant(merchant)
            for (const listing of merchant.listings) {
              await createListing(merchant.id, listing)
            }
          }
          
          // Query unified catalog
          const catalog = await listingService.searchListings({ limit: 1000, offset: 0 })
          
          // Verify all listings are present
          const expectedListingIds = merchants.flatMap(m => m.listings.map(l => l.id))
          const actualListingIds = catalog.listings.map(l => l.id)
          
          expect(actualListingIds).toEqual(expect.arrayContaining(expectedListingIds))
          expect(actualListingIds.length).toBe(expectedListingIds.length)
          
          // Verify each listing is accessible by ID
          for (const listingId of expectedListingIds) {
            const listing = await listingService.getListing(listingId)
            expect(listing).toBeDefined()
            expect(listing.id).toBe(listingId)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
  
  // Feature: telegram-signals-marketplace, Property 17: Deposit address uniqueness
  it('should generate unique deposit addresses for all orders', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(orderRequestArbitrary(), { minLength: 2, maxLength: 50 }),
        async (orderRequests) => {
          // Generate deposit addresses for all orders
          const addresses = await Promise.all(
            orderRequests.map(req => paymentService.generateDepositAddress(req.orderId, req.currency))
          )
          
          // Verify all addresses are unique
          const uniqueAddresses = new Set(addresses)
          expect(uniqueAddresses.size).toBe(addresses.length)
        }
      ),
      { numRuns: 100 }
    )
  })
  
  // Feature: telegram-signals-marketplace, Property 26: Pro-rated refund calculation
  it('should calculate pro-rated refunds correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        subscriptionArbitrary(),
        fc.integer({ min: 0, max: 100 }), // days elapsed
        async (subscription, daysElapsed) => {
          // Setup subscription with known payment amount and duration
          const paymentAmount = 100
          const totalDays = subscription.durationDays
          
          // Simulate time passing
          const currentDate = new Date(subscription.startDate.getTime() + daysElapsed * 24 * 60 * 60 * 1000)
          const unusedDays = Math.max(0, totalDays - daysElapsed)
          
          // Calculate refund
          const refund = await escrowService.calculateProRatedRefund(subscription, currentDate)
          
          // Verify formula: (payment amount) × (unused days / total days)
          const expectedRefund = paymentAmount * (unusedDays / totalDays)
          expect(refund).toBeCloseTo(expectedRefund, 2)
          
          // Verify refund is never negative
          expect(refund).toBeGreaterThanOrEqual(0)
          
          // Verify refund never exceeds payment amount
          expect(refund).toBeLessThanOrEqual(paymentAmount)
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

**Example Property Test (Python with Hypothesis):**

```python
from hypothesis import given, strategies as st
import pytest

class TestListingProperties:
    # Feature: telegram-signals-marketplace, Property 2: Multi-vendor channel support
    @given(
        channel_id=st.text(min_size=1, max_size=50),
        merchants=st.lists(
            st.builds(Merchant, 
                id=st.uuids(),
                username=st.text(min_size=3, max_size=20)
            ),
            min_size=2,
            max_size=5
        ),
        listings=st.lists(
            st.builds(ListingData,
                price=st.floats(min_value=0.01, max_value=1000),
                duration_days=st.integers(min_value=1, max_value=365)
            ),
            min_size=1,
            max_size=3
        )
    )
    @pytest.mark.asyncio
    async def test_multiple_merchants_can_list_same_channel(self, channel_id, merchants, listings):
        # Create channel
        channel = await create_channel(channel_id)
        
        # Each merchant creates listings for the same channel
        created_listings = []
        for merchant in merchants:
            await create_merchant(merchant)
            for listing_data in listings:
                listing = await listing_service.create_listing(
                    merchant.id,
                    CreateListingRequest(
                        channel_id=channel.id,
                        price=listing_data.price,
                        duration_days=listing_data.duration_days,
                        **listing_data.other_fields
                    )
                )
                created_listings.append(listing)
        
        # Verify all listings exist and are associated with correct channel
        for listing in created_listings:
            retrieved = await listing_service.get_listing(listing.id)
            assert retrieved is not None
            assert retrieved.channel_id == channel.id
        
        # Verify we have listings from multiple merchants for same channel
        merchant_ids = {listing.merchant_id for listing in created_listings}
        assert len(merchant_ids) >= 2
```

### Unit Testing Strategy

Unit tests should focus on:

1. **Specific Examples**: Test concrete scenarios with known inputs and outputs
2. **Edge Cases**: Test boundary conditions (empty lists, zero amounts, maximum values)
3. **Error Conditions**: Test validation failures, permission denials, and exception handling
4. **Integration Points**: Test interactions between services with mocked dependencies

**Example Unit Tests:**

```typescript
describe('OrderService', () => {
  describe('createOrder', () => {
    it('should create order with all required fields', async () => {
      const buyerId = 'buyer_123'
      const listingId = 'listing_456'
      
      const order = await orderService.createOrder(buyerId, listingId)
      
      expect(order.id).toBeDefined()
      expect(order.buyerId).toBe(buyerId)
      expect(order.listingId).toBe(listingId)
      expect(order.depositAddress).toBeDefined()
      expect(order.status).toBe('pending_payment')
      expect(order.expiresAt).toBeInstanceOf(Date)
    })
    
    it('should reject order for inactive listing', async () => {
      const buyerId = 'buyer_123'
      const inactiveListing = await createListing({ status: 'inactive' })
      
      await expect(
        orderService.createOrder(buyerId, inactiveListing.id)
      ).rejects.toThrow('Cannot purchase inactive listing')
    })
    
    it('should set expiration 24 hours from creation', async () => {
      const before = new Date()
      const order = await orderService.createOrder('buyer_123', 'listing_456')
      const after = new Date()
      
      const expectedExpiry = new Date(before.getTime() + 24 * 60 * 60 * 1000)
      const timeDiff = Math.abs(order.expiresAt.getTime() - expectedExpiry.getTime())
      
      expect(timeDiff).toBeLessThan(1000) // Within 1 second
    })
  })
  
  describe('expireUnpaidOrders', () => {
    it('should expire orders past expiration time', async () => {
      // Create order that expired 1 hour ago
      const expiredOrder = await createOrder({
        status: 'pending_payment',
        expiresAt: new Date(Date.now() - 60 * 60 * 1000)
      })
      
      await orderService.expireUnpaidOrders()
      
      const updated = await orderService.getOrder(expiredOrder.id)
      expect(updated.status).toBe('expired')
    })
    
    it('should not expire orders with confirmed payment', async () => {
      const paidOrder = await createOrder({
        status: 'payment_confirmed',
        expiresAt: new Date(Date.now() - 60 * 60 * 1000)
      })
      
      await orderService.expireUnpaidOrders()
      
      const updated = await orderService.getOrder(paidOrder.id)
      expect(updated.status).toBe('payment_confirmed')
    })
  })
})

describe('EscrowService', () => {
  describe('calculateProRatedRefund', () => {
    it('should return full amount for unused subscription', async () => {
      const subscription = {
        startDate: new Date('2024-01-01'),
        expiryDate: new Date('2024-01-31'),
        durationDays: 30
      }
      const paymentAmount = 100
      const currentDate = new Date('2024-01-01') // Same as start
      
      const refund = await escrowService.calculateProRatedRefund(
        subscription,
        paymentAmount,
        currentDate
      )
      
      expect(refund).toBe(100)
    })
    
    it('should return zero for fully used subscription', async () => {
      const subscription = {
        startDate: new Date('2024-01-01'),
        expiryDate: new Date('2024-01-31'),
        durationDays: 30
      }
      const paymentAmount = 100
      const currentDate = new Date('2024-01-31') // At expiry
      
      const refund = await escrowService.calculateProRatedRefund(
        subscription,
        paymentAmount,
        currentDate
      )
      
      expect(refund).toBe(0)
    })
    
    it('should return half amount for half-used subscription', async () => {
      const subscription = {
        startDate: new Date('2024-01-01'),
        expiryDate: new Date('2024-01-31'),
        durationDays: 30
      }
      const paymentAmount = 100
      const currentDate = new Date('2024-01-16') // 15 days used, 15 remaining
      
      const refund = await escrowService.calculateProRatedRefund(
        subscription,
        paymentAmount,
        currentDate
      )
      
      expect(refund).toBeCloseTo(50, 2)
    })
  })
})
```

### Integration Testing

Integration tests verify interactions between components:

```typescript
describe('Purchase Flow Integration', () => {
  it('should complete full purchase flow from order to subscription', async () => {
    // Setup
    const merchant = await createMerchant()
    const channel = await createChannel({ botIsAdmin: true })
    const listing = await createListing({
      merchantId: merchant.id,
      channelId: channel.id,
      price: 50,
      currency: 'USDT_BEP20',
      durationDays: 30
    })
    const buyer = await createUser({ role: 'buyer' })
    
    // Step 1: Create order
    const order = await orderService.createOrder(buyer.id, listing.id)
    expect(order.status).toBe('pending_payment')
    expect(order.depositAddress).toBeDefined()
    
    // Step 2: Simulate payment
    const txHash = await simulateBlockchainPayment(
      order.depositAddress,
      order.amount,
      order.currency
    )
    
    // Step 3: Wait for payment confirmation
    await waitForConfirmations(txHash, 12)
    
    // Step 4: Verify order updated
    const updatedOrder = await orderService.getOrder(order.id)
    expect(updatedOrder.status).toBe('payment_confirmed')
    
    // Step 5: Verify subscription created
    const subscriptions = await subscriptionService.getBuyerSubscriptions(buyer.id)
    expect(subscriptions).toHaveLength(1)
    expect(subscriptions[0].listingId).toBe(listing.id)
    expect(subscriptions[0].status).toBe('active')
    
    // Step 6: Verify escrow created
    const escrow = await escrowService.getEscrowByOrder(order.id)
    expect(escrow.status).toBe('held')
    expect(escrow.amount).toBe(order.amount)
    
    // Step 7: Verify bot invited user
    const botInvites = await getBotInvites()
    expect(botInvites).toContainEqual({
      userId: buyer.telegramUserId,
      channelId: channel.telegramChannelId
    })
  })
})
```

### Test Data Generators (Arbitraries)

For property-based testing, define generators for domain objects:

```typescript
// fast-check arbitraries
const merchantArbitrary = () => fc.record({
  id: fc.uuid(),
  username: fc.string({ minLength: 3, maxLength: 20 }),
  storefrontSlug: fc.string({ minLength: 3, maxLength: 50 })
})

const listingArbitrary = () => fc.record({
  id: fc.uuid(),
  merchantId: fc.uuid(),
  channelId: fc.uuid(),
  price: fc.float({ min: 0.01, max: 10000, noNaN: true }),
  currency: fc.constantFrom('BNB', 'USDT_BEP20', 'USDC_BEP20', 'BTC', 'USDT_TRC20'),
  durationDays: fc.integer({ min: 1, max: 365 }),
  description: fc.string({ minLength: 10, maxLength: 500 })
})

const subscriptionArbitrary = () => fc.record({
  id: fc.uuid(),
  buyerId: fc.uuid(),
  listingId: fc.uuid(),
  orderId: fc.uuid(),
  channelId: fc.uuid(),
  startDate: fc.date(),
  durationDays: fc.integer({ min: 1, max: 365 })
}).map(sub => ({
  ...sub,
  expiryDate: new Date(sub.startDate.getTime() + sub.durationDays * 24 * 60 * 60 * 1000)
}))
```

### Test Coverage Goals

- **Unit Test Coverage**: Minimum 80% line coverage for business logic
- **Property Test Coverage**: All 71 correctness properties implemented
- **Integration Test Coverage**: All critical user flows (purchase, refund, payout)
- **E2E Test Coverage**: Key user journeys through UI

### Continuous Integration

All tests should run on every commit:

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run property tests
        run: npm run test:property
      
      - name: Run integration tests
        run: npm run test:integration
      
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

