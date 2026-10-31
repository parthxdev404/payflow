
import Redis from "ioredis";
import { logger } from "./logger";
import { env } from "./env";

export const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,

    retryStrategy(times: number) {
        if (times > 5) return null;

        return Math.min(times * 500, 5000);
    },
});

// Redis connection events
redis.on("connect", () => {
    logger.info("Redis connected");
});

redis.on("ready", () => {
    logger.info("Redis ready");
});

redis.on("error", (error) => {
    logger.error({ err: error }, "Redis error");
});

redis.on("close", () => {
    logger.warn("Redis connection closed");
});

redis.on("reconnecting", () => {
    logger.warn("Redis reconnecting...");
});

// Establish Redis connection
export async function connectRedis(): Promise<void> {
    try {
        // Avoid connecting an already-connected client.
        if (redis.status === "ready") {
            return;
        }

        // Establish the connection when lazyConnect is enabled.
        if (redis.status === "wait") {
            await redis.connect();
        } else {
            // Wait for an existing connection attempt to finish.
            await new Promise<void>((resolve, reject) => {
                const onReady = () => {
                    cleanup();
                    resolve();
                };

                const onError = (error: Error) => {
                    cleanup();
                    reject(error);
                };

                const cleanup = () => {
                    redis.off("ready", onReady);
                    redis.off("error", onError);
                };

                redis.once("ready", onReady);
                redis.once("error", onError);
            });
        }

        logger.info("Redis connection established");
    } catch (error) {
        logger.fatal({ err: error }, "Unable to connect to Redis");

        // Let the caller decide how to handle the failure.
        throw error;
    }
}

// Close Redis connection safely
export async function disconnectRedis(): Promise<void> {
    try {
        if (redis.status === "end") {
            return;
        }

        if (redis.status === "wait" || redis.status === "close") {
            redis.disconnect();
            return;
        }

        await redis.quit();

        logger.info("Redis disconnected");
    } catch (error) {
        logger.error({ err: error }, "Error disconnecting Redis");
        redis.disconnect();
    }
}
