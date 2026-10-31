import "dotenv/config";
import { z } from "zod";

const port = Number(process.env.PORT ?? 3000);
const jwtAccessSecret = process.env.JWT_ACCESS_SECRET;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("REDIS_URL is required");
}

if (!razorpayWebhookSecret) {
  throw new Error("Razorpay webhook secret must be configured");
}

if (!jwtAccessSecret || jwtAccessSecret.length < 32) {
  throw new Error("JWT secret must be set to a sufficiently long secret");
}

if (!razorpayKeyId || !razorpayKeySecret) {
  throw new Error("Razorpay test API credentials must be configured");
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid port number");
}

export const env = {
  PORT: port,
  NODE_ENV: process.env.NODE_ENV ?? "development",
  LOG_LEVEL: process.env.LOG_LEVEL,
  JWT_ACCESS_SECRET: jwtAccessSecret,
  JWT_ACCESS_EXPIRESIN: process.env.JWT_ACCESS_EXPIRESIN ?? "15m",
  RAZORPAY_KEY_ID: razorpayKeyId,
  RAZORPAY_KEY_SECRET: razorpayKeySecret,
  RAZORPAY_WEBHOOK_SECRET: razorpayWebhookSecret,
  FRONTEND_URL: process.env.FRONTEND_URL,
  REDIS_URL: redisUrl
} as const;
