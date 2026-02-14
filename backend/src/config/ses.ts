import { SESClient } from '@aws-sdk/client-ses';
import { logger } from '../utils/logger';

/**
 * AWS SES Configuration
 * 
 * Configures AWS SES client for email sending
 * Supports both AWS and LocalStack for local development
 */

// Determine if we're using LocalStack for local development
const isLocalDevelopment = process.env.NODE_ENV === 'development' || process.env.USE_LOCALSTACK === 'true';

// SES Client configuration
const sesConfig = {
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-1',
  ...(isLocalDevelopment && {
    endpoint: process.env.SES_ENDPOINT || 'http://localhost:4566',
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
  }),
};

// Create SES client
export const sesClient = new SESClient(sesConfig);

// Email configuration
export const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@example.com';
export const EMAIL_SUPPORT = process.env.EMAIL_SUPPORT || 'support@example.com';

// Validate email configuration in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.EMAIL_FROM) {
    logger.error('EMAIL_FROM is not configured');
    throw new Error('EMAIL_FROM environment variable is required in production');
  }
  
  if (!process.env.EMAIL_SUPPORT) {
    logger.warn('EMAIL_SUPPORT is not configured - using default support email');
  }
}

logger.info('SES client configured', {
  region: sesConfig.region,
  isLocalDevelopment,
  emailFrom: EMAIL_FROM,
  emailSupport: EMAIL_SUPPORT,
});
