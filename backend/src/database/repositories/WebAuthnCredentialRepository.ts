import { BaseRepository } from './BaseRepository';
import { WebAuthnCredential } from '../../types/models';

/**
 * WebAuthn Credential Repository
 * Handles CRUD operations for WebAuthn credentials
 * 
 * Requirements: 1.1, 4.5
 */
export class WebAuthnCredentialRepository extends BaseRepository<WebAuthnCredential> {
  constructor() {
    super('webauthn_credentials');
  }

  /**
   * Find credentials by user ID
   */
  async findByUserId(userId: string): Promise<WebAuthnCredential[]> {
    return await this.query()
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .select('*');
  }

  /**
   * Find credential by credential ID
   */
  async findByCredentialId(credentialId: string): Promise<WebAuthnCredential | null> {
    const result = await this.query()
      .where({ credential_id: credentialId })
      .first();
    return result || null;
  }

  /**
   * Check if credential ID exists
   */
  async credentialIdExists(credentialId: string): Promise<boolean> {
    const result = await this.query()
      .where({ credential_id: credentialId })
      .first('id');
    return !!result;
  }

  /**
   * Update credential counter
   */
  async updateCounter(id: string, counter: number): Promise<WebAuthnCredential | null> {
    return await this.update(id, { counter } as Partial<WebAuthnCredential>);
  }

  /**
   * Delete credential by credential ID
   */
  async deleteByCredentialId(credentialId: string): Promise<boolean> {
    const deletedCount = await this.query()
      .where({ credential_id: credentialId })
      .delete();
    return deletedCount > 0;
  }

  /**
   * Count credentials for user
   */
  async countByUserId(userId: string): Promise<number> {
    return await this.count({ userId } as Partial<WebAuthnCredential>);
  }

  /**
   * Check if user has any credentials
   */
  async userHasCredentials(userId: string): Promise<boolean> {
    const count = await this.countByUserId(userId);
    return count > 0;
  }

  /**
   * Get user's most recently created credential
   */
  async getMostRecent(userId: string): Promise<WebAuthnCredential | null> {
    const result = await this.query()
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .first();
    return result || null;
  }
}
