import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { errorMiddleware } from "./middlewares/error.middleware";
import { apiRateLimiter } from "./middlewares/rateLimiter";
import { logger } from "./config/logger";
import { prisma } from "./config/database";

import authRouter from "./modules/auth/auth.routes";
import productRouter from "./modules/products/product.routes";
import cartRouter from "./modules/cart/cart.routes";
import orderRouter from "./modules/orders/order.routes";
import paymentRouter from "./modules/payments/payment.route";
import vendorRouter from "./modules/vendors/vendor.route";
import adminRouter from "./modules/admin/admin.routes";
import cors from "cors";
import { env } from "./config/env";
import { setupSwagger } from "./config/swagger";

const app = express();
setupSwagger(app);

app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(pinoHttp({ logger }));

app.get("/health/live", (_req, res) => {
  res.status(200).json({
    status: "ok",
  });
});

app.get("/health/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: "ready",
      checks: {
        database: "ok",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Readiness check failed");

    res.status(503).json({
      status: "not_ready",
      checks: {
        database: "unavailable",
      },
    });
  }
});

app.use("/api", apiRateLimiter);
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Register API routes.
app.use("/api/auth", authRouter);
app.use("/api/products", productRouter);
app.use("/api/cart", cartRouter);
app.use("/api/orders", orderRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/vendors", vendorRouter);
app.use("/api/admin", adminRouter);

app.use(express.static("public"));
app.use(errorMiddleware);

export default app;
