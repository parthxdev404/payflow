import Redis from 'ioredis';
import { logger } from './logger';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy(times: number) {
        if (times > 5) return null;

        return Math.min(times * 500, 5000);
    },
});

redis.on('connect', () => {
    logger.info('Redis connected');
});

redis.on('ready', () => {
    logger.info('Redis ready');
});

redis.on('error', (error) => {
    logger.error({ error }, 'Redis error');
});

redis.on('close', () => {
    logger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
    logger.warn('Redis reconnecting...');
});

export async function connectRedis(): Promise<void> {
    try {
        await redis.connect();

        logger.info('Redis connection established');
    } catch (error) {
        logger.fatal({ error }, 'Unable to connect to Redis');
        process.exit(1);
    }
}

export async function disconnectRedis(): Promise<void> {
    try {
        await redis.quit();

        logger.info('Redis disconnected');
    } catch (error) {
        logger.error({ error }, 'Error disconnecting Redis');
    }
}