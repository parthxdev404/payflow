import type { Server } from "node:http";

import app from "./app";
import { env } from "./config/env";
import { prisma } from "./config/database";
import { logger } from "./config/logger";

let server: Server | undefined;
let shuttingDown = false;

const startServer = async () => {
  try {
    await prisma.$connect();
    logger.info("Database Connected Successfully");

    server = app.listen(env.PORT, () => {
      logger.info(
        {
          port: env.PORT,
        },
        "Payflow Server Started",
      );
    });

    server.on("error", (error) => {
      logger.fatal({ err: error }, "HTTP Server Error");
      process.exitCode = 1;
      shutdown("SERVER_ERROR");
    });
  } catch (error) {
    logger.fatal({ err: error }, "Server Startup Failed");

    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      logger.error(
        { err: disconnectError },
        "Database cleanup after startup failure failed",
      );
    }

    process.exitCode = 1;
  }
};

const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "Graceful shutdown started");

  if (!server) {
    void prisma.$disconnect().catch((error) => {
      logger.error({ err: error }, "Database disconnect failed");
      process.exitCode = 1;
    });
    return;
  }

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "HTTP server close failed");
      process.exitCode = 1;
    }

    void prisma
      .$disconnect()
      .then(() => {
        logger.info("Database disconnected successfully");
        logger.info("Graceful shutdown completed");
      })
      .catch((disconnectError) => {
        logger.error({ err: disconnectError }, "Database disconnect failed");
        process.exitCode = 1;
      });
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer();
