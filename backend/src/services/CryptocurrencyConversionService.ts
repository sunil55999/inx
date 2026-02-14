/**
 * Cryptocurrency Conversion Service
 * 
 * Provides real-time cryptocurrency price conversion using external price feed APIs.
 * Implements caching with 1-minute TTL to reduce API calls and improve performance.
 * 
 * Requirements: 3.1 (Requirement 5.1 - Cryptocurrency Payment Processing)
 * 
 * Features:
 * - Convert USD amounts to cryptocurrency amounts
 * - Fetch real-time exchange rates from CoinGecko API
 * - Cache exchange rates with 1-minute TTL
 * - Support for all platform cryptocurrencies (BNB, USDT, USDC, BTC)
 * - Automatic cache invalidation and refresh
 */

import axios from 'axios';
import { logger } from '../utils/logger';
import { CryptoCurrency } from '../types/models';

/**
 * Exchange rate data with timestamp
 */
interface ExchangeRate {
  currency: CryptoCurrency;
  usdPrice: number;
  timestamp: Date;
}

/**
 * Cache entry for exchange rates
 */
interface CacheEntry {
  rate: ExchangeRate;
  expiresAt: Date;
}

/**
 * CoinGecko API response format
 */
interface CoinGeckoResponse {
  [coinId: string]: {
    usd: number;
  };
}

/**
 * Cryptocurrency Conversion Service
 * 
 * Converts USD amounts to cryptocurrency amounts using real-time exchange rates.
 * Implements caching to reduce API calls and improve performance.
 */
export class CryptocurrencyConversionService {
  private cache: Map<CryptoCurrency, CacheEntry> = new Map();
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute
  private readonly COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/simple/price';
  
  /**
   * Mapping of platform currencies to CoinGecko coin IDs
   */
  private readonly COIN_IDS: Record<CryptoCurrency, string> = {
    BNB: 'binancecoin',
    USDT_BEP20: 'tether',
    USDC_BEP20: 'usd-coin',
    BTC: 'bitcoin',
    USDT_TRC20: 'tether'
  };

  /**
   * Convert USD amount to cryptocurrency amount
   * 
   * @param usdAmount - Amount in USD to convert
   * @param currency - Target cryptocurrency
   * @returns Amount in cryptocurrency
   * 
   * @example
   * const btcAmount = await service.convertUsdToCrypto(100, 'BTC');
   * // Returns: 0.00234 (if BTC price is $42,735)
   */
  async convertUsdToCrypto(
    usdAmount: number,
    currency: CryptoCurrency
  ): Promise<number> {
    try {
      // Validate input
      if (usdAmount < 0) {
        throw new Error('USD amount cannot be negative');
      }

      if (usdAmount === 0) {
        return 0;
      }

      // Get exchange rate (from cache or API)
      const rate = await this.getExchangeRate(currency);

      // Calculate cryptocurrency amount
      const cryptoAmount = usdAmount / rate.usdPrice;

      logger.debug('USD to crypto conversion', {
        usdAmount,
        currency,
        exchangeRate: rate.usdPrice,
        cryptoAmount,
        rateAge: Date.now() - rate.timestamp.getTime()
      });

      return cryptoAmount;

    } catch (error) {
      logger.error('Error converting USD to crypto', {
        error,
        usdAmount,
        currency
      });
      throw error;
    }
  }

  /**
   * Convert cryptocurrency amount to USD amount
   * 
   * @param cryptoAmount - Amount in cryptocurrency to convert
   * @param currency - Source cryptocurrency
   * @returns Amount in USD
   * 
   * @example
   * const usdAmount = await service.convertCryptoToUsd(0.00234, 'BTC');
   * // Returns: 100 (if BTC price is $42,735)
   */
  async convertCryptoToUsd(
    cryptoAmount: number,
    currency: CryptoCurrency
  ): Promise<number> {
    try {
      // Validate input
      if (cryptoAmount < 0) {
        throw new Error('Crypto amount cannot be negative');
      }

      if (cryptoAmount === 0) {
        return 0;
      }

      // Get exchange rate (from cache or API)
      const rate = await this.getExchangeRate(currency);

      // Calculate USD amount
      const usdAmount = cryptoAmount * rate.usdPrice;

      logger.debug('Crypto to USD conversion', {
        cryptoAmount,
        currency,
        exchangeRate: rate.usdPrice,
        usdAmount,
        rateAge: Date.now() - rate.timestamp.getTime()
      });

      return usdAmount;

    } catch (error) {
      logger.error('Error converting crypto to USD', {
        error,
        cryptoAmount,
        currency
      });
      throw error;
    }
  }

  /**
   * Get exchange rate for a cryptocurrency
   * 
   * Checks cache first, fetches from API if cache is expired or missing.
   * 
   * @param currency - Cryptocurrency to get rate for
   * @returns Exchange rate data
   */
  async getExchangeRate(currency: CryptoCurrency): Promise<ExchangeRate> {
    // Check cache
    const cached = this.cache.get(currency);
    if (cached && cached.expiresAt > new Date()) {
      logger.debug('Using cached exchange rate', {
        currency,
        rate: cached.rate.usdPrice,
        expiresIn: cached.expiresAt.getTime() - Date.now()
      });
      return cached.rate;
    }

    // Fetch from API
    logger.debug('Fetching exchange rate from API', { currency });
    const rate = await this.fetchExchangeRate(currency);

    // Update cache
    this.cache.set(currency, {
      rate,
      expiresAt: new Date(Date.now() + this.CACHE_TTL_MS)
    });

    return rate;
  }

  /**
   * Fetch exchange rate from CoinGecko API
   * 
   * @param currency - Cryptocurrency to fetch rate for
   * @returns Exchange rate data
   */
  private async fetchExchangeRate(currency: CryptoCurrency): Promise<ExchangeRate> {
    try {
      const coinId = this.COIN_IDS[currency];
      
      const response = await axios.get<CoinGeckoResponse>(this.COINGECKO_API_URL, {
        params: {
          ids: coinId,
          vs_currencies: 'usd'
        },
        timeout: 5000 // 5 second timeout
      });

      const usdPrice = response.data[coinId]?.usd;

      if (!usdPrice || usdPrice <= 0) {
        throw new Error(`Invalid price data received for ${currency}`);
      }

      logger.info('Fetched exchange rate from CoinGecko', {
        currency,
        coinId,
        usdPrice
      });

      return {
        currency,
        usdPrice,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Error fetching exchange rate from CoinGecko', {
        error,
        currency
      });

      // If API fails, check if we have stale cache data
      const cached = this.cache.get(currency);
      if (cached) {
        logger.warn('Using stale cached exchange rate due to API error', {
          currency,
          rate: cached.rate.usdPrice,
          age: Date.now() - cached.rate.timestamp.getTime()
        });
        return cached.rate;
      }

      throw new Error(`Failed to fetch exchange rate for ${currency}: ${error}`);
    }
  }

  /**
   * Get current exchange rates for all supported currencies
   * 
   * @returns Map of currency to exchange rate
   */
  async getAllExchangeRates(): Promise<Map<CryptoCurrency, ExchangeRate>> {
    const currencies: CryptoCurrency[] = [
      'BNB',
      'USDT_BEP20',
      'USDC_BEP20',
      'BTC',
      'USDT_TRC20'
    ];

    const rates = new Map<CryptoCurrency, ExchangeRate>();

    // Fetch all rates in parallel
    await Promise.all(
      currencies.map(async (currency) => {
        try {
          const rate = await this.getExchangeRate(currency);
          rates.set(currency, rate);
        } catch (error) {
          logger.error('Error fetching rate for currency', { currency, error });
        }
      })
    );

    return rates;
  }

  /**
   * Clear cache for a specific currency or all currencies
   * 
   * @param currency - Optional currency to clear, clears all if not specified
   */
  clearCache(currency?: CryptoCurrency): void {
    if (currency) {
      this.cache.delete(currency);
      logger.debug('Cleared cache for currency', { currency });
    } else {
      this.cache.clear();
      logger.debug('Cleared all exchange rate cache');
    }
  }

  /**
   * Get cache statistics
   * 
   * @returns Cache statistics
   */
  getCacheStats(): {
    size: number;
    entries: Array<{
      currency: CryptoCurrency;
      rate: number;
      age: number;
      expiresIn: number;
    }>;
  } {
    const entries = Array.from(this.cache.entries()).map(([currency, entry]) => ({
      currency,
      rate: entry.rate.usdPrice,
      age: Date.now() - entry.rate.timestamp.getTime(),
      expiresIn: entry.expiresAt.getTime() - Date.now()
    }));

    return {
      size: this.cache.size,
      entries
    };
  }
}

// Export singleton instance
export const cryptocurrencyConversionService = new CryptocurrencyConversionService();
