/**
 * Notification Worker
 * 
 * Standalone worker process that consumes notification messages from SQS
 * and sends emails via AWS SES
 * 
 * Usage:
 *   npm run worker:notifications
 *   or
 *   ts-node src/workers/notificationWorker.ts
 * 
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
 */

import { notificationQueueConsumer } from '../services/NotificationQueueConsumer';
import { logger } from '../utils/logger';

/**
 * Start the notification worker
 */
async function startWorker(): Promise<void> {
  logger.info('Starting notification worker...');

  try {
    // Start the consumer
    await notificationQueueConsumer.start();

    logger.info('Notification worker started successfully');

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      await notificationQueueConsumer.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully...');
      await notificationQueueConsumer.stop();
      process.exit(0);
    });

  } catch (error: any) {
    logger.error('Failed to start notification worker', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Start the worker
startWorker();
