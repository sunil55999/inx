/**
 * Notification Queue Types
 * 
 * Type definitions for notification queue operations
 */

import { NotificationEvent } from '../services/NotificationService';

/**
 * Notification queue message
 */
export interface NotificationQueueMessage {
  notificationId: string;
  userId: string;
  userEmail: string;
  event: NotificationEvent;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  attemptCount: number;
  maxRetries: number;
  createdAt: string;
}

/**
 * Notification processing result
 */
export interface NotificationProcessingResult {
  success: boolean;
  error?: string;
  retryable: boolean;
  shouldMoveToDeadLetter: boolean;
}
