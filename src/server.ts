
import type { Server } from "node:http";

import app from "./app";
import { env } from "./config/env";
import { prisma } from "./config/database";
import { logger } from "./config/logger";
import { connectRedis, disconnectRedis } from "./config/redis";

let server: Server | undefined;
let shuttingDown = false;
let cleanupPromise: Promise<void> | undefined;

const cleanupDependencies = (): Promise<void> => {
  if (cleanupPromise) return cleanupPromise;

  cleanupPromise = (async () => {
    const results = await Promise.allSettled([
      disconnectRedis(),
      prisma.$disconnect(),
    ]);

    const [redisResult, databaseResult] = results;

    if (redisResult.status === "fulfilled") {
      logger.info("Redis disconnected successfully");
    } else {
      logger.error(
        { err: redisResult.reason },
        "Redis disconnect failed",
      );
      process.exitCode = 1;
    }

    if (databaseResult.status === "fulfilled") {
      logger.info("Database disconnected successfully");
    } else {
      logger.error(
        { err: databaseResult.reason },
        "Database disconnect failed",
      );
      process.exitCode = 1;
    }

    logger.info("Graceful shutdown completed");
  })();

  return cleanupPromise;
};

const startServer = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info("Database Connected Successfully");

    try {
      await connectRedis();
      logger.info("Redis Connected Successfully");
    } catch (error) {
      logger.warn(
        { err: error },
        "Redis unavailable. Continuing without cache.",
      );
    }

    if (shuttingDown) {
      await cleanupDependencies();
      return;
    }

    server = app.listen(env.PORT, () => {
      logger.info(
        { port: env.PORT },
        "Payflow Server Started",
      );
    });

    server.on("error", (error) => {
      logger.fatal({ err: error }, "HTTP Server Error");
      process.exitCode = 1;
      void shutdown("SERVER_ERROR");
    });
  } catch (error) {
    logger.fatal({ err: error }, "Server Startup Failed");
    process.exitCode = 1;
    await cleanupDependencies();
  }
};

const shutdown = (signal: string): Promise<void> => {
  if (shuttingDown) {
    return cleanupDependencies();
  }

  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");

  if (!server?.listening) {
    return cleanupDependencies();
  }

  return new Promise<void>((resolve) => {
    server!.close((error) => {
      if (error) {
        logger.error(
          { err: error },
          "HTTP server close failed",
        );
        process.exitCode = 1;
      }

      void cleanupDependencies().finally(resolve);
    });
  });
};

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

void startServer();
