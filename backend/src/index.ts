import app from './app';
import { testConnection, closeConnection } from './database/connection';
import { testRedisConnection, closeRedisConnections } from './config/redis';
import { testElasticsearchConnection, initializeElasticsearchIndices } from './config/elasticsearch';
import { telegramBotService } from './services/TelegramBotService';
import { logger } from './utils/logger';

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }

    // Test Redis connection
    const redisConnected = await testRedisConnection();
    if (!redisConnected) {
      throw new Error('Failed to connect to Redis');
    }

    // Test Elasticsearch connection and initialize indices (if enabled)
    const useElasticsearch = process.env.USE_ELASTICSEARCH !== 'false';
    if (useElasticsearch) {
      try {
        const esConnected = await testElasticsearchConnection();
        if (esConnected) {
          await initializeElasticsearchIndices();
          logger.info('✅ Elasticsearch initialized successfully');
        } else {
          logger.warn('⚠️  Elasticsearch connection failed. Search will use database fallback.');
        }
      } catch (error) {
        logger.error('Elasticsearch initialization error:', error);
        logger.warn('⚠️  Continuing without Elasticsearch. Search will use database fallback.');
      }
    } else {
      logger.info('Elasticsearch disabled. Using database for search.');
    }

    // Start Express server
    const server = app.listen(PORT, async () => {
      logger.info(`🚀 Server is running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`API Base URL: ${process.env.API_BASE_URL || `http://localhost:${PORT}`}`);
      
      // Initialize Telegram webhook if webhook URL is configured
      const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
      if (webhookUrl && telegramBotService) {
        try {
          await telegramBotService.initializeWebhook(webhookUrl);
          logger.info('✅ Telegram webhook initialized successfully');
        } catch (error) {
          logger.error('Failed to initialize Telegram webhook:', error);
          logger.warn('⚠️  Bot will not receive updates until webhook is configured');
        }
      } else if (!telegramBotService) {
        logger.warn('⚠️  TELEGRAM_BOT_TOKEN not configured. Bot service not available.');
      } else {
        logger.warn('⚠️  TELEGRAM_WEBHOOK_URL not configured. Bot webhook not initialized.');
        logger.warn('   Set TELEGRAM_WEBHOOK_URL in .env to enable bot functionality');
      }
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Stop Telegram bot
          if (telegramBotService) {
            await telegramBotService.stop();
            logger.info('Telegram bot stopped');
          }
          
          await closeConnection();
          await closeRedisConnections();
          logger.info('All connections closed successfully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
