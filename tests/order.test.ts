import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import app from "../src/app";
import { prisma } from "../src/config/database";
import { hashPassword } from "../src/utils/password";

const password = "OrderTest@123";

describe("Order API Integration Tests", () => {
  let customerAgent: ReturnType<typeof request.agent>;
  let secondCustomerAgent: ReturnType<typeof request.agent>;
  let vendorAgent: ReturnType<typeof request.agent>;

  let customerId: number;
  let secondCustomerId: number;
  let vendorId: number;

  let productId: number;
  let orderId: number;

  const uniqueEmail = () =>
    `order-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;

  const createUser = async (role: "CUSTOMER" | "VENDOR") => {
    return prisma.user.create({
      data: {
        name: `Order ${role}`,
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

  const addProductToCart = async (
    agent: ReturnType<typeof request.agent>,
    quantity = 2,
  ) => {
    return agent.post("/api/cart/items").send({
      productId,
      quantity,
    });
  };

  const checkout = async (agent: ReturnType<typeof request.agent>) => {
    return agent.post("/api/orders/checkout").send({});
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

    const product = await prisma.product.create({
      data: {
        vendorId,
        name: "Order Test Product",
        slug: `order-test-${Date.now()}`,
        description: "Product used for order integration tests",
        priceInPaise: 10000,
        stock: 10,
        status: "ACTIVE",
      },
    });

    productId = product.id;
  });

  beforeEach(async () => {
    // Give every test a clean cart and predictable stock.
    await prisma.cartItem.deleteMany({
      where: {
        cart: {
          userId: {
            in: [customerId, secondCustomerId],
          },
        },
      },
    });

    await prisma.product.update({
      where: { id: productId },
      data: {
        stock: 10,
        status: "ACTIVE",
        priceInPaise: 10000,
      },
    });
  });

  afterAll(async () => {
    // OrderItem records reference vendors with onDelete: Restrict.
    // Deleting orders cascades their order items.
    await prisma.order.deleteMany({
      where: {
        userId: {
          in: [customerId, secondCustomerId],
        },
      },
    });

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
      where: { id: productId },
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

  describe("POST /api/orders/checkout", () => {
    it("should reject unauthenticated requests", async () => {
      const response = await request(app).post("/api/orders/checkout").send({});

      expect(response.status).toBe(401);
    });

    it("should reject vendor access", async () => {
      const response = await checkout(vendorAgent);

      expect(response.status).toBe(403);
    });

    it("should reject unexpected checkout fields", async () => {
      const response = await customerAgent
        .post("/api/orders/checkout")
        .send({ couponCode: "TEST" });

      expect(response.status).toBe(400);
    });

    it("should reject checkout when no cart exists", async () => {
      const response = await checkout(customerAgent);

      expect(response.status).toBe(404);
    });

    it("should reject checkout when the cart is empty", async () => {
      await prisma.cart.create({
        data: { userId: customerId },
      });

      const response = await checkout(customerAgent);

      expect(response.status).toBe(400);
    });

    it("should create an order and deduct product stock", async () => {
      await addProductToCart(customerAgent, 2);

      const response = await checkout(customerAgent);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Order placed successfully");

      expect(response.body.data).toMatchObject({
        userId: customerId,
        status: "PENDING",
        totalInPaise: 20000,
      });

      expect(response.body.data.items).toHaveLength(1);

      expect(response.body.data.items[0]).toMatchObject({
        productId,
        vendorId,
        productName: "Order Test Product",
        unitPriceInPaise: 10000,
        quantity: 2,
        lineTotalInPaise: 20000,
        status: "PENDING",
      });

      orderId = response.body.data.id;

      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      expect(product?.stock).toBe(8);
    });

    it("should clear the cart after successful checkout", async () => {
      await addProductToCart(customerAgent, 2);

      const response = await checkout(customerAgent);

      expect(response.status).toBe(201);

      const cart = await customerAgent.get("/api/cart");

      expect(cart.status).toBe(200);
      expect(cart.body.data.items).toHaveLength(0);
      expect(cart.body.data.itemCount).toBe(0);
      expect(cart.body.data.totalQuantity).toBe(0);
    });

    it("should reject checkout when product stock is insufficient", async () => {
      await addProductToCart(customerAgent, 5);

      // Simulate another customer/order consuming stock.
      await prisma.product.update({
        where: { id: productId },
        data: { stock: 2 },
      });

      const response = await checkout(customerAgent);

      expect(response.status).toBe(409);

      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      expect(product?.stock).toBe(2);

      // Failed checkout must not clear the cart.
      const cart = await customerAgent.get("/api/cart");

      expect(cart.body.data.items).toHaveLength(1);
      expect(cart.body.data.items[0].quantity).toBe(5);
    });

    it("should reject checkout when a product is no longer active", async () => {
      await addProductToCart(customerAgent, 1);

      await prisma.product.update({
        where: { id: productId },
        data: { status: "ARCHIVED" },
      });

      const response = await checkout(customerAgent);

      expect(response.status).toBe(409);

      const cart = await customerAgent.get("/api/cart");

      expect(cart.body.data.items).toHaveLength(1);
    });
  });

  describe("GET /api/orders", () => {
    it("should reject unauthenticated requests", async () => {
      const response = await request(app).get("/api/orders");

      expect(response.status).toBe(401);
    });

    it("should reject vendor access", async () => {
      const response = await vendorAgent.get("/api/orders");

      expect(response.status).toBe(403);
    });

    it("should return only the authenticated customer's orders", async () => {
      await addProductToCart(customerAgent, 2);

      const checkoutResponse = await checkout(customerAgent);

      expect(checkoutResponse.status).toBe(201);

      const response = await customerAgent.get("/api/orders");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: checkoutResponse.body.data.id,
            userId: customerId,
            totalInPaise: 20000,
            status: "PENDING",
          }),
        ]),
      );
    });

    it("should not expose another customer's orders", async () => {
      const response = await secondCustomerAgent.get("/api/orders");

      expect(response.status).toBe(200);
      expect(
        response.body.data.every(
          (order: { userId: number }) => order.userId === secondCustomerId,
        ),
      ).toBe(true);
    });
  });

  describe("GET /api/orders/:orderId", () => {
    beforeEach(async () => {
      await addProductToCart(customerAgent, 2);

      const response = await checkout(customerAgent);

      expect(response.status).toBe(201);

      orderId = response.body.data.id;
    });

    it("should return an order belonging to the customer", async () => {
      const response = await customerAgent.get(`/api/orders/${orderId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      expect(response.body.data).toMatchObject({
        id: orderId,
        userId: customerId,
        totalInPaise: 20000,
        status: "PENDING",
      });

      expect(response.body.data.items).toHaveLength(1);
    });

    it("should reject access to another customer's order", async () => {
      const response = await secondCustomerAgent.get(`/api/orders/${orderId}`);

      expect(response.status).toBe(404);
    });

    it("should reject nonexistent orders", async () => {
      const response = await customerAgent.get("/api/orders/999999999");

      expect(response.status).toBe(404);
    });

    it("should reject invalid order IDs", async () => {
      const response = await customerAgent.get("/api/orders/invalid");

      expect(response.status).toBe(400);
    });

    it("should reject unauthenticated requests", async () => {
      const response = await request(app).get(`/api/orders/${orderId}`);

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/orders/:orderId/cancel", () => {
    beforeEach(async () => {
      await addProductToCart(customerAgent, 2);

      const response = await checkout(customerAgent);

      expect(response.status).toBe(201);

      orderId = response.body.data.id;
    });

    it("should cancel a pending order", async () => {
      const response = await customerAgent.post(
        `/api/orders/${orderId}/cancel`,
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Order cancelled successfully");

      expect(response.body.data.status).toBe("CANCELLED");

      expect(response.body.data.items[0].status).toBe("CANCELLED");
    });

    it("should restore product stock after cancellation", async () => {
      const productBefore = await prisma.product.findUnique({
        where: { id: productId },
      });

      expect(productBefore?.stock).toBe(8);

      const response = await customerAgent.post(
        `/api/orders/${orderId}/cancel`,
      );

      expect(response.status).toBe(200);

      const productAfter = await prisma.product.findUnique({
        where: { id: productId },
      });

      expect(productAfter?.stock).toBe(10);
    });

    it("should reject cancelling an already cancelled order", async () => {
      const firstResponse = await customerAgent.post(
        `/api/orders/${orderId}/cancel`,
      );

      expect(firstResponse.status).toBe(200);

      const secondResponse = await customerAgent.post(
        `/api/orders/${orderId}/cancel`,
      );

      expect(secondResponse.status).toBe(409);
    });

    it("should reject cancellation by another customer", async () => {
      const response = await secondCustomerAgent.post(
        `/api/orders/${orderId}/cancel`,
      );

      expect(response.status).toBe(404);
    });

    it("should reject cancellation of a nonexistent order", async () => {
      const response = await customerAgent.post("/api/orders/999999999/cancel");

      expect(response.status).toBe(404);
    });

    it("should reject invalid order IDs", async () => {
      const response = await customerAgent.post("/api/orders/invalid/cancel");

      expect(response.status).toBe(400);
    });

    it("should reject unauthenticated requests", async () => {
      const response = await request(app).post(`/api/orders/${orderId}/cancel`);

      expect(response.status).toBe(401);
    });
  });
});
