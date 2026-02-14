# Bot Admin Verification Implementation Summary

## Overview

Implemented a scheduled job system for verifying bot admin permissions across all channels with active listings. This ensures the platform maintains accurate listing status and notifies merchants when the bot loses admin access.

## Components Implemented

### 1. BotAdminVerificationService

**Location:** `backend/src/services/BotAdminVerificationService.ts`

**Purpose:** Core business logic for verifying bot admin status and handling permission changes.

**Key Methods:**
- `verifyAllChannels()`: Main entry point that verifies all channels with active listings
- `verifyChannel()`: Verifies a specific channel's bot admin status
- `handleAdminLoss()`: Deactivates listings and notifies merchants when bot loses admin
- `notifyMerchants()`: Sends notifications to affected merchants
- `getChannelsWithActiveListings()`: Retrieves channels that need verification

**Features:**
- Queries all channels with active listings
- Verifies bot admin permissions via Telegram Bot API
- Updates channel `bot_is_admin` status in database
- Detects when bot loses admin permissions
- Deactivates all listings for affected channels
- Sends notifications to merchants with listing details
- Handles errors gracefully and continues with remaining channels
- Logs detailed statistics and results

### 2. Scheduler Worker

**Location:** `backend/src/workers/schedulerWorker.ts`

**Purpose:** Standalone process that runs scheduled jobs using node-cron.

**Features:**
- Runs bot admin verification daily at 2:00 AM (configurable)
- Supports custom cron schedules via environment variables
- Timezone-aware scheduling
- Optional run-on-startup for testing
- Graceful shutdown handling (SIGTERM, SIGINT)
- Comprehensive logging of job executions

**Configuration:**
- `BOT_ADMIN_VERIFICATION_CRON`: Cron schedule (default: "0 2 * * *")
- `TZ`: Timezone for cron jobs (default: "UTC")
- `RUN_ON_STARTUP`: Run verification immediately on startup (default: "false")

### 3. ChannelRepository Enhancement

**Location:** `backend/src/database/repositories/ChannelRepository.ts`

**New Method:**
- `findWithActiveListings()`: Returns distinct channels that have at least one active listing

This method efficiently queries channels that need verification by joining with the listings table.

### 4. Package Dependencies

**Added:**
- `node-cron`: ^3.0.3 - Cron job scheduling
- `@types/node-cron`: ^3.0.11 - TypeScript types

### 5. NPM Scripts

**Added to package.json:**
- `worker:scheduler`: Run scheduler worker in production
- `worker:scheduler:dev`: Run scheduler worker with auto-reload

### 6. Environment Variables

**Added to .env.example:**
- `BOT_ADMIN_VERIFICATION_CRON`: Cron schedule for bot admin verification
- `TZ`: Timezone for scheduled jobs
- `RUN_ON_STARTUP`: Run verification immediately on startup

### 7. Documentation

**Created:**
- `backend/src/workers/SCHEDULER_README.md`: Comprehensive documentation for the scheduler worker
- `backend/src/services/BOT_ADMIN_VERIFICATION_SUMMARY.md`: This summary document

### 8. Unit Tests

**Location:** `backend/src/services/__tests__/BotAdminVerificationService.test.ts`

**Test Coverage:**
- ✅ Verifies all channels with active listings
- ✅ Handles bot admin loss and deactivates listings
- ✅ Handles bot regaining admin permissions
- ✅ Handles errors gracefully and continues with other channels
- ✅ Does not deactivate listings if no active listings exist
- ✅ Handles notification failures gracefully

**Test Results:** All 6 tests passing

## Workflow

### Daily Verification Process

1. **Scheduler triggers** at configured time (default: 2:00 AM daily)
2. **Service queries** all channels with active listings
3. **For each channel:**
   - Verify bot admin permissions via Telegram Bot API
   - Update channel `bot_is_admin` status in database
   - If bot lost admin:
     - Get all active listings for channel
     - Deactivate all listings
     - Get unique merchant IDs
     - Send notification to each merchant
   - If bot regained admin:
     - Log the event (merchants can manually reactivate)
4. **Log statistics:**
   - Total channels checked
   - Successfully verified
   - Admin losses detected
   - Errors encountered

### Notification Content

When bot loses admin permissions, merchants receive:

**Title:** "Listings Deactivated - Bot Admin Access Lost"

**Message:** "Your {count} listing(s) for channel "{channel_name}" have been deactivated because our bot lost admin permissions. Please ensure the bot has admin access and reactivate your listings."

**Type:** `LISTING_INACTIVE`

## Requirements Satisfied

✅ **Requirement 2.5:** Bot admin verification for all channels with active listings
- Daily cron job verifies bot admin status
- Deactivates listings when bot loses admin
- Sends notifications to affected merchants

## Usage

### Running the Scheduler Worker

**Development:**
```bash
npm run worker:scheduler:dev
```

**Production:**
```bash
npm run worker:scheduler
```

**With custom schedule (every hour for testing):**
```bash
BOT_ADMIN_VERIFICATION_CRON="0 * * * *" npm run worker:scheduler:dev
```

**Run immediately on startup:**
```bash
RUN_ON_STARTUP=true npm run worker:scheduler:dev
```

### Deployment

The scheduler worker should run as a separate process/container in production:

**Docker Compose:**
```yaml
scheduler-worker:
  build: .
  command: npm run worker:scheduler
  environment:
    - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
    - DATABASE_URL=${DATABASE_URL}
    - BOT_ADMIN_VERIFICATION_CRON=0 2 * * *
    - TZ=UTC
  restart: unless-stopped
```

**Kubernetes:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: scheduler-worker
spec:
  replicas: 1  # Only one instance needed
  template:
    spec:
      containers:
      - name: scheduler-worker
        image: your-registry/scheduler-worker:latest
        env:
        - name: BOT_ADMIN_VERIFICATION_CRON
          value: "0 2 * * *"
```

## Monitoring

### Key Metrics

- **Job execution time**: Duration of each verification run
- **Channels verified**: Number of channels checked
- **Admin losses detected**: Channels where bot lost admin
- **Errors**: Failed verification attempts
- **Notifications sent**: Merchants notified

### Log Examples

**Successful run:**
```json
{
  "level": "info",
  "message": "Bot admin verification job completed",
  "totalChannels": 50,
  "verified": 48,
  "adminLost": 2,
  "errors": 0
}
```

**Admin loss detected:**
```json
{
  "level": "warn",
  "message": "Bot lost admin permissions in channel",
  "channelId": "uuid",
  "channelName": "Crypto Signals VIP"
}
```

## Testing

### Run Unit Tests
```bash
npm test -- BotAdminVerificationService.test.ts
```

### Manual Testing
```bash
# Run verification immediately
RUN_ON_STARTUP=true npm run worker:scheduler:dev

# Run every minute for testing
BOT_ADMIN_VERIFICATION_CRON="* * * * *" npm run worker:scheduler:dev
```

## Future Enhancements

Potential improvements for future iterations:

1. **Retry Logic**: Add retry mechanism for failed Telegram API calls
2. **Batch Processing**: Process channels in batches to handle large numbers
3. **Metrics Dashboard**: Add Prometheus/Grafana metrics
4. **Alert System**: Send alerts to admins when high error rates detected
5. **Auto-Reactivation**: Automatically reactivate listings when bot regains admin
6. **Historical Tracking**: Store verification history for analytics

## Related Documentation

- [Scheduler Worker README](../workers/SCHEDULER_README.md)
- [Bot Queue Implementation](./BOT_QUEUE_README.md)
- [Telegram Bot Service](./TELEGRAM_BOT_README.md)
- [Listing Service](./README.md)
