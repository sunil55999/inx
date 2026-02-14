import { BaseRepository } from './BaseRepository';
import { CryptoCurrency, BlockchainNetwork } from '../../types/models';

/**
 * Deposit Address model
 */
export interface DepositAddress {
  id: string;
  orderId: string;
  address: string;
  currency: CryptoCurrency;
  network: BlockchainNetwork;
  derivationPath: string;
  createdAt: Date;
}

/**
 * Deposit Address Repository
 * Handles CRUD operations for deposit addresses
 * 
 * Requirements: 3.1 (Requirement 5.2)
 */
export class DepositAddressRepository extends BaseRepository<DepositAddress> {
  constructor() {
    super('deposit_addresses');
  }

  /**
   * Find deposit address by order ID
   */
  async findByOrderId(orderId: string): Promise<DepositAddress | null> {
    const result = await this.query()
      .where({ order_id: orderId })
      .first();
    
    return result ? this.mapToModel(result) : null;
  }

  /**
   * Find order ID by deposit address
   */
  async findOrderIdByAddress(address: string): Promise<string | null> {
    const result = await this.query()
      .where({ address })
      .select('order_id')
      .first();
    
    return result ? result.order_id : null;
  }

  /**
   * Find all addresses for a currency
   */
  async findByCurrency(currency: CryptoCurrency): Promise<DepositAddress[]> {
    const results = await this.query()
      .where({ currency })
      .select('*');
    
    return results.map(this.mapToModel);
  }

  /**
   * Find all addresses for a network
   */
  async findByNetwork(network: BlockchainNetwork): Promise<DepositAddress[]> {
    const results = await this.query()
      .where({ network })
      .select('*');
    
    return results.map(this.mapToModel);
  }

  /**
   * Check if address exists
   */
  async addressExists(address: string): Promise<boolean> {
    const result = await this.query()
      .where({ address })
      .first();
    
    return !!result;
  }

  /**
   * Get all addresses (for monitoring)
   */
  async getAllAddresses(): Promise<DepositAddress[]> {
    const results = await this.query()
      .select('*')
      .orderBy('created_at', 'desc');
    
    return results.map(this.mapToModel);
  }

  /**
   * Map database row to model
   */
  private mapToModel(row: any): DepositAddress {
    return {
      id: row.id,
      orderId: row.order_id,
      address: row.address,
      currency: row.currency,
      network: row.network,
      derivationPath: row.derivation_path,
      createdAt: row.created_at
    };
  }
}
