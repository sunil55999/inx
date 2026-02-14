# Scheduler Worker

The Scheduler Worker is a standalone process that runs scheduled jobs for the Telegram Signals Marketplace platform.

## Overview

The scheduler worker uses `node-cron` to run periodic tasks that maintain platform integrity and automate administrative functions.

## Scheduled Jobs

### Bot Admin Verification Job

**Schedule:** Daily at 2:00 AM (configurable via `BOT_ADMIN_VERIFICATION_CRON` environment variable)

**Purpose:** Verifies that the Telegram bot maintains admin permissions in all channels with active listings.

**Process:**
1. Queries all channels that have active listings
2. Verifies bot admin permissions for each channel using Telegram Bot API
3. Updates channel `bot_is_admin` status in database
4. When bot loses admin permissions:
   - Deactivates all listings for that channel
   - Sends notifications to affected merchants
5. Logs verification results and statistics

**Requirements:** 2.5

## Running the Worker

### Development

```bash
npm run worker:scheduler:dev
```

This runs the worker with auto-reload on file changes.

### Production

```bash
npm run worker:scheduler
```

Or using the compiled JavaScript:

```bash
node dist/workers/schedulerWorker.js
```

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token | - | Yes |
| `DATABASE_URL` | PostgreSQL connection string | - | Yes |
| `BOT_ADMIN_VERIFICATION_CRON` | Cron schedule for bot admin verification | `0 2 * * *` | No |
| `TZ` | Timezone for cron jobs | `UTC` | No |
| `RUN_ON_STARTUP` | Run verification immediately on startup | `false` | No |

## Cron Schedule Format

The cron schedule uses the standard cron format:

```
┌────────────── second (optional, 0-59)
│ ┌──────────── minute (0-59)
│ │ ┌────────── hour (0-23)
│ │ │ ┌──────── day of month (1-31)
│ │ │ │ ┌────── month (1-12)
│ │ │ │ │ ┌──── day of week (0-7, 0 and 7 are Sunday)
│ │ │ │ │ │
* * * * * *
```

### Examples

- `0 2 * * *` - Daily at 2:00 AM
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 0` - Weekly on Sunday at midnight
- `0 0 1 * *` - Monthly on the 1st at midnight

## Deployment

### Docker

The scheduler worker should run as a separate container in production:

```dockerfile
# Dockerfile for scheduler worker
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

CMD ["node", "dist/workers/schedulerWorker.js"]
```

### Docker Compose

```yaml
services:
  scheduler-worker:
    build:
      context: .
      dockerfile: Dockerfile.scheduler
    environment:
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - DATABASE_URL=${DATABASE_URL}
      - BOT_ADMIN_VERIFICATION_CRON=0 2 * * *
      - TZ=UTC
    restart: unless-stopped
    depends_on:
      - postgres
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: scheduler-worker
spec:
  replicas: 1  # Only one instance needed
  selector:
    matchLabels:
      app: scheduler-worker
  template:
    metadata:
      labels:
        app: scheduler-worker
    spec:
      containers:
      - name: scheduler-worker
        image: your-registry/scheduler-worker:latest
        env:
        - name: TELEGRAM_BOT_TOKEN
          valueFrom:
            secretKeyRef:
              name: telegram-secrets
              key: bot-token
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: url
        - name: BOT_ADMIN_VERIFICATION_CRON
          value: "0 2 * * *"
        - name: TZ
          value: "UTC"
```

## Monitoring

### Logs

The worker logs all job executions and results:

```json
{
  "level": "info",
  "message": "Bot admin verification job completed",
  "totalChannels": 50,
  "verified": 48,
  "adminLost": 2,
  "errors": 0,
  "timestamp": "2024-01-15T02:00:05.123Z"
}
```

### Metrics

Key metrics to monitor:

- **Job execution time**: How long each verification run takes
- **Channels verified**: Number of channels checked per run
- **Admin losses detected**: Number of channels where bot lost admin
- **Errors**: Failed verification attempts
- **Notifications sent**: Number of merchants notified

### Alerts

Set up alerts for:

- Job execution failures
- High error rates (>10% of channels)
- Job execution time exceeding threshold (e.g., >5 minutes)
- Worker process crashes

## Graceful Shutdown

The worker handles `SIGTERM` and `SIGINT` signals for graceful shutdown:

1. Stops accepting new job executions
2. Waits for current job to complete (if running)
3. Cleans up resources
4. Exits with appropriate status code

## Testing

### Unit Tests

```bash
npm test -- BotAdminVerificationService
```

### Manual Testing

Run verification immediately on startup:

```bash
RUN_ON_STARTUP=true npm run worker:scheduler:dev
```

### Test with Custom Schedule

Run every minute for testing:

```bash
BOT_ADMIN_VERIFICATION_CRON="* * * * *" npm run worker:scheduler:dev
```

## Troubleshooting

### Worker Not Starting

1. Check environment variables are set correctly
2. Verify database connection
3. Check Telegram bot token is valid
4. Review logs for error messages

### Jobs Not Running

1. Verify cron schedule format is correct
2. Check timezone settings
3. Ensure worker process is running
4. Review logs for scheduling errors

### High Error Rates

1. Check Telegram API rate limits
2. Verify bot token is valid and not revoked
3. Check database connection stability
4. Review channel IDs for invalid entries

## Adding New Scheduled Jobs

To add a new scheduled job:

1. Create a service class for the job logic (e.g., `MyJobService.ts`)
2. Add the job function in `schedulerWorker.ts`:

```typescript
async function runMyJob() {
  logger.info('Starting my job');
  try {
    const service = new MyJobService();
    await service.execute();
    logger.info('My job completed');
  } catch (error: any) {
    logger.error('My job failed', { error: error.message });
  }
}
```

3. Schedule the job in the `main()` function:

```typescript
const myJobSchedule = process.env.MY_JOB_CRON || '0 3 * * *';
cron.schedule(myJobSchedule, async () => {
  await runMyJob();
}, {
  scheduled: true,
  timezone: process.env.TZ || 'UTC',
});
```

4. Add environment variable documentation
5. Write unit tests for the service
6. Update this README

## Related Documentation

- [Bot Queue Implementation](../services/BOT_QUEUE_README.md)
- [Telegram Bot Service](../services/TELEGRAM_BOT_README.md)
- [Listing Service](../services/README.md)
