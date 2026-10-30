import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app";

describe("Health endpoints", () => {
  it("GET /health/live should return 200 and an OK status", async () => {
    const response = await request(app).get("/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("GET /health/ready should confirm database connectivity", async () => {
    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ready",
      checks: {
        database: "ok",
      },
    });
  });
});
