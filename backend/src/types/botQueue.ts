/**
 * Bot Operation Queue Types
 * 
 * Defines types for bot operations that are queued for asynchronous processing
 */

/**
 * Type of bot operation
 */
export enum BotOperationType {
  INVITE_USER = 'INVITE_USER',
  REMOVE_USER = 'REMOVE_USER',
  VERIFY_PERMISSIONS = 'VERIFY_PERMISSIONS',
}

/**
 * Base bot operation message
 */
export interface BotOperationMessage {
  operationType: BotOperationType;
  timestamp: string;
  attemptCount: number;
  maxRetries: number;
}

/**
 * Invite user operation
 */
export interface InviteUserOperation extends BotOperationMessage {
  operationType: BotOperationType.INVITE_USER;
  userId: number;
  channelId: string;
  subscriptionId: string;
  orderId: string;
}

/**
 * Remove user operation
 */
export interface RemoveUserOperation extends BotOperationMessage {
  operationType: BotOperationType.REMOVE_USER;
  userId: number;
  channelId: string;
  subscriptionId: string;
  reason: 'expiry' | 'refund' | 'cancellation';
}

/**
 * Verify permissions operation
 */
export interface VerifyPermissionsOperation extends BotOperationMessage {
  operationType: BotOperationType.VERIFY_PERMISSIONS;
  channelId: string;
  listingId?: string;
}

/**
 * Union type of all bot operations
 */
export type BotOperation = 
  | InviteUserOperation 
  | RemoveUserOperation 
  | VerifyPermissionsOperation;

/**
 * Result of processing a bot operation
 */
export interface BotOperationResult {
  success: boolean;
  error?: string;
  retryable: boolean;
  shouldMoveToDeadLetter: boolean;
}
