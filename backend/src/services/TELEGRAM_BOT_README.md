# Telegram Bot Service

The `TelegramBotService` manages all Telegram Bot API operations for the Telegram Signals Marketplace platform.

## Features

- **Bot Initialization**: Initialize bot with API token from environment variables
- **Webhook Setup**: Configure webhook endpoint for receiving bot updates
- **Command Handlers**: Implement bot commands (/start, /help, /status, /support)
- **User Management**: Invite and remove users from channels
- **Permission Verification**: Verify bot has admin permissions in channels
- **Rate Limiting**: Automatic retry with exponential backoff for rate limits
- **Error Handling**: Comprehensive error handling for all Telegram API operations

## Requirements Satisfied

- **Requirement 2.1**: Initialize bot with API token
- **Requirement 2.2**: Set up webhook endpoint for bot events
- **Requirement 2.3**: Implement bot command handlers

## Configuration

The service requires the following environment variables:

```env
# Required
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# Optional (for webhook)
TELEGRAM_WEBHOOK_URL=https://your-domain.com/api/telegram/webhook

# Optional (for support command)
EMAIL_SUPPORT=support@yourdomain.com
```

## Usage

### Import the Service

```typescript
import { telegramBotService } from './services/TelegramBotService';
```

### Initialize Webhook

The webhook is automatically initialized when the server starts if `TELEGRAM_WEBHOOK_URL` is configured:

```typescript
// In index.ts
if (webhookUrl && telegramBotService) {
  await telegramBotService.initializeWebhook(webhookUrl);
}
```

### Verify Admin Permissions

Before creating a listing, verify the bot has admin permissions in the channel:

```typescript
const permissions = await telegramBotService.verifyAdminPermissions('@channelname');

if (!permissions.isAdmin || !permissions.canInviteUsers || !permissions.canRemoveUsers) {
  throw new Error('Bot lacks required permissions');
}
```

### Invite User to Channel

When a subscription is activated, invite the user to the channel:

```typescript
const result = await telegramBotService.inviteUserToChannel(
  userId,      // Telegram user ID (numeric)
  channelId    // Channel ID or @username
);

if (!result.success) {
  if (result.retryable) {
    // Queue for retry
  } else {
    // Handle permanent failure
  }
}
```

### Remove User from Channel

When a subscription expires or is refunded, remove the user from the channel:

```typescript
const result = await telegramBotService.removeUserFromChannel(
  userId,      // Telegram user ID (numeric)
  channelId    // Channel ID or @username
);

if (!result.success) {
  if (result.retryable) {
    // Queue for retry
  } else {
    // Handle permanent failure
  }
}
```

### Get Bot Information

Retrieve bot information for debugging:

```typescript
const botInfo = await telegramBotService.getBotInfo();
console.log(`Bot ID: ${botInfo.id}`);
console.log(`Bot Username: ${botInfo.username}`);
console.log(`Is Active: ${botInfo.isActive}`);
```

## API Endpoints

The service exposes the following REST API endpoints:

### POST /api/telegram/webhook

Webhook endpoint for receiving Telegram updates. This is called by Telegram servers.

### GET /api/telegram/bot-info

Get bot information (ID, username, status).

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 123456789,
    "username": "your_bot",
    "isActive": true
  }
}
```

### POST /api/telegram/verify-permissions

Verify bot admin permissions in a channel.

**Request:**
```json
{
  "channelId": "@channelname"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isAdmin": true,
    "canInviteUsers": true,
    "canRemoveUsers": true,
    "channelExists": true
  }
}
```

### POST /api/telegram/invite

Manually invite a user to a channel (for testing/admin operations).

**Request:**
```json
{
  "userId": 987654321,
  "channelId": "@channelname"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "retryable": false
  }
}
```

### POST /api/telegram/remove

Manually remove a user from a channel (for testing/admin operations).

**Request:**
```json
{
  "userId": 987654321,
  "channelId": "@channelname"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "retryable": false
  }
}
```

## Bot Commands

The bot responds to the following commands:

- `/start` - Welcome message with bot introduction
- `/help` - Show available commands
- `/status` - Check subscription status (shows Telegram ID)
- `/support` - Get support information

## Error Handling

The service implements comprehensive error handling:

### Rate Limiting (429)

Automatically retries with exponential backoff:
- 1st retry: 1 second delay
- 2nd retry: 2 seconds delay
- 3rd retry: 4 seconds delay

### Permission Errors (403)

Returns non-retryable error when bot lacks permissions:
```typescript
{
  success: false,
  error: 'Bot lacks permissions to invite users',
  retryable: false
}
```

### User Not Found

Returns non-retryable error when Telegram user doesn't exist:
```typescript
{
  success: false,
  error: 'Telegram user not found',
  retryable: false
}
```

### Channel Not Found

Returns non-retryable error when channel doesn't exist:
```typescript
{
  success: false,
  error: 'Channel not found',
  retryable: false
}
```

### Other Errors

Retries up to 3 times with exponential backoff, then returns:
```typescript
{
  success: false,
  error: 'Max retries exceeded',
  retryable: true
}
```

## Testing

Run the unit tests:

```bash
npm test -- TelegramBotService.test.ts
```

The test suite includes:
- Bot initialization tests
- Webhook setup tests
- Permission verification tests
- User invite/remove tests
- Rate limiting and retry logic tests
- Error handling tests

## Integration with Other Services

### ListingService

Before creating a listing, verify bot permissions:

```typescript
const permissions = await telegramBotService.verifyAdminPermissions(channelId);
if (!permissions.isAdmin || !permissions.canInviteUsers) {
  throw new Error('Bot must be admin with invite permissions');
}
```

### SubscriptionService

When subscription is activated:

```typescript
const result = await telegramBotService.inviteUserToChannel(
  subscription.buyerTelegramId,
  subscription.channelId
);
```

When subscription expires or is refunded:

```typescript
const result = await telegramBotService.removeUserFromChannel(
  subscription.buyerTelegramId,
  subscription.channelId
);
```

## Setting Up Your Telegram Bot

1. **Create a bot** with [@BotFather](https://t.me/botfather):
   - Send `/newbot` to BotFather
   - Choose a name and username for your bot
   - Copy the API token

2. **Add bot to your channel**:
   - Go to your channel settings
   - Add the bot as an administrator
   - Grant permissions: "Add members" and "Ban users"

3. **Configure environment variables**:
   ```env
   TELEGRAM_BOT_TOKEN=your-bot-token-here
   TELEGRAM_WEBHOOK_URL=https://yourdomain.com/api/telegram/webhook
   ```

4. **Test the bot**:
   - Send `/start` to your bot
   - Verify it responds with the welcome message

## Production Considerations

1. **Webhook URL**: Must be HTTPS in production (Telegram requirement)
2. **Rate Limits**: Telegram has rate limits (30 messages/second per bot)
3. **Retry Queue**: Consider using SQS for retryable operations
4. **Monitoring**: Log all bot operations for debugging
5. **Error Alerts**: Set up alerts for permission errors
6. **Token Security**: Store bot token in AWS Secrets Manager or KMS

## Troubleshooting

### Bot not receiving updates

- Verify `TELEGRAM_WEBHOOK_URL` is set correctly
- Check webhook is accessible from internet (use ngrok for local testing)
- Verify webhook URL is HTTPS (required by Telegram)
- Check server logs for webhook initialization errors

### Permission errors

- Verify bot is added as admin to the channel
- Check bot has "Add members" and "Ban users" permissions
- Use `/api/telegram/verify-permissions` endpoint to check permissions

### Rate limiting

- The service automatically handles rate limits with exponential backoff
- If rate limits persist, consider implementing a queue system
- Monitor rate limit errors in logs

### User not found errors

- Verify the user has started a conversation with the bot
- User must have a Telegram account
- User ID must be numeric (not username)

## Next Steps

For the next task (5.2), we'll implement:
- Bot operation queue with SQS
- Scheduled job for admin verification
- Enhanced retry logic with dead letter queue
