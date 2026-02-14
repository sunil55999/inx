import dotenv from 'dotenv';
import { testConnection, closeConnection } from '../database/connection';
import { testElasticsearchConnection, initializeElasticsearchIndices } from '../config/elasticsearch';
import { ListingService } from '../services/ListingService';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

/**
 * Script to reindex all listings in Elasticsearch
 * 
 * Usage: ts-node src/scripts/reindexListings.ts
 * 
 * This script:
 * 1. Connects to the database
 * 2. Connects to Elasticsearch
 * 3. Ensures the listings index exists
 * 4. Fetches all listings from the database
 * 5. Indexes them in Elasticsearch
 */
async function reindexListings() {
  try {
    logger.info('Starting listing reindex process...');

    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }
    logger.info('✅ Database connected');

    // Test Elasticsearch connection
    const esConnected = await testElasticsearchConnection();
    if (!esConnected) {
      throw new Error('Failed to connect to Elasticsearch');
    }
    logger.info('✅ Elasticsearch connected');

    // Initialize Elasticsearch indices
    await initializeElasticsearchIndices();
    logger.info('✅ Elasticsearch indices initialized');

    // Create listing service
    const listingService = new ListingService();

    // Reindex all listings
    await listingService.reindexAllListings();

    logger.info('✅ Reindex completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Reindex failed:', error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

// Run the script
reindexListings();
