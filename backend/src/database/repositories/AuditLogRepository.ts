import { BaseRepository } from './BaseRepository';
import { AuditLog } from '../../types/models';

/**
 * Audit Log Repository
 * Handles CRUD operations for audit logs
 * 
 * Requirements: 1.1, 4.5
 */
export class AuditLogRepository extends BaseRepository<AuditLog> {
  constructor() {
    super('audit_logs');
  }

  /**
   * Find audit logs by admin ID
   */
  async findByAdminId(adminId: string): Promise<AuditLog[]> {
    return await this.query()
      .where({ admin_id: adminId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find audit logs by entity type and ID
   */
  async findByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    return await this.query()
      .where({ 
        entity_type: entityType,
        entity_id: entityId 
      })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find audit logs by action
   */
  async findByAction(action: string): Promise<AuditLog[]> {
    return await this.query()
      .where({ action })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find audit logs in time range
   */
  async findInTimeRange(startDate: Date, endDate: Date): Promise<AuditLog[]> {
    return await this.query()
      .whereBetween('created_at', [startDate, endDate])
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Get recent audit logs with pagination
   */
  async getRecent(limit: number, offset: number): Promise<{ data: AuditLog[]; total: number }> {
    const query = this.query().orderBy('created_at', 'desc');
    
    const [data, countResult] = await Promise.all([
      query.clone().limit(limit).offset(offset).select('*'),
      query.clone().count('* as count').first()
    ]);
    
    const total = parseInt(countResult?.count as string || '0', 10);
    
    return { data, total };
  }

  /**
   * Find recent audit logs (alias for getRecent that returns just the data array)
   */
  async findRecent(limit: number, offset: number): Promise<AuditLog[]> {
    const result = await this.getRecent(limit, offset);
    return result.data;
  }

  /**
   * Log admin action
   */
  async logAction(
    adminId: string,
    action: string,
    entityType: string,
    entityId: string,
    changes?: Record<string, any>,
    ipAddress?: string
  ): Promise<AuditLog> {
    return await this.create({
      adminId,
      action,
      entityType,
      entityId,
      changes,
      ipAddress
    } as Partial<AuditLog>);
  }

  /**
   * Get audit statistics
   */
  async getStatistics(startDate?: Date, endDate?: Date): Promise<{
    totalActions: number;
    actionsByType: Record<string, number>;
    actionsByAdmin: Record<string, number>;
  }> {
    let query = this.query();
    
    if (startDate && endDate) {
      query = query.whereBetween('created_at', [startDate, endDate]);
    }

    const [totalResult, byTypeResults, byAdminResults] = await Promise.all([
      query.clone().count('* as count').first(),
      query.clone().select('action').count('* as count').groupBy('action'),
      query.clone().select('admin_id').count('* as count').groupBy('admin_id')
    ]);

    const actionsByType: Record<string, number> = {};
    byTypeResults.forEach((row: any) => {
      actionsByType[row.action] = parseInt(row.count, 10);
    });

    const actionsByAdmin: Record<string, number> = {};
    byAdminResults.forEach((row: any) => {
      actionsByAdmin[row.admin_id] = parseInt(row.count, 10);
    });

    return {
      totalActions: parseInt(totalResult?.count as string || '0', 10),
      actionsByType,
      actionsByAdmin
    };
  }

  /**
   * Search audit logs
   */
  async search(
    filters: {
      adminId?: string;
      action?: string;
      entityType?: string;
      entityId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    limit: number,
    offset: number
  ): Promise<{ data: AuditLog[]; total: number }> {
    let query = this.query();

    if (filters.adminId) {
      query = query.where({ admin_id: filters.adminId });
    }
    if (filters.action) {
      query = query.where({ action: filters.action });
    }
    if (filters.entityType) {
      query = query.where({ entity_type: filters.entityType });
    }
    if (filters.entityId) {
      query = query.where({ entity_id: filters.entityId });
    }
    if (filters.startDate && filters.endDate) {
      query = query.whereBetween('created_at', [filters.startDate, filters.endDate]);
    }

    query = query.orderBy('created_at', 'desc');

    const [data, countResult] = await Promise.all([
      query.clone().limit(limit).offset(offset).select('*'),
      query.clone().count('* as count').first()
    ]);

    const total = parseInt(countResult?.count as string || '0', 10);

    return { data, total };
  }

  /**
   * Delete old audit logs (for cleanup)
   */
  async deleteOlderThan(date: Date): Promise<number> {
    return await this.query()
      .where('created_at', '<', date)
      .delete();
  }
}
