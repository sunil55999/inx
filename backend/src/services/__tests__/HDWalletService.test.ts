/**
 * HD Wallet Service Tests
 * 
 * Tests for hierarchical deterministic wallet address generation
 * 
 * Requirements: 3.1 (Requirement 5.2)
 */

import { HDWalletService } from '../HDWalletService';
import db from '../../database/connection';
import { CryptoCurrency } from '../../types/models';

describe('HDWalletService', () => {
  let hdWalletService: HDWalletService;

  beforeAll(async () => {
    // Run migrations
    await db.migrate.latest();
  });

  beforeEach(async () => {
    // Clean up deposit_addresses table
    await db('deposit_addresses').del();
    
    hdWalletService = new HDWalletService();
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('generateDepositAddress', () => {
    it('should generate a unique address for BNB', async () => {
      const orderId = 'order_123';
      const currency: CryptoCurrency = 'BNB';

      const address = await hdWalletService.generateDepositAddress(orderId, currency);

      expect(address).toBeDefined();
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/); // Ethereum address format
    });

    it('should generate a unique address for Bitcoin', async () => {
      const orderId = 'order_456';
      const currency: CryptoCurrency = 'BTC';

      const address = await hdWalletService.generateDepositAddress(orderId, currency);

      expect(address).toBeDefined();
      expect(address).toMatch(/^1[a-zA-Z0-9]{33}$/); // Bitcoin P2PKH format
    });

    it('should generate a unique address for TRON', async () => {
      const orderId = 'order_789';
      const currency: CryptoCurrency = 'USDT_TRC20';

      const address = await hdWalletService.generateDepositAddress(orderId, currency);

      expect(address).toBeDefined();
      expect(address).toMatch(/^T[a-zA-Z0-9]{33}$/); // TRON address format
    });

    it('should generate different addresses for different order IDs', async () => {
      const orderId1 = 'order_001';
      const orderId2 = 'order_002';
      const currency: CryptoCurrency = 'BNB';

      const address1 = await hdWalletService.generateDepositAddress(orderId1, currency);
      const address2 = await hdWalletService.generateDepositAddress(orderId2, currency);

      expect(address1).not.toBe(address2);
    });

    it('should generate different addresses for different currencies', async () => {
      const orderId = 'order_multi';

      const bnbAddress = await hdWalletService.generateDepositAddress(orderId + '_bnb', 'BNB');
      const btcAddress = await hdWalletService.generateDepositAddress(orderId + '_btc', 'BTC');
      const tronAddress = await hdWalletService.generateDepositAddress(orderId + '_tron', 'USDT_TRC20');

      expect(bnbAddress).not.toBe(btcAddress);
      expect(bnbAddress).not.toBe(tronAddress);
      expect(btcAddress).not.toBe(tronAddress);
    });

    it('should return the same address if called twice for the same order', async () => {
      const orderId = 'order_duplicate';
      const currency: CryptoCurrency = 'BNB';

      const address1 = await hdWalletService.generateDepositAddress(orderId, currency);
      const address2 = await hdWalletService.generateDepositAddress(orderId, currency);

      expect(address1).toBe(address2);
    });

    it('should store address-to-order mapping in database', async () => {
      const orderId = 'order_store';
      const currency: CryptoCurrency = 'USDT_BEP20';

      const address = await hdWalletService.generateDepositAddress(orderId, currency);

      const stored = await db('deposit_addresses')
        .where({ order_id: orderId })
        .first();

      expect(stored).toBeDefined();
      expect(stored.address).toBe(address);
      expect(stored.currency).toBe(currency);
      expect(stored.network).toBe('BNB_CHAIN');
    });

    it('should generate deterministic addresses from order ID', async () => {
      const orderId = 'order_deterministic';
      const currency: CryptoCurrency = 'BNB';

      // Clean database
      await db('deposit_addresses').del();

      // Generate address first time
      const address1 = await hdWalletService.generateDepositAddress(orderId, currency);

      // Delete from database
      await db('deposit_addresses').where({ order_id: orderId }).del();

      // Generate again - should be same address
      const address2 = await hdWalletService.generateDepositAddress(orderId, currency);

      expect(address1).toBe(address2);
    });
  });

  describe('getAddressByOrderId', () => {
    it('should retrieve address for existing order', async () => {
      const orderId = 'order_retrieve';
      const currency: CryptoCurrency = 'BNB';

      const generatedAddress = await hdWalletService.generateDepositAddress(orderId, currency);
      const retrieved = await hdWalletService.getAddressByOrderId(orderId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.address).toBe(generatedAddress);
      expect(retrieved?.orderId).toBe(orderId);
    });

    it('should return null for non-existent order', async () => {
      const retrieved = await hdWalletService.getAddressByOrderId('non_existent_order');
      expect(retrieved).toBeNull();
    });
  });

  describe('getOrderIdByAddress', () => {
    it('should retrieve order ID for existing address', async () => {
      const orderId = 'order_reverse';
      const currency: CryptoCurrency = 'BTC';

      const address = await hdWalletService.generateDepositAddress(orderId, currency);
      const retrievedOrderId = await hdWalletService.getOrderIdByAddress(address);

      expect(retrievedOrderId).toBe(orderId);
    });

    it('should return null for non-existent address', async () => {
      const retrievedOrderId = await hdWalletService.getOrderIdByAddress('0xnonexistent');
      expect(retrievedOrderId).toBeNull();
    });
  });

  describe('verifyAddressOwnership', () => {
    it('should return true for addresses in our wallet', async () => {
      const orderId = 'order_verify';
      const currency: CryptoCurrency = 'BNB';

      const address = await hdWalletService.generateDepositAddress(orderId, currency);
      const isOwned = await hdWalletService.verifyAddressOwnership(address);

      expect(isOwned).toBe(true);
    });

    it('should return false for external addresses', async () => {
      const isOwned = await hdWalletService.verifyAddressOwnership('0xexternaladdress123');
      expect(isOwned).toBe(false);
    });
  });

  describe('getAddressesByCurrency', () => {
    it('should retrieve all addresses for a specific currency', async () => {
      // Generate addresses for different currencies
      await hdWalletService.generateDepositAddress('order_bnb_1', 'BNB');
      await hdWalletService.generateDepositAddress('order_bnb_2', 'BNB');
      await hdWalletService.generateDepositAddress('order_btc_1', 'BTC');

      const bnbAddresses = await hdWalletService.getAddressesByCurrency('BNB');
      const btcAddresses = await hdWalletService.getAddressesByCurrency('BTC');

      expect(bnbAddresses).toHaveLength(2);
      expect(btcAddresses).toHaveLength(1);
    });

    it('should return empty array for currency with no addresses', async () => {
      const addresses = await hdWalletService.getAddressesByCurrency('USDC_BEP20');
      expect(addresses).toHaveLength(0);
    });
  });

  describe('address uniqueness', () => {
    it('should generate unique addresses for multiple orders', async () => {
      const orderIds = ['order_1', 'order_2', 'order_3', 'order_4', 'order_5'];
      const currency: CryptoCurrency = 'BNB';

      const addresses = await Promise.all(
        orderIds.map(orderId => hdWalletService.generateDepositAddress(orderId, currency))
      );

      // Check all addresses are unique
      const uniqueAddresses = new Set(addresses);
      expect(uniqueAddresses.size).toBe(addresses.length);
    });

    it('should handle concurrent address generation', async () => {
      const orderIds = Array.from({ length: 10 }, (_, i) => `order_concurrent_${i}`);
      const currency: CryptoCurrency = 'USDT_BEP20';

      // Generate addresses concurrently
      const addresses = await Promise.all(
        orderIds.map(orderId => hdWalletService.generateDepositAddress(orderId, currency))
      );

      // Verify all addresses are unique
      const uniqueAddresses = new Set(addresses);
      expect(uniqueAddresses.size).toBe(addresses.length);

      // Verify all are stored in database
      const stored = await db('deposit_addresses')
        .whereIn('order_id', orderIds)
        .select('*');

      expect(stored).toHaveLength(orderIds.length);
    });
  });

  describe('derivation path generation', () => {
    it('should generate consistent derivation paths for same order ID', async () => {
      const orderId = 'order_path_test';
      const currency: CryptoCurrency = 'BNB';

      await hdWalletService.generateDepositAddress(orderId, currency);
      const stored1 = await db('deposit_addresses')
        .where({ order_id: orderId })
        .first();

      // Delete and regenerate
      await db('deposit_addresses').where({ order_id: orderId }).del();
      await hdWalletService.generateDepositAddress(orderId, currency);
      const stored2 = await db('deposit_addresses')
        .where({ order_id: orderId })
        .first();

      expect(stored1.derivation_path).toBe(stored2.derivation_path);
    });

    it('should use BIP44 format for derivation paths', async () => {
      const orderId = 'order_bip44';
      const currency: CryptoCurrency = 'BNB';

      await hdWalletService.generateDepositAddress(orderId, currency);
      const stored = await db('deposit_addresses')
        .where({ order_id: orderId })
        .first();

      // BIP44 format: m/44'/coin_type'/0'/0/index
      expect(stored.derivation_path).toMatch(/^m\/44'\/\d+'\/0'\/0\/\d+$/);
    });
  });

  describe('network mapping', () => {
    it('should map BEP-20 tokens to BNB_CHAIN network', async () => {
      const currencies: CryptoCurrency[] = ['BNB', 'USDT_BEP20', 'USDC_BEP20'];

      for (const currency of currencies) {
        const orderId = `order_${currency}`;
        await hdWalletService.generateDepositAddress(orderId, currency);
        
        const stored = await db('deposit_addresses')
          .where({ order_id: orderId })
          .first();

        expect(stored.network).toBe('BNB_CHAIN');
      }
    });

    it('should map BTC to BITCOIN network', async () => {
      const orderId = 'order_btc_network';
      await hdWalletService.generateDepositAddress(orderId, 'BTC');
      
      const stored = await db('deposit_addresses')
        .where({ order_id: orderId })
        .first();

      expect(stored.network).toBe('BITCOIN');
    });

    it('should map TRC-20 tokens to TRON network', async () => {
      const orderId = 'order_trc20_network';
      await hdWalletService.generateDepositAddress(orderId, 'USDT_TRC20');
      
      const stored = await db('deposit_addresses')
        .where({ order_id: orderId })
        .first();

      expect(stored.network).toBe('TRON');
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close database connection to simulate error
      await db.destroy();

      const orderId = 'order_error';
      const currency: CryptoCurrency = 'BNB';

      await expect(
        hdWalletService.generateDepositAddress(orderId, currency)
      ).rejects.toThrow();
    });
  });
});
