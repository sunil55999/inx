/**
 * AuthService Unit Tests
 * Tests for WebAuthn authentication service
 * 
 * Requirements: 8.1, 8.2, 8.3
 */

import { AuthService } from '../AuthService';
import { UserRepository } from '../../database/repositories/UserRepository';
import { WebAuthnCredentialRepository } from '../../database/repositories/WebAuthnCredentialRepository';
import { UserRole } from '../../types/models';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/types';

// Mock the repositories
jest.mock('../../database/repositories/UserRepository');
jest.mock('../../database/repositories/WebAuthnCredentialRepository');

// Mock @simplewebauthn/server
jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  generateAuthenticationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
}));

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockCredentialRepo: jest.Mocked<WebAuthnCredentialRepository>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create service instance
    authService = new AuthService();

    // Get mocked repository instances
    mockUserRepo = (authService as any).userRepo;
    mockCredentialRepo = (authService as any).credentialRepo;
  });

  describe('beginRegistration', () => {
    it('should generate registration options for new user', async () => {
      const username = 'testuser';
      const mockOptions = {
        challenge: 'mock-challenge-123',
        rp: { name: 'Test RP', id: 'localhost' },
        user: { id: 'user-id', name: username, displayName: username },
      };

      mockUserRepo.findByUsername.mockResolvedValue(null);
      (generateRegistrationOptions as jest.Mock).mockResolvedValue(mockOptions);

      const result = await authService.beginRegistration(username);

      expect(mockUserRepo.findByUsername).toHaveBeenCalledWith(username);
      expect(generateRegistrationOptions).toHaveBeenCalled();
      expect(result.options).toEqual(mockOptions);
      expect(result.challenge).toBe('mock-challenge-123');
    });

    it('should throw error if username already exists', async () => {
      const username = 'existinguser';
      mockUserRepo.findByUsername.mockResolvedValue({
        id: 'user-123',
        username,
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(authService.beginRegistration(username)).rejects.toThrow(
        'Username already exists'
      );

      expect(mockUserRepo.findByUsername).toHaveBeenCalledWith(username);
      expect(generateRegistrationOptions).not.toHaveBeenCalled();
    });

    it('should use default role of BUYER if not specified', async () => {
      const username = 'testuser';
      mockUserRepo.findByUsername.mockResolvedValue(null);
      (generateRegistrationOptions as jest.Mock).mockResolvedValue({
        challenge: 'challenge',
      });

      await authService.beginRegistration(username);

      expect(generateRegistrationOptions).toHaveBeenCalled();
    });

    it('should accept custom role', async () => {
      const username = 'merchantuser';
      mockUserRepo.findByUsername.mockResolvedValue(null);
      (generateRegistrationOptions as jest.Mock).mockResolvedValue({
        challenge: 'challenge',
      });

      await authService.beginRegistration(username, UserRole.MERCHANT);

      expect(generateRegistrationOptions).toHaveBeenCalled();
    });
  });

  describe('completeRegistration', () => {
    const mockResponse: RegistrationResponseJSON = {
      id: 'credential-id',
      rawId: 'credential-id',
      response: {
        clientDataJSON: 'client-data',
        attestationObject: 'attestation',
      },
      type: 'public-key',
      clientExtensionResults: {},
    };

    it('should create user and credential on successful verification', async () => {
      const username = 'newuser';
      const challenge = 'test-challenge';
      const mockUser = {
        id: 'user-123',
        username,
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockCredential = {
        id: 'cred-123',
        userId: 'user-123',
        credentialId: 'credential-id-base64',
        publicKey: 'public-key-base64',
        counter: 0,
        createdAt: new Date(),
      };

      (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credentialID: Buffer.from('credential-id'),
          credentialPublicKey: Buffer.from('public-key'),
          counter: 0,
        },
      });

      mockCredentialRepo.findByCredentialId.mockResolvedValue(null);
      mockUserRepo.create.mockResolvedValue(mockUser);
      mockCredentialRepo.create.mockResolvedValue(mockCredential);

      const result = await authService.completeRegistration(
        username,
        UserRole.BUYER,
        mockResponse,
        challenge
      );

      expect(verifyRegistrationResponse).toHaveBeenCalled();
      expect(mockUserRepo.create).toHaveBeenCalled();
      expect(mockCredentialRepo.create).toHaveBeenCalled();
      expect(result.user).toEqual(mockUser);
      expect(result.credential).toEqual(mockCredential);
    });

    it('should throw error if verification fails', async () => {
      const username = 'newuser';
      const challenge = 'test-challenge';

      (verifyRegistrationResponse as jest.Mock).mockRejectedValue(
        new Error('Verification failed')
      );

      await expect(
        authService.completeRegistration(username, UserRole.BUYER, mockResponse, challenge)
      ).rejects.toThrow('Registration verification failed');

      expect(mockUserRepo.create).not.toHaveBeenCalled();
      expect(mockCredentialRepo.create).not.toHaveBeenCalled();
    });

    it('should throw error if credential already exists', async () => {
      const username = 'newuser';
      const challenge = 'test-challenge';

      (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credentialID: Buffer.from('credential-id'),
          credentialPublicKey: Buffer.from('public-key'),
          counter: 0,
        },
      });

      mockCredentialRepo.findByCredentialId.mockResolvedValue({
        id: 'existing-cred',
        userId: 'other-user',
        credentialId: 'credential-id-base64',
        publicKey: 'public-key',
        counter: 0,
        createdAt: new Date(),
      });

      await expect(
        authService.completeRegistration(username, UserRole.BUYER, mockResponse, challenge)
      ).rejects.toThrow('Credential already registered');

      expect(mockUserRepo.create).not.toHaveBeenCalled();
    });

    it('should rollback user creation if credential storage fails', async () => {
      const username = 'newuser';
      const challenge = 'test-challenge';
      const mockUser = {
        id: 'user-123',
        username,
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credentialID: Buffer.from('credential-id'),
          credentialPublicKey: Buffer.from('public-key'),
          counter: 0,
        },
      });

      mockCredentialRepo.findByCredentialId.mockResolvedValue(null);
      mockUserRepo.create.mockResolvedValue(mockUser);
      mockCredentialRepo.create.mockResolvedValue(null as any); // Simulate failure

      await expect(
        authService.completeRegistration(username, UserRole.BUYER, mockResponse, challenge)
      ).rejects.toThrow('Failed to store credential');

      expect(mockUserRepo.delete).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('beginAuthentication', () => {
    it('should generate authentication options for existing user', async () => {
      const username = 'testuser';
      const mockUser = {
        id: 'user-123',
        username,
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockCredentials = [
        {
          id: 'cred-123',
          userId: 'user-123',
          credentialId: 'credential-id-base64',
          publicKey: 'public-key',
          counter: 0,
          createdAt: new Date(),
        },
      ];
      const mockOptions = {
        challenge: 'auth-challenge-123',
        allowCredentials: [],
      };

      mockUserRepo.findByUsername.mockResolvedValue(mockUser);
      mockCredentialRepo.findByUserId.mockResolvedValue(mockCredentials);
      (generateAuthenticationOptions as jest.Mock).mockResolvedValue(mockOptions);

      const result = await authService.beginAuthentication(username);

      expect(mockUserRepo.findByUsername).toHaveBeenCalledWith(username);
      expect(mockCredentialRepo.findByUserId).toHaveBeenCalledWith(mockUser.id);
      expect(generateAuthenticationOptions).toHaveBeenCalled();
      expect(result.options).toEqual(mockOptions);
      expect(result.challenge).toBe('auth-challenge-123');
    });

    it('should throw error if user not found', async () => {
      const username = 'nonexistent';
      mockUserRepo.findByUsername.mockResolvedValue(null);

      await expect(authService.beginAuthentication(username)).rejects.toThrow('User not found');

      expect(mockCredentialRepo.findByUserId).not.toHaveBeenCalled();
    });

    it('should throw error if user has no credentials', async () => {
      const username = 'testuser';
      const mockUser = {
        id: 'user-123',
        username,
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUserRepo.findByUsername.mockResolvedValue(mockUser);
      mockCredentialRepo.findByUserId.mockResolvedValue([]);

      await expect(authService.beginAuthentication(username)).rejects.toThrow(
        'No credentials registered for this user'
      );
    });
  });

  describe('completeAuthentication', () => {
    const mockResponse: AuthenticationResponseJSON = {
      id: 'credential-id',
      rawId: 'credential-id',
      response: {
        clientDataJSON: 'client-data',
        authenticatorData: 'auth-data',
        signature: 'signature',
      },
      type: 'public-key',
      clientExtensionResults: {},
    };

    it('should authenticate user and return token on success', async () => {
      const username = 'testuser';
      const challenge = 'auth-challenge';
      const mockUser = {
        id: 'user-123',
        username,
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockCredential = {
        id: 'cred-123',
        userId: 'user-123',
        credentialId: 'credential-id',
        publicKey: 'public-key-base64',
        counter: 0,
        createdAt: new Date(),
      };

      mockUserRepo.findByUsername.mockResolvedValue(mockUser);
      mockCredentialRepo.findByCredentialId.mockResolvedValue(mockCredential);
      (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          newCounter: 1,
        },
      });
      mockCredentialRepo.updateCounter.mockResolvedValue(mockCredential);

      const result = await authService.completeAuthentication(username, mockResponse, challenge);

      expect(mockUserRepo.findByUsername).toHaveBeenCalledWith(username);
      expect(mockCredentialRepo.findByCredentialId).toHaveBeenCalledWith('credential-id');
      expect(verifyAuthenticationResponse).toHaveBeenCalled();
      expect(mockCredentialRepo.updateCounter).toHaveBeenCalledWith('cred-123', 1);
      expect(result.user).toEqual(mockUser);
      expect(result.token.token).toBeDefined();
      expect(result.token.userId).toBe(mockUser.id);
      expect(result.token.role).toBe(mockUser.role);
    });

    it('should throw error if user not found', async () => {
      const username = 'nonexistent';
      const challenge = 'auth-challenge';

      mockUserRepo.findByUsername.mockResolvedValue(null);

      await expect(
        authService.completeAuthentication(username, mockResponse, challenge)
      ).rejects.toThrow('User not found');
    });

    it('should throw error if credential not found', async () => {
      const username = 'testuser';
      const challenge = 'auth-challenge';
      const mockUser = {
        id: 'user-123',
        username,
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUserRepo.findByUsername.mockResolvedValue(mockUser);
      mockCredentialRepo.findByCredentialId.mockResolvedValue(null);

      await expect(
        authService.completeAuthentication(username, mockResponse, challenge)
      ).rejects.toThrow('Credential not found');
    });

    it('should throw error if credential belongs to different user', async () => {
      const username = 'testuser';
      const challenge = 'auth-challenge';
      const mockUser = {
        id: 'user-123',
        username,
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockCredential = {
        id: 'cred-123',
        userId: 'other-user-456', // Different user
        credentialId: 'credential-id',
        publicKey: 'public-key-base64',
        counter: 0,
        createdAt: new Date(),
      };

      mockUserRepo.findByUsername.mockResolvedValue(mockUser);
      mockCredentialRepo.findByCredentialId.mockResolvedValue(mockCredential);

      await expect(
        authService.completeAuthentication(username, mockResponse, challenge)
      ).rejects.toThrow('Credential does not belong to user');
    });

    it('should throw error if verification fails', async () => {
      const username = 'testuser';
      const challenge = 'auth-challenge';
      const mockUser = {
        id: 'user-123',
        username,
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockCredential = {
        id: 'cred-123',
        userId: 'user-123',
        credentialId: 'credential-id',
        publicKey: 'public-key-base64',
        counter: 0,
        createdAt: new Date(),
      };

      mockUserRepo.findByUsername.mockResolvedValue(mockUser);
      mockCredentialRepo.findByCredentialId.mockResolvedValue(mockCredential);
      (verifyAuthenticationResponse as jest.Mock).mockRejectedValue(
        new Error('Verification failed')
      );

      await expect(
        authService.completeAuthentication(username, mockResponse, challenge)
      ).rejects.toThrow('Authentication verification failed');
    });
  });

  describe('validateToken', () => {
    it('should return user for valid token', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Generate a real token
      const token = (authService as any).generateToken(mockUser).token;

      mockUserRepo.findById.mockResolvedValue(mockUser);

      const result = await authService.validateToken(token);

      expect(result).toEqual(mockUser);
      expect(mockUserRepo.findById).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw error for invalid token', async () => {
      const invalidToken = 'invalid-token';

      await expect(authService.validateToken(invalidToken)).rejects.toThrow(
        'Invalid or expired token'
      );
    });

    it('should throw error if user no longer exists', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const token = (authService as any).generateToken(mockUser).token;

      mockUserRepo.findById.mockResolvedValue(null);

      await expect(authService.validateToken(token)).rejects.toThrow(
        'Invalid or expired token'
      );
    });
  });

  describe('addCredential', () => {
    const mockResponse: RegistrationResponseJSON = {
      id: 'new-credential-id',
      rawId: 'new-credential-id',
      response: {
        clientDataJSON: 'client-data',
        attestationObject: 'attestation',
      },
      type: 'public-key',
      clientExtensionResults: {},
    };

    it('should add additional credential to existing user', async () => {
      const userId = 'user-123';
      const challenge = 'test-challenge';
      const mockUser = {
        id: userId,
        username: 'testuser',
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockCredential = {
        id: 'cred-456',
        userId,
        credentialId: 'new-credential-id-base64',
        publicKey: 'public-key-base64',
        counter: 0,
        createdAt: new Date(),
      };

      mockUserRepo.findById.mockResolvedValue(mockUser);
      (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credentialID: Buffer.from('new-credential-id'),
          credentialPublicKey: Buffer.from('public-key'),
          counter: 0,
        },
      });
      mockCredentialRepo.findByCredentialId.mockResolvedValue(null);
      mockCredentialRepo.create.mockResolvedValue(mockCredential);

      const result = await authService.addCredential(userId, mockResponse, challenge);

      expect(mockUserRepo.findById).toHaveBeenCalledWith(userId);
      expect(verifyRegistrationResponse).toHaveBeenCalled();
      expect(mockCredentialRepo.create).toHaveBeenCalled();
      expect(result).toEqual(mockCredential);
    });

    it('should throw error if user not found', async () => {
      const userId = 'nonexistent';
      const challenge = 'test-challenge';

      mockUserRepo.findById.mockResolvedValue(null);

      await expect(authService.addCredential(userId, mockResponse, challenge)).rejects.toThrow(
        'User not found'
      );
    });

    it('should throw error if credential already exists', async () => {
      const userId = 'user-123';
      const challenge = 'test-challenge';
      const mockUser = {
        id: userId,
        username: 'testuser',
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUserRepo.findById.mockResolvedValue(mockUser);
      (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credentialID: Buffer.from('new-credential-id'),
          credentialPublicKey: Buffer.from('public-key'),
          counter: 0,
        },
      });
      mockCredentialRepo.findByCredentialId.mockResolvedValue({
        id: 'existing-cred',
        userId: 'other-user',
        credentialId: 'new-credential-id-base64',
        publicKey: 'public-key',
        counter: 0,
        createdAt: new Date(),
      });

      await expect(authService.addCredential(userId, mockResponse, challenge)).rejects.toThrow(
        'Credential already registered'
      );
    });
  });

  describe('removeCredential', () => {
    it('should remove credential from user account', async () => {
      const userId = 'user-123';
      const credentialId = 'credential-id';
      const mockUser = {
        id: userId,
        username: 'testuser',
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockCredential = {
        id: 'cred-123',
        userId,
        credentialId,
        publicKey: 'public-key',
        counter: 0,
        createdAt: new Date(),
      };

      mockUserRepo.findById.mockResolvedValue(mockUser);
      mockCredentialRepo.findByCredentialId.mockResolvedValue(mockCredential);
      mockCredentialRepo.findByUserId.mockResolvedValue([mockCredential, mockCredential]); // 2 credentials
      mockCredentialRepo.deleteByCredentialId.mockResolvedValue(true);

      await authService.removeCredential(userId, credentialId);

      expect(mockUserRepo.findById).toHaveBeenCalledWith(userId);
      expect(mockCredentialRepo.findByCredentialId).toHaveBeenCalledWith(credentialId);
      expect(mockCredentialRepo.deleteByCredentialId).toHaveBeenCalledWith(credentialId);
    });

    it('should throw error if trying to remove last credential', async () => {
      const userId = 'user-123';
      const credentialId = 'credential-id';
      const mockUser = {
        id: userId,
        username: 'testuser',
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockCredential = {
        id: 'cred-123',
        userId,
        credentialId,
        publicKey: 'public-key',
        counter: 0,
        createdAt: new Date(),
      };

      mockUserRepo.findById.mockResolvedValue(mockUser);
      mockCredentialRepo.findByCredentialId.mockResolvedValue(mockCredential);
      mockCredentialRepo.findByUserId.mockResolvedValue([mockCredential]); // Only 1 credential

      await expect(authService.removeCredential(userId, credentialId)).rejects.toThrow(
        'Cannot remove last credential'
      );

      expect(mockCredentialRepo.deleteByCredentialId).not.toHaveBeenCalled();
    });

    it('should throw error if credential does not belong to user', async () => {
      const userId = 'user-123';
      const credentialId = 'credential-id';
      const mockUser = {
        id: userId,
        username: 'testuser',
        role: UserRole.BUYER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockCredential = {
        id: 'cred-123',
        userId: 'other-user-456', // Different user
        credentialId,
        publicKey: 'public-key',
        counter: 0,
        createdAt: new Date(),
      };

      mockUserRepo.findById.mockResolvedValue(mockUser);
      mockCredentialRepo.findByCredentialId.mockResolvedValue(mockCredential);

      await expect(authService.removeCredential(userId, credentialId)).rejects.toThrow(
        'Credential does not belong to user'
      );
    });
  });

  describe('listCredentials', () => {
    it('should return list of user credentials without sensitive data', async () => {
      const userId = 'user-123';
      const mockCredentials = [
        {
          id: 'cred-123',
          userId,
          credentialId: 'credential-id-1',
          publicKey: 'public-key-1',
          counter: 0,
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'cred-456',
          userId,
          credentialId: 'credential-id-2',
          publicKey: 'public-key-2',
          counter: 5,
          createdAt: new Date('2024-01-02'),
        },
      ];

      mockCredentialRepo.findByUserId.mockResolvedValue(mockCredentials);

      const result = await authService.listCredentials(userId);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'cred-123',
        credentialId: 'credential-id-1',
        createdAt: new Date('2024-01-01'),
      });
      expect(result[1]).toEqual({
        id: 'cred-456',
        credentialId: 'credential-id-2',
        createdAt: new Date('2024-01-02'),
      });
      // Ensure sensitive data is not included
      expect((result[0] as any).publicKey).toBeUndefined();
      expect((result[0] as any).counter).toBeUndefined();
    });

    it('should return empty array if user has no credentials', async () => {
      const userId = 'user-123';

      mockCredentialRepo.findByUserId.mockResolvedValue([]);

      const result = await authService.listCredentials(userId);

      expect(result).toEqual([]);
    });
  });
});
