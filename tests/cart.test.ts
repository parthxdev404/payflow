import request from "supertest";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";

import app from "../src/app";
import { prisma } from "../src/config/database";
import { hashPassword } from "../src/utils/password";

const password = "CartTest@123";

describe("Cart API Integration Tests", () => {
  let customerAgent: ReturnType<typeof request.agent>;
  let secondCustomerAgent: ReturnType<typeof request.agent>;
  let vendorAgent: ReturnType<typeof request.agent>;

  let customerId: number;
  let secondCustomerId: number;
  let vendorId: number;

  let productId: number;
  let draftProductId: number;
  let archivedProductId: number;

  let cartItemId: number;

  const uniqueEmail = () =>
    `cart-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;

  const createUser = async (role: "CUSTOMER" | "VENDOR") => {
    return prisma.user.create({
      data: {
        name: `Cart ${role}`,
        email: uniqueEmail(),
        passwordHash: await hashPassword(password),
        role,
        status: "ACTIVE",
      },
    });
  };

  const login = async (email: string) => {
    const agent = request.agent(app);

    const response = await agent.post("/api/auth/login").send({
      email,
      password,
    });

    expect(response.status).toBe(200);
    return agent;
  };

  beforeAll(async () => {
    const customer = await createUser("CUSTOMER");
    const secondCustomer = await createUser("CUSTOMER");
    const vendor = await createUser("VENDOR");

    customerId = customer.id;
    secondCustomerId = secondCustomer.id;
    vendorId = vendor.id;

    customerAgent = await login(customer.email);
    secondCustomerAgent = await login(secondCustomer.email);
    vendorAgent = await login(vendor.email);

    const activeProduct = await prisma.product.create({
      data: {
        vendorId,
        name: "Cart Test Product",
        slug: `cart-test-${Date.now()}`,
        description: "Product used for cart integration tests",
        priceInPaise: 10000,
        stock: 10,
        status: "ACTIVE",
      },
    });

    const draftProduct = await prisma.product.create({
      data: {
        vendorId,
        name: "Cart Draft Product",
        slug: `cart-draft-${Date.now()}`,
        priceInPaise: 5000,
        stock: 10,
        status: "DRAFT",
      },
    });

    const archivedProduct = await prisma.product.create({
      data: {
        vendorId,
        name: "Cart Archived Product",
        slug: `cart-archived-${Date.now()}`,
        priceInPaise: 5000,
        stock: 10,
        status: "ARCHIVED",
      },
    });

    productId = activeProduct.id;
    draftProductId = draftProduct.id;
    archivedProductId = archivedProduct.id;
  });

  beforeEach(async () => {
    await prisma.cartItem.deleteMany({
      where: {
        cart: {
          userId: {
            in: [customerId, secondCustomerId],
          },
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.cartItem.deleteMany({
      where: {
        cart: {
          userId: {
            in: [customerId, secondCustomerId],
          },
        },
      },
    });

    await prisma.cart.deleteMany({
      where: {
        userId: {
          in: [customerId, secondCustomerId],
        },
      },
    });

    await prisma.product.deleteMany({
      where: {
        id: {
          in: [productId, draftProductId, archivedProductId],
        },
      },
    });

    await prisma.refreshToken.deleteMany({
      where: {
        userId: {
          in: [customerId, secondCustomerId, vendorId],
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [customerId, secondCustomerId, vendorId],
        },
      },
    });

    await prisma.$disconnect();
  });

  describe("GET /api/cart", () => {
    it("should reject unauthenticated requests", async () => {
      const response = await request(app).get("/api/cart");

      expect(response.status).toBe(401);
    });

    it("should reject vendor access", async () => {
      const response = await vendorAgent.get("/api/cart");

      expect(response.status).toBe(403);
    });

    it("should create and return an empty cart", async () => {
      const response = await customerAgent.get("/api/cart");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBe(customerId);
      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.itemCount).toBe(0);
      expect(response.body.data.totalQuantity).toBe(0);
      expect(response.body.data.subtotalInPaise).toBe(0);
      expect(response.body.data.currency).toBe("INR");
    });

    it("should return cart items with correct totals", async () => {
      await customerAgent.post("/api/cart/items").send({
        productId,
        quantity: 2,
      });

      const response = await customerAgent.get("/api/cart");

      expect(response.status).toBe(200);
      expect(response.body.data.itemCount).toBe(1);
      expect(response.body.data.totalQuantity).toBe(2);
      expect(response.body.data.subtotalInPaise).toBe(20000);

      expect(response.body.data.items[0]).toMatchObject({
        productId,
        name: "Cart Test Product",
        priceInPaise: 10000,
        quantity: 2,
        availableStock: 10,
        status: "ACTIVE",
        isAvailable: true,
        itemTotalInPaise: 20000,
      });
    });
  });

  describe("POST /api/cart/items", () => {
    it("should reject unauthenticated requests", async () => {
      const response = await request(app)
        .post("/api/cart/items")
        .send({ productId, quantity: 1 });

      expect(response.status).toBe(401);
    });

    it("should reject vendor access", async () => {
      const response = await vendorAgent
        .post("/api/cart/items")
        .send({ productId, quantity: 1 });

      expect(response.status).toBe(403);
    });

    it("should add an active product to the cart", async () => {
      const response = await customerAgent.post("/api/cart/items").send({
        productId,
        quantity: 2,
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        productId,
        quantity: 2,
        product: {
          name: "Cart Test Product",
          priceInPaise: 10000,
          stock: 10,
          status: "ACTIVE",
        },
      });
    });

    it("should increase quantity when the same product is added again", async () => {
      const first = await customerAgent.post("/api/cart/items").send({
        productId,
        quantity: 2,
      });

      const second = await customerAgent.post("/api/cart/items").send({
        productId,
        quantity: 3,
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(second.body.data.quantity).toBe(5);
    });

    it("should reject a nonexistent product", async () => {
      const response = await customerAgent.post("/api/cart/items").send({
        productId: 999999999,
        quantity: 1,
      });

      expect(response.status).toBe(404);
    });

    it("should reject draft products", async () => {
      const response = await customerAgent.post("/api/cart/items").send({
        productId: draftProductId,
        quantity: 1,
      });

      expect(response.status).toBe(404);
    });

    it("should reject archived products", async () => {
      const response = await customerAgent.post("/api/cart/items").send({
        productId: archivedProductId,
        quantity: 1,
      });

      expect(response.status).toBe(404);
    });

    it("should reject quantities exceeding available stock", async () => {
      const response = await customerAgent.post("/api/cart/items").send({
        productId,
        quantity: 11,
      });

      expect(response.status).toBe(409);
    });

    it("should reject when adding a quantity that makes the total exceed stock", async () => {
      await customerAgent.post("/api/cart/items").send({
        productId,
        quantity: 7,
      });

      const response = await customerAgent.post("/api/cart/items").send({
        productId,
        quantity: 4,
      });

      expect(response.status).toBe(409);

      const cart = await customerAgent.get("/api/cart");

      expect(cart.body.data.items[0].quantity).toBe(7);
    });

    it("should reject invalid quantities", async () => {
      const invalidQuantities = [0, -1, 1.5, 101];

      for (const quantity of invalidQuantities) {
        const response = await customerAgent.post("/api/cart/items").send({
          productId,
          quantity,
        });

        expect(response.status).toBe(400);
      }
    });

    it("should reject invalid product IDs", async () => {
      const response = await customerAgent.post("/api/cart/items").send({
        productId: -1,
        quantity: 1,
      });

      expect(response.status).toBe(400);
    });
  });

  describe("PATCH /api/cart/items/:itemId", () => {
    beforeEach(async () => {
      const response = await customerAgent.post("/api/cart/items").send({
        productId,
        quantity: 2,
      });

      cartItemId = response.body.data.id;
    });

    it("should update cart item quantity", async () => {
      const response = await customerAgent
        .patch(`/api/cart/items/${cartItemId}`)
        .send({ quantity: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data.quantity).toBe(5);
    });

    it("should reject quantities exceeding available stock", async () => {
      const response = await customerAgent
        .patch(`/api/cart/items/${cartItemId}`)
        .send({ quantity: 11 });

      expect(response.status).toBe(409);
    });

    it("should reject invalid quantities", async () => {
      const response = await customerAgent
        .patch(`/api/cart/items/${cartItemId}`)
        .send({ quantity: 0 });

      expect(response.status).toBe(400);
    });

    it("should reject an item that does not belong to the customer", async () => {
      const response = await secondCustomerAgent
        .patch(`/api/cart/items/${cartItemId}`)
        .send({ quantity: 3 });

      expect(response.status).toBe(404);
    });

    it("should reject nonexistent cart items", async () => {
      const response = await customerAgent
        .patch("/api/cart/items/999999999")
        .send({ quantity: 2 });

      expect(response.status).toBe(404);
    });

    it("should reject unauthenticated requests", async () => {
      const response = await request(app)
        .patch(`/api/cart/items/${cartItemId}`)
        .send({ quantity: 3 });

      expect(response.status).toBe(401);
    });
  });

  describe("DELETE /api/cart/items/:itemId", () => {
    beforeEach(async () => {
      const response = await customerAgent.post("/api/cart/items").send({
        productId,
        quantity: 2,
      });

      cartItemId = response.body.data.id;
    });

    it("should remove an item from the cart", async () => {
      const response = await customerAgent.delete(
        `/api/cart/items/${cartItemId}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Cart item removed successfully");

      const cart = await customerAgent.get("/api/cart");

      expect(cart.body.data.items).toHaveLength(0);
      expect(cart.body.data.itemCount).toBe(0);
    });

    it("should reject removing another customer's item", async () => {
      const response = await secondCustomerAgent.delete(
        `/api/cart/items/${cartItemId}`,
      );

      expect(response.status).toBe(404);
    });

    it("should reject nonexistent cart items", async () => {
      const response = await customerAgent.delete("/api/cart/items/999999999");

      expect(response.status).toBe(404);
    });

    it("should reject invalid item IDs", async () => {
      const response = await customerAgent.delete("/api/cart/items/invalid");

      expect(response.status).toBe(400);
    });

    it("should reject unauthenticated requests", async () => {
      const response = await request(app).delete(
        `/api/cart/items/${cartItemId}`,
      );

      expect(response.status).toBe(401);
    });
  });

  it("should keep each customer's cart separate", async () => {
    await customerAgent.post("/api/cart/items").send({
      productId,
      quantity: 2,
    });

    const firstCart = await customerAgent.get("/api/cart");
    const secondCart = await secondCustomerAgent.get("/api/cart");

    expect(firstCart.body.data.items).toHaveLength(1);
    expect(secondCart.body.data.items).toHaveLength(0);
    expect(firstCart.body.data.userId).not.toBe(secondCart.body.data.userId);
  });
});
