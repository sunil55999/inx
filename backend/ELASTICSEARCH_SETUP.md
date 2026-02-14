# Elasticsearch Setup Guide

This guide explains how to set up and use Elasticsearch for full-text search in the Telegram Signals Marketplace.

## Overview

Elasticsearch provides powerful full-text search capabilities for listing discovery. It supports:

- **Full-text search** across channel names, descriptions, and merchant usernames
- **Fuzzy matching** with automatic edit distance (≤ 2)
- **Relevance ranking** with field boosting
- **Autocomplete suggestions** for search queries
- **Filtering** by merchant, price range, currency, and signal types
- **Sorting** by price, popularity, or date

## Requirements

- Elasticsearch 8.x
- Node.js 18+
- PostgreSQL (primary data store)

## Local Development Setup

### Option 1: Using Docker Compose (Recommended)

The easiest way to run Elasticsearch locally is using Docker Compose:

```bash
# Start all services including Elasticsearch
docker-compose up -d

# Check Elasticsearch health
curl http://localhost:9200/_cluster/health
```

### Option 2: Manual Installation

1. **Download and install Elasticsearch:**
   ```bash
   # macOS (using Homebrew)
   brew tap elastic/tap
   brew install elastic/tap/elasticsearch-full

   # Linux
   wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-8.11.0-linux-x86_64.tar.gz
   tar -xzf elasticsearch-8.11.0-linux-x86_64.tar.gz
   cd elasticsearch-8.11.0/

   # Windows
   # Download from https://www.elastic.co/downloads/elasticsearch
   ```

2. **Configure Elasticsearch for development:**
   
   Edit `config/elasticsearch.yml`:
   ```yaml
   cluster.name: telegram-signals-dev
   network.host: 0.0.0.0
   discovery.type: single-node
   xpack.security.enabled: false
   ```

3. **Start Elasticsearch:**
   ```bash
   # macOS/Linux
   ./bin/elasticsearch

   # Windows
   bin\elasticsearch.bat
   ```

4. **Verify it's running:**
   ```bash
   curl http://localhost:9200
   ```

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Elasticsearch Configuration
ELASTICSEARCH_NODE=http://localhost:9200
ELASTICSEARCH_USERNAME=
ELASTICSEARCH_PASSWORD=
USE_ELASTICSEARCH=true
```

For production with authentication:

```env
ELASTICSEARCH_NODE=https://your-elasticsearch-cluster.com:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=your-secure-password
USE_ELASTICSEARCH=true
```

### Disabling Elasticsearch

To disable Elasticsearch and use PostgreSQL full-text search instead:

```env
USE_ELASTICSEARCH=false
```

## Index Management

### Automatic Index Creation

The listings index is automatically created when the backend starts. The index includes:

- **Custom analyzer** with lowercase, ASCII folding, stop words, and snowball stemming
- **Field mappings** for all listing properties
- **Multi-field mappings** for text fields (analyzed + keyword)

### Manual Index Creation

If you need to manually create or recreate the index:

```bash
# Delete existing index (if needed)
curl -X DELETE http://localhost:9200/listings

# The index will be automatically recreated on next backend startup
npm run dev
```

### Reindexing All Listings

After setting up Elasticsearch or making index changes, reindex all listings:

```bash
npm run reindex:listings
```

This script:
1. Connects to the database
2. Fetches all listings with related data (merchant, channel)
3. Bulk indexes them in Elasticsearch
4. Processes in batches of 100 for efficiency

## Usage

### Automatic Indexing

Listings are automatically indexed/updated in Elasticsearch when:

- **Creating a listing** - Indexed immediately
- **Updating a listing** - Updated in index
- **Deactivating a listing** - Status updated in index
- **Reactivating a listing** - Status updated in index

### Search API

The search automatically uses Elasticsearch when:
- `USE_ELASTICSEARCH=true` in environment
- A text search query is provided
- Elasticsearch is available

Example search request:

```bash
curl "http://localhost:3000/api/listings?text=crypto&minPrice=10&maxPrice=100&sortBy=popularity&limit=20&offset=0"
```

### Autocomplete API

Get search suggestions:

```bash
curl "http://localhost:3000/api/listings/autocomplete?prefix=cry&limit=10"
```

## Index Schema

### Listings Index

```json
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "listing_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "asciifolding", "stop", "snowball"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "merchant_id": { "type": "keyword" },
      "merchant_username": { 
        "type": "text",
        "analyzer": "listing_analyzer",
        "fields": { "keyword": { "type": "keyword" } }
      },
      "merchant_display_name": {
        "type": "text",
        "analyzer": "listing_analyzer"
      },
      "channel_id": { "type": "keyword" },
      "channel_name": {
        "type": "text",
        "analyzer": "listing_analyzer",
        "fields": { "keyword": { "type": "keyword" } }
      },
      "channel_username": {
        "type": "text",
        "analyzer": "listing_analyzer",
        "fields": { "keyword": { "type": "keyword" } }
      },
      "description": {
        "type": "text",
        "analyzer": "listing_analyzer"
      },
      "price": { "type": "double" },
      "currency": { "type": "keyword" },
      "duration_days": { "type": "integer" },
      "signal_types": { "type": "keyword" },
      "status": { "type": "keyword" },
      "view_count": { "type": "integer" },
      "purchase_count": { "type": "integer" },
      "created_at": { "type": "date" },
      "updated_at": { "type": "date" }
    }
  }
}
```

## Search Features

### Full-Text Search

Searches across multiple fields with boosting:

- **channel_name** (3x boost) - Highest priority
- **channel_username** (2x boost)
- **merchant_username** (2x boost)
- **merchant_display_name** (2x boost)
- **description** (1x boost) - Normal priority

### Fuzzy Matching

Automatically handles typos with edit distance ≤ 2:

- "cryto" → matches "crypto"
- "bitcon" → matches "bitcoin"
- "signls" → matches "signals"

### Relevance Ranking

Results are ranked by:
1. **Exact matches** - Highest score
2. **Partial matches** - Medium score
3. **Fuzzy matches** - Lower score
4. **Field boost** - Channel names ranked higher than descriptions

### Filters

Combine text search with filters:

- **Merchant** - Filter by specific merchant
- **Price range** - Min/max price
- **Currency** - BNB, USDT, USDC, BTC, etc.
- **Signal types** - Forex, Crypto, Stocks, etc.

### Sorting

Sort results by:

- **Relevance** (default for text searches)
- **Price** (ascending/descending)
- **Popularity** (purchase count)
- **Newest** (creation date)

## Monitoring

### Check Cluster Health

```bash
curl http://localhost:9200/_cluster/health?pretty
```

### Check Index Stats

```bash
curl http://localhost:9200/listings/_stats?pretty
```

### View Index Mapping

```bash
curl http://localhost:9200/listings/_mapping?pretty
```

### Search Index Directly

```bash
curl -X POST http://localhost:9200/listings/_search?pretty \
  -H 'Content-Type: application/json' \
  -d '{
    "query": {
      "multi_match": {
        "query": "crypto signals",
        "fields": ["channel_name^3", "description"]
      }
    }
  }'
```

## Troubleshooting

### Elasticsearch Not Starting

1. **Check if port 9200 is available:**
   ```bash
   lsof -i :9200  # macOS/Linux
   netstat -ano | findstr :9200  # Windows
   ```

2. **Check Elasticsearch logs:**
   ```bash
   # Docker
   docker logs telegram-signals-elasticsearch

   # Manual installation
   tail -f logs/telegram-signals-dev.log
   ```

3. **Increase heap size if needed:**
   ```bash
   export ES_JAVA_OPTS="-Xms1g -Xmx1g"
   ```

### Index Not Created

1. **Check backend logs** for Elasticsearch connection errors
2. **Verify environment variables** are set correctly
3. **Manually create index:**
   ```bash
   npm run reindex:listings
   ```

### Search Not Using Elasticsearch

1. **Check `USE_ELASTICSEARCH` environment variable**
2. **Verify Elasticsearch is running:**
   ```bash
   curl http://localhost:9200/_cluster/health
   ```
3. **Check backend logs** for Elasticsearch errors

### Stale Search Results

If search results don't reflect recent changes:

1. **Reindex all listings:**
   ```bash
   npm run reindex:listings
   ```

2. **Check index refresh settings:**
   ```bash
   curl http://localhost:9200/listings/_settings?pretty
   ```

## Production Deployment

### AWS Elasticsearch Service (OpenSearch)

1. **Create an OpenSearch domain** in AWS Console
2. **Configure access policies** for your backend
3. **Update environment variables:**
   ```env
   ELASTICSEARCH_NODE=https://your-domain.us-east-1.es.amazonaws.com
   ELASTICSEARCH_USERNAME=admin
   ELASTICSEARCH_PASSWORD=your-password
   USE_ELASTICSEARCH=true
   ```

### Elastic Cloud

1. **Create a deployment** at https://cloud.elastic.co
2. **Get connection details** from deployment page
3. **Update environment variables:**
   ```env
   ELASTICSEARCH_NODE=https://your-deployment.es.us-east-1.aws.found.io:9243
   ELASTICSEARCH_USERNAME=elastic
   ELASTICSEARCH_PASSWORD=your-password
   USE_ELASTICSEARCH=true
   ```

### Self-Hosted Cluster

For production self-hosted deployments:

1. **Enable security** (TLS, authentication)
2. **Configure replication** (at least 1 replica)
3. **Set up monitoring** (Kibana, Metricbeat)
4. **Configure backups** (snapshots)
5. **Tune JVM heap** (50% of RAM, max 32GB)

## Performance Optimization

### Index Settings

For better performance:

```bash
curl -X PUT http://localhost:9200/listings/_settings \
  -H 'Content-Type: application/json' \
  -d '{
    "index": {
      "refresh_interval": "30s",
      "number_of_replicas": 1
    }
  }'
```

### Bulk Indexing

The reindex script uses bulk operations for efficiency:
- Batches of 100 documents
- Automatic retry on failures
- Progress logging

### Caching

Consider adding Redis caching for:
- Popular search queries
- Autocomplete suggestions
- Frequently accessed listings

## References

- [Elasticsearch Documentation](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
- [Elasticsearch Node.js Client](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html)
- [Full-Text Search Best Practices](https://www.elastic.co/guide/en/elasticsearch/reference/current/full-text-queries.html)
