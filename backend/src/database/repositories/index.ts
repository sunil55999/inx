/**
 * Repository Layer Index
 * Exports all repository classes for easy importing
 * 
 * Requirements: 1.1, 4.5, 6.7
 */

// Export repository classes
export { BaseRepository } from './BaseRepository';
export { UserRepository } from './UserRepository';
export { MerchantRepository } from './MerchantRepository';
export { ChannelRepository } from './ChannelRepository';
export { ListingRepository } from './ListingRepository';
export { OrderRepository } from './OrderRepository';
export { SubscriptionRepository } from './SubscriptionRepository';
export { EscrowRepository } from './EscrowRepository';
export { DisputeRepository } from './DisputeRepository';
export { PayoutRepository } from './PayoutRepository';
export { TransactionRepository } from './TransactionRepository';
export { MerchantBalanceRepository } from './MerchantBalanceRepository';
export { WebAuthnCredentialRepository } from './WebAuthnCredentialRepository';
export { NotificationRepository } from './NotificationRepository';
export { AuditLogRepository } from './AuditLogRepository';
export { DepositAddressRepository } from './DepositAddressRepository';

// Import classes for singleton instances
import { UserRepository } from './UserRepository';
import { MerchantRepository } from './MerchantRepository';
import { ChannelRepository } from './ChannelRepository';
import { ListingRepository } from './ListingRepository';
import { OrderRepository } from './OrderRepository';
import { SubscriptionRepository } from './SubscriptionRepository';
import { EscrowRepository } from './EscrowRepository';
import { DisputeRepository } from './DisputeRepository';
import { PayoutRepository } from './PayoutRepository';
import { TransactionRepository } from './TransactionRepository';
import { MerchantBalanceRepository } from './MerchantBalanceRepository';
import { WebAuthnCredentialRepository } from './WebAuthnCredentialRepository';
import { NotificationRepository } from './NotificationRepository';
import { AuditLogRepository } from './AuditLogRepository';
import { DepositAddressRepository } from './DepositAddressRepository';

// Create singleton instances for easy access
export const userRepository = new UserRepository();
export const merchantRepository = new MerchantRepository();
export const channelRepository = new ChannelRepository();
export const listingRepository = new ListingRepository();
export const orderRepository = new OrderRepository();
export const subscriptionRepository = new SubscriptionRepository();
export const escrowRepository = new EscrowRepository();
export const disputeRepository = new DisputeRepository();
export const payoutRepository = new PayoutRepository();
export const transactionRepository = new TransactionRepository();
export const merchantBalanceRepository = new MerchantBalanceRepository();
export const webAuthnCredentialRepository = new WebAuthnCredentialRepository();
export const notificationRepository = new NotificationRepository();
export const auditLogRepository = new AuditLogRepository();
export const depositAddressRepository = new DepositAddressRepository();
