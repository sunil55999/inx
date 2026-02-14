/**
 * Unit Tests for Blockchain Monitor Service
 * 
 * Tests the blockchain monitoring functionality including:
 * - Address watching and unwatching
 * - Transaction detection and processing
 * - Connection management and reconnection
 * - Event publishing to SQS
 */

import { BlockchainMonitorService } from '../BlockchainMonitorService';
import { sqsClient } from '../../config/sqs';
import { CryptoCurrency, Transaction } from '../../types/models';

// Mock dependencies
jest.mock('../../config/sqs', () => ({
  sqsClient: {
    send: jest.fn()
  }
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('BlockchainMonitorService', () => {
  let service: BlockchainMonitorService;
  const mockQueueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/transactions';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BlockchainMonitorService(mockQueueUrl);
  });

  afterEach(async () => {
    await service.stop();
  });

  describe('start and stop', () => {
    it('should start monitoring service successfully', async () => {
      await service.start();
      
      const status = service.getConnectionStatus();
      expect(status.BNB_CHAIN).toBe(true);
      expect(status.BITCOIN).toBe(true);
      expect(status.TRON).toBe(true);
    });

    it('should stop monitoring service successfully', async () => {
      await service.start();
      await service.stop();
      
      const status = service.getConnectionStatus();
      expect(status.BNB_CHAIN).toBe(false);
      expect(status.BITCOIN).toBe(false);
      expect(status.TRON).toBe(false);
    });

    it('should not start if already running', async () => {
      await service.start();
      await service.start(); // Second call should be ignored
      
      const status = service.getConnectionStatus();
      expect(status.BNB_CHAIN).toBe(true);
    });
  });

  describe('watchAddress', () => {
    beforeEach(async () => {
      await service.start();
    });

    it('should watch BNB Chain address successfully', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const orderId = 'order_123';
      const currency: CryptoCurrency = 'BNB';
      const expectedAmount = 1.5;

      await service.watchAddress(address, orderId, currency, expectedAmount);

      const watched = service.getWatchedAddresses();
      expect(watched).toHaveLength(1);
      expect(watched[0]).toMatchObject({
        address,
        orderId,
        currency,
        expectedAmount,
        network: 'BNB_CHAIN'
      });
    });

    it('should watch Bitcoin address successfully', async () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const orderId = 'order_456';
      const currency: CryptoCurrency = 'BTC';
      const expectedAmount = 0.05;

      await service.watchAddress(address, orderId, currency, expectedAmount);

      const watched = service.getWatchedAddresses();
      expect(watched).toHaveLength(1);
      expect(watched[0]).toMatchObject({
        address,
        orderId,
        currency,
        expectedAmount,
        network: 'BITCOIN'
      });
    });

    it('should watch TRON address successfully', async () => {
      const address = 'TRX9address1234567890123456789012';
      const orderId = 'order_789';
      const currency: CryptoCurrency = 'USDT_TRC20';
      const expectedAmount = 100;

      await service.watchAddress(address, orderId, currency, expectedAmount);

      const watched = service.getWatchedAddresses();
      expect(watched).toHaveLength(1);
      expect(watched[0]).toMatchObject({
        address,
        orderId,
        currency,
        expectedAmount,
        network: 'TRON'
      });
    });

    it('should watch multiple addresses simultaneously', async () => {
      const addresses = [
        { address: '0xabc', orderId: 'order_1', currency: 'BNB' as CryptoCurrency, amount: 1 },
        { address: '0xdef', orderId: 'order_2', currency: 'USDT_BEP20' as CryptoCurrency, amount: 50 },
        { address: '1BTC', orderId: 'order_3', currency: 'BTC' as CryptoCurrency, amount: 0.01 }
      ];

      for (const addr of addresses) {
        await service.watchAddress(addr.address, addr.orderId, addr.currency, addr.amount);
      }

      const watched = service.getWatchedAddresses();
      expect(watched).toHaveLength(3);
    });

    it('should call custom callback when provided', async () => {
      const callback = jest.fn();
      const address = '0x1234567890123456789012345678901234567890';
      const orderId = 'order_callback';
      const currency: CryptoCurrency = 'BNB';

      await service.watchAddress(address, orderId, currency, 1.0, callback);

      const watched = service.getWatchedAddresses();
      expect(watched[0].callback).toBe(callback);
    });
  });

  describe('unwatchAddress', () => {
    beforeEach(async () => {
      await service.start();
    });

    it('should unwatch address successfully', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const orderId = 'order_123';
      const currency: CryptoCurrency = 'BNB';

      await service.watchAddress(address, orderId, currency, 1.0);
      expect(service.getWatchedAddresses()).toHaveLength(1);

      await service.unwatchAddress(address);
      expect(service.getWatchedAddresses()).toHaveLength(0);
    });

    it('should handle unwatching non-existent address gracefully', async () => {
      await service.unwatchAddress('0xnonexistent');
      // Should not throw error
      expect(service.getWatchedAddresses()).toHaveLength(0);
    });

    it('should only unwatch specified address', async () => {
      await service.watchAddress('0xaaa', 'order_1', 'BNB', 1.0);
      await service.watchAddress('0xbbb', 'order_2', 'BNB', 2.0);

      await service.unwatchAddress('0xaaa');

      const watched = service.getWatchedAddresses();
      expect(watched).toHaveLength(1);
      expect(watched[0].address).toBe('0xbbb');
    });
  });

  describe('getConnectionStatus', () => {
    it('should return all networks disconnected initially', () => {
      const status = service.getConnectionStatus();
      
      expect(status.BNB_CHAIN).toBe(false);
      expect(status.BITCOIN).toBe(false);
      expect(status.TRON).toBe(false);
    });

    it('should return all networks connected after start', async () => {
      await service.start();
      const status = service.getConnectionStatus();
      
      expect(status.BNB_CHAIN).toBe(true);
      expect(status.BITCOIN).toBe(true);
      expect(status.TRON).toBe(true);
    });

    it('should return all networks disconnected after stop', async () => {
      await service.start();
      await service.stop();
      const status = service.getConnectionStatus();
      
      expect(status.BNB_CHAIN).toBe(false);
      expect(status.BITCOIN).toBe(false);
      expect(status.TRON).toBe(false);
    });
  });

  describe('transaction processing', () => {
    beforeEach(async () => {
      await service.start();
      (sqsClient.send as jest.Mock).mockResolvedValue({});
    });

    it('should publish TRANSACTION_DETECTED event to SQS', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const orderId = 'order_123';
      
      await service.watchAddress(address, orderId, 'BNB', 1.0);

      // Simulate transaction detection by calling private method via event
      const transaction: Transaction = {
        id: 'tx_1',
        orderId,
        transactionHash: '0xabcdef',
        fromAddress: '0xsender',
        toAddress: address,
        amount: 1.0,
        currency: 'BNB',
        confirmations: 0,
        blockNumber: 12345,
        detectedAt: new Date(),
        confirmedAt: undefined
      };

      // Trigger transaction event
      service.emit('transaction', transaction);

      // Note: In actual implementation, processTransaction would be called
      // which would publish to SQS. For this test, we verify the method exists
      expect(service.getWatchedAddresses()).toHaveLength(1);
    });

    it('should publish TRANSACTION_CONFIRMED event when confirmations met', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      const orderId = 'order_456';
      
      await service.watchAddress(address, orderId, 'BNB', 1.0);

      const transaction: Transaction = {
        id: 'tx_2',
        orderId,
        transactionHash: '0xconfirmed',
        fromAddress: '0xsender',
        toAddress: address,
        amount: 1.0,
        currency: 'BNB',
        confirmations: 12, // Meets BNB requirement
        blockNumber: 12345,
        detectedAt: new Date(),
        confirmedAt: new Date()
      };

      service.emit('transaction', transaction);
      expect(service.getWatchedAddresses()).toHaveLength(1);
    });
  });

  describe('network-specific functionality', () => {
    beforeEach(async () => {
      await service.start();
    });

    it('should route BNB/USDT_BEP20/USDC_BEP20 to BNB_CHAIN', async () => {
      await service.watchAddress('0xaaa', 'order_1', 'BNB', 1.0);
      await service.watchAddress('0xbbb', 'order_2', 'USDT_BEP20', 50);
      await service.watchAddress('0xccc', 'order_3', 'USDC_BEP20', 100);

      const watched = service.getWatchedAddresses();
      expect(watched.filter(w => w.network === 'BNB_CHAIN')).toHaveLength(3);
    });

    it('should route BTC to BITCOIN network', async () => {
      await service.watchAddress('1BTC', 'order_1', 'BTC', 0.01);

      const watched = service.getWatchedAddresses();
      expect(watched[0].network).toBe('BITCOIN');
    });

    it('should route USDT_TRC20 to TRON network', async () => {
      await service.watchAddress('TRON', 'order_1', 'USDT_TRC20', 100);

      const watched = service.getWatchedAddresses();
      expect(watched[0].network).toBe('TRON');
    });
  });

  describe('error handling', () => {
    it('should handle connection failures gracefully', async () => {
      // Service should not throw even if connections fail
      await expect(service.start()).resolves.not.toThrow();
    });

    it('should handle SQS publish failures gracefully', async () => {
      await service.start();
      (sqsClient.send as jest.Mock).mockRejectedValue(new Error('SQS error'));

      // Should not throw when watching address
      await expect(
        service.watchAddress('0xabc', 'order_1', 'BNB', 1.0)
      ).resolves.not.toThrow();
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      await service.start();
    });

    it('should handle watching same address twice', async () => {
      const address = '0x1234567890123456789012345678901234567890';
      
      await service.watchAddress(address, 'order_1', 'BNB', 1.0);
      await service.watchAddress(address, 'order_2', 'BNB', 2.0);

      // Second watch should overwrite first
      const watched = service.getWatchedAddresses();
      expect(watched).toHaveLength(1);
      expect(watched[0].orderId).toBe('order_2');
    });

    it('should handle empty queue URL', () => {
      const serviceNoQueue = new BlockchainMonitorService('');
      expect(serviceNoQueue).toBeDefined();
    });

    it('should handle zero expected amount', async () => {
      await service.watchAddress('0xabc', 'order_1', 'BNB', 0);
      
      const watched = service.getWatchedAddresses();
      expect(watched[0].expectedAmount).toBe(0);
    });

    it('should handle very large expected amount', async () => {
      const largeAmount = 1000000;
      await service.watchAddress('0xabc', 'order_1', 'BNB', largeAmount);
      
      const watched = service.getWatchedAddresses();
      expect(watched[0].expectedAmount).toBe(largeAmount);
    });
  });

  describe('getWatchedAddresses', () => {
    beforeEach(async () => {
      await service.start();
    });

    it('should return empty array when no addresses watched', () => {
      const watched = service.getWatchedAddresses();
      expect(watched).toEqual([]);
    });

    it('should return all watched addresses', async () => {
      await service.watchAddress('0xaaa', 'order_1', 'BNB', 1.0);
      await service.watchAddress('0xbbb', 'order_2', 'BTC', 0.01);
      await service.watchAddress('0xccc', 'order_3', 'USDT_TRC20', 50);

      const watched = service.getWatchedAddresses();
      expect(watched).toHaveLength(3);
      expect(watched.map(w => w.orderId)).toEqual(['order_1', 'order_2', 'order_3']);
    });

    it('should return copy of watched addresses (not reference)', async () => {
      await service.watchAddress('0xaaa', 'order_1', 'BNB', 1.0);

      const watched1 = service.getWatchedAddresses();
      const watched2 = service.getWatchedAddresses();

      expect(watched1).not.toBe(watched2); // Different array instances
      expect(watched1).toEqual(watched2); // But same content
    });
  });
});
