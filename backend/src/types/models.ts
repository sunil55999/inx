/**
 * Data Models and Types for Telegram Signals Marketplace
 * 
 * This file contains all TypeScript interfaces and types for the platform's data models.
 * These types correspond to the database schema and are used throughout the application.
 * 
 * Requirements: 1.1, 1.5, 1.6, 3.2, 4.1, 5.1, 6.1, 12.1
 */

// ============================================================================
// Enums and Type Aliases
// ============================================================================

/**
 * Supported cryptocurrency types for payments and payouts
 */
export type CryptoCurrency = 
  | 'BNB'           // BNB Chain native token
  | 'USDT_BEP20'    // USDT on BNB Chain (BEP-20)
  | 'USDC_BEP20'    // USDC on BNB Chain (BEP-20)
  | 'BTC'           // Bitcoin
  | 'USDT_TRC20'    // USDT on TRON (TRC-20)

/**
 * Order status throughout the payment lifecycle
 */
export enum OrderStatus {
  PENDING_PAYMENT = 'pending_payment',       // Order created, awaiting payment
  PAYMENT_DETECTED = 'payment_detected',     // Transaction detected, awaiting confirmations
  PAYMENT_CONFIRMED = 'payment_confirmed',   // Payment confirmed with sufficient confirmations
  SUBSCRIPTION_ACTIVE = 'subscription_active', // Subscription activated
  EXPIRED = 'expired',                       // Order expired without payment
  REFUNDED = 'refunded'                      // Order refunded
}

/**
 * Subscription status throughout its lifecycle
 */
export enum SubscriptionStatus {
  PENDING_ACTIVATION = 'pending_activation', // Created, awaiting bot invite
  ACTIVE = 'active',                         // User has active access to channel
  EXPIRED = 'expired',                       // Subscription period ended
  REFUNDED = 'refunded',                     // Subscription refunded
  CANCELLED = 'cancelled'                    // Subscription cancelled by user or admin
}

/**
 * Dispute status in the resolution workflow
 */
export enum DisputeStatus {
  OPEN = 'open',                 // Dispute created, awaiting review
  IN_PROGRESS = 'in_progress',   // Admin reviewing dispute
  RESOLVED = 'resolved',         // Dispute resolved with decision
  CLOSED = 'closed'              // Dispute closed
}

/**
 * Payout status for merchant withdrawals
 */
export enum PayoutStatus {
  PENDING = 'pending',           // Payout requested, awaiting processing
  PROCESSING = 'processing',     // Payout transaction being created
  COMPLETED = 'completed',       // Payout successfully sent
  FAILED = 'failed'              // Payout failed, balance restored
}

/**
 * Escrow entry status
 */
export enum EscrowStatus {
  HELD = 'held',                 // Funds held in escrow
  RELEASED = 'released',         // Funds released to merchant
  REFUNDED = 'refunded'          // Funds refunded to buyer
}

/**
 * Listing status
 */
export enum ListingStatus {
  ACTIVE = 'active',             // Listing available for purchase
  INACTIVE = 'inactive',         // Listing not available (bot permissions lost)
  SUSPENDED = 'suspended'        // Listing suspended by admin
}

/**
 * User role types
 */
export enum UserRole {
  BUYER = 'buyer',               // Regular user who purchases subscriptions
  MERCHANT = 'merchant',         // Vendor who sells channel access
  ADMIN = 'admin'                // Platform administrator
}

/**
 * Telegram channel type
 */
export enum ChannelType {
  CHANNEL = 'channel',           // Telegram channel
  GROUP = 'group',               // Telegram group
  SUPERGROUP = 'supergroup'      // Telegram supergroup
}

/**
 * Notification type
 */
export enum NotificationType {
  ORDER_CREATED = 'order_created',
  PAYMENT_RECEIVED = 'payment_received',
  SUBSCRIPTION_ACTIVATED = 'subscription_activated',
  SUBSCRIPTION_EXPIRING = 'subscription_expiring',
  SUBSCRIPTION_EXPIRED = 'subscription_expired',
  DISPUTE_CREATED = 'dispute_created',
  DISPUTE_RESOLVED = 'dispute_resolved',
  PAYOUT_COMPLETED = 'payout_completed',
  PAYOUT_FAILED = 'payout_failed',
  LISTING_INACTIVE = 'listing_inactive'
}

// ============================================================================
// Core Data Models
// ============================================================================

/**
 * User account
 * Represents a platform user (buyer, merchant, or admin)
 */
export interface User {
  id: string
  username: string
  role: UserRole
  email?: string
  telegramUserId?: number
  createdAt: Date
  updatedAt: Date
}

/**
 * WebAuthn credential for biometric authentication
 */
export interface WebAuthnCredential {
  id: string
  userId: string
  credentialId: string
  publicKey: string
  counter: number
  createdAt: Date
}

/**
 * Merchant profile
 * Extended information for users who sell channel access
 */
export interface Merchant {
  id: string
  userId: string
  storefrontSlug: string
  displayName?: string
  description?: string
  profileImageUrl?: string
  totalSales: number
  isVerified: boolean
  isSuspended: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Telegram channel information
 */
export interface Channel {
  id: string
  telegramChannelId: number
  channelName: string
  channelUsername?: string
  channelType: ChannelType
  botIsAdmin: boolean
  lastPermissionCheck?: Date
  createdAt: Date
  updatedAt: Date
}

/**
 * Channel listing offered by a merchant
 */
export interface Listing {
  id: string
  merchantId: string
  channelId: string
  description: string
  price: number
  currency: CryptoCurrency
  durationDays: number
  signalTypes?: string[]
  status: ListingStatus
  viewCount: number
  purchaseCount: number
  createdAt: Date
  updatedAt: Date
}

/**
 * Purchase order linking buyer, listing, and payment
 */
export interface Order {
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

/**
 * Active subscription granting channel access
 */
export interface Subscription {
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

/**
 * Escrow ledger entry for payment holding
 */
export interface EscrowEntry {
  id: string
  orderId: string
  subscriptionId?: string
  amount: number
  currency: CryptoCurrency
  status: EscrowStatus
  platformFee: number
  merchantAmount?: number
  createdAt: Date
  releasedAt?: Date
}

/**
 * Merchant balance for each cryptocurrency
 */
export interface MerchantBalance {
  id: string
  merchantId: string
  currency: CryptoCurrency
  availableBalance: number
  pendingBalance: number
  totalEarned: number
  totalWithdrawn: number
  updatedAt: Date
}

/**
 * Payout request for merchant withdrawal
 */
export interface Payout {
  id: string
  merchantId: string
  amount: number
  currency: CryptoCurrency
  walletAddress: string
  status: PayoutStatus
  transactionHash?: string
  errorMessage?: string
  createdAt: Date
  processedAt?: Date
}

/**
 * Dispute/ticket for support and refund requests
 */
export interface Dispute {
  id: string
  buyerId: string
  orderId: string
  issue: string
  status: DisputeStatus
  resolution?: string
  adminId?: string
  createdAt: Date
  resolvedAt?: Date
}

/**
 * Blockchain transaction record
 */
export interface Transaction {
  id: string
  orderId: string
  transactionHash: string
  fromAddress: string
  toAddress: string
  amount: number
  currency: CryptoCurrency
  confirmations: number
  blockNumber?: number
  detectedAt: Date
  confirmedAt?: Date
}

/**
 * Notification sent to users
 */
export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  relatedEntityId?: string
  isRead: boolean
  createdAt: Date
}

/**
 * Audit log for admin actions
 */
export interface AuditLog {
  id: string
  adminId: string
  action: string
  entityType: string
  entityId: string
  changes?: Record<string, any>
  ipAddress?: string
  createdAt: Date
}

// ============================================================================
// Request/Response DTOs
// ============================================================================

/**
 * Request to create a new listing
 */
export interface CreateListingRequest {
  channelId: string
  channelName: string
  description: string
  price: number
  currency: CryptoCurrency
  durationDays: number
  signalTypes?: string[]
}

/**
 * Request to update a listing
 */
export interface UpdateListingRequest {
  description?: string
  price?: number
  durationDays?: number
  signalTypes?: string[]
  status?: ListingStatus
}

/**
 * Search query for listings
 */
export interface SearchQuery {
  text?: string
  merchantId?: string
  minPrice?: number
  maxPrice?: number
  currency?: CryptoCurrency
  signalTypes?: string[]
  sortBy?: 'price_asc' | 'price_desc' | 'popularity' | 'newest'
  limit: number
  offset: number
}

/**
 * Search result with pagination
 */
export interface SearchResult<T> {
  items: T[]
  total: number
  hasMore: boolean
  limit: number
  offset: number
}

/**
 * Request to create an order
 */
export interface CreateOrderRequest {
  listingId: string
}

/**
 * Request to create a dispute
 */
export interface CreateDisputeRequest {
  orderId: string
  issue: string
}

/**
 * Request to resolve a dispute (admin)
 */
export interface ResolveDisputeRequest {
  resolution: string
  approveRefund: boolean
  refundAmount?: number
}

/**
 * Request to create a payout
 */
export interface CreatePayoutRequest {
  amount: number
  currency: CryptoCurrency
  walletAddress: string
}

/**
 * Request to update merchant profile
 */
export interface UpdateMerchantProfileRequest {
  displayName?: string
  description?: string
  profileImageUrl?: string
}

// ============================================================================
// Service Response Types
// ============================================================================

/**
 * Result of a bot operation
 */
export interface BotOperationResult {
  success: boolean
  error?: string
  retryable: boolean
}

/**
 * Bot permission check result
 */
export interface PermissionCheck {
  isAdmin: boolean
  canInviteUsers: boolean
  canRemoveUsers: boolean
  channelExists: boolean
}

/**
 * Transaction verification result
 */
export interface TransactionVerification {
  isValid: boolean
  amount: number
  confirmations: number
  fromAddress: string
  toAddress: string
  timestamp: Date
}

/**
 * Refund calculation result
 */
export interface RefundResult {
  refundAmount: number
  merchantPenalty: number
  buyerReceives: number
  transactionHash?: string
}

/**
 * Balance breakdown for merchant
 */
export interface BalanceBreakdown {
  merchantId: string
  balances: Record<CryptoCurrency, {
    available: number
    pending: number
    totalEarned: number
    totalWithdrawn: number
  }>
}

/**
 * Platform metrics for admin dashboard
 */
export interface PlatformMetrics {
  activeSubscriptions: number
  pendingDisputes: number
  totalEscrowBalance: Record<CryptoCurrency, number>
  recentTransactions: number
  totalUsers: number
  totalMerchants: number
  totalListings: number
}

// ============================================================================
// Extended Models with Relations
// ============================================================================

/**
 * Listing with related merchant and channel information
 */
export interface ListingWithRelations extends Listing {
  merchant?: Merchant
  channel?: Channel
}

/**
 * Order with related listing and buyer information
 */
export interface OrderWithRelations extends Order {
  listing?: Listing
  buyer?: User
  subscription?: Subscription
  transactions?: Transaction[]
}

/**
 * Subscription with related listing, order, and channel information
 */
export interface SubscriptionWithRelations extends Subscription {
  listing?: Listing
  order?: Order
  channel?: Channel
  buyer?: User
}

/**
 * Dispute with related order and user information
 */
export interface DisputeWithRelations extends Dispute {
  order?: OrderWithRelations
  buyer?: User
  admin?: User
}

/**
 * Merchant with user information
 */
export interface MerchantWithUser extends Merchant {
  user?: User
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Pagination parameters
 */
export interface PaginationParams {
  limit: number
  offset: number
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

/**
 * API error response
 */
export interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: any
    retryable: boolean
    timestamp: string
    requestId: string
  }
}

/**
 * Session token for authentication
 */
export interface SessionToken {
  token: string
  expiresAt: Date
  userId: string
  role: UserRole
}

/**
 * Blockchain network types
 */
export type BlockchainNetwork = 'BNB_CHAIN' | 'BITCOIN' | 'TRON'

/**
 * Minimum payout thresholds by currency
 */
export const MINIMUM_PAYOUT_THRESHOLDS: Record<CryptoCurrency, number> = {
  BNB: 0.01,
  USDT_BEP20: 10,
  USDC_BEP20: 10,
  BTC: 0.001,
  USDT_TRC20: 10
}

/**
 * Required blockchain confirmations by currency
 */
export const REQUIRED_CONFIRMATIONS: Record<CryptoCurrency, number> = {
  BNB: 12,
  USDT_BEP20: 12,
  USDC_BEP20: 12,
  BTC: 3,
  USDT_TRC20: 19
}

/**
 * Payment amount tolerance (0.1%)
 */
export const PAYMENT_TOLERANCE = 0.001

/**
 * Order expiration time in milliseconds (24 hours)
 */
export const ORDER_EXPIRATION_MS = 24 * 60 * 60 * 1000

/**
 * Default platform fee percentage
 */
export const DEFAULT_PLATFORM_FEE = 0.05 // 5%
