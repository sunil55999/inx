import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
};

// Main Redis client for general caching
export const redisClient = new Redis(redisConfig);

// Separate Redis client for session management
export const sessionRedisClient = new Redis({
  ...redisConfig,
  db: 1, // Use different database for sessions
});

// Event handlers
redisClient.on('connect', () => {
  console.log('✓ Redis client connected');
});

redisClient.on('error', (error) => {
  console.error('✗ Redis client error:', error);
});

sessionRedisClient.on('connect', () => {
  console.log('✓ Session Redis client connected');
});

sessionRedisClient.on('error', (error) => {
  console.error('✗ Session Redis client error:', error);
});

// Test Redis connection
export async function testRedisConnection(): Promise<boolean> {
  try {
    await redisClient.ping();
    await sessionRedisClient.ping();
    console.log('✓ Redis connections established successfully');
    return true;
  } catch (error) {
    console.error('✗ Redis connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeRedisConnections(): Promise<void> {
  await redisClient.quit();
  await sessionRedisClient.quit();
  console.log('Redis connections closed');
}

// Cache helper functions
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  },

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redisClient.setex(key, ttlSeconds, serialized);
    } else {
      await redisClient.set(key, serialized);
    }
  },

  async del(key: string): Promise<void> {
    await redisClient.del(key);
  },

  async exists(key: string): Promise<boolean> {
    const result = await redisClient.exists(key);
    return result === 1;
  },

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await redisClient.expire(key, ttlSeconds);
  },

  async keys(pattern: string): Promise<string[]> {
    return await redisClient.keys(pattern);
  },

  async flushPattern(pattern: string): Promise<void> {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  },
};

export default redisClient;
