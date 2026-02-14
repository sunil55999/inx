import { SQSClient } from '@aws-sdk/client-sqs';
import { logger } from '../utils/logger';

/**
 * SQS Configuration
 * 
 * Configures AWS SQS client for bot operation queue
 * Supports both AWS and LocalStack for local development
 */

// Determine if we're using LocalStack for local development
const isLocalDevelopment = process.env.NODE_ENV === 'development' || process.env.USE_LOCALSTACK === 'true';

// SQS Client configuration
const sqsConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  ...(isLocalDevelopment && {
    endpoint: process.env.SQS_ENDPOINT || 'http://localhost:4566',
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
  }),
};

// Create SQS client
export const sqsClient = new SQSClient(sqsConfig);

// Queue URLs
export const BOT_OPERATIONS_QUEUE_URL = process.env.BOT_OPERATIONS_QUEUE_URL || '';
export const BOT_OPERATIONS_DLQ_URL = process.env.BOT_OPERATIONS_DLQ_URL || '';

// Validate queue URLs in production
if (process.env.NODE_ENV === 'production') {
  if (!BOT_OPERATIONS_QUEUE_URL) {
    logger.error('BOT_OPERATIONS_QUEUE_URL is not configured');
    throw new Error('BOT_OPERATIONS_QUEUE_URL environment variable is required in production');
  }
  
  if (!BOT_OPERATIONS_DLQ_URL) {
    logger.warn('BOT_OPERATIONS_DLQ_URL is not configured - dead letter queue will not be available');
  }
}

logger.info('SQS client configured', {
  region: sqsConfig.region,
  isLocalDevelopment,
  hasQueueUrl: !!BOT_OPERATIONS_QUEUE_URL,
  hasDlqUrl: !!BOT_OPERATIONS_DLQ_URL,
});
