#!/usr/bin/env node

/**
 * Scheduler Worker
 * 
 * Standalone worker process for running scheduled jobs
 * 
 * Jobs:
 * - Bot admin verification: Daily at 2:00 AM
 * - Subscription expiry: Every hour
 * - Subscription expiry reminders: Every 6 hours
 * - Order expiry: Every 15 minutes
 * 
 * Usage:
 *   npm run worker:scheduler
 *   or
 *   ts-node src/workers/schedulerWorker.ts
 * 
 * Environment Variables:
 *   TELEGRAM_BOT_TOKEN - Telegram bot API token
 *   DATABASE_URL - PostgreSQL connection string
 *   BOT_ADMIN_VERIFICATION_CRON - Cron schedule (default: "0 2 * * *")
 *   SUBSCRIPTION_EXPIRY_CRON - Cron schedule (default: "0 * * * *")
 *   SUBSCRIPTION_REMINDER_CRON - Cron schedule (default: "0 */6 * * *")
 *   ORDER_EXPIRY_CRON - Cron schedule (default: "*/15 * * * *")
 * 
 * Requirements: 2.5, 10.1, 10.2, 10.3, 10.4, 3.6, 12.7
 */

import dotenv from 'dotenv';
import cron from 'node-cron';
import { BotAdminVerificationService } from '../services/BotAdminVerificationService';
import { SubscriptionService } from '../services/SubscriptionService';
import { OrderService } from '../services/OrderService';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

/**
 * Bot admin verification job
 * Runs daily to verify bot admin status for all channels with active listings
 */
async function runBotAdminVerification() {
  logger.info('Starting bot admin verification job');

  try {
    const service = new BotAdminVerificationService();
    const stats = await service.verifyAllChannels();

    logger.info('Bot admin verification job completed', stats);
  } catch (error: any) {
    logger.error('Bot admin verification job failed', {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Subscription expiry job
 * Runs hourly to expire subscriptions and release escrow
 * 
 * Requirements: 10.1, 10.2, 10.3
 */
async function runSubscriptionExpiry() {
  logger.info('Starting subscription expiry job');

  try {
    const subscriptionService = new SubscriptionService();
    const stats = await subscriptionService.expireSubscriptions();

    logger.info('Subscription expiry job completed', stats);
  } catch (error: any) {
    logger.error('Subscription expiry job failed', {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Subscription expiry reminder job
 * Runs every 6 hours to send reminders for subscriptions expiring soon
 * 
 * Requirements: 10.4
 */
async function runSubscriptionReminders() {
  logger.info('Starting subscription reminder job');

  try {
    const subscriptionService = new SubscriptionService();
    const stats = await subscriptionService.sendExpiryReminders();

    logger.info('Subscription reminder job completed', stats);
  } catch (error: any) {
    logger.error('Subscription reminder job failed', {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Order expiry job
 * Runs every 15 minutes to expire unpaid orders
 * 
 * Requirements: 3.6, 12.7
 */
async function runOrderExpiry() {
  logger.info('Starting order expiry job');

  try {
    const orderService = new OrderService();
    const stats = await orderService.expireOrders();

    logger.info('Order expiry job completed', stats);
  } catch (error: any) {
    logger.error('Order expiry job failed', {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Main worker function
 */
async function main() {
  logger.info('Starting scheduler worker...');

  try {
    // Get cron schedules from environment or use defaults
    const botAdminCron = process.env.BOT_ADMIN_VERIFICATION_CRON || '0 2 * * *';
    const subscriptionExpiryCron = process.env.SUBSCRIPTION_EXPIRY_CRON || '0 * * * *';
    const subscriptionReminderCron = process.env.SUBSCRIPTION_REMINDER_CRON || '0 */6 * * *';
    const orderExpiryCron = process.env.ORDER_EXPIRY_CRON || '*/15 * * * *';

    logger.info('Scheduling jobs', {
      botAdminVerification: botAdminCron,
      subscriptionExpiry: subscriptionExpiryCron,
      subscriptionReminder: subscriptionReminderCron,
      orderExpiry: orderExpiryCron,
    });

    // Schedule bot admin verification job (daily at 2:00 AM)
    const botAdminTask = cron.schedule(botAdminCron, async () => {
      await runBotAdminVerification();
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'UTC',
    });

    // Schedule subscription expiry job (every hour)
    const subscriptionExpiryTask = cron.schedule(subscriptionExpiryCron, async () => {
      await runSubscriptionExpiry();
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'UTC',
    });

    // Schedule subscription reminder job (every 6 hours)
    const subscriptionReminderTask = cron.schedule(subscriptionReminderCron, async () => {
      await runSubscriptionReminders();
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'UTC',
    });

    // Schedule order expiry job (every 15 minutes)
    const orderExpiryTask = cron.schedule(orderExpiryCron, async () => {
      await runOrderExpiry();
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'UTC',
    });

    logger.info('Scheduler worker is running', {
      timezone: process.env.TZ || 'UTC',
    });

    // Run jobs immediately on startup (optional, for testing)
    if (process.env.RUN_ON_STARTUP === 'true') {
      logger.info('Running jobs on startup');
      await runBotAdminVerification();
      await runSubscriptionExpiry();
      await runSubscriptionReminders();
      await runOrderExpiry();
    }

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        botAdminTask.stop();
        subscriptionExpiryTask.stop();
        subscriptionReminderTask.stop();
        orderExpiryTask.stop();
        
        logger.info('Scheduler worker shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    logger.info('Scheduler worker started successfully. Press Ctrl+C to stop.');
  } catch (error: any) {
    logger.error('Failed to start scheduler worker', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Start the worker
main().catch(error => {
  logger.error('Unhandled error in scheduler worker', { error });
  process.exit(1);
});
