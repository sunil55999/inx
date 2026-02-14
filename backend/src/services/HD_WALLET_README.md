# HD Wallet Service Implementation

## Overview

The HD Wallet Service implements hierarchical deterministic wallet functionality for generating unique cryptocurrency deposit addresses for orders across BNB Chain, Bitcoin, and TRON networks.

**Requirements:** Validates Requirement 3.1 (Requirement 5.2 - Generate unique deposit address for each order)

## Architecture

### Components

1. **HDWalletService** (`HDWalletService.ts`)
   - Main service for generating deposit addresses
   - Manages address-to-order mappings
   - Implements BIP44 derivation path generation

2. **DepositAddressRepository** (`DepositAddressRepository.ts`)
   - Database operations for deposit addresses
   - Query methods for address lookup

3. **Database Migration** (`20240101000014_create_deposit_addresses_table.ts`)
   - Creates `deposit_addresses` table
   - Stores address-to-order mappings

## Features Implemented

### ✅ Core Functionality

- **Unique Address Generation**: Each order gets a unique deposit address
- **Multi-Chain Support**: BNB Chain, Bitcoin, and TRON networks
- **BIP44 Derivation**: Standard hierarchical deterministic wallet paths
- **Database Mapping**: Persistent address-to-order relationships
- **Deterministic Generation**: Same order ID always generates same address
- **Address Verification**: Check if address belongs to our wallet

### ✅ Database Schema

```sql
CREATE TABLE deposit_addresses (
  id UUID PRIMARY KEY,
  order_id UUID UNIQUE NOT NULL,
  address VARCHAR(255) UNIQUE NOT NULL,
  currency VARCHAR(20) NOT NULL,
  network VARCHAR(20) NOT NULL,
  derivation_path VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

### ✅ API Methods

```typescript
// Generate deposit address for an order
generateDepositAddress(orderId: string, currency: CryptoCurrency): Promise<string>

// Get address by order ID
getAddressByOrderId(orderId: string): Promise<DepositAddress | null>

// Get order ID by address
getOrderIdByAddress(address: string): Promise<string | null>

// Verify address ownership
verifyAddressOwnership(address: string): Promise<boolean>

// Get all addresses for a currency
getAddressesByCurrency(currency: CryptoCurrency): Promise<DepositAddress[]>
```

## BIP44 Derivation Paths

The service uses BIP44 standard derivation paths:

```
m/44'/coin_type'/0'/0/index
```

Where:
- **coin_type**: 
  - `60` for BNB Chain (Ethereum-compatible)
  - `0` for Bitcoin
  - `195` for TRON
- **index**: Derived from order ID hash (deterministic)

### Example Paths

- BNB: `m/44'/60'/0'/0/123456789`
- Bitcoin: `m/44'/0'/0'/0/987654321`
- TRON: `m/44'/195'/0'/0/456789123`

## Current Implementation Status

### ✅ Completed

1. Service structure and interfaces
2. Database schema and migrations
3. Repository layer
4. Derivation path generation
5. Address-to-order mapping
6. Comprehensive unit tests
7. Multi-chain support structure

### ⚠️ Placeholder Implementation

The current implementation uses **deterministic test addresses** for development. The following components need production implementation:

1. **AWS KMS Integration**
   - Decrypt master seed from KMS
   - Secure key management

2. **Actual HD Wallet Derivation**
   - BIP39 mnemonic handling
   - BIP32 key derivation
   - Private key generation

3. **Address Generation**
   - BNB Chain: Ethereum-compatible addresses
   - Bitcoin: P2PKH or P2WPKH addresses
   - TRON: Base58Check encoded addresses

## Production Implementation Guide

### Step 1: Install Dependencies

```bash
npm install ethers bitcoinjs-lib tronweb @aws-sdk/client-kms
```

### Step 2: AWS KMS Setup

1. Create KMS key in AWS
2. Store encrypted master seed in KMS
3. Grant service IAM role access to KMS key

```typescript
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';

async function decryptMasterSeed(): Promise<string> {
  const client = new KMSClient({ region: process.env.AWS_REGION });
  const command = new DecryptCommand({
    CiphertextBlob: Buffer.from(this.masterSeedEncrypted, 'base64'),
    KeyId: this.kmsKeyId
  });
  
  const response = await client.send(command);
  return Buffer.from(response.Plaintext!).toString('utf-8');
}
```

### Step 3: Implement BNB Chain Address Generation

```typescript
import { ethers } from 'ethers';

async function generateBNBChainAddress(derivationPath: string): Promise<string> {
  // Decrypt master seed
  const mnemonic = await this.decryptMasterSeed();
  
  // Create HD wallet
  const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic);
  
  // Derive child key
  const childNode = hdNode.derivePath(derivationPath);
  
  // Return address
  return childNode.address;
}
```

### Step 4: Implement Bitcoin Address Generation

```typescript
import * as bitcoin from 'bitcoinjs-lib';
import * as bip32 from 'bip32';
import * as bip39 from 'bip39';

async function generateBitcoinAddress(derivationPath: string): Promise<string> {
  // Decrypt master seed
  const mnemonic = await this.decryptMasterSeed();
  
  // Generate seed from mnemonic
  const seed = await bip39.mnemonicToSeed(mnemonic);
  
  // Create HD wallet
  const root = bip32.fromSeed(seed);
  
  // Derive child key
  const child = root.derivePath(derivationPath);
  
  // Generate P2WPKH address (native segwit)
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: child.publicKey,
    network: bitcoin.networks.bitcoin
  });
  
  return address!;
}
```

### Step 5: Implement TRON Address Generation

```typescript
import TronWeb from 'tronweb';

async function generateTronAddress(derivationPath: string): Promise<string> {
  // Decrypt master seed
  const mnemonic = await this.decryptMasterSeed();
  
  // Derive private key (similar to Ethereum)
  const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic);
  const childNode = hdNode.derivePath(derivationPath);
  
  // Convert to TRON address
  const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });
  const address = tronWeb.address.fromPrivateKey(childNode.privateKey);
  
  return address;
}
```

## Security Considerations

### ✅ Implemented

1. **Master seed stored in AWS KMS** (configured, not implemented)
2. **Unique addresses per order** (prevents address reuse)
3. **Database mapping** (persistent address tracking)
4. **No private keys in logs** (logging configured safely)

### ⚠️ Required for Production

1. **KMS encryption/decryption** (implement AWS KMS integration)
2. **Private key handling** (never store unencrypted private keys)
3. **Secure memory management** (clear sensitive data after use)
4. **Access control** (restrict KMS access to service role only)
5. **Audit logging** (log all address generation events)

## Testing

### Unit Tests

Run the test suite:

```bash
npm test -- HDWalletService.test.ts
```

### Test Coverage

- ✅ Address generation for all currencies
- ✅ Address uniqueness
- ✅ Deterministic generation
- ✅ Database mapping
- ✅ Concurrent generation
- ✅ Error handling
- ✅ Network mapping
- ✅ Derivation path format

### Property-Based Tests

Property tests for address uniqueness are defined in Task 7.2:

```typescript
// Property 7: Deposit Address Uniqueness
// For any set of orders, all generated deposit addresses should be unique
```

## Usage Example

```typescript
import { hdWalletService } from './services/HDWalletService';

// Generate deposit address for an order
const orderId = 'order_abc123';
const currency = 'BNB';

const address = await hdWalletService.generateDepositAddress(orderId, currency);
console.log(`Deposit address: ${address}`);

// Later, look up order by address
const foundOrderId = await hdWalletService.getOrderIdByAddress(address);
console.log(`Order ID: ${foundOrderId}`);

// Verify address belongs to our wallet
const isOurs = await hdWalletService.verifyAddressOwnership(address);
console.log(`Address is ours: ${isOurs}`);
```

## Integration with Order Service

The HD Wallet Service should be integrated into the Order Service:

```typescript
// In OrderService.createOrder()
async createOrder(buyerId: string, listingId: string): Promise<Order> {
  // ... get listing details ...
  
  // Generate unique deposit address
  const depositAddress = await hdWalletService.generateDepositAddress(
    orderId,
    listing.currency
  );
  
  // Create order with deposit address
  const order = await orderRepository.create({
    id: orderId,
    buyerId,
    listingId,
    depositAddress,
    amount: listing.price,
    currency: listing.currency,
    status: OrderStatus.PENDING_PAYMENT,
    // ...
  });
  
  return order;
}
```

## Environment Variables

Required configuration:

```env
# HD Wallet Configuration
WALLET_MASTER_SEED=<encrypted-seed-from-kms>
WALLET_DERIVATION_PATH=m/44'/60'/0'/0

# AWS Configuration
AWS_REGION=us-east-1
AWS_KMS_KEY_ID=<your-kms-key-id>
```

## Migration Instructions

To apply the database migration:

```bash
# Run migration
npm run migrate:latest

# Rollback if needed
npm run migrate:rollback
```

## Next Steps

1. **Implement AWS KMS integration** (Step 2 above)
2. **Install crypto libraries** (ethers, bitcoinjs-lib, tronweb)
3. **Implement production address generation** (Steps 3-5 above)
4. **Test with real blockchain networks** (testnet first)
5. **Implement property-based tests** (Task 7.2)
6. **Security audit** (review key handling)
7. **Integration testing** (with Order Service)

## References

- [BIP32: Hierarchical Deterministic Wallets](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki)
- [BIP39: Mnemonic Code for Generating Deterministic Keys](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki)
- [BIP44: Multi-Account Hierarchy for Deterministic Wallets](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)
- [AWS KMS Documentation](https://docs.aws.amazon.com/kms/)
- [Ethers.js Documentation](https://docs.ethers.org/)
- [BitcoinJS Library](https://github.com/bitcoinjs/bitcoinjs-lib)
- [TronWeb Documentation](https://developers.tron.network/docs/tronweb)

## Support

For questions or issues with the HD Wallet Service, please refer to:
- Design document: `.kiro/specs/telegram-signals-marketplace/design.md`
- Requirements: `.kiro/specs/telegram-signals-marketplace/requirements.md`
- Task list: `.kiro/specs/telegram-signals-marketplace/tasks.md`
