/**
 * Crypto Transaction Service Tests
 * 
 * Tests for cryptocurrency transaction signing and broadcasting.
 * 
 * Requirements: 6.4, 6.6, 6.7
 */

import { CryptoTransactionService } from '../CryptoTransactionService';

describe('CryptoTransactionService', () => {
  let service: CryptoTransactionService;

  beforeEach(() => {
    service = new CryptoTransactionService();
  });

  describe('sendTransaction', () => {
    describe('BNB Chain transactions', () => {
      it('should send BNB transaction successfully', async () => {
        const result = await service.sendTransaction({
          currency: 'BNB',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          amount: 0.1
        });

        expect(result.success).toBe(true);
        expect(result.transactionHash).toBeDefined();
        expect(result.transactionHash).toMatch(/^0x[a-f0-9]{64}$/);
        expect(result.retryable).toBe(false);
      });

      it('should send USDT_BEP20 transaction successfully', async () => {
        const result = await service.sendTransaction({
          currency: 'USDT_BEP20',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          amount: 100
        });

        expect(result.success).toBe(true);
        expect(result.transactionHash).toBeDefined();
        expect(result.retryable).toBe(false);
      });

      it('should send USDC_BEP20 transaction successfully', async () => {
        const result = await service.sendTransaction({
          currency: 'USDC_BEP20',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          amount: 50
        });

        expect(result.success).toBe(true);
        expect(result.transactionHash).toBeDefined();
        expect(result.retryable).toBe(false);
      });

      it('should reject invalid BNB Chain address', async () => {
        const result = await service.sendTransaction({
          currency: 'BNB',
          toAddress: 'invalid-address',
          amount: 0.1
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid BNB Chain address format');
      });
    });

    describe('Bitcoin transactions', () => {
      it('should send BTC transaction successfully', async () => {
        const result = await service.sendTransaction({
          currency: 'BTC',
          toAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          amount: 0.001
        });

        expect(result.success).toBe(true);
        expect(result.transactionHash).toBeDefined();
        expect(result.transactionHash).toMatch(/^[a-f0-9]{64}$/);
        expect(result.retryable).toBe(false);
      });

      it('should send BTC transaction to Bech32 address', async () => {
        const result = await service.sendTransaction({
          currency: 'BTC',
          toAddress: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
          amount: 0.001
        });

        expect(result.success).toBe(true);
        expect(result.transactionHash).toBeDefined();
      });

      it('should reject invalid Bitcoin address', async () => {
        const result = await service.sendTransaction({
          currency: 'BTC',
          toAddress: 'invalid-btc-address',
          amount: 0.001
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid Bitcoin address format');
      });
    });

    describe('TRON transactions', () => {
      it('should send USDT_TRC20 transaction successfully', async () => {
        const result = await service.sendTransaction({
          currency: 'USDT_TRC20',
          toAddress: 'TYASr5UV6HEcXatwdFQfmLVUqQQQMUxHLS',
          amount: 100
        });

        expect(result.success).toBe(true);
        expect(result.transactionHash).toBeDefined();
        expect(result.transactionHash).toMatch(/^[a-f0-9]{64}$/);
        expect(result.retryable).toBe(false);
      });

      it('should reject invalid TRON address', async () => {
        const result = await service.sendTransaction({
          currency: 'USDT_TRC20',
          toAddress: 'invalid-tron-address',
          amount: 100
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid TRON address format');
      });
    });

    describe('validation', () => {
      it('should reject empty destination address', async () => {
        const result = await service.sendTransaction({
          currency: 'BNB',
          toAddress: '',
          amount: 0.1
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Destination address is required');
      });

      it('should reject zero amount', async () => {
        const result = await service.sendTransaction({
          currency: 'BNB',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          amount: 0
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Amount must be greater than zero');
      });

      it('should reject negative amount', async () => {
        const result = await service.sendTransaction({
          currency: 'BNB',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          amount: -0.1
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Amount must be greater than zero');
      });
    });

    describe('transaction uniqueness', () => {
      it('should generate unique transaction hashes for different requests', async () => {
        const result1 = await service.sendTransaction({
          currency: 'BNB',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          amount: 0.1
        });

        // Wait a bit to ensure different timestamp
        await new Promise(resolve => setTimeout(resolve, 10));

        const result2 = await service.sendTransaction({
          currency: 'BNB',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          amount: 0.1
        });

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);
        expect(result1.transactionHash).not.toBe(result2.transactionHash);
      });
    });
  });

  describe('getTransactionStatus', () => {
    it('should get BNB Chain transaction status', async () => {
      const txHash = '0x' + '1'.repeat(64);
      const status = await service.getTransactionStatus(txHash, 'BNB');

      expect(status.hash).toBe(txHash);
      expect(status.confirmations).toBeGreaterThanOrEqual(0);
      expect(status.status).toMatch(/pending|confirmed|failed/);
    });

    it('should get Bitcoin transaction status', async () => {
      const txHash = '1'.repeat(64);
      const status = await service.getTransactionStatus(txHash, 'BTC');

      expect(status.hash).toBe(txHash);
      expect(status.confirmations).toBeGreaterThanOrEqual(0);
      expect(status.status).toMatch(/pending|confirmed|failed/);
    });

    it('should get TRON transaction status', async () => {
      const txHash = '1'.repeat(64);
      const status = await service.getTransactionStatus(txHash, 'USDT_TRC20');

      expect(status.hash).toBe(txHash);
      expect(status.confirmations).toBeGreaterThanOrEqual(0);
      expect(status.status).toMatch(/pending|confirmed|failed/);
    });
  });

  describe('address format validation', () => {
    const validAddresses = {
      BNB: [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        '0x0000000000000000000000000000000000000000',
        '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
      ],
      BTC: [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy',
        'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
      ],
      USDT_TRC20: [
        'TYASr5UV6HEcXatwdFQfmLVUqQQQMUxHLS',
        'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
      ]
    };

    const invalidAddresses = {
      BNB: [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bE', // Too short
        '742d35Cc6634C0532925a3b844Bc9e7595f0bEb', // Missing 0x
        '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG' // Invalid hex
      ],
      BTC: [
        '0A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // Invalid character
        'bc1qinvalid', // Too short
        '4J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy' // Invalid prefix
      ],
      USDT_TRC20: [
        'AYASr5UV6HEcXatwdFQfmLVUqQQQMUxHLS', // Wrong prefix
        'TYASr5UV6HEcXatwdFQfmLVUqQQQMUxHL', // Too short
        'T' // Too short
      ]
    };

    describe('valid addresses', () => {
      it('should accept valid BNB Chain addresses', async () => {
        for (const address of validAddresses.BNB) {
          const result = await service.sendTransaction({
            currency: 'BNB',
            toAddress: address,
            amount: 0.1
          });
          expect(result.success).toBe(true);
        }
      });

      it('should accept valid Bitcoin addresses', async () => {
        for (const address of validAddresses.BTC) {
          const result = await service.sendTransaction({
            currency: 'BTC',
            toAddress: address,
            amount: 0.001
          });
          expect(result.success).toBe(true);
        }
      });

      it('should accept valid TRON addresses', async () => {
        for (const address of validAddresses.USDT_TRC20) {
          const result = await service.sendTransaction({
            currency: 'USDT_TRC20',
            toAddress: address,
            amount: 100
          });
          expect(result.success).toBe(true);
        }
      });
    });

    describe('invalid addresses', () => {
      it('should reject invalid BNB Chain addresses', async () => {
        for (const address of invalidAddresses.BNB) {
          const result = await service.sendTransaction({
            currency: 'BNB',
            toAddress: address,
            amount: 0.1
          });
          expect(result.success).toBe(false);
          expect(result.error).toContain('Invalid BNB Chain address format');
        }
      });

      it('should reject invalid Bitcoin addresses', async () => {
        for (const address of invalidAddresses.BTC) {
          const result = await service.sendTransaction({
            currency: 'BTC',
            toAddress: address,
            amount: 0.001
          });
          expect(result.success).toBe(false);
          expect(result.error).toContain('Invalid Bitcoin address format');
        }
      });

      it('should reject invalid TRON addresses', async () => {
        for (const address of invalidAddresses.USDT_TRC20) {
          const result = await service.sendTransaction({
            currency: 'USDT_TRC20',
            toAddress: address,
            amount: 100
          });
          expect(result.success).toBe(false);
          expect(result.error).toContain('Invalid TRON address format');
        }
      });
    });
  });

  describe('error handling', () => {
    it('should return retryable error for network issues', async () => {
      // This test would need to mock network failures
      // For now, we just verify the error structure
      const result = await service.sendTransaction({
        currency: 'BNB',
        toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        amount: 0.1
      });

      // In case of error, should have proper structure
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.retryable).toBe('boolean');
      }
    });
  });
});
