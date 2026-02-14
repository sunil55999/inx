# Implementation Plan: Telegram Signals Marketplace

## Overview

This implementation plan breaks down the Telegram Signals Marketplace into discrete, incremental coding tasks. The approach follows a layered architecture: database schema and models first, then core business logic services, followed by API endpoints, Telegram bot integration, blockchain monitoring, and finally the frontend application. Each task builds on previous work, with testing integrated throughout to validate functionality early.

The implementation uses Node.js/TypeScript for the backend, React for the frontend, PostgreSQL for data storage, and integrates with Telegram Bot API and multiple blockchain networks.

## Tasks

- [x] 1. Set up project infrastructure and database schema
  - Initialize Node.js/TypeScript backend project with Express
  - Initialize React/TypeScript frontend project
  - Set up PostgreSQL database with migration framework (e.g., Knex.js or TypeORM)
  - Create database schema for all tables: users, merchants, channels, listings, orders, subscriptions, escrow_entries, disputes, payouts, notifications, audit_logs
  - Set up Redis for caching and session management
  - Configure environment variables and secrets management
  - Set up Docker Compose for local development
  - _Requirements: All data model requirements_

- [x] 2. Implement data models and validation
  - [x] 2.1 Create TypeScript interfaces and types for all data models
    - Define User, Merchant, Channel, Listing, Order, Subscription, EscrowEntry, Dispute, Payout models
    - Define enums for status types (OrderStatus, SubscriptionStatus, DisputeStatus, PayoutStatus, CryptoType)
    - _Requirements: 1.1, 1.5, 1.6, 3.2, 4.1, 5.1, 6.1, 12.1_

  - [ ]* 2.2 Write property test for data model persistence
    - **Property 1: Listing Creation Persistence**
    - **Validates: Requirements 1.1, 1.5, 1.6**

  - [x] 2.3 Implement database repository layer
    - Create repository classes for each model with CRUD operations
    - Implement query methods for common access patterns
    - Add database transaction support
    - _Requirements: 1.1, 4.5, 6.7_

  - [ ]* 2.4 Write unit tests for repository layer
    - Test CRUD operations for each model
    - Test transaction rollback scenarios
    - Test query methods with various filters
    - _Requirements: 1.1, 4.5_


- [x] 3. Implement WebAuthn authentication system
  - [x] 3.1 Create authentication service with WebAuthn support
    - Implement registration begin/complete endpoints
    - Implement login begin/complete endpoints
    - Generate and verify WebAuthn challenges
    - Store and retrieve credentials from database
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 3.2 Write property tests for WebAuthn authentication
    - **Property 29: WebAuthn Credential Storage**
    - **Property 30: WebAuthn Authentication Verification**
    - **Property 31: Multiple Device Support**
    - **Validates: Requirements 8.2, 8.3, 8.4**

  - [x] 3.3 Implement JWT token generation and validation
    - Create JWT signing and verification functions
    - Implement token refresh mechanism
    - Add authentication middleware for protected routes
    - _Requirements: 8.1_

  - [ ]* 3.4 Write unit tests for authentication flows
    - Test registration with valid/invalid credentials
    - Test login with valid/invalid credentials
    - Test JWT token validation
    - Test authentication middleware
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 3.5 Implement credential management endpoints
    - Add endpoint to list user's registered devices
    - Add endpoint to remove a credential
    - Add endpoint to add new credential to existing account
    - _Requirements: 8.7_

  - [ ]* 3.6 Write property test for device management
    - **Property 32: Biometric Device Management**
    - **Validates: Requirements 8.7**


- [x] 4. Implement listing management service
  - [x] 4.1 Create listing service with business logic
    - Implement createListing function with validation
    - Implement updateListing function
    - Implement deactivateListing function
    - Implement getListingById and listListings functions
    - Add uniqueness check for channel per merchant
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 4.2 Write property tests for listing management
    - **Property 2: Catalog Filtering by Active Status**
    - **Property 3: Channel Listing Uniqueness per Merchant**
    - **Validates: Requirements 1.2, 1.3, 1.4**

  - [x] 4.3 Implement listing API endpoints
    - POST /api/listings - create listing
    - GET /api/listings - list listings with filters
    - GET /api/listings/:id - get listing details
    - PATCH /api/listings/:id - update listing
    - DELETE /api/listings/:id - deactivate listing
    - _Requirements: 1.1, 1.2_

  - [ ]* 4.4 Write unit tests for listing endpoints
    - Test listing creation with valid/invalid data
    - Test listing retrieval with various filters
    - Test duplicate channel prevention
    - Test authorization (only merchant can modify their listings)
    - _Requirements: 1.1, 1.3, 1.4_


- [x] 5. Implement Telegram Bot service
  - [x] 5.1 Set up Telegram Bot with Telegraf.js
    - Initialize bot with API token
    - Set up webhook endpoint for bot events
    - Implement bot command handlers
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 5.2 Implement bot operation functions
    - Implement verifyAdminStatus function
    - Implement addUserToChannel function
    - Implement removeUserFromChannel function
    - Implement getChannelInfo function
    - Add rate limiting and exponential backoff
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

  - [ ]* 5.3 Write property tests for bot operations
    - **Property 4: Bot Admin Verification Blocks Listing Creation**
    - **Property 5: Bot Admin Loss Deactivates Listings**
    - **Validates: Requirements 2.4, 2.5**

  - [x] 5.4 Implement bot operation queue with SQS
    - Create SQS queue for bot operations
    - Implement queue producer to enqueue operations
    - Implement queue consumer worker to process operations
    - Add retry logic with exponential backoff
    - Add dead letter queue for failed operations
    - _Requirements: 2.6_

  - [ ]* 5.5 Write unit tests for bot service
    - Test admin verification with mock Telegram API
    - Test add/remove user operations
    - Test rate limiting behavior
    - Test retry logic for failed operations
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [x] 5.6 Implement scheduled job for bot admin verification
    - Create daily cron job to verify bot admin status for all channels
    - Deactivate listings when bot loses admin
    - Send notifications to affected merchants
    - _Requirements: 2.5_

  - [ ]* 5.7 Write property test for bot operation queueing
    - **Property 6: Bot Operation Queueing for Access Management**
    - **Validates: Requirements 2.1, 2.2, 2.3, 10.3**


- [x] 6. Checkpoint - Ensure authentication and listing tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement payment service and blockchain monitoring
  - [x] 7.1 Implement HD wallet for address generation
    - Set up hierarchical deterministic wallet with master seed in AWS KMS
    - Implement generateDepositAddress function using order ID as derivation path
    - Store address-to-order mapping in database
    - _Requirements: 3.1_

  - [ ]* 7.2 Write property test for address uniqueness
    - **Property 7: Deposit Address Uniqueness**
    - **Validates: Requirements 3.1**

  - [x] 7.3 Implement blockchain monitor service
    - Set up WebSocket connections to BNB Chain, Bitcoin, and TRON nodes
    - Implement watchAddress function to monitor specific addresses
    - Implement transaction detection and confirmation tracking
    - Publish transaction events to SQS queue
    - _Requirements: 3.3, 3.4, 3.5_

  - [x] 7.4 Implement payment processing service
    - Implement processPayment function to handle detected transactions
    - Verify transaction amount with tolerance check (±0.1%)
    - Update order status based on confirmations
    - Handle partial payments
    - _Requirements: 3.3, 3.5, 3.7_

  - [ ]* 7.5 Write property tests for payment processing
    - **Property 8: Payment Amount Verification with Tolerance**
    - **Property 11: Partial Payment Tracking**
    - **Validates: Requirements 3.3, 3.7**

  - [x] 7.6 Implement cryptocurrency conversion service
    - Implement convertUsdToCrypto function using real-time exchange rates
    - Integrate with price feed API (e.g., CoinGecko, Binance API)
    - Cache exchange rates with 1-minute TTL
    - _Requirements: 3.1_

  - [ ]* 7.7 Write unit tests for payment service
    - Test address generation uniqueness
    - Test payment amount verification with various amounts
    - Test partial payment handling
    - Test confirmation tracking for each blockchain
    - _Requirements: 3.1, 3.3, 3.5, 3.7_


- [x] 8. Implement order and subscription management
  - [x] 8.1 Create order service
    - Implement createOrder function
    - Generate deposit address and calculate expected amount
    - Set order expiration (24 hours)
    - Generate QR code for payment
    - _Requirements: 3.1, 3.6, 12.1, 12.2_

  - [ ]* 8.2 Write property tests for order management
    - **Property 43: Order Creation with Initial State**
    - **Property 44: Order Response Completeness**
    - **Property 46: Order State Transitions**
    - **Validates: Requirements 12.1, 12.2, 12.6**

  - [x] 8.3 Implement order status update workflow
    - Handle payment detection (pending_payment → payment_received)
    - Handle payment confirmation (payment_received → confirmed)
    - Create subscription when order confirmed
    - _Requirements: 3.5, 12.3, 12.4_

  - [ ]* 8.4 Write property tests for order workflow
    - **Property 9: Payment Confirmation Activates Subscription**
    - **Property 45: Order Payment Detection Status Update**
    - **Validates: Requirements 3.5, 12.3, 12.4**

  - [x] 8.5 Implement order API endpoints
    - POST /api/orders - create order
    - GET /api/orders/:id - get order details with payment status
    - GET /api/orders - list user's orders
    - _Requirements: 12.1, 12.2, 12.5_

  - [x] 8.6 Implement subscription service
    - Implement createSubscription function
    - Implement updateSubscriptionStatus function
    - Implement renewSubscription function
    - Calculate renewal eligibility (within 7 days of expiry)
    - _Requirements: 10.5, 10.6_

  - [ ]* 8.7 Write property tests for subscription management
    - **Property 39: Subscription Renewal Time Window**
    - **Property 40: Subscription Renewal Extension**
    - **Property 41: Subscription State Transitions**
    - **Validates: Requirements 10.5, 10.6, 10.7**

  - [x] 8.8 Implement subscription API endpoints
    - GET /api/subscriptions - list user's subscriptions
    - GET /api/subscriptions/:id - get subscription details
    - POST /api/subscriptions/:id/renew - renew subscription
    - _Requirements: 10.5_

  - [ ]* 8.9 Write unit tests for order and subscription endpoints
    - Test order creation flow
    - Test order status transitions
    - Test subscription renewal within/outside time window
    - Test subscription listing and filtering
    - _Requirements: 12.1, 12.3, 12.4, 10.5, 10.6_


- [x] 9. Implement escrow service
  - [x] 9.1 Create escrow service with business logic
    - Implement createEscrow function (called when subscription activates)
    - Calculate platform fee (5% configurable)
    - Implement releaseEscrow function (called when subscription completes)
    - Implement refundEscrow function with pro-rated calculation
    - Update merchant balances (available_balance, pending_balance)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 9.2 Write property tests for escrow management
    - **Property 12: Escrow Creation on Subscription Activation**
    - **Property 13: Escrow Release on Subscription Completion**
    - **Property 14: Pro-Rated Refund Calculation**
    - **Property 16: Escrow Entry Independence**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.6**

  - [x] 9.3 Implement escrow transaction logging
    - Log all escrow status changes with timestamps
    - Implement audit trail query functions
    - _Requirements: 4.5_

  - [ ]* 9.4 Write property test for escrow audit trail
    - **Property 15: Escrow Transaction Audit Trail**
    - **Validates: Requirements 4.5**

  - [ ]* 9.5 Write unit tests for escrow service
    - Test escrow creation with various payment amounts
    - Test platform fee calculation
    - Test escrow release updates merchant balance
    - Test pro-rated refund with various subscription states
    - Test multiple escrows for same merchant don't interfere
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_


- [x] 10. Implement dispute and refund system
  - [x] 10.1 Create dispute service
    - Implement createDispute function with validation
    - Validate dispute time window (active or ended within 7 days)
    - Implement updateDisputeStatus function
    - Implement resolveDispute function (admin action)
    - Calculate refund amount based on admin decision
    - _Requirements: 5.1, 5.2, 5.4_

  - [ ]* 10.2 Write property tests for dispute management
    - **Property 17: Dispute Creation with Required Fields**
    - **Property 18: Dispute Time Window Validation**
    - **Property 20: Dispute State Transitions**
    - **Validates: Requirements 5.1, 5.2, 5.7**

  - [x] 10.3 Implement refund processing
    - Deduct refund from escrow balance
    - Queue cryptocurrency refund transaction
    - Update subscription status to 'refunded'
    - Trigger bot to remove user from channel
    - _Requirements: 5.5, 5.6_

  - [ ]* 10.4 Write property test for refund escrow deduction
    - **Property 19: Refund Escrow Deduction**
    - **Validates: Requirements 5.6**

  - [x] 10.5 Implement dispute API endpoints
    - POST /api/disputes - create dispute (buyer)
    - GET /api/disputes/:id - get dispute details
    - POST /api/disputes/:id/respond - merchant response
    - POST /api/disputes/:id/resolve - admin resolution
    - GET /api/disputes - list disputes (filtered by role)
    - _Requirements: 5.1, 5.3_

  - [ ]* 10.6 Write unit tests for dispute system
    - Test dispute creation within/outside time window
    - Test dispute state transitions
    - Test refund calculation and processing
    - Test authorization (buyer, merchant, admin roles)
    - _Requirements: 5.1, 5.2, 5.4, 5.7_


- [x] 11. Checkpoint - Ensure payment and escrow tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement merchant payout system
  - [x] 12.1 Create payout service
    - Implement createPayout function with balance verification
    - Validate minimum payout threshold
    - Deduct amount from merchant available_balance
    - Queue cryptocurrency transaction
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

  - [ ]* 12.2 Write property tests for payout management
    - **Property 21: Payout Balance Verification**
    - **Property 22: Payout Balance Deduction**
    - **Property 23: Payout Minimum Threshold**
    - **Property 24: Failed Payout Balance Restoration**
    - **Validates: Requirements 6.1, 6.3, 6.5, 6.6**

  - [x] 12.3 Implement cryptocurrency sending function
    - Implement sendCrypto function for each supported blockchain
    - Sign and broadcast transactions
    - Store transaction hashes
    - Handle failed transactions and restore balance
    - _Requirements: 6.4, 6.6, 6.7_

  - [x] 12.4 Implement payout API endpoints
    - POST /api/payouts - request payout
    - GET /api/payouts - list merchant's payouts
    - GET /api/payouts/:id - get payout details
    - GET /api/merchant/balance - get merchant balance breakdown
    - _Requirements: 6.1, 6.7_

  - [ ]* 12.5 Write unit tests for payout system
    - Test payout creation with sufficient/insufficient balance
    - Test minimum threshold enforcement
    - Test balance deduction and restoration
    - Test transaction hash storage
    - _Requirements: 6.1, 6.3, 6.5, 6.6, 6.7_


- [x] 13. Implement merchant storefront
  - [x] 13.1 Create merchant service
    - Implement createMerchant function (called during user registration)
    - Implement updateMerchantProfile function
    - Implement getMerchantByUsername function
    - Generate unique storefront URLs
    - _Requirements: 7.1, 7.6_

  - [ ]* 13.2 Write property tests for storefront
    - **Property 25: Storefront URL Format**
    - **Property 26: Storefront Listing Filtering**
    - **Property 27: Storefront Profile Completeness**
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [x] 13.3 Implement storefront API endpoints
    - GET /api/store/:username - get merchant storefront
    - PATCH /api/merchant/profile - update merchant profile
    - _Requirements: 7.2, 7.3, 7.6_

  - [x] 13.4 Implement SEO meta tag generation
    - Generate Open Graph tags for storefront pages
    - Include merchant name, description, and profile image
    - _Requirements: 7.4_

  - [ ]* 13.5 Write property test for SEO meta tags
    - **Property 28: Storefront SEO Meta Tags**
    - **Validates: Requirements 7.4**

  - [ ]* 13.6 Write unit tests for storefront
    - Test storefront retrieval with active/inactive listings
    - Test empty storefront message
    - Test profile updates
    - Test SEO meta tag generation
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6_


- [x] 14. Implement search functionality
  - [x] 14.1 Set up Elasticsearch and indexing
    - Configure Elasticsearch cluster
    - Create index mapping for listings
    - Implement indexing function to sync listings to Elasticsearch
    - Set up automatic reindexing on listing changes
    - _Requirements: 9.1_

  - [x] 14.2 Implement search service
    - Implement search function with multi-field matching
    - Implement filter application (merchant, price, duration, signal type)
    - Implement relevance scoring and ranking
    - Implement fuzzy matching with edit distance ≤ 2
    - _Requirements: 9.1, 9.2, 9.4, 9.5_

  - [ ]* 14.3 Write property tests for search
    - **Property 33: Search Multi-Field Matching**
    - **Property 34: Search Filter Application**
    - **Property 36: Fuzzy Search Matching**
    - **Property 37: Search Relevance Ranking**
    - **Validates: Requirements 9.1, 9.2, 9.4, 9.5**

  - [x] 14.4 Implement autocomplete service
    - Build autocomplete index from channel names and popular searches
    - Implement prefix matching for suggestions
    - Cache popular suggestions
    - _Requirements: 9.3_

  - [ ]* 14.5 Write property test for autocomplete
    - **Property 35: Search Autocomplete Suggestions**
    - **Validates: Requirements 9.3**

  - [x] 14.6 Implement search API endpoints
    - GET /api/search - search listings with filters
    - GET /api/search/autocomplete - get autocomplete suggestions
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 14.7 Write unit tests for search
    - Test search with various queries
    - Test filter combinations
    - Test fuzzy matching with typos
    - Test autocomplete with partial queries
    - Test empty results with suggestions
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.7_


- [x] 15. Implement scheduled jobs for subscription lifecycle
  - [x] 15.1 Create subscription expiry job
    - Implement job to find subscriptions where end_date ≤ now AND status = 'active'
    - Update subscription status to 'expired'
    - Queue bot operation to remove user from channel
    - Release escrow to merchant
    - Send expiry notification to buyer
    - Schedule to run every hour
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 15.2 Write property test for subscription expiry
    - **Property 38: Subscription Expiry Status Update**
    - **Validates: Requirements 10.2**

  - [x] 15.3 Create subscription expiry reminder job
    - Implement job to find subscriptions expiring in next 24 hours
    - Send reminder notifications to buyers
    - Schedule to run every 6 hours
    - _Requirements: 10.4_

  - [ ]* 15.4 Write property test for expiry reminders
    - **Property 10.4: Subscription expiry reminders**
    - **Validates: Requirements 10.4**

  - [x] 15.5 Create order expiry job
    - Implement job to find orders where expires_at ≤ now AND status = 'pending_payment'
    - Update order status to 'expired'
    - Release deposit address for reuse
    - Schedule to run every 15 minutes
    - _Requirements: 3.6, 12.7_

  - [ ]* 15.6 Write property test for order expiry
    - **Property 10: Order Expiry for Unpaid Orders**
    - **Validates: Requirements 3.6, 12.7**

  - [ ]* 15.7 Write unit tests for scheduled jobs
    - Test expiry job identifies correct subscriptions
    - Test reminder job sends notifications
    - Test order expiry job updates status
    - _Requirements: 10.2, 10.3, 10.4, 3.6, 12.7_


- [x] 16. Implement notification system
  - [x] 16.1 Create notification service
    - Implement sendNotification function
    - Queue notifications to SQS
    - Store notifications in database
    - Implement notification preference checking
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

  - [ ]* 16.2 Write property tests for notifications
    - **Property 53: System Event Notification Triggering**
    - **Property 54: Notification Preference Respect**
    - **Property 55: Notification History Persistence**
    - **Validates: Requirements 5.3, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7**

  - [x] 16.3 Implement email notification worker
    - Set up AWS SES for email sending
    - Create worker to consume notification queue
    - Implement email templates for each notification type
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 16.4 Implement notification API endpoints
    - GET /api/notifications - list user's notifications
    - PATCH /api/notifications/:id/read - mark notification as read
    - PATCH /api/user/notification-preferences - update preferences
    - _Requirements: 15.6, 15.7_

  - [ ]* 16.5 Write unit tests for notification system
    - Test notification creation for various events
    - Test preference filtering
    - Test notification history retrieval
    - Test email sending
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_


- [x] 17. Implement admin dashboard and controls
  - [x] 17.1 Create admin service
    - Implement getDisputesForReview function
    - Implement getPendingPayouts function
    - Implement getPlatformMetrics function
    - Implement suspendMerchant function
    - Implement audit logging for all admin actions
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6_

  - [ ]* 17.2 Write property tests for admin functions
    - **Property 47: Dispute Detail Completeness**
    - **Property 48: Admin Action Audit Logging**
    - **Property 49: Merchant Suspension Effects**
    - **Validates: Requirements 13.2, 13.4, 13.6, 13.7**

  - [x] 17.3 Implement admin API endpoints
    - GET /api/admin/disputes - list disputes for review
    - GET /api/admin/payouts - list pending payouts
    - GET /api/admin/metrics - get platform metrics
    - POST /api/admin/merchants/:id/suspend - suspend merchant
    - POST /api/admin/merchants/:id/unsuspend - unsuspend merchant
    - GET /api/admin/audit-log - get audit log entries
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6_

  - [ ]* 17.4 Write unit tests for admin endpoints
    - Test dispute listing and filtering
    - Test merchant suspension effects
    - Test audit log creation
    - Test authorization (admin role required)
    - _Requirements: 13.2, 13.4, 13.6, 13.7_


- [x] 18. Checkpoint - Ensure all backend services and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Implement security features
  - [x] 19.1 Implement rate limiting middleware
    - Create rate limiter using Redis
    - Set limit to 100 requests per minute per IP
    - Return HTTP 429 for exceeded limits
    - _Requirements: 14.4_

  - [ ]* 19.2 Write property test for rate limiting
    - **Property 50: API Rate Limiting**
    - **Validates: Requirements 14.4**

  - [x] 19.3 Implement input validation and sanitization
    - Create validation middleware for all endpoints
    - Sanitize inputs to prevent SQL injection, XSS, command injection
    - Use parameterized queries for database operations
    - _Requirements: 14.5_

  - [ ]* 19.4 Write property test for input sanitization
    - **Property 51: Input Sanitization**
    - **Validates: Requirements 14.5**

  - [x] 19.5 Implement authentication logging
    - Log all authentication attempts with details
    - Flag suspicious patterns (multiple failures, unusual locations)
    - _Requirements: 14.7_

  - [ ]* 19.6 Write property test for auth logging
    - **Property 52: Authentication Attempt Logging**
    - **Validates: Requirements 14.7**

  - [x] 19.7 Implement CSRF protection
    - Add CSRF token generation and validation
    - Protect all state-changing endpoints
    - _Requirements: 14.6_

  - [ ]* 19.8 Write unit tests for security features
    - Test rate limiting with burst requests
    - Test input validation rejects malicious inputs
    - Test CSRF protection
    - Test authentication logging
    - _Requirements: 14.4, 14.5, 14.6, 14.7_


- [x] 20. Implement React frontend application
  - [x] 20.1 Set up React project with Material-UI
    - Initialize React app with TypeScript
    - Install and configure Material-UI with dark theme
    - Set up React Router for navigation
    - Configure Axios for API calls
    - Set up theme toggle functionality
    - _Requirements: 11.1, 11.2, 11.5_

  - [ ]* 20.2 Write property test for theme persistence
    - **Property 42: Theme Preference Persistence**
    - **Validates: Requirements 11.2, 11.6**

  - [x] 20.3 Implement authentication pages
    - Create registration page with WebAuthn integration
    - Create login page with WebAuthn integration
    - Implement biometric credential registration flow
    - Add fallback authentication options
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [x] 20.4 Implement listing pages
    - Create listing catalog page with filters
    - Create listing detail page
    - Create merchant listing management page (create/edit listings)
    - Implement listing form with validation
    - _Requirements: 1.1, 1.2, 1.5, 1.6_

  - [x] 20.5 Implement search functionality
    - Create search bar with autocomplete
    - Implement search results page with filters
    - Add filter controls (category, price, merchant, signal type)
    - Display search suggestions for empty results
    - _Requirements: 9.1, 9.2, 9.3, 9.7_

  - [x] 20.6 Implement order and payment pages
    - Create order creation page with payment details
    - Display deposit address and QR code
    - Show payment status and confirmation progress
    - Implement order history page
    - _Requirements: 3.1, 12.1, 12.2, 12.5_


  - [x] 20.7 Implement subscription pages
    - Create subscription list page
    - Create subscription detail page with renewal option
    - Display subscription status and expiry countdown
    - Implement renewal flow
    - _Requirements: 10.5, 10.6_

  - [x] 20.8 Implement merchant storefront page
    - Create public storefront page at /store/:username
    - Display merchant profile and listings
    - Implement merchant profile editing page
    - Add SEO meta tags to storefront
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6_

  - [x] 20.9 Implement dispute pages
    - Create dispute creation form
    - Create dispute list page
    - Create dispute detail page with status updates
    - Implement merchant response form
    - _Requirements: 5.1, 5.2_

  - [x] 20.10 Implement merchant dashboard
    - Create balance overview page
    - Create payout request form
    - Create payout history page
    - Display escrow entries and pending balance
    - _Requirements: 6.1, 6.2, 6.7_

  - [x] 20.11 Implement admin dashboard
    - Create dispute review page
    - Create payout approval page
    - Create platform metrics dashboard
    - Implement merchant suspension controls
    - _Requirements: 13.1, 13.2, 13.3, 13.6_

  - [x] 20.12 Implement notification center
    - Create notification list component
    - Add notification badge to header
    - Implement mark as read functionality
    - Create notification preferences page
    - _Requirements: 15.6, 15.7_


  - [x] 20.13 Implement responsive design
    - Ensure all pages work on mobile (320px) to desktop (1920px)
    - Test and adjust layouts for different screen sizes
    - Ensure touch-friendly controls on mobile
    - _Requirements: 11.4_

  - [x] 20.14 Implement accessibility features
    - Ensure WCAG AA contrast ratios (4.5:1 minimum)
    - Add keyboard navigation support
    - Add visible focus indicators
    - Use semantic HTML elements
    - Add ARIA labels where needed
    - _Requirements: 11.3, 11.7_

  - [ ]* 20.15 Write integration tests for frontend
    - Test authentication flows
    - Test order creation and payment flow
    - Test search and filtering
    - Test subscription renewal
    - Test dispute creation
    - _Requirements: Multiple_


- [x] 21. Integration and deployment
  - [x] 21.1 Set up AWS infrastructure with Terraform
    - Configure ECS Fargate for backend services
    - Set up Aurora PostgreSQL Serverless v2
    - Configure ElastiCache Redis
    - Set up SQS queues for async operations
    - Configure AWS KMS for key management
    - Set up CloudFront CDN for frontend
    - Configure Route 53 for DNS
    - _Requirements: Infrastructure_

  - [x] 21.2 Implement CI/CD pipeline
    - Set up GitHub Actions workflows
    - Configure automated testing on pull requests
    - Set up automated deployment to staging
    - Configure production deployment with approval
    - _Requirements: Infrastructure_

  - [x] 21.3 Set up monitoring and logging
    - Configure CloudWatch for application logs
    - Set up CloudWatch alarms for critical metrics
    - Implement error tracking (e.g., Sentry)
    - Set up uptime monitoring
    - _Requirements: Infrastructure_

  - [x] 21.4 Configure environment-specific settings
    - Set up development, staging, and production environments
    - Configure environment variables and secrets
    - Set up database migrations for each environment
    - _Requirements: Infrastructure_

  - [ ]* 21.5 Perform end-to-end testing
    - Test complete user flows in staging environment
    - Test with real testnet cryptocurrency transactions
    - Test Telegram bot integration with test channels
    - Verify all scheduled jobs run correctly
    - Test error scenarios and recovery
    - _Requirements: All_


- [x] 22. Final checkpoint - Complete system verification
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all requirements are implemented
  - Verify all correctness properties are tested
  - Review security configurations
  - Verify monitoring and alerting are operational

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties with 100+ iterations
- Unit tests validate specific examples, edge cases, and error conditions
- Integration tests verify end-to-end flows across services
- The implementation follows a bottom-up approach: data layer → business logic → API → frontend
- External service integrations (Telegram, blockchain) are isolated for easier testing
- All async operations use message queues for reliability and scalability
