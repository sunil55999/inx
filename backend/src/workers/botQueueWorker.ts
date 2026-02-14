#!/usr/bin/env node

/**
 * Bot Queue Worker
 * 
 * Standalone worker process for consuming bot operations from SQS
 * 
 * Usage:
 *   npm run worker:bot-queue
 *   or
 *   ts-node src/workers/botQueueWorker.ts
 * 
 * Environment Variables:
 *   BOT_OPERATIONS_QUEUE_URL - SQS queue URL for bot operations
 *   BOT_OPERATIONS_DLQ_URL - SQS dead letter queue URL
 *   TELEGRAM_BOT_TOKEN - Telegram bot API token
 *   AWS_REGION - AWS region (default: us-east-1)
 * 
 * Requirements: 2.6
 */

import dotenv from 'dotenv';
import { TelegramBotService } from '../services/TelegramBotService';
import { BotQueueConsumer } from '../services/BotQueueConsumer';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

/**
 * Main worker function
 */
async function main() {
  logger.info('Starting bot queue worker...');

  try {
    // Initialize Telegram Bot Service
    const botService = new TelegramBotService();
    logger.info('Telegram bot service initialized');

    // Initialize Queue Consumer
    const consumer = new BotQueueConsumer(botService);
    logger.info('Bot queue consumer initialized');

    // Start consuming messages
    await consumer.start();

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        await consumer.stop();
        await botService.stop();
        
        logger.info('Worker shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    logger.info('Bot queue worker is running. Press Ctrl+C to stop.');
  } catch (error: any) {
    logger.error('Failed to start bot queue worker', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Start the worker
main().catch(error => {
  logger.error('Unhandled error in worker', { error });
  process.exit(1);
});
