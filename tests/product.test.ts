
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../src/app";
import { prisma } from "../src/config/database";
import {
  redis,
  connectRedis,
  disconnectRedis,
} from "../src/config/redis";
import { hashPassword } from "../src/utils/password";

const uniqueId = `${process.pid}-${Date.now()}`;
const password = "StrongTestPassword123";

const vendorAEmail = `products-vendor-a-${uniqueId}@example.com`;
const vendorBEmail = `products-vendor-b-${uniqueId}@example.com`;
const customerEmail = `products-customer-${uniqueId}@example.com`;

const vendorAAgent = request.agent(app);
const vendorBAgent = request.agent(app);
const customerAgent = request.agent(app);

let vendorAId: number;
let vendorBId: number;
let customerId: number;

let productAId: number;
let productBId: number;

describe("Products API integration tests", () => {
  beforeAll(async () => {
    // Establish Redis connection before tests use the cache.
    await connectRedis();

    const passwordHash = await hashPassword(password);

    const [vendorA, vendorB, customer] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Products Vendor A",
          email: vendorAEmail,
          passwordHash,
          role: "VENDOR",
          status: "ACTIVE",
        },
      }),
      prisma.user.create({
        data: {
          name: "Products Vendor B",
          email: vendorBEmail,
          passwordHash,
          role: "VENDOR",
          status: "ACTIVE",
        },
      }),
      prisma.user.create({
        data: {
          name: "Products Customer",
          email: customerEmail,
          passwordHash,
          role: "CUSTOMER",
          status: "ACTIVE",
        },
      }),
    ]);

    vendorAId = vendorA.id;
    vendorBId = vendorB.id;
    customerId = customer.id;

    const [vendorALogin, vendorBLogin, customerLogin] = await Promise.all([
      vendorAAgent.post("/api/auth/login").send({
        email: vendorAEmail,
        password,
      }),
      vendorBAgent.post("/api/auth/login").send({
        email: vendorBEmail,
        password,
      }),
      customerAgent.post("/api/auth/login").send({
        email: customerEmail,
        password,
      }),
    ]);

    expect(vendorALogin.status).toBe(200);
    expect(vendorBLogin.status).toBe(200);
    expect(customerLogin.status).toBe(200);
  });

  afterAll(async () => {
    try {
      // Remove cached products created by this test suite.
      const cacheKeys = [productAId, productBId]
        .filter((id): id is number => Boolean(id))
        .map((id) => `product:${id}`);

      if (cacheKeys.length > 0) {
        await redis.del(...cacheKeys);
      }

      // Delete products belonging to the test vendors.
      const vendorIds = [vendorAId, vendorBId].filter(
        (id): id is number => Boolean(id),
      );

      if (vendorIds.length > 0) {
        await prisma.product.deleteMany({
          where: {
            vendorId: { in: vendorIds },
          },
        });
      }

      // Delete refresh tokens and test users.
      const userIds = [vendorAId, vendorBId, customerId].filter(
        (id): id is number => Boolean(id),
      );

      if (userIds.length > 0) {
        await prisma.refreshToken.deleteMany({
          where: {
            userId: { in: userIds },
          },
        });

        await prisma.user.deleteMany({
          where: {
            id: { in: userIds },
          },
        });
      }
    } finally {
      // Always close Redis, even if database cleanup fails.
      await disconnectRedis();
    }
  });

  // Authentication and authorization

  it("should reject product creation without authentication", async () => {
    const response = await request(app).post("/api/products").send({
      name: "Unauthorized Product",
      slug: "unauthorized-product",
      priceInPaise: 10000,
      stock: 10,
    });

    expect(response.status).toBe(401);
  });

  it("should prevent customers from creating products", async () => {
    const response = await customerAgent.post("/api/products").send({
      name: "Customer Product",
      slug: "customer-product",
      priceInPaise: 10000,
      stock: 10,
    });

    expect(response.status).toBe(403);
  });

  // Product creation

  it("should allow a vendor to create a product", async () => {
    const response = await vendorAAgent.post("/api/products").send({
      name: "Test Laptop",
      slug: "test-laptop",
      description: "Integration testing laptop",
      priceInPaise: 5000000,
      stock: 20,
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      vendorId: vendorAId,
      name: "Test Laptop",
      slug: "test-laptop",
      priceInPaise: 5000000,
      stock: 20,
      status: "DRAFT",
    });

    productAId = response.body.data.id;
  });

  it("should reject a duplicate slug for the same vendor", async () => {
    const response = await vendorAAgent.post("/api/products").send({
      name: "Another Laptop",
      slug: "test-laptop",
      priceInPaise: 4000000,
      stock: 10,
    });

    expect(response.status).toBe(409);
  });

  it("should allow different vendors to use the same slug", async () => {
    const response = await vendorBAgent.post("/api/products").send({
      name: "Vendor B Laptop",
      slug: "test-laptop",
      priceInPaise: 4500000,
      stock: 15,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.vendorId).toBe(vendorBId);

    productBId = response.body.data.id;
  });

  it("should reject product creation with invalid input", async () => {
    const response = await vendorAAgent.post("/api/products").send({
      name: "A",
      slug: "INVALID SLUG",
      priceInPaise: -100,
      stock: -5,
    });

    expect(response.status).toBe(400);
  });

  // Public product listing

  it("should not expose draft products in the public listing", async () => {
    const response = await request(app).get("/api/products");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeInstanceOf(Array);

    const productIds = response.body.data.map(
      (product: { id: number }) => product.id,
    );

    expect(productIds).not.toContain(productAId);
    expect(productIds).not.toContain(productBId);
  });

  // Product activation

  it("should allow a vendor to activate their own draft product", async () => {
    const response = await vendorAAgent.patch(
      `/api/products/${productAId}/activate`,
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("ACTIVE");
  });

  it("should allow another vendor to activate their own product", async () => {
    const response = await vendorBAgent.patch(
      `/api/products/${productBId}/activate`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ACTIVE");
  });

  // Product retrieval and search

  it("should return an active product by ID", async () => {
    const response = await request(app).get(
      `/api/products/${productAId}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(productAId);
    expect(response.body.data.status).toBe("ACTIVE");
  });

  // Redis caching

  it("should cache an active product and reuse the cached data", async () => {
    const cacheKey = `product:${productAId}`;

    // Start with an empty cache.
    await redis.del(cacheKey);

    // First request: fetch from PostgreSQL and populate Redis.
    const firstResponse = await request(app).get(
      `/api/products/${productAId}`,
    );

    expect(firstResponse.status).toBe(200);

    const cachedProduct = await redis.get(cacheKey);

    expect(cachedProduct).not.toBeNull();

    if (!cachedProduct) {
      throw new Error("Product was not stored in Redis.");
    }

    expect(JSON.parse(cachedProduct)).toMatchObject({
      id: productAId,
      name: "Test Laptop",
      status: "ACTIVE",
    });

    // Second request: should still return the cached product.
    const secondResponse = await request(app).get(
      `/api/products/${productAId}`,
    );

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.data).toEqual(firstResponse.body.data);
  });

  it("should return 404 for a product that does not exist", async () => {
    const response = await request(app).get("/api/products/999999999");

    expect(response.status).toBe(404);
  });

  it("should return active products matching the search term", async () => {
    const response = await request(app)
      .get("/api/products")
      .query({ search: "Laptop" });

    expect(response.status).toBe(200);

    const productIds = response.body.data.map(
      (product: { id: number }) => product.id,
    );

    expect(productIds).toContain(productAId);
    expect(productIds).toContain(productBId);
  });

  // Pagination

  it("should return correct pagination information", async () => {
    const firstPage = await request(app)
      .get("/api/products")
      .query({ page: 1, limit: 1 });

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data).toHaveLength(1);

    expect(firstPage.body.pagination).toMatchObject({
      page: 1,
      limit: 1,
      total: expect.any(Number),
      totalPages: expect.any(Number),
      hasPreviousPage: false,
      hasNextPage: true,
    });

    const secondPage = await request(app)
      .get("/api/products")
      .query({ page: 2, limit: 1 });

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data).toHaveLength(1);
    expect(secondPage.body.pagination.hasPreviousPage).toBe(true);
  });

  it("should reject invalid product IDs", async () => {
    const response = await request(app).get(
      "/api/products/invalid-id",
    );

    expect(response.status).toBe(400);
  });

  // Product updates and ownership

  it("should allow a vendor to update their own product", async () => {
    const cacheKey = `product:${productAId}`;

    // Ensure the product is cached before updating it.
    const cachedResponse = await request(app).get(
      `/api/products/${productAId}`,
    );

    expect(cachedResponse.status).toBe(200);
    expect(await redis.get(cacheKey)).not.toBeNull();

    const response = await vendorAAgent
      .patch(`/api/products/${productAId}`)
      .send({
        name: "Updated Test Laptop",
        priceInPaise: 5500000,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      id: productAId,
      name: "Updated Test Laptop",
      priceInPaise: 5500000,
    });

    // Updating the product must invalidate its old cache.
    expect(await redis.get(cacheKey)).toBeNull();
  });

  it("should prevent a vendor from updating another vendor's product", async () => {
    const response = await vendorBAgent
      .patch(`/api/products/${productAId}`)
      .send({
        name: "Unauthorized Update",
      });

    expect(response.status).toBe(403);
  });

  it("should reject an empty product update", async () => {
    const response = await vendorAAgent
      .patch(`/api/products/${productAId}`)
      .send({});

    expect(response.status).toBe(400);
  });

  // Product archive lifecycle

  it("should allow a vendor to archive their own product", async () => {
    const response = await vendorAAgent.patch(
      `/api/products/${productAId}/archive`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ARCHIVED");
  });

  it("should hide archived products from public retrieval", async () => {
    const response = await request(app).get(
      `/api/products/${productAId}`,
    );

    expect(response.status).toBe(404);
  });

  it("should reject activation of an archived product", async () => {
    const response = await vendorAAgent.patch(
      `/api/products/${productAId}/activate`,
    );

    expect(response.status).toBe(409);
  });

  it("should reject archiving an already archived product", async () => {
    const response = await vendorAAgent.patch(
      `/api/products/${productAId}/archive`,
    );

    expect(response.status).toBe(409);
  });
});
