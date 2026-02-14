import { Client } from '@elastic/elasticsearch';
import logger from '../utils/logger';

/**
 * Elasticsearch Configuration
 * 
 * Configures connection to Elasticsearch cluster for full-text search
 * Requirements: 9.1
 */

const elasticsearchConfig = {
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
  auth: process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD
    ? {
        username: process.env.ELASTICSEARCH_USERNAME,
        password: process.env.ELASTICSEARCH_PASSWORD,
      }
    : undefined,
  maxRetries: 5,
  requestTimeout: 60000,
  sniffOnStart: true,
};

// Create Elasticsearch client
export const elasticsearchClient = new Client(elasticsearchConfig);

/**
 * Test Elasticsearch connection
 */
export async function testElasticsearchConnection(): Promise<boolean> {
  try {
    const health = await elasticsearchClient.cluster.health();
    logger.info('Elasticsearch connection successful', { 
      status: health.status,
      cluster_name: health.cluster_name 
    });
    return true;
  } catch (error) {
    logger.error('Elasticsearch connection failed', { error });
    return false;
  }
}

/**
 * Initialize Elasticsearch indices
 */
export async function initializeElasticsearchIndices(): Promise<void> {
  try {
    // Check if listings index exists
    const indexExists = await elasticsearchClient.indices.exists({
      index: 'listings',
    });

    if (!indexExists) {
      logger.info('Creating listings index...');
      await createListingsIndex();
    } else {
      logger.info('Listings index already exists');
    }
  } catch (error) {
    logger.error('Failed to initialize Elasticsearch indices', { error });
    throw error;
  }
}

/**
 * Create listings index with mapping
 */
async function createListingsIndex(): Promise<void> {
  await elasticsearchClient.indices.create({
    index: 'listings',
    settings: {
      number_of_shards: 1,
      number_of_replicas: 1,
      analysis: {
        analyzer: {
          listing_analyzer: {
            type: 'custom',
            tokenizer: 'standard',
            filter: ['lowercase', 'asciifolding', 'stop', 'snowball'],
          },
        },
      },
    },
    mappings: {
      properties: {
        id: {
          type: 'keyword',
        },
        merchant_id: {
          type: 'keyword',
        },
        merchant_username: {
          type: 'text',
          analyzer: 'listing_analyzer',
          fields: {
            keyword: {
              type: 'keyword',
            },
          },
        },
        merchant_display_name: {
          type: 'text',
          analyzer: 'listing_analyzer',
        },
        channel_id: {
          type: 'keyword',
        },
        channel_name: {
          type: 'text',
          analyzer: 'listing_analyzer',
          fields: {
            keyword: {
              type: 'keyword',
            },
          },
        },
        channel_username: {
          type: 'text',
          analyzer: 'listing_analyzer',
          fields: {
            keyword: {
              type: 'keyword',
            },
          },
        },
        description: {
          type: 'text',
          analyzer: 'listing_analyzer',
        },
        price: {
          type: 'double',
        },
        currency: {
          type: 'keyword',
        },
        duration_days: {
          type: 'integer',
        },
        signal_types: {
          type: 'keyword',
        },
        status: {
          type: 'keyword',
        },
        view_count: {
          type: 'integer',
        },
        purchase_count: {
          type: 'integer',
        },
        created_at: {
          type: 'date',
        },
        updated_at: {
          type: 'date',
        },
      },
    },
  });

  logger.info('Listings index created successfully');
}

/**
 * Delete listings index (for testing/reset)
 */
export async function deleteListingsIndex(): Promise<void> {
  try {
    const indexExists = await elasticsearchClient.indices.exists({
      index: 'listings',
    });

    if (indexExists) {
      await elasticsearchClient.indices.delete({
        index: 'listings',
      });
      logger.info('Listings index deleted');
    }
  } catch (error) {
    logger.error('Failed to delete listings index', { error });
    throw error;
  }
}

export default elasticsearchClient;
