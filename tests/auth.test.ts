import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../src/app";
import { prisma } from "../src/config/database";

const email = `payflow-auth-test-${process.pid}@example.com`;
const password = "StrongTestPassword123";
const name = "PayFlow Test User";

const agent = request.agent(app);

describe("Auth API integration tests", () => {
  beforeAll(async () => {
    // Remove leftover test data if a previous test run was interrupted.
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      await prisma.refreshToken.deleteMany({
        where: { userId: existingUser.id },
      });

      await prisma.user.delete({
        where: { id: existingUser.id },
      });
    }
  });

  afterAll(async () => {
    // Remove refresh-token records before deleting the test user.
    const testUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (testUser) {
      await prisma.refreshToken.deleteMany({
        where: { userId: testUser.id },
      });

      await prisma.user.delete({
        where: { id: testUser.id },
      });
    }
  });

  it("should reject registration with invalid input", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "P",
      email: "invalid-email",
      password: "123",
    });

    expect(response.status).toBe(400);
  });

  it("should register a new customer", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name,
      email,
      password,
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      name,
      email,
      role: "CUSTOMER",
      status: "ACTIVE",
    });

    // The password hash must never be returned to the client.
    expect(response.body.data).not.toHaveProperty("passwordHash");
  });

  it("should reject registration with an already registered email", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name,
      email,
      password,
    });

    expect(response.status).toBe(409);
  });

  it("should reject login with an incorrect password", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email,
      password: "WrongPassword123",
    });

    expect(response.status).toBe(401);
  });

  it("should reject access to protected routes without authentication", async () => {
    const meResponse = await request(app).get("/api/auth/me");

    expect(meResponse.status).toBe(401);

    const roleResponse = await request(app).get("/api/auth/admin-check");

    expect(roleResponse.status).toBe(401);
  });

  it("should reject refresh when the refresh cookie is missing", async () => {
    const response = await request(app).post("/api/auth/refresh");

    expect(response.status).toBe(401);
  });

  it("should complete the login, profile, role, refresh and logout lifecycle", async () => {
    // 1. Login.
    const loginResponse = await agent.post("/api/auth/login").send({
      email,
      password,
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.success).toBe(true);
    expect(loginResponse.body.data.user).toMatchObject({
      email,
      role: "CUSTOMER",
      status: "ACTIVE",
    });

    expect(loginResponse.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("payflow_access="),
        expect.stringContaining("payflow_refresh="),
      ]),
    );

    // 2. Access the authenticated user's profile.
    const meResponse = await agent.get("/api/auth/me");

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.success).toBe(true);
    expect(meResponse.body.data.user.email).toBe(email);

    // 3. Verify the role middleware.
    // The current route allows CUSTOMER, not ADMIN.
    const roleResponse = await agent.get("/api/auth/admin-check");

    expect(roleResponse.status).toBe(200);
    expect(roleResponse.body.success).toBe(true);

    // 4. Rotate the refresh session.
    const refreshResponse = await agent.post("/api/auth/refresh");

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.success).toBe(true);
    expect(refreshResponse.body.message).toBe("Session refreshed successfully");

    expect(refreshResponse.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("payflow_access="),
        expect.stringContaining("payflow_refresh="),
      ]),
    );

    // 5. Verify the new access cookie works.
    const refreshedMeResponse = await agent.get("/api/auth/me");

    expect(refreshedMeResponse.status).toBe(200);
    expect(refreshedMeResponse.body.data.user.email).toBe(email);

    // 6. Logout and revoke the refresh-token family.
    const logoutResponse = await agent.post("/api/auth/logout");

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body.success).toBe(true);

    // 7. The cleared access cookie should no longer authenticate.
    const afterLogoutResponse = await agent.get("/api/auth/me");

    expect(afterLogoutResponse.status).toBe(401);

    // 8. The revoked refresh session cannot be used again.
    const afterLogoutRefreshResponse = await agent.post("/api/auth/refresh");

    expect(afterLogoutRefreshResponse.status).toBe(401);
  });
});
