/**
 * Authentication Service
 * Handles WebAuthn (FIDO2) biometric authentication and JWT token management
 * 
 * Requirements: 8.1, 8.2, 8.3
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/types';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { UserRepository } from '../database/repositories/UserRepository';
import { WebAuthnCredentialRepository } from '../database/repositories/WebAuthnCredentialRepository';
import { User, WebAuthnCredential, UserRole, SessionToken } from '../types/models';
import logger from '../utils/logger';

/**
 * WebAuthn Relying Party configuration
 */
interface RPConfig {
  name: string;
  id: string;
  origin: string;
}

/**
 * Challenge storage for WebAuthn operations
 * In production, this should use Redis for distributed systems
 */
interface ChallengeStore {
  [userId: string]: string;
}

/**
 * Registration options result
 */
export interface RegistrationOptionsResult {
  options: PublicKeyCredentialCreationOptionsJSON;
  challenge: string;
}

/**
 * Authentication options result
 */
export interface AuthenticationOptionsResult {
  options: PublicKeyCredentialRequestOptionsJSON;
  challenge: string;
}

/**
 * Registration result
 */
export interface RegistrationResult {
  user: User;
  credential: WebAuthnCredential;
}

/**
 * Authentication result
 */
export interface AuthenticationResult {
  user: User;
  token: SessionToken;
}

export class AuthService {
  private userRepo: UserRepository;
  private credentialRepo: WebAuthnCredentialRepository;
  private rpConfig: RPConfig;
  private jwtSecret: string;
  private jwtExpiresIn: string;
  
  // In-memory challenge storage (use Redis in production)
  private challenges: ChallengeStore = {};

  constructor() {
    this.userRepo = new UserRepository();
    this.credentialRepo = new WebAuthnCredentialRepository();
    
    // Load configuration from environment
    this.rpConfig = {
      name: process.env.WEBAUTHN_RP_NAME || 'Telegram Signals Marketplace',
      id: process.env.WEBAUTHN_RP_ID || 'localhost',
      origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000',
    };
    
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
    
    logger.info('AuthService initialized', {
      rpName: this.rpConfig.name,
      rpId: this.rpConfig.id,
    });
  }

  /**
   * Begin WebAuthn registration process
   * Generates registration options for the client
   * 
   * @param username - Username for the new account
   * @param _role - User role (buyer, merchant, admin) - stored for later use
   * @returns Registration options to send to client
   */
  async beginRegistration(
    username: string,
    _role: UserRole = UserRole.BUYER
  ): Promise<RegistrationOptionsResult> {
    // Check if username already exists
    const existingUser = await this.userRepo.findByUsername(username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Create temporary user ID for challenge storage
    const userId = uuidv4();

    // Get existing credentials (empty for new user)
    const existingCredentials: { id: Buffer; type: 'public-key'; transports?: AuthenticatorTransport[] }[] = [];

    // Generate registration options
    const options = await generateRegistrationOptions({
      rpName: this.rpConfig.name,
      rpID: this.rpConfig.id,
      userID: userId,
      userName: username,
      userDisplayName: username,
      attestationType: 'none',
      excludeCredentials: existingCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform', // Prefer platform authenticators (biometrics)
      },
    });

    // Store challenge for verification
    this.challenges[userId] = options.challenge;

    logger.info('Registration options generated', { username, userId });

    return {
      options,
      challenge: options.challenge,
    };
  }

  /**
   * Complete WebAuthn registration process
   * Verifies the registration response and creates user account
   * 
   * @param username - Username for the new account
   * @param role - User role
   * @param response - Registration response from client
   * @param expectedChallenge - Expected challenge value
   * @returns Created user and credential
   */
  async completeRegistration(
    username: string,
    role: UserRole,
    response: RegistrationResponseJSON,
    expectedChallenge: string
  ): Promise<RegistrationResult> {
    // Verify the registration response
    let verification: VerifiedRegistrationResponse;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.rpConfig.origin,
        expectedRPID: this.rpConfig.id,
      });
    } catch (error) {
      logger.error('Registration verification failed', { username, error });
      throw new Error('Registration verification failed: ' + (error as Error).message);
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('Registration verification failed');
    }

    const { credentialPublicKey, credentialID, counter } = verification.registrationInfo;

    // Check if credential ID already exists
    const existingCredential = await this.credentialRepo.findByCredentialId(
      Buffer.from(credentialID).toString('base64')
    );
    if (existingCredential) {
      throw new Error('Credential already registered');
    }

    // Create user account
    const user = await this.userRepo.create({
      username,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User);

    if (!user) {
      throw new Error('Failed to create user account');
    }

    // Store WebAuthn credential
    const credential = await this.credentialRepo.create({
      userId: user.id,
      credentialId: Buffer.from(credentialID).toString('base64'),
      publicKey: Buffer.from(credentialPublicKey).toString('base64'),
      counter,
      createdAt: new Date(),
    } as WebAuthnCredential);

    if (!credential) {
      // Rollback user creation
      await this.userRepo.delete(user.id);
      throw new Error('Failed to store credential');
    }

    logger.info('User registered successfully', {
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    return { user, credential };
  }

  /**
   * Begin WebAuthn authentication process
   * Generates authentication options for the client
   * 
   * @param username - Username to authenticate
   * @returns Authentication options to send to client
   */
  async beginAuthentication(username: string): Promise<AuthenticationOptionsResult> {
    // Find user by username
    const user = await this.userRepo.findByUsername(username);
    if (!user) {
      throw new Error('User not found');
    }

    // Get user's credentials
    const credentials = await this.credentialRepo.findByUserId(user.id);
    if (credentials.length === 0) {
      throw new Error('No credentials registered for this user');
    }

    // Convert credentials to expected format
    const allowCredentials = credentials.map((cred) => ({
      id: Buffer.from(cred.credentialId, 'base64'),
      type: 'public-key' as const,
      transports: ['internal'] as AuthenticatorTransport[],
    }));

    // Generate authentication options
    const options = await generateAuthenticationOptions({
      rpID: this.rpConfig.id,
      allowCredentials,
      userVerification: 'preferred',
    });

    // Store challenge for verification
    this.challenges[user.id] = options.challenge;

    logger.info('Authentication options generated', {
      userId: user.id,
      username: user.username,
    });

    return {
      options,
      challenge: options.challenge,
    };
  }

  /**
   * Complete WebAuthn authentication process
   * Verifies the authentication response and issues JWT token
   * 
   * @param username - Username to authenticate
   * @param response - Authentication response from client
   * @param expectedChallenge - Expected challenge value
   * @returns User and session token
   */
  async completeAuthentication(
    username: string,
    response: AuthenticationResponseJSON,
    expectedChallenge: string
  ): Promise<AuthenticationResult> {
    // Find user by username
    const user = await this.userRepo.findByUsername(username);
    if (!user) {
      throw new Error('User not found');
    }

    // Find credential by credential ID
    const credentialId = response.id;
    const credential = await this.credentialRepo.findByCredentialId(credentialId);
    if (!credential) {
      throw new Error('Credential not found');
    }

    // Verify credential belongs to user
    if (credential.userId !== user.id) {
      throw new Error('Credential does not belong to user');
    }

    // Verify the authentication response
    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.rpConfig.origin,
        expectedRPID: this.rpConfig.id,
        authenticator: {
          credentialID: Buffer.from(credential.credentialId, 'base64'),
          credentialPublicKey: Buffer.from(credential.publicKey, 'base64'),
          counter: credential.counter,
        },
      });
    } catch (error) {
      logger.error('Authentication verification failed', { username, error });
      throw new Error('Authentication verification failed: ' + (error as Error).message);
    }

    if (!verification.verified) {
      throw new Error('Authentication verification failed');
    }

    // Update credential counter
    const { newCounter } = verification.authenticationInfo;
    await this.credentialRepo.updateCounter(credential.id, newCounter);

    // Generate JWT token
    const token = this.generateToken(user);

    logger.info('User authenticated successfully', {
      userId: user.id,
      username: user.username,
    });

    return { user, token };
  }

  /**
   * Generate JWT token for authenticated user
   * 
   * @param user - Authenticated user
   * @returns Session token
   */
  private generateToken(user: User): SessionToken {
    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };

    const token = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    } as jwt.SignOptions);

    // Calculate expiration date
    const expiresAt = new Date();
    const expiryDays = parseInt(this.jwtExpiresIn.replace('d', ''));
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    return {
      token,
      expiresAt,
      userId: user.id,
      role: user.role,
    };
  }

  /**
   * Validate JWT token
   * 
   * @param token - JWT token to validate
   * @returns Decoded user information
   */
  async validateToken(token: string): Promise<User> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as {
        userId: string;
        username: string;
        role: UserRole;
      };

      // Fetch user from database to ensure they still exist
      const user = await this.userRepo.findById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      logger.error('Token validation failed', { error });
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Revoke token (logout)
   * In production, implement token blacklist using Redis
   * 
   * @param token - Token to revoke
   */
  async revokeToken(token: string): Promise<void> {
    // TODO: Implement token blacklist in Redis
    // For now, tokens will remain valid until expiration
    logger.info('Token revoked (client-side only)', { token: token.substring(0, 20) + '...' });
  }

  /**
   * Add additional WebAuthn credential to existing user account
   * 
   * @param userId - User ID
   * @param response - Registration response from client
   * @param expectedChallenge - Expected challenge value
   * @returns Created credential
   */
  async addCredential(
    userId: string,
    response: RegistrationResponseJSON,
    expectedChallenge: string
  ): Promise<WebAuthnCredential> {
    // Verify user exists
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify the registration response
    let verification: VerifiedRegistrationResponse;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.rpConfig.origin,
        expectedRPID: this.rpConfig.id,
      });
    } catch (error) {
      logger.error('Credential registration verification failed', { userId, error });
      throw new Error('Credential verification failed: ' + (error as Error).message);
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('Credential verification failed');
    }

    const { credentialPublicKey, credentialID, counter } = verification.registrationInfo;

    // Check if credential ID already exists
    const existingCredential = await this.credentialRepo.findByCredentialId(
      Buffer.from(credentialID).toString('base64')
    );
    if (existingCredential) {
      throw new Error('Credential already registered');
    }

    // Store WebAuthn credential
    const credential = await this.credentialRepo.create({
      userId: user.id,
      credentialId: Buffer.from(credentialID).toString('base64'),
      publicKey: Buffer.from(credentialPublicKey).toString('base64'),
      counter,
      createdAt: new Date(),
    } as WebAuthnCredential);

    if (!credential) {
      throw new Error('Failed to store credential');
    }

    logger.info('Additional credential added', {
      userId: user.id,
      credentialId: credential.id,
    });

    return credential;
  }

  /**
   * Remove WebAuthn credential from user account
   * 
   * @param userId - User ID
   * @param credentialId - Credential ID to remove
   */
  async removeCredential(userId: string, credentialId: string): Promise<void> {
    // Verify user exists
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Find credential
    const credential = await this.credentialRepo.findByCredentialId(credentialId);
    if (!credential) {
      throw new Error('Credential not found');
    }

    // Verify credential belongs to user
    if (credential.userId !== userId) {
      throw new Error('Credential does not belong to user');
    }

    // Check if this is the last credential
    const userCredentials = await this.credentialRepo.findByUserId(userId);
    if (userCredentials.length <= 1) {
      throw new Error('Cannot remove last credential');
    }

    // Delete credential
    const deleted = await this.credentialRepo.deleteByCredentialId(credentialId);
    if (!deleted) {
      throw new Error('Failed to delete credential');
    }

    logger.info('Credential removed', {
      userId,
      credentialId,
    });
  }

  /**
   * List user's registered credentials
   * 
   * @param userId - User ID
   * @returns List of credentials (without sensitive data)
   */
  async listCredentials(userId: string): Promise<Array<{
    id: string;
    credentialId: string;
    createdAt: Date;
  }>> {
    const credentials = await this.credentialRepo.findByUserId(userId);
    
    // Return only non-sensitive information
    return credentials.map((cred) => ({
      id: cred.id,
      credentialId: cred.credentialId,
      createdAt: cred.createdAt,
    }));
  }

  /**
   * Get challenge for user (for testing/debugging)
   * 
   * @param userId - User ID
   * @returns Stored challenge or null
   */
  getChallenge(userId: string): string | null {
    return this.challenges[userId] || null;
  }

  /**
   * Clear challenge for user
   * 
   * @param userId - User ID
   */
  clearChallenge(userId: string): void {
    delete this.challenges[userId];
  }
}
