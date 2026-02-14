# Requirements Document: Telegram Signals Marketplace

## Introduction

The Telegram Signals Marketplace is a multi-vendor platform enabling merchants to list and sell subscriptions to their Telegram signal channels. Buyers purchase access using cryptocurrency, and the platform automates subscription management through Telegram Bot API integration. The system handles payment processing, escrow, automated user access control, and merchant payouts.

## Glossary

- **Platform**: The Telegram Signals Marketplace web application and backend services
- **Merchant**: A vendor who lists Telegram channels for sale on the Platform
- **Buyer**: A user who purchases subscription access to a Telegram channel
- **Channel**: A Telegram channel or group that provides signals or content
- **Listing**: A merchant's offer to sell access to a specific Channel at a defined price and duration
- **Subscription**: An active access grant for a Buyer to a Channel via a purchased Listing
- **Bot**: The Platform's Telegram bot that manages user access to Channels
- **Escrow**: The Platform's holding of payment funds until subscription fulfillment conditions are met
- **Transaction**: A blockchain payment record for a purchase
- **Order**: A purchase record linking a Buyer, Listing, and Transaction
- **Deposit_Address**: A unique cryptocurrency wallet address generated for a specific purchase
- **Payout**: A cryptocurrency transfer from the Platform to a Merchant's wallet
- **Ticket**: A support request or dispute raised by a Buyer or Merchant
- **Admin**: A Platform operator with elevated privileges for managing disputes and system operations

## Requirements

### Requirement 1: Multi-Vendor Product Catalog

**User Story:** As a merchant, I want to create and manage listings for my Telegram channels, so that buyers can discover and purchase subscriptions to my signals.

#### Acceptance Criteria

1. THE Platform SHALL maintain a unified catalog of all Channel listings across all Merchants
2. WHEN a Merchant creates a Listing, THE Platform SHALL associate it with the Merchant's account and a specific Channel
3. THE Platform SHALL store for each Listing: Channel identifier, Merchant identifier, price, subscription duration, and description
4. WHEN a Buyer views the catalog, THE Platform SHALL display Listings from all Merchants in a unified storefront
5. THE Platform SHALL allow multiple Merchants to create Listings for the same Channel with different prices and durations
6. WHEN a Channel has multiple Listings, THE Platform SHALL display all available offers to Buyers

### Requirement 2: Order and Subscription Management

**User Story:** As a buyer, I want to purchase channel subscriptions and have them automatically activated, so that I can access signal content immediately after payment.

#### Acceptance Criteria

1. WHEN a Buyer initiates a purchase, THE Platform SHALL create an Order record linking the Buyer, Listing, and generated Deposit_Address
2. WHEN payment is confirmed, THE Platform SHALL create a Subscription record with start timestamp and calculated expiry timestamp
3. THE Platform SHALL store for each Subscription: Buyer identifier, Listing identifier, start timestamp, expiry timestamp, and status
4. WHEN a Subscription is created, THE Platform SHALL trigger the Bot to grant Channel access
5. WHEN a Subscription expires, THE Platform SHALL update the Subscription status and trigger the Bot to revoke Channel access
6. THE Platform SHALL support Subscription renewals by creating new Subscription records linked to the original

### Requirement 3: Telegram Bot Access Control

**User Story:** As a platform operator, I want the bot to automatically manage user access to channels, so that subscription enforcement is automated and reliable.

#### Acceptance Criteria

1. WHEN a Subscription is activated, THE Bot SHALL invite the Buyer to the associated Channel using Telegram Bot API
2. WHEN a Subscription expires, THE Bot SHALL remove the Buyer from the Channel using kickChatMember API
3. IF a Bot operation fails due to insufficient permissions, THEN THE Platform SHALL flag the Listing as inactive and notify the Merchant
4. THE Bot SHALL verify it has admin privileges in a Channel before allowing a Merchant to create a Listing
5. WHEN a refund is approved, THE Bot SHALL immediately remove the Buyer from the Channel
6. THE Bot SHALL handle Telegram API rate limits and retry failed operations with exponential backoff

### Requirement 4: Subscription Expiry Scheduling

**User Story:** As a platform operator, I want subscriptions to automatically expire at the correct time, so that access control remains accurate without manual intervention.

#### Acceptance Criteria

1. THE Platform SHALL maintain a task queue or scheduled job system for processing Subscription expiries
2. WHEN a Subscription is created, THE Platform SHALL schedule an expiry task for the calculated expiry timestamp
3. THE Platform SHALL process expiry tasks within 5 minutes of the scheduled expiry timestamp
4. WHEN processing an expiry task, THE Platform SHALL update the Subscription status and trigger Bot access revocation
5. IF an expiry task fails, THEN THE Platform SHALL retry the task up to 3 times with exponential backoff
6. THE Platform SHALL log all expiry task executions for audit purposes

### Requirement 5: Cryptocurrency Payment Processing

**User Story:** As a buyer, I want to pay for subscriptions using cryptocurrency, so that I can purchase access without traditional payment methods.

#### Acceptance Criteria

1. THE Platform SHALL support payments in BNB (native), BEP-20 USDT, BEP-20 USDC, Bitcoin, and USDT-TRC20
2. WHEN a Buyer initiates a purchase, THE Platform SHALL generate a unique Deposit_Address for that specific Order
3. THE Platform SHALL monitor the blockchain for incoming transactions to generated Deposit_Addresses
4. WHEN a transaction is detected, THE Platform SHALL verify the payment amount matches the Order total within 0.1% tolerance
5. WHEN payment is confirmed with sufficient blockchain confirmations, THE Platform SHALL activate the Subscription
6. THE Platform SHALL require minimum confirmations: 12 for BNB Chain, 3 for Bitcoin, 19 for TRON
7. IF payment is insufficient or not received within 24 hours, THEN THE Platform SHALL mark the Order as expired

### Requirement 6: Blockchain Transaction Monitoring

**User Story:** As a platform operator, I want real-time monitoring of blockchain transactions, so that payments are confirmed quickly and accurately.

#### Acceptance Criteria

1. THE Platform SHALL connect to blockchain networks via WebSocket or node RPC for real-time transaction monitoring
2. WHEN monitoring BNB Chain, THE Platform SHALL use BscScan WebSocket API or a hosted node provider
3. THE Platform SHALL subscribe to address-specific transaction notifications for all active Deposit_Addresses
4. WHEN a transaction is detected, THE Platform SHALL extract: sender address, amount, token type, and confirmation count
5. THE Platform SHALL update Order status in real-time as confirmations accumulate
6. IF blockchain connection is lost, THEN THE Platform SHALL reconnect automatically and resume monitoring

### Requirement 7: Payment Escrow System

**User Story:** As a buyer, I want my payment held in escrow until service is delivered, so that I am protected if the merchant fails to provide access.

#### Acceptance Criteria

1. WHEN payment is confirmed, THE Platform SHALL hold funds in Escrow until the Subscription term completes or a refund is approved
2. THE Platform SHALL maintain an Escrow balance ledger tracking funds for each active Subscription
3. WHEN a Subscription completes successfully, THE Platform SHALL release Escrow funds to the Merchant's balance
4. WHEN a refund is approved, THE Platform SHALL calculate pro-rated refund amount based on unused subscription days
5. THE Platform SHALL deduct platform fees from Merchant payouts before releasing funds
6. THE Platform SHALL maintain audit logs of all Escrow transactions

### Requirement 8: Merchant Payout System

**User Story:** As a merchant, I want to withdraw my earnings to my cryptocurrency wallet, so that I can receive payment for my services.

#### Acceptance Criteria

1. THE Platform SHALL maintain a balance ledger for each Merchant tracking available funds
2. WHEN a Merchant requests a withdrawal, THE Platform SHALL verify sufficient available balance
3. THE Platform SHALL process cryptocurrency Payouts to Merchant-specified wallet addresses
4. WHEN processing a Payout, THE Platform SHALL deduct the amount from the Merchant's balance and create a blockchain transaction
5. THE Platform SHALL support Payout in the same cryptocurrencies as payment acceptance
6. THE Platform SHALL require minimum withdrawal amounts: 0.01 BNB, 10 USDT/USDC, 0.001 BTC
7. IF a Payout transaction fails, THEN THE Platform SHALL restore the Merchant's balance and notify the Merchant

### Requirement 9: WebAuthn Biometric Authentication

**User Story:** As a user, I want to log in using biometric authentication, so that I can access my account securely without passwords.

#### Acceptance Criteria

1. THE Platform SHALL implement WebAuthn (FIDO2) protocol for user authentication
2. WHEN a user registers, THE Platform SHALL support registration of biometric authenticators (fingerprint, face recognition)
3. WHEN a user logs in, THE Platform SHALL authenticate using registered WebAuthn credentials
4. THE Platform SHALL store WebAuthn credential public keys and challenge data securely
5. THE Platform SHALL support multiple authenticators per user account
6. WHERE a user prefers password authentication, THE Platform SHALL support password-based login as an alternative
7. THE Platform SHALL enforce multi-factor authentication for Merchant accounts and Admin accounts

### Requirement 10: Merchant Storefront Pages

**User Story:** As a merchant, I want a dedicated storefront page with a unique URL, so that I can share my channel listings with potential buyers.

#### Acceptance Criteria

1. THE Platform SHALL create a unique storefront URL for each Merchant in the format /store/{merchant_username}
2. WHEN a Buyer visits a Merchant storefront, THE Platform SHALL display only that Merchant's active Listings
3. THE Platform SHALL display Merchant profile information including: username, description, and total sales count
4. THE Platform SHALL allow Merchants to customize their storefront description and profile image
5. WHEN a Merchant updates their profile, THE Platform SHALL reflect changes immediately on their storefront page

### Requirement 11: Search and Discovery

**User Story:** As a buyer, I want to search and filter channel listings, so that I can find signals relevant to my trading interests.

#### Acceptance Criteria

1. THE Platform SHALL provide full-text search across Channel names, descriptions, and Merchant usernames
2. WHEN a Buyer enters a search query, THE Platform SHALL return matching Listings ranked by relevance
3. THE Platform SHALL provide autocomplete suggestions as the Buyer types in the search field
4. THE Platform SHALL support filtering Listings by: Merchant, price range, subscription duration, and signal type
5. THE Platform SHALL support sorting Listings by: price (ascending/descending), popularity, and newest first
6. WHEN no Listings match search criteria, THE Platform SHALL display a message suggesting alternative search terms

### Requirement 12: User Interface Design

**User Story:** As a user, I want a modern dark-themed interface, so that I can browse and purchase comfortably in low-light conditions.

#### Acceptance Criteria

1. THE Platform SHALL use a dark theme with dark gray backgrounds and light text throughout the interface
2. THE Platform SHALL use readable sans-serif fonts such as Roboto, Inter, Lato, or Open Sans
3. THE Platform SHALL implement responsive design supporting desktop, tablet, and mobile viewports
4. THE Platform SHALL use a component library (Material-UI, Tailwind CSS, or Bootstrap) for consistent styling
5. WHEN displaying prices, THE Platform SHALL show cryptocurrency amounts with appropriate decimal precision
6. THE Platform SHALL provide visual feedback for loading states, successful actions, and errors

### Requirement 13: Ticket and Dispute System

**User Story:** As a buyer, I want to raise disputes if I don't receive access or experience issues, so that I can get support and potentially receive a refund.

#### Acceptance Criteria

1. THE Platform SHALL allow Buyers to create Tickets for Orders with issues
2. WHEN a Buyer creates a Ticket, THE Platform SHALL capture: Order identifier, issue description, and timestamp
3. THE Platform SHALL notify Admins when new Tickets are created
4. THE Platform SHALL allow Admins to view Ticket details including Order, Subscription, and Transaction information
5. THE Platform SHALL allow Admins to approve or deny refund requests through the Ticket interface
6. WHEN a refund is approved, THE Platform SHALL calculate pro-rated amount and process the refund automatically
7. THE Platform SHALL notify the Buyer and Merchant when a Ticket is resolved

### Requirement 14: Refund Processing

**User Story:** As a buyer, I want to receive refunds for unused subscription time if issues occur, so that I am not charged for services I cannot access.

#### Acceptance Criteria

1. WHEN a refund is approved, THE Platform SHALL calculate refund amount as: (payment amount) × (unused days / total subscription days)
2. THE Platform SHALL deduct platform fees from the Merchant's portion, not from the Buyer's refund
3. WHEN processing a refund, THE Platform SHALL return funds to the original Deposit_Address used for payment
4. THE Platform SHALL update the Subscription status to "refunded" and trigger Bot access revocation
5. IF a Merchant violates source Channel terms causing access loss, THEN THE Platform SHALL not penalize the Buyer's refund amount
6. THE Platform SHALL maintain refund transaction records for audit and accounting purposes

### Requirement 15: Listing Validation and Status Management

**User Story:** As a platform operator, I want to automatically detect when listings become invalid, so that buyers are not sold access to channels where the bot lacks permissions.

#### Acceptance Criteria

1. WHEN a Merchant creates a Listing, THE Platform SHALL verify the Bot has admin privileges in the specified Channel
2. IF the Bot lacks admin privileges, THEN THE Platform SHALL reject the Listing creation and notify the Merchant
3. WHEN the Bot detects it has been removed as admin from a Channel, THE Platform SHALL mark all associated Listings as inactive
4. THE Platform SHALL notify affected Merchants when their Listings are marked inactive
5. THE Platform SHALL prevent new purchases of inactive Listings
6. WHEN the Bot regains admin privileges, THE Platform SHALL allow the Merchant to reactivate the Listing

### Requirement 16: Admin Dashboard and Controls

**User Story:** As an admin, I want a dashboard to monitor platform operations and manage disputes, so that I can ensure smooth platform operation and resolve issues.

#### Acceptance Criteria

1. THE Platform SHALL provide an Admin dashboard displaying: active Subscriptions count, pending Tickets, recent Transactions, and Escrow balance
2. THE Platform SHALL allow Admins to view and search all Orders, Subscriptions, and Transactions
3. THE Platform SHALL allow Admins to manually trigger Bot operations for testing and recovery
4. THE Platform SHALL allow Admins to adjust platform fee percentages
5. THE Platform SHALL provide audit logs of all Admin actions
6. THE Platform SHALL restrict Admin dashboard access to authenticated Admin accounts only

### Requirement 17: Security and Secret Management

**User Story:** As a platform operator, I want sensitive credentials stored securely, so that the platform and user funds are protected from unauthorized access.

#### Acceptance Criteria

1. THE Platform SHALL store Telegram Bot API tokens in AWS KMS or equivalent secure secret storage
2. THE Platform SHALL store cryptocurrency wallet private keys in AWS KMS with encryption at rest
3. THE Platform SHALL use environment variables or secret management services for all sensitive configuration
4. THE Platform SHALL never log or expose private keys, API tokens, or user credentials in plain text
5. THE Platform SHALL use HTTPS/TLS for all web traffic and API communications
6. THE Platform SHALL implement rate limiting on authentication endpoints to prevent brute force attacks

### Requirement 18: Database Schema and Data Integrity

**User Story:** As a platform operator, I want a robust database schema with referential integrity, so that data remains consistent and reliable.

#### Acceptance Criteria

1. THE Platform SHALL use PostgreSQL or Amazon Aurora as the primary database
2. THE Platform SHALL define tables for: Users, Merchants, Channels, Listings, Orders, Subscriptions, Transactions, Tickets, and Escrow_Ledger
3. THE Platform SHALL enforce foreign key constraints between related tables
4. THE Platform SHALL use database transactions for operations that modify multiple tables
5. THE Platform SHALL implement database indexes on frequently queried columns (user IDs, Order IDs, Subscription expiry timestamps)
6. THE Platform SHALL perform regular automated database backups with point-in-time recovery capability

### Requirement 19: Scalability and Performance

**User Story:** As a platform operator, I want the system to handle growing transaction volume, so that performance remains acceptable as the user base expands.

#### Acceptance Criteria

1. THE Platform SHALL deploy the Telegram Bot service as AWS Lambda functions or containerized services behind webhooks
2. THE Platform SHALL use connection pooling for database connections to handle concurrent requests
3. THE Platform SHALL implement caching for frequently accessed data (Channel listings, Merchant profiles)
4. WHEN search query volume increases, THE Platform SHALL scale search infrastructure horizontally
5. THE Platform SHALL monitor API response times and alert when latency exceeds 2 seconds for 95th percentile
6. THE Platform SHALL implement queue-based processing for blockchain monitoring to handle high transaction volumes

### Requirement 20: Terms of Service and Compliance

**User Story:** As a platform operator, I want clear terms of service and compliance measures, so that the platform operates within legal boundaries and user expectations are set.

#### Acceptance Criteria

1. THE Platform SHALL display Terms of Service including refund policies, escrow terms, and merchant obligations
2. THE Platform SHALL require users to accept Terms of Service before creating an account
3. WHERE required by jurisdiction, THE Platform SHALL implement KYC/AML verification for Merchants
4. THE Platform SHALL maintain records of user acceptance of Terms of Service with timestamps
5. THE Platform SHALL provide a mechanism for users to export their personal data upon request
6. THE Platform SHALL implement account suspension capabilities for Terms of Service violations
