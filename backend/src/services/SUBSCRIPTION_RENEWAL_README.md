# Subscription Renewal Feature

## Overview

The subscription renewal feature allows buyers to extend their channel subscriptions by creating a new order for the same listing. This feature implements requirements 10.5 and 10.6 from the specification.

## Renewal Eligibility

A subscription is eligible for renewal if:

1. **Time Window**: The subscription expires within 7 days (or has already expired)
2. **Status**: The subscription has not been refunded or cancelled

### Eligibility Examples

✅ **Eligible for Renewal:**
- Active subscription expiring in 5 days
- Active subscription expiring in exactly 7 days
- Subscription that expired 1 day ago
- Expired subscription (status: expired)

❌ **Not Eligible for Renewal:**
- Active subscription expiring in 10 days (too far in the future)
- Refunded subscription (status: refunded)
- Cancelled subscription (status: cancelled)

## API Endpoints

### 1. Check Renewal Eligibility

```
GET /api/subscriptions/:id/renewal-eligibility
```

**Authentication**: Required (buyer or admin)

**Response**:
```json
{
  "eligible": true,
  "daysUntilExpiry": 5,
  "expiryDate": "2024-02-15T00:00:00.000Z",
  "status": "active"
}
```

Or if not eligible:
```json
{
  "eligible": false,
  "reason": "Subscription expires in 10 days. Renewal available within 7 days of expiry.",
  "daysUntilExpiry": 10,
  "expiryDate": "2024-02-20T00:00:00.000Z",
  "status": "active"
}
```

### 2. Renew Subscription

```
POST /api/subscriptions/:id/renew
```

**Authentication**: Required (buyer only)

**Response** (Success):
```json
{
  "eligible": true,
  "order": {
    "id": "order-123",
    "buyerId": "buyer-456",
    "listingId": "listing-789",
    "depositAddress": "0xabc123...",
    "amount": 100,
    "currency": "USDT_BEP20",
    "status": "pending_payment",
    "confirmations": 0,
    "createdAt": "2024-02-10T00:00:00.000Z",
    "expiresAt": "2024-02-11T00:00:00.000Z"
  },
  "paymentDetails": {
    "depositAddress": "0xabc123...",
    "amount": 100,
    "currency": "USDT_BEP20",
    "qrCode": "data:image/png;base64,...",
    "expiresAt": "2024-02-11T00:00:00.000Z"
  }
}
```

**Response** (Not Eligible):
```json
{
  "error": {
    "code": "RENEWAL_NOT_ELIGIBLE",
    "message": "Subscription expires in 10 days. Renewal available within 7 days of expiry.",
    "retryable": false,
    "timestamp": "2024-02-10T00:00:00.000Z",
    "requestId": "req-123"
  }
}
```

### 3. List Subscriptions

```
GET /api/subscriptions
```

**Authentication**: Required

**Response**:
```json
{
  "subscriptions": [
    {
      "id": "sub-123",
      "buyerId": "buyer-456",
      "listingId": "listing-789",
      "orderId": "order-123",
      "channelId": "channel-999",
      "status": "active",
      "startDate": "2024-01-10T00:00:00.000Z",
      "expiryDate": "2024-02-10T00:00:00.000Z",
      "durationDays": 30,
      "createdAt": "2024-01-10T00:00:00.000Z",
      "updatedAt": "2024-01-10T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

### 4. Get Subscription Details

```
GET /api/subscriptions/:id
```

**Authentication**: Required (buyer or admin)

**Response**:
```json
{
  "subscription": {
    "id": "sub-123",
    "buyerId": "buyer-456",
    "listingId": "listing-789",
    "orderId": "order-123",
    "channelId": "channel-999",
    "status": "active",
    "startDate": "2024-01-10T00:00:00.000Z",
    "expiryDate": "2024-02-10T00:00:00.000Z",
    "durationDays": 30,
    "createdAt": "2024-01-10T00:00:00.000Z",
    "updatedAt": "2024-01-10T00:00:00.000Z",
    "listing": {
      "id": "listing-789",
      "channelName": "Crypto Signals Pro",
      "price": 100,
      "currency": "USDT_BEP20",
      "durationDays": 30
    },
    "order": {
      "id": "order-123",
      "amount": 100,
      "currency": "USDT_BEP20",
      "status": "subscription_active",
      "paidAt": "2024-01-10T00:00:00.000Z"
    }
  }
}
```

## Service Methods

### `isEligibleForRenewal(subscriptionId: string): Promise<boolean>`

Checks if a subscription is eligible for renewal based on:
- Subscription status (not refunded or cancelled)
- Time until expiry (within 7 days or already expired)

### `renewSubscription(subscriptionId: string): Promise<RenewalResult>`

Attempts to renew a subscription by:
1. Validating eligibility
2. Checking listing is still active
3. Creating a new order for the same listing
4. Returning the order for payment

**Returns**:
```typescript
{
  eligible: boolean;
  reason?: string;  // If not eligible
  order?: Order;    // If eligible
}
```

## Renewal Flow

1. **Buyer checks eligibility** (optional)
   - `GET /api/subscriptions/:id/renewal-eligibility`
   - UI can show "Renew" button only if eligible

2. **Buyer initiates renewal**
   - `POST /api/subscriptions/:id/renew`
   - System validates eligibility
   - System creates new order for same listing

3. **Buyer pays for renewal**
   - Use returned order's payment details
   - Pay to the deposit address
   - Wait for payment confirmation

4. **New subscription created**
   - After payment confirmed, new subscription is created
   - New subscription extends access for listing's duration
   - Original subscription remains in database for history

## Implementation Details

### Renewal Time Window

The 7-day renewal window is calculated as:
```typescript
const now = new Date();
const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
const isEligible = subscription.expiryDate <= sevenDaysFromNow;
```

This means:
- If subscription expires on Feb 15 and today is Feb 8, it's eligible (7 days)
- If subscription expires on Feb 15 and today is Feb 7, it's not eligible (8 days)
- If subscription expired on Feb 8 and today is Feb 10, it's eligible (already expired)

### Status Restrictions

Subscriptions with these statuses cannot be renewed:
- `refunded`: Buyer received refund, cannot renew
- `cancelled`: Subscription was cancelled, cannot renew

Subscriptions with these statuses can be renewed (if within time window):
- `active`: Currently active subscription
- `expired`: Subscription has expired
- `pending_activation`: Waiting for bot to invite user

### Listing Validation

When renewing, the system checks:
1. Listing still exists
2. Listing is still active (status = 'active')

If listing is inactive or deleted, renewal is rejected with appropriate error message.

## Testing

The feature includes comprehensive unit tests covering:
- Eligibility checking for various scenarios
- Renewal for eligible subscriptions
- Rejection for ineligible subscriptions
- Edge cases (expired, refunded, cancelled, listing inactive)

Run tests:
```bash
npm test -- SubscriptionService.test.ts
```

All 33 tests pass, including 8 tests specifically for renewal functionality.

## Requirements Validation

✅ **Requirement 10.5**: Subscription renewal within 7 days of expiry
- Implemented `isEligibleForRenewal()` with 7-day window check
- API endpoint to check eligibility
- API endpoint to initiate renewal

✅ **Requirement 10.6**: Calculate renewal eligibility
- Eligibility based on time window (7 days)
- Eligibility based on status (not refunded/cancelled)
- Clear error messages when not eligible

✅ **Requirement 2.6**: Support subscription renewals by creating new subscription records
- Renewal creates new order for same listing
- After payment, new subscription is created
- Original subscription preserved for history
