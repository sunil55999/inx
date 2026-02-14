import { Knex } from 'knex';
import db from '../connection';

/**
 * Base Repository class providing common CRUD operations
 * All model-specific repositories extend this class
 * 
 * Requirements: 1.1, 4.5, 6.7
 */
export abstract class BaseRepository<T> {
  protected db: Knex;
  protected tableName: string;

  constructor(tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  /**
   * Find a record by ID
   */
  async findById(id: string): Promise<T | null> {
    const result = await this.db(this.tableName)
      .where({ id })
      .first();
    return result || null;
  }

  /**
   * Find all records with optional filters
   */
  async findAll(filters?: Partial<T>): Promise<T[]> {
    let query = this.db(this.tableName);
    
    if (filters) {
      query = query.where(filters);
    }
    
    return await query.select('*');
  }

  /**
   * Find records with pagination
   */
  async findWithPagination(
    filters: Partial<T>,
    limit: number,
    offset: number
  ): Promise<{ data: T[]; total: number }> {
    const query = this.db(this.tableName).where(filters);
    
    const [data, countResult] = await Promise.all([
      query.clone().select('*').limit(limit).offset(offset),
      query.clone().count('* as count').first()
    ]);
    
    const total = parseInt(countResult?.count as string || '0', 10);
    
    return { data, total };
  }

  /**
   * Create a new record
   */
  async create(data: Partial<T>): Promise<T> {
    const [result] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return result;
  }

  /**
   * Update a record by ID
   */
  async update(id: string, data: Partial<T>): Promise<T | null> {
    const [result] = await this.db(this.tableName)
      .where({ id })
      .update({
        ...data,
        updated_at: this.db.fn.now()
      })
      .returning('*');
    return result || null;
  }

  /**
   * Delete a record by ID
   */
  async delete(id: string): Promise<boolean> {
    const deletedCount = await this.db(this.tableName)
      .where({ id })
      .delete();
    return deletedCount > 0;
  }

  /**
   * Check if a record exists by ID
   */
  async exists(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .first('id');
    return !!result;
  }

  /**
   * Count records with optional filters
   */
  async count(filters?: Partial<T>): Promise<number> {
    let query = this.db(this.tableName);
    
    if (filters) {
      query = query.where(filters);
    }
    
    const result = await query.count('* as count').first();
    return parseInt(result?.count as string || '0', 10);
  }

  /**
   * Execute a transaction
   */
  async transaction<R>(callback: (trx: Knex.Transaction) => Promise<R>): Promise<R> {
    return await this.db.transaction(callback);
  }

  /**
   * Get the underlying Knex query builder for custom queries
   */
  protected query(): Knex.QueryBuilder {
    return this.db(this.tableName);
  }
}
