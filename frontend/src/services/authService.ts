import apiClient from '../config/api';
import { AuthResponse, User } from '../types';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

export const authService = {
  // Register with WebAuthn
  async register(username: string, email: string): Promise<AuthResponse> {
    // Get registration options from server
    const optionsResponse = await apiClient.post('/api/auth/register/begin', {
      username,
      email,
    });

    const { options } = optionsResponse.data;

    // Start WebAuthn registration
    const credential = await startRegistration(options);

    // Complete registration
    const response = await apiClient.post('/api/auth/register/complete', {
      username,
      email,
      credential,
    });

    return response.data;
  },

  // Login with WebAuthn
  async login(username: string): Promise<AuthResponse> {
    // Get authentication options from server
    const optionsResponse = await apiClient.post('/api/auth/login/begin', {
      username,
    });

    const { options } = optionsResponse.data;

    // Start WebAuthn authentication
    const credential = await startAuthentication(options);

    // Complete authentication
    const response = await apiClient.post('/api/auth/login/complete', {
      username,
      credential,
    });

    return response.data;
  },

  // Refresh token
  async refreshToken(refreshToken: string): Promise<{ token: string }> {
    const response = await apiClient.post('/api/auth/refresh', {
      refreshToken,
    });
    return response.data;
  },

  // Get current user
  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get('/api/auth/me');
    return response.data;
  },

  // Logout
  async logout(): Promise<void> {
    await apiClient.post('/api/auth/logout');
  },
};
