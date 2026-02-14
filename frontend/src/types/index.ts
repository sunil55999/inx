// Type definitions for the frontend application

export type UserRole = 'buyer' | 'merchant' | 'admin';

export type OrderStatus = 
  | 'pending_payment' 
  | 'payment_received' 
  | 'confirmed' 
  | 'expired' 
  | 'cancelled';

export type SubscriptionStatus = 
  | 'active' 
  | 'expired' 
  | 'cancelled' 
  | 'refunded';

export type DisputeStatus = 
  | 'open' 
  | 'under_review' 
  | 'resolved' 
  | 'rejected';

export type PayoutStatus = 
  | 'pending' 
  | 'processing' 
  | 'completed' 
  | 'failed';

export type CryptoCurrency = 
  | 'BNB' 
  | 'BTC' 
  | 'USDT_BEP20' 
  | 'USDC_BEP20' 
  | 'USDT_TRC20';

export type SignalType = 
  | 'crypto' 
  | 'forex' 
  | 'stocks' 
  | 'options' 
  | 'futures' 
  | 'other';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  createdAt: string;
  isMerchant: boolean;
}

export interface Merchant {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  bio?: string;
  profileImage?: string;
  isVerified: boolean;
  isSuspended: boolean;
  createdAt: string;
}

export interface Listing {
  id: string;
  merchantId: string;
  channelId: string;
  channelName: string;
  channelUsername: string;
  title: string;
  description: string;
  signalType: SignalType;
  priceUsd: number;
  durationDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  merchant?: Merchant;
}

export interface Order {
  id: string;
  userId: string;
  listingId: string;
  status: OrderStatus;
  priceUsd: number;
  cryptoCurrency: CryptoCurrency;
  cryptoAmount: string;
  depositAddress: string;
  qrCode: string;
  expiresAt: string;
  createdAt: string;
  listing?: Listing;
}

export interface Subscription {
  id: string;
  userId: string;
  listingId: string;
  orderId: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  createdAt: string;
  listing?: Listing;
}

export interface Dispute {
  id: string;
  subscriptionId: string;
  buyerId: string;
  merchantId: string;
  reason: string;
  description: string;
  status: DisputeStatus;
  resolution?: string;
  refundAmount?: number;
  createdAt: string;
  resolvedAt?: string;
  subscription?: Subscription;
}

export interface Payout {
  id: string;
  merchantId: string;
  amount: number;
  currency: CryptoCurrency;
  walletAddress: string;
  status: PayoutStatus;
  transactionHash?: string;
  createdAt: string;
  processedAt?: string;
}

export interface MerchantBalance {
  merchantId: string;
  currency: CryptoCurrency;
  availableBalance: number;
  pendingBalance: number;
  totalEarnings: number;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface PlatformMetrics {
  totalUsers: number;
  totalMerchants: number;
  totalListings: number;
  activeSubscriptions: number;
  totalRevenue: number;
  pendingDisputes: number;
  pendingPayouts: number;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: User;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}
