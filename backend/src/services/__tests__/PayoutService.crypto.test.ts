/**
 * Payout Service Cryptocurrency Integration Tests
 * 
 * Tests for payout processing with cryptocurrency transactions.
 * 
 * Requirements: 6.4, 6.6, 6.7
 */

import { PayoutService } from '../PayoutService';
import { PayoutRepository } from '../../database/repositories/PayoutRepository';
import { MerchantBalanceRepository } from '../../database/repositories/MerchantBalanceRepository';
import { PayoutStatus, CryptoCurrency } from '../../types/models';
import { v4 as uuidv4 } from 'uuid';

// Mock the repositories
jest.mock('../../database/repositories/PayoutRepository');
jest.mock('../../database/repositories/MerchantBalanceRepository');

describe('PayoutService - Cryptocurrency Integration', () => {
  let payoutService: PayoutService;
  let mockPayoutRepository: jest.Mocked<PayoutRepository>;
  let mockMerchantBalanceRepository: jest.Mocked<MerchantBalanceRepository>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create service instance
    payoutService = new PayoutService();

    // Get mocked instances
    mockPayoutRepository = (payoutService as any).payoutRepository;
    mockMerchantBalanceRepository = (payoutService as any).merchantBalanceRepository;
  });

  describe('processPayout', () => {
    describe('successful transaction', () => {
      it('should process BNB payout successfully', async () => {
        const payoutId = uuidv4();
        const merchantId = uuidv4();
        const mockPayout = {
          id: payoutId,
          merchantId,
          amount: 0.5,
          currency: 'BNB' as CryptoCurrency,
          walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          status: PayoutStatus.PENDING,
          createdAt: new Date()
        };

        const completedPayout = {
          ...mockPayout,
          status: PayoutStatus.COMPLETED,
          transactionHash: '0x' + '1'.repeat(64),
          processedAt: new Date()
        };

        mockPayoutRepository.findById.mockResolvedValue(mockPayout);
        mockPayoutRepository.updateStatus.mockResolvedValue(mockPayout);
        mockPayoutRepository.markCompleted.mockResolvedValue(completedPayout);

        const result = await payoutService.processPayout(payoutId);

        expect(result.status).toBe(PayoutStatus.COMPLETED);
        expect(result.transactionHash).toBeDefined();
        expect(result.transactionHash).toMatch(/^0x[a-f0-9]{64}$/);
        expect(mockPayoutRepository.markCompleted).toHaveBeenCalledWith(
          payoutId,
          expect.stringMatching(/^0x[a-f0-9]{64}$/)
        );
      });

      it('should process USDT_BEP20 payout successfully', async () => {
        const payoutId = uuidv4();
        const merchantId = uuidv4();
        const mockPayout = {
          id: payoutId,
          merchantId,
          amount: 100,
          currency: 'USDT_BEP20' as CryptoCurrency,
          walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          status: PayoutStatus.PENDING,
          createdAt: new Date()
        };

        const completedPayout = {
          ...mockPayout,
          status: PayoutStatus.COMPLETED,
          transactionHash: '0x' + '2'.repeat(64),
          processedAt: new Date()
        };

        mockPayoutRepository.findById.mockResolvedValue(mockPayout);
        mockPayoutRepository.updateStatus.mockResolvedValue(mockPayout);
        mockPayoutRepository.markCompleted.mockResolvedValue(completedPayout);

        const result = await payoutService.processPayout(payoutId);

        expect(result.status).toBe(PayoutStatus.COMPLETED);
        expect(result.transactionHash).toBeDefined();
      });

      it('should process BTC payout successfully', async () => {
        const payoutId = uuidv4();
        const merchantId = uuidv4();
        const mockPayout = {
          id: payoutId,
          merchantId,
          amount: 0.001,
          currency: 'BTC' as CryptoCurrency,
          walletAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          status: PayoutStatus.PENDING,
          createdAt: new Date()
        };

        const completedPayout = {
          ...mockPayout,
          status: PayoutStatus.COMPLETED,
          transactionHash: '3'.repeat(64),
          processedAt: new Date()
        };

        mockPayoutRepository.findById.mockResolvedValue(mockPayout);
        mockPayoutRepository.updateStatus.mockResolvedValue(mockPayout);
        mockPayoutRepository.markCompleted.mockResolvedValue(completedPayout);

        const result = await payoutService.processPayout(payoutId);

        expect(result.status).toBe(PayoutStatus.COMPLETED);
        expect(result.transactionHash).toBeDefined();
        expect(result.transactionHash).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should process USDT_TRC20 payout successfully', async () => {
        const payoutId = uuidv4();
        const merchantId = uuidv4();
        const mockPayout = {
          id: payoutId,
          merchantId,
          amount: 100,
          currency: 'USDT_TRC20' as CryptoCurrency,
          walletAddress: 'TYASr5UV6HEcXatwdFQfmLVUqQQQMUxHLS',
          status: PayoutStatus.PENDING,
          createdAt: new Date()
        };

        const completedPayout = {
          ...mockPayout,
          status: PayoutStatus.COMPLETED,
          transactionHash: '4'.repeat(64),
          processedAt: new Date()
        };

        mockPayoutRepository.findById.mockResolvedValue(mockPayout);
        mockPayoutRepository.updateStatus.mockResolvedValue(mockPayout);
        mockPayoutRepository.markCompleted.mockResolvedValue(completedPayout);

        const result = await payoutService.processPayout(payoutId);

        expect(result.status).toBe(PayoutStatus.COMPLETED);
        expect(result.transactionHash).toBeDefined();
      });
    });

    describe('failed transaction with balance restoration', () => {
      it('should restore balance when transaction fails', async () => {
        const payoutId = uuidv4();
        const merchantId = uuidv4();
        const amount = 0.5;
        const currency = 'BNB' as CryptoCurrency;

        const mockPayout = {
          id: payoutId,
          merchantId,
          amount,
          currency,
          walletAddress: 'invalid-address', // This will cause validation failure
          status: PayoutStatus.PENDING,
          createdAt: new Date()
        };

        const failedPayout = {
          ...mockPayout,
          status: PayoutStatus.FAILED,
          errorMessage: 'Invalid BNB Chain address format',
          processedAt: new Date()
        };

        mockPayoutRepository.findById.mockResolvedValue(mockPayout);
        mockPayoutRepository.updateStatus.mockResolvedValue(mockPayout);
        mockPayoutRepository.markFailed.mockResolvedValue(failedPayout);
        mockMerchantBalanceRepository.incrementAvailable.mockResolvedValue({
          id: uuidv4(),
          merchantId,
          currency,
          availableBalance: 1.5,
          pendingBalance: 0,
          totalEarned: 2.0,
          totalWithdrawn: 0.5,
          updatedAt: new Date()
        });

        const result = await payoutService.processPayout(payoutId);

        expect(result.status).toBe(PayoutStatus.FAILED);
        expect(result.errorMessage).toContain('Invalid BNB Chain address format');
        
        // Verify balance was restored
        expect(mockMerchantBalanceRepository.incrementAvailable).toHaveBeenCalledWith(
          merchantId,
          currency,
          amount
        );
        
        // Verify payout was marked as failed
        expect(mockPayoutRepository.markFailed).toHaveBeenCalledWith(
          payoutId,
          expect.stringContaining('Invalid BNB Chain address format')
        );
      });

      it('should restore balance for all supported currencies on failure', async () => {
        const currencies: CryptoCurrency[] = ['BNB', 'USDT_BEP20', 'USDC_BEP20', 'BTC', 'USDT_TRC20'];

        for (const currency of currencies) {
          const payoutId = uuidv4();
          const merchantId = uuidv4();
          const amount = 100;

          const mockPayout = {
            id: payoutId,
            merchantId,
            amount,
            currency,
            walletAddress: 'invalid-address',
            status: PayoutStatus.PENDING,
            createdAt: new Date()
          };

          const failedPayout = {
            ...mockPayout,
            status: PayoutStatus.FAILED,
            errorMessage: 'Transaction failed',
            processedAt: new Date()
          };

          mockPayoutRepository.findById.mockResolvedValue(mockPayout);
          mockPayoutRepository.updateStatus.mockResolvedValue(mockPayout);
          mockPayoutRepository.markFailed.mockResolvedValue(failedPayout);
          mockMerchantBalanceRepository.incrementAvailable.mockResolvedValue({
            id: uuidv4(),
            merchantId,
            currency,
            availableBalance: amount,
            pendingBalance: 0,
            totalEarned: amount,
            totalWithdrawn: 0,
            updatedAt: new Date()
          });

          await payoutService.processPayout(payoutId);

          expect(mockMerchantBalanceRepository.incrementAvailable).toHaveBeenCalledWith(
            merchantId,
            currency,
            amount
          );
        }
      });
    });

    describe('error handling', () => {
      it('should throw error if payout not found', async () => {
        const payoutId = uuidv4();
        mockPayoutRepository.findById.mockResolvedValue(null);

        await expect(payoutService.processPayout(payoutId)).rejects.toThrow(
          `Payout not found: ${payoutId}`
        );
      });

      it('should throw error if payout not in PENDING status', async () => {
        const payoutId = uuidv4();
        const mockPayout = {
          id: payoutId,
          merchantId: uuidv4(),
          amount: 0.5,
          currency: 'BNB' as CryptoCurrency,
          walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
          status: PayoutStatus.COMPLETED,
          createdAt: new Date()
        };

        mockPayoutRepository.findById.mockResolvedValue(mockPayout);

        await expect(payoutService.processPayout(payoutId)).rejects.toThrow(
          `Payout is not in PENDING status: ${PayoutStatus.COMPLETED}`
        );
      });

      it('should restore balance even if marking as failed throws error', async () => {
        const payoutId = uuidv4();
        const merchantId = uuidv4();
        const amount = 0.5;
        const currency = 'BNB' as CryptoCurrency;

        const mockPayout = {
          id: payoutId,
          merchantId,
          amount,
          currency,
          walletAddress: 'invalid-address',
          status: PayoutStatus.PENDING,
          createdAt: new Date()
        };

        mockPayoutRepository.findById.mockResolvedValue(mockPayout);
        mockPayoutRepository.updateStatus.mockResolvedValue(mockPayout);
        mockPayoutRepository.markFailed.mockRejectedValue(new Error('Database error'));
        mockMerchantBalanceRepository.incrementAvailable.mockResolvedValue({
          id: uuidv4(),
          merchantId,
          currency,
          availableBalance: 1.5,
          pendingBalance: 0,
          totalEarned: 2.0,
          totalWithdrawn: 0.5,
          updatedAt: new Date()
        });

        await expect(payoutService.processPayout(payoutId)).rejects.toThrow();

        // Balance should still be restored
        expect(mockMerchantBalanceRepository.incrementAvailable).toHaveBeenCalledWith(
          merchantId,
          currency,
          amount
        );
      });
    });

    describe('transaction hash storage', () => {
      it('should store transaction hash on successful completion', async () => {
        const payoutId = uuidv4();
        const merchantId = uuidv4();
        const mockPayout = {
          id: payoutId,
          merchantId,
          amount: 0.5,
          currency: 'BNB' as CryptoCurrency,
          walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          status: PayoutStatus.PENDING,
          createdAt: new Date()
        };

        const completedPayout = {
          ...mockPayout,
          status: PayoutStatus.COMPLETED,
          transactionHash: '0x' + '1'.repeat(64),
          processedAt: new Date()
        };

        mockPayoutRepository.findById.mockResolvedValue(mockPayout);
        mockPayoutRepository.updateStatus.mockResolvedValue(mockPayout);
        mockPayoutRepository.markCompleted.mockResolvedValue(completedPayout);

        const result = await payoutService.processPayout(payoutId);

        expect(mockPayoutRepository.markCompleted).toHaveBeenCalledWith(
          payoutId,
          expect.any(String)
        );
        expect(result.transactionHash).toBeDefined();
        expect(result.transactionHash).not.toBe('');
      });

      it('should generate unique transaction hashes for different payouts', async () => {
        const payouts = [
          { id: uuidv4(), merchantId: uuidv4(), amount: 0.5 },
          { id: uuidv4(), merchantId: uuidv4(), amount: 1.0 },
          { id: uuidv4(), merchantId: uuidv4(), amount: 0.25 }
        ];

        const txHashes: string[] = [];

        for (const payout of payouts) {
          const mockPayout = {
            ...payout,
            currency: 'BNB' as CryptoCurrency,
            walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
            status: PayoutStatus.PENDING,
            createdAt: new Date()
          };

          const completedPayout = {
            ...mockPayout,
            status: PayoutStatus.COMPLETED,
            transactionHash: '0x' + Math.random().toString(16).substring(2).padEnd(64, '0'),
            processedAt: new Date()
          };

          mockPayoutRepository.findById.mockResolvedValue(mockPayout);
          mockPayoutRepository.updateStatus.mockResolvedValue(mockPayout);
          mockPayoutRepository.markCompleted.mockResolvedValue(completedPayout);

          const result = await payoutService.processPayout(payout.id);
          txHashes.push(result.transactionHash!);

          // Small delay to ensure different timestamps
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        // All transaction hashes should be unique
        const uniqueHashes = new Set(txHashes);
        expect(uniqueHashes.size).toBe(txHashes.length);
      });
    });
  });
});
