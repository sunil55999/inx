# Services

This directory contains business logic services for the Telegram Signals Marketplace.

## AuthService

The `AuthService` handles WebAuthn (FIDO2) biometric authentication and JWT token management.

### Features

- **WebAuthn Registration**: Register new users with biometric authenticators (fingerprint, face recognition)
- **WebAuthn Authentication**: Authenticate users using registered biometric credentials
- **JWT Token Management**: Generate and validate JWT tokens for session management
- **Multi-Device Support**: Users can register multiple authenticators (e.g., phone + laptop)
- **Credential Management**: Add and remove authenticators from user accounts

### API Flow

#### Registration Flow

1. **Begin Registration**: Client calls `POST /api/auth/register/begin` with username
   - Server generates WebAuthn registration options
   - Returns challenge and options to client

2. **Complete Registration**: Client performs biometric authentication and calls `POST /api/auth/register/complete`
   - Server verifies the registration response
   - Creates user account and stores credential
   - Returns user information

#### Authentication Flow

1. **Begin Authentication**: Client calls `POST /api/auth/login/begin` with username
   - Server generates WebAuthn authentication options
   - Returns challenge and options to client

2. **Complete Authentication**: Client performs biometric authentication and calls `POST /api/auth/login/complete`
   - Server verifies the authentication response
   - Generates JWT token
   - Returns user information and token

### Configuration

The service requires the following environment variables:

```env
# WebAuthn Configuration
WEBAUTHN_RP_NAME=Telegram Signals Marketplace
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:3000

# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d
```

### Usage Example

```typescript
import { AuthService } from './services/AuthService';

const authService = new AuthService();

// Begin registration
const registrationOptions = await authService.beginRegistration('username', UserRole.BUYER);

// Complete registration (after client performs biometric auth)
const { user, credential } = await authService.completeRegistration(
  'username',
  UserRole.BUYER,
  registrationResponse,
  challenge
);

// Begin authentication
const authOptions = await authService.beginAuthentication('username');

// Complete authentication (after client performs biometric auth)
const { user, token } = await authService.completeAuthentication(
  'username',
  authResponse,
  challenge
);

// Validate token
const user = await authService.validateToken(token);
```

### Security Considerations

1. **Challenge Storage**: In production, challenges should be stored in Redis with short TTL (5 minutes)
2. **Token Blacklist**: Implement token blacklist in Redis for logout functionality
3. **Rate Limiting**: Apply rate limiting to authentication endpoints to prevent brute force attacks
4. **HTTPS Only**: WebAuthn requires HTTPS in production (except localhost for development)
5. **Credential Counter**: The service tracks and validates credential counters to detect cloned authenticators

### Testing

Run the unit tests:

```bash
npm test -- AuthService.test.ts
```

The test suite includes:
- Registration flow tests (success and error cases)
- Authentication flow tests (success and error cases)
- Token validation tests
- Credential management tests (add/remove)
- Edge cases and error handling

### Requirements Satisfied

- **Requirement 8.1**: WebAuthn (FIDO2) protocol implementation
- **Requirement 8.2**: Biometric authenticator registration
- **Requirement 8.3**: WebAuthn credential authentication
- **Requirement 8.4**: Secure credential storage (public keys only)
- **Requirement 8.5**: Multiple authenticators per user
