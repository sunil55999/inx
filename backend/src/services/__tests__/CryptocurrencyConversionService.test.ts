/**
 * Unit Tests for Cryptocurrency Conversion Service
 * 
 * Tests the cryptocurrency conversion service including:
 * - USD to crypto conversion
 * - Crypto to USD conversion
 * - Exchange rate caching with 1-minute TTL
 * - API integration with CoinGecko
 * - Error handling and fallback to stale cache
 * 
 * Requirements: 3.1 (Requirement 5.1)
 */

import axios from 'axios';
import { CryptocurrencyConversionService } from '../CryptocurrencyConversionService';
import { CryptoCurrency } from '../../types/models';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CryptocurrencyConversionService', () => {
  let service: CryptocurrencyConversionService;

  beforeEach(() => {
    // Create fresh service instance for each test
    service = new CryptocurrencyConversionService();
    
    // Clear all mocks
    jest.clearAllMocks();
    
    // Reset timers
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('convertUsdToCrypto', () => {
    it('should convert USD to BTC correctly', async () => {
      // Mock CoinGecko API response
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          bitcoin: { usd: 42735 }
        }
      });

      const result = await service.convertUsdToCrypto(100, 'BTC');

      // 100 USD / 42735 USD per BTC = 0.00234 BTC (approximately)
      expect(result).toBeCloseTo(0.00234, 5);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.coingecko.com/api/v3/simple/price',
        expect.objectContaining({
          params: {
            ids: 'bitcoin',
            vs_currencies: 'usd'
          }
        })
      );
    });

    it('should convert USD to BNB correctly', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          binancecoin: { usd: 350 }
        }
      });

      const result = await service.convertUsdToCrypto(1000, 'BNB');

      // 1000 USD / 350 USD per BNB = 2.857 BNB
      expect(result).toBeCloseTo(2.857, 3);
    });

    it('should convert USD to USDT correctly', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          tether: { usd: 1.0 }
        }
      });

      const result = await service.convertUsdToCrypto(100, 'USDT_BEP20');

      // 100 USD / 1.0 USD per USDT = 100 USDT
      expect(result).toBeCloseTo(100, 2);
    });

    it('should convert USD to USDC correctly', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          'usd-coin': { usd: 0.9998 }
        }
      });

      const result = await service.convertUsdToCrypto(50, 'USDC_BEP20');

      // 50 USD / 0.9998 USD per USDC = 50.01 USDC
      expect(result).toBeCloseTo(50.01, 2);
    });

    it('should return 0 for 0 USD amount', async () => {
      const result = await service.convertUsdToCrypto(0, 'BTC');

      expect(result).toBe(0);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should throw error for negative USD amount', async () => {
      await expect(
        service.convertUsdToCrypto(-100, 'BTC')
      ).rejects.toThrow('USD amount cannot be negative');

      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('API timeout'));

      await expect(
        service.convertUsdToCrypto(100, 'BTC')
      ).rejects.toThrow('Failed to fetch exchange rate for BTC');
    });
  });

  describe('convertCryptoToUsd', () => {
    it('should convert BTC to USD correctly', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          bitcoin: { usd: 42735 }
        }
      });

      const result = await service.convertCryptoToUsd(0.00234, 'BTC');

      // 0.00234 BTC * 42735 USD per BTC = 100 USD (approximately)
      expect(result).toBeCloseTo(100, 0);
    });

    it('should convert BNB to USD correctly', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          binancecoin: { usd: 350 }
        }
      });

      const result = await service.convertCryptoToUsd(2.857, 'BNB');

      // 2.857 BNB * 350 USD per BNB = 999.95 USD
      expect(result).toBeCloseTo(1000, 0);
    });

    it('should return 0 for 0 crypto amount', async () => {
      const result = await service.convertCryptoToUsd(0, 'BTC');

      expect(result).toBe(0);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should throw error for negative crypto amount', async () => {
      await expect(
        service.convertCryptoToUsd(-0.5, 'BTC')
      ).rejects.toThrow('Crypto amount cannot be negative');

      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });

  describe('Exchange Rate Caching', () => {
    it('should cache exchange rates for 1 minute', async () => {
      // First call - should fetch from API
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          bitcoin: { usd: 42735 }
        }
      });

      await service.convertUsdToCrypto(100, 'BTC');
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);

      // Second call within 1 minute - should use cache
      await service.convertUsdToCrypto(200, 'BTC');
      expect(mockedAxios.get).toHaveBeenCalledTimes(1); // Still 1, not 2

      // Third call within 1 minute - should still use cache
      await service.convertCryptoToUsd(0.5, 'BTC');
      expect(mockedAxios.get).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should refresh cache after 1 minute TTL expires', async () => {
      // First call
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          bitcoin: { usd: 42735 }
        }
      });

      await service.convertUsdToCrypto(100, 'BTC');
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);

      // Advance time by 61 seconds (past 1 minute TTL)
      jest.advanceTimersByTime(61 * 1000);

      // Second call after TTL - should fetch from API again
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          bitcoin: { usd: 43000 }
        }
      });

      const result = await service.convertUsdToCrypto(100, 'BTC');
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      
      // Should use new rate
      expect(result).toBeCloseTo(100 / 43000, 5);
    });

    it('should cache different currencies independently', async () => {
      // Fetch BTC rate
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          bitcoin: { usd: 42735 }
        }
      });

      await service.convertUsdToCrypto(100, 'BTC');
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);

      // Fetch BNB rate - should make new API call
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          binancecoin: { usd: 350 }
        }
      });

      await service.convertUsdToCrypto(100, 'BNB');
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);

      // Use BTC again - should use cache
      await service.convertUsdToCrypto(200, 'BTC');
      expect(mockedAxios.get).toHaveBeenCalledTimes(2); // Still 2
    });

    it('should use stale cache if API fails', async () => {
      // First call - successful
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          bitcoin: { usd: 42735 }
        }
      });

      await service.convertUsdToCrypto(100, 'BTC');
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);

      // Advance time past TTL
      jest.advanceTimersByTime(61 * 1000);

      // Second call - API fails
      mockedAxios.get.mockRejectedValueOnce(new Error('API timeout'));

      // Should fall back to stale cache
      const result = await service.convertUsdToCrypto(100, 'BTC');
      expect(result).toBeCloseTo(100 / 42735, 5);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it('should throw error if API fails and no cache exists', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('API timeout'));

      await expect(
        service.convertUsdToCrypto(100, 'BTC')
      ).rejects.toThrow('Failed to fetch exchange rate for BTC');
    });
  });

  describe('getExchangeRate', () => {
    it('should return exchange rate with timestamp', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          bitcoin: { usd: 42735 }
        }
      });

      const rate = await service.getExchangeRate('BTC');

      expect(rate).toMatchObject({
        currency: 'BTC',
        usdPrice: 42735,
        timestamp: expect.any(Date)
      });
    });

    it('should throw error for invalid price data', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          bitcoin: { usd: 0 }
        }
      });

      await expect(
        service.getExchangeRate('BTC')
      ).rejects.toThrow('Invalid price data received for BTC');
    });

    it('should throw error for missing price data', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {}
      });

      await expect(
        service.getExchangeRate('BTC')
      ).rejects.toThrow('Invalid price data received for BTC');
    });
  });

  describe('getAllExchangeRates', () => {
    it('should fetch rates for all supported currencies', async () => {
      // Mock responses for all currencies
      mockedAxios.get
        .mockResolvedValueOnce({ data: { binancecoin: { usd: 350 } } })
        .mockResolvedValueOnce({ data: { tether: { usd: 1.0 } } })
        .mockResolvedValueOnce({ data: { 'usd-coin': { usd: 0.9998 } } })
        .mockResolvedValueOnce({ data: { bitcoin: { usd: 42735 } } })
        .mockResolvedValueOnce({ data: { tether: { usd: 1.0 } } });

      const rates = await service.getAllExchangeRates();

      expect(rates.size).toBe(5);
      expect(rates.get('BNB')?.usdPrice).toBe(350);
      expect(rates.get('USDT_BEP20')?.usdPrice).toBe(1.0);
      expect(rates.get('USDC_BEP20')?.usdPrice).toBe(0.9998);
      expect(rates.get('BTC')?.usdPrice).toBe(42735);
      expect(rates.get('USDT_TRC20')?.usdPrice).toBe(1.0);
    });

    it('should continue fetching other rates if one fails', async () => {
      // Mock responses - one fails
      mockedAxios.get
        .mockResolvedValueOnce({ data: { binancecoin: { usd: 350 } } })
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({ data: { 'usd-coin': { usd: 0.9998 } } })
        .mockResolvedValueOnce({ data: { bitcoin: { usd: 42735 } } })
        .mockResolvedValueOnce({ data: { tether: { usd: 1.0 } } });

      const rates = await service.getAllExchangeRates();

      // Should have 4 rates (one failed)
      expect(rates.size).toBe(4);
      expect(rates.has('USDT_BEP20')).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear cache for specific currency', async () => {
      // Fetch and cache BTC rate
      mockedAxios.get.mockResolvedValueOnce({
        data: { bitcoin: { usd: 42735 } }
      });

      await service.convertUsdToCrypto(100, 'BTC');
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);

      // Clear BTC cache
      service.clearCache('BTC');

      // Next call should fetch from API again
      mockedAxios.get.mockResolvedValueOnce({
        data: { bitcoin: { usd: 43000 } }
      });

      await service.convertUsdToCrypto(100, 'BTC');
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it('should clear all cache when no currency specified', async () => {
      // Fetch and cache multiple rates
      mockedAxios.get
        .mockResolvedValueOnce({ data: { bitcoin: { usd: 42735 } } })
        .mockResolvedValueOnce({ data: { binancecoin: { usd: 350 } } });

      await service.convertUsdToCrypto(100, 'BTC');
      await service.convertUsdToCrypto(100, 'BNB');
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);

      // Clear all cache
      service.clearCache();

      // Next calls should fetch from API again
      mockedAxios.get
        .mockResolvedValueOnce({ data: { bitcoin: { usd: 43000 } } })
        .mockResolvedValueOnce({ data: { binancecoin: { usd: 360 } } });

      await service.convertUsdToCrypto(100, 'BTC');
      await service.convertUsdToCrypto(100, 'BNB');
      expect(mockedAxios.get).toHaveBeenCalledTimes(4);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      // Fetch and cache rates
      mockedAxios.get
        .mockResolvedValueOnce({ data: { bitcoin: { usd: 42735 } } })
        .mockResolvedValueOnce({ data: { binancecoin: { usd: 350 } } });

      await service.convertUsdToCrypto(100, 'BTC');
      await service.convertUsdToCrypto(100, 'BNB');

      const stats = service.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.entries).toHaveLength(2);
      expect(stats.entries[0]).toMatchObject({
        currency: expect.any(String),
        rate: expect.any(Number),
        age: expect.any(Number),
        expiresIn: expect.any(Number)
      });
    });

    it('should return empty stats for empty cache', () => {
      const stats = service.getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.entries).toHaveLength(0);
    });
  });

  describe('API Integration', () => {
    it('should use correct CoinGecko coin IDs', async () => {
      const testCases: Array<[CryptoCurrency, string]> = [
        ['BNB', 'binancecoin'],
        ['USDT_BEP20', 'tether'],
        ['USDC_BEP20', 'usd-coin'],
        ['BTC', 'bitcoin'],
        ['USDT_TRC20', 'tether']
      ];

      for (const [currency, expectedCoinId] of testCases) {
        mockedAxios.get.mockResolvedValueOnce({
          data: { [expectedCoinId]: { usd: 100 } }
        });

        await service.convertUsdToCrypto(100, currency);

        expect(mockedAxios.get).toHaveBeenCalledWith(
          'https://api.coingecko.com/api/v3/simple/price',
          expect.objectContaining({
            params: {
              ids: expectedCoinId,
              vs_currencies: 'usd'
            }
          })
        );

        // Clear cache for next iteration
        service.clearCache(currency);
      }
    });

    it('should set 5 second timeout for API requests', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { bitcoin: { usd: 42735 } }
      });

      await service.convertUsdToCrypto(100, 'BTC');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeout: 5000
        })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small USD amounts', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { bitcoin: { usd: 42735 } }
      });

      const result = await service.convertUsdToCrypto(0.01, 'BTC');

      expect(result).toBeGreaterThan(0);
      expect(result).toBeCloseTo(0.01 / 42735, 10);
    });

    it('should handle very large USD amounts', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { bitcoin: { usd: 42735 } }
      });

      const result = await service.convertUsdToCrypto(1000000, 'BTC');

      expect(result).toBeCloseTo(1000000 / 42735, 5);
    });

    it('should handle very small crypto amounts', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { bitcoin: { usd: 42735 } }
      });

      const result = await service.convertCryptoToUsd(0.00000001, 'BTC');

      expect(result).toBeGreaterThan(0);
      expect(result).toBeCloseTo(0.00000001 * 42735, 10);
    });

    it('should handle very large crypto amounts', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { bitcoin: { usd: 42735 } }
      });

      const result = await service.convertCryptoToUsd(1000, 'BTC');

      expect(result).toBeCloseTo(1000 * 42735, 0);
    });
  });
});
