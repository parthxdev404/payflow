import { redis } from "../config/redis";
import { logger } from "../config/logger";

const DEFAULT_TTL = 300 // 5 minutes

// Retrieve cached data and convert JSON back into a JS value.

export const getCache = async <T>(key: string): Promise<T | null> => {
    try {
        const cachedData = await redis.get(key);
        if (cachedData === null) {
            return null;
        }

        return JSON.parse(cachedData) as T;

    } catch (error) {
        logger.warn({ err: error, key }, "Cache read failed")
        return null;
    }
}

// Convert a JS value into JSON and store it with an expiry
export const setCache = async (key: string, value: unknown, ttlSeconds: number = DEFAULT_TTL): Promise<void> => {
    try {
        if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
            throw new Error("Cache TTL must be a positive number")
        }

        const serializedData = JSON.stringify(value);

        if (serializedData === undefined) {
            throw new Error("Cache value could not be serialized")
        }

        await redis.set(key, serializedData, "EX", ttlSeconds);

    } catch (error) {
        logger.warn({ err: error, key }, "Cache write failed");

    }
}

// Delete one specific cache entry
export const deleteCache = async (key: string): Promise<void> => {
    try {
        await redis.del(key);
    } catch (error) {
        logger.warn({ err: error, key }, "Cache deletion failed")
    }
}

// Delete matching entries using SCAN instead of blocking Redis with KEYS.
export const deleteCacheByPattern = async (pattern: string): Promise<void> => {
    try {
        let cursor = "0";
        do {
            const [nextCursor, keys] = await redis.scan(
                cursor,
                "MATCH",
                pattern,
                "COUNT",
                100
            );

            cursor = nextCursor;

            if (keys.length > 0) {
                await redis.unlink(...keys);
            }
        } while (cursor !== "0");
    } catch (error) {
        logger.warn(
            { err: error, pattern },
            "Cache pattern deletion failed"
        );
    }
};