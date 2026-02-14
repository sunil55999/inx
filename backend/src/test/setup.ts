// Test setup file
// This file runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'telegram_signals_marketplace_test';
process.env.REDIS_DB = '15'; // Use separate Redis DB for tests
process.env.JWT_SECRET = 'test-secret-key';

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
