# Order API Endpoints

This document describes the order API endpoints implemented for the Telegram Signals Marketplace.

**Requirements:** 12.1, 12.2, 12.5

## Endpoints

### POST /api/orders

Create a new order for a listing purchase.

**Authentication:** Required (any authenticated user)

**Request Body:**
```json
{
  "listingId": "string (UUID)"
}
```

**Response (201 Created):**
```json
{
  "order": {
    "id": "string (UUID)",
    "buyerId": "string (UUID)",
    "listingId": "string (UUID)",
    "depositAddress": "string",
    "amount": "number",
    "currency": "CryptoCurrency",
    "status": "OrderStatus",
    "confirmations": "number",
    "transactionHash": "string | null",
    "createdAt": "Date",
    "expiresAt": "Date",
    "paidAt": "Date | null"
  },
  "paymentDetails": {
    "depositAddress": "string",
    "amount": "number",
    "currency": "CryptoCurrency",
    "qrCode": "string (base64 data URL)",
    "expiresAt": "Date"
  }
}
```

**Error Responses:**
- `400 INVALID_INPUT` - Missing required field: listingId
- `400 LISTING_INACTIVE` - Cannot create order for inactive listing
- `404 LISTING_NOT_FOUND` - Listing not found
- `401 UNAUTHORIZED` - Authentication required

**Example:**
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"listingId": "123e4567-e89b-12d3-a456-426614174000"}'
```

---

### GET /api/orders/:id

Get order details with payment status.

**Authentication:** Required (order owner or admin)

**Path Parameters:**
- `id` - Order ID (UUID)

**Response (200 OK):**
```json
{
  "order": {
    "id": "string (UUID)",
    "buyerId": "string (UUID)",
    "listingId": "string (UUID)",
    "depositAddress": "string",
    "amount": "number",
    "currency": "CryptoCurrency",
    "status": "OrderStatus",
    "confirmations": "number",
    "transactionHash": "string | null",
    "createdAt": "Date",
    "expiresAt": "Date",
    "paidAt": "Date | null",
    "listing": {
      "id": "string",
      "description": "string",
      "price": "number",
      ...
    },
    "subscription": {
      "id": "string",
      "status": "string",
      ...
    } | null,
    "transactions": [
      {
        "hash": "string",
        "amount": "number",
        "confirmations": "number",
        ...
      }
    ]
  }
}
```

**Error Responses:**
- `404 ORDER_NOT_FOUND` - Order not found
- `403 FORBIDDEN` - You do not have permission to view this order
- `401 UNAUTHORIZED` - Authentication required

**Example:**
```bash
curl -X GET http://localhost:3000/api/orders/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer <token>"
```

---

### GET /api/orders

List user's orders.

**Authentication:** Required

**Query Parameters:**
- `buyerId` (optional, admin only) - Filter orders by buyer ID

**Response (200 OK):**
```json
{
  "orders": [
    {
      "id": "string (UUID)",
      "buyerId": "string (UUID)",
      "listingId": "string (UUID)",
      "depositAddress": "string",
      "amount": "number",
      "currency": "CryptoCurrency",
      "status": "OrderStatus",
      "confirmations": "number",
      "transactionHash": "string | null",
      "createdAt": "Date",
      "expiresAt": "Date",
      "paidAt": "Date | null"
    }
  ],
  "total": "number"
}
```

**Error Responses:**
- `401 UNAUTHORIZED` - Authentication required

**Example:**
```bash
# Get current user's orders
curl -X GET http://localhost:3000/api/orders \
  -H "Authorization: Bearer <token>"

# Admin: Get specific buyer's orders
curl -X GET "http://localhost:3000/api/orders?buyerId=123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer <admin-token>"
```

---

## Order Status Flow

Orders progress through the following statuses:

1. `PENDING_PAYMENT` - Order created, waiting for payment
2. `PAYMENT_DETECTED` - Payment transaction detected on blockchain
3. `PAYMENT_CONFIRMED` - Payment confirmed with required confirmations
4. `SUBSCRIPTION_ACTIVE` - Subscription created and activated
5. `EXPIRED` - Order expired (24 hours without payment)
6. `REFUNDED` - Order refunded

## Payment Details

When an order is created, the API returns payment details including:

- **depositAddress**: Unique cryptocurrency address for this order
- **amount**: Exact amount to send
- **currency**: Cryptocurrency type (BNB, USDT_BEP20, USDC_BEP20, BTC, USDT_TRC20)
- **qrCode**: Base64-encoded QR code image for easy payment
- **expiresAt**: Order expiration time (24 hours from creation)

## Authorization

- **POST /api/orders**: Any authenticated user can create orders
- **GET /api/orders/:id**: Only the order owner or admin can view order details
- **GET /api/orders**: Users see their own orders; admins can query any buyer's orders

## Implementation Notes

1. Each order generates a unique deposit address using HD wallet derivation
2. Orders expire after 24 hours if payment is not received
3. QR codes are generated in the appropriate format for each cryptocurrency:
   - BNB/BEP-20: `ethereum:{address}?value={amount}`
   - Bitcoin: `bitcoin:{address}?amount={amount}`
   - TRON: `tron:{address}?amount={amount}`
4. Order details include related entities (listing, subscription, transactions) for complete context
5. Payment status is tracked through blockchain confirmations

## Related Services

- **OrderService**: Core business logic for order management
- **HDWalletService**: Generates unique deposit addresses
- **PaymentProcessingService**: Monitors blockchain for payments
- **SubscriptionService**: Creates subscriptions when orders are confirmed

## Testing

Integration tests should verify:
- Order creation with valid listing
- Order creation fails for inactive listing
- Order creation fails for non-existent listing
- Order retrieval by owner
- Order retrieval blocked for non-owner
- Admin can view any order
- User can list their own orders
- Admin can query orders by buyer ID

## Security Considerations

1. Authentication required for all endpoints
2. Authorization checks prevent users from viewing others' orders
3. Deposit addresses are unique per order to prevent payment confusion
4. Order expiration prevents indefinite resource allocation
5. Admin role required to query other users' orders
