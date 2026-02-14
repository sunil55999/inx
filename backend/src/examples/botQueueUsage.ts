/**
 * Bot Queue Usage Examples
 * 
 * This file demonstrates how to use the bot operation queue system
 * in various scenarios throughout the application.
 */

import { botQueueProducer } from '../services/BotQueueProducer';
import { logger } from '../utils/logger';

/**
 * Example 1: Enqueue invite operation when subscription is activated
 * 
 * This should be called from the SubscriptionService when a payment
 * is confirmed and a subscription is created.
 */
export async function onSubscriptionActivated(
  subscriptionId: string,
  orderId: string,
  userId: number,
  channelId: string
): Promise<void> {
  try {
    logger.info('Subscription activated, enqueuing invite operation', {
      subscriptionId,
      orderId,
      userId,
      channelId,
    });

    const messageId = await botQueueProducer.enqueueInviteUser(
      userId,
      channelId,
      subscriptionId,
      orderId
    );

    if (messageId) {
      logger.info('Invite operation enqueued successfully', {
        subscriptionId,
        messageId,
      });
    } else {
      logger.error('Failed to enqueue invite operation', {
        subscriptionId,
      });
      
      // Handle failure - maybe store in database for manual processing
      // or trigger an alert
    }
  } catch (error) {
    logger.error('Error enqueuing invite operation', {
      subscriptionId,
      error,
    });
    throw error;
  }
}

/**
 * Example 2: Enqueue remove operation when subscription expires
 * 
 * This should be called from the scheduled job that processes
 * subscription expiries.
 */
export async function onSubscriptionExpired(
  subscriptionId: string,
  userId: number,
  channelId: string
): Promise<void> {
  try {
    logger.info('Subscription expired, enqueuing remove operation', {
      subscriptionId,
      userId,
      channelId,
    });

    const messageId = await botQueueProducer.enqueueRemoveUser(
      userId,
      channelId,
      subscriptionId,
      'expiry'
    );

    if (messageId) {
      logger.info('Remove operation enqueued successfully', {
        subscriptionId,
        messageId,
      });
    } else {
      logger.error('Failed to enqueue remove operation', {
        subscriptionId,
      });
    }
  } catch (error) {
    logger.error('Error enqueuing remove operation', {
      subscriptionId,
      error,
    });
    throw error;
  }
}

/**
 * Example 3: Enqueue remove operation when refund is approved
 * 
 * This should be called from the DisputeService when an admin
 * approves a refund.
 */
export async function onRefundApproved(
  subscriptionId: string,
  userId: number,
  channelId: string
): Promise<void> {
  try {
    logger.info('Refund approved, enqueuing remove operation', {
      subscriptionId,
      userId,
      channelId,
    });

    const messageId = await botQueueProducer.enqueueRemoveUser(
      userId,
      channelId,
      subscriptionId,
      'refund'
    );

    if (messageId) {
      logger.info('Remove operation enqueued successfully', {
        subscriptionId,
        messageId,
      });
    } else {
      logger.error('Failed to enqueue remove operation', {
        subscriptionId,
      });
    }
  } catch (error) {
    logger.error('Error enqueuing remove operation', {
      subscriptionId,
      error,
    });
    throw error;
  }
}

/**
 * Example 4: Enqueue permission verification when listing is created
 * 
 * This should be called from the ListingService before allowing
 * a merchant to create a listing.
 */
export async function verifyChannelPermissions(
  channelId: string,
  listingId?: string
): Promise<void> {
  try {
    logger.info('Verifying channel permissions', {
      channelId,
      listingId,
    });

    const messageId = await botQueueProducer.enqueueVerifyPermissions(
      channelId,
      listingId
    );

    if (messageId) {
      logger.info('Permission verification enqueued successfully', {
        channelId,
        messageId,
      });
    } else {
      logger.error('Failed to enqueue permission verification', {
        channelId,
      });
    }
  } catch (error) {
    logger.error('Error enqueuing permission verification', {
      channelId,
      error,
    });
    throw error;
  }
}

/**
 * Example 5: Batch enqueue operations
 * 
 * This demonstrates how to enqueue multiple operations efficiently,
 * for example when processing multiple subscription expiries.
 */
export async function batchProcessExpiries(
  expiredSubscriptions: Array<{
    subscriptionId: string;
    userId: number;
    channelId: string;
  }>
): Promise<void> {
  logger.info('Batch processing subscription expiries', {
    count: expiredSubscriptions.length,
  });

  const results = await Promise.allSettled(
    expiredSubscriptions.map(sub =>
      botQueueProducer.enqueueRemoveUser(
        sub.userId,
        sub.channelId,
        sub.subscriptionId,
        'expiry'
      )
    )
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  logger.info('Batch processing complete', {
    total: expiredSubscriptions.length,
    successful,
    failed,
  });

  if (failed > 0) {
    logger.error('Some operations failed to enqueue', {
      failed,
      total: expiredSubscriptions.length,
    });
  }
}

/**
 * Example 6: Check if queue is configured before using
 * 
 * This demonstrates how to gracefully handle cases where
 * the queue might not be configured (e.g., in development).
 */
export async function safeEnqueueInvite(
  userId: number,
  channelId: string,
  subscriptionId: string,
  orderId: string
): Promise<boolean> {
  if (!botQueueProducer.isConfigured()) {
    logger.warn('Bot queue not configured, skipping enqueue', {
      subscriptionId,
    });
    return false;
  }

  const messageId = await botQueueProducer.enqueueInviteUser(
    userId,
    channelId,
    subscriptionId,
    orderId
  );

  return !!messageId;
}
