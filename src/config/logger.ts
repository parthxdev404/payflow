import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",

  base: {
    service: "payflow-api",
  },

  redact: {
    paths: [
      "password",
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
    ],
    remove: true,
  },
});
