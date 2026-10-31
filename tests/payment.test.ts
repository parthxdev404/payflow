
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import request from "supertest";

const razorpayMocks = vi.hoisted(() => ({
  createOrder: vi.fn(),
  fetchPayments: vi.fn(),
  fetchPayment: vi.fn(),
}));

vi.mock("../src/config/razorpay", () => ({
  razorpay: {
    orders: {
      create: razorpayMocks.createOrder,
      fetchPayments: razorpayMocks.fetchPayments,
    },
    payments: {
      fetch: razorpayMocks.fetchPayment,
    },
  },
}));

import app from "../src/app";
import { prisma } from "../src/config/database";
import { env } from "../src/config/env";
import { hashPassword } from "../src/utils/password";

describe("Payment integration tests", () => {
  const testSuffix = `${Date.now()}`;

  const customerEmail = `payment-customer-${testSuffix}@test.com`;
  const secondCustomerEmail = `payment-customer-2-${testSuffix}@test.com`;
  const vendorEmail = `payment-vendor-${testSuffix}@test.com`;

  const password = "TestPassword123";

  let customerId: number;
  let secondCustomerId: number;
  let vendorId: number;

  let customerAgent: ReturnType<typeof request.agent>;
  let secondCustomerAgent: ReturnType<typeof request.agent>;
  let vendorAgent: ReturnType<typeof request.agent>;

  let orderId: number;
  let paymentId: number;
  let razorpayOrderId: string;

  const amountInPaise = 15000;

  function generateSignature(
    providerOrderId: string,
    providerPaymentId: string,
  ) {
    return createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(`${providerOrderId}|${providerPaymentId}`)
      .digest("hex");
  }

  async function createPendingOrder(userId: number) {
    return prisma.order.create({
      data: {
        userId,
        status: "PENDING",
        totalInPaise: amountInPaise,
      },
    });
  }

  async function initiatePaymentForOrder(
    agent = customerAgent,
    id = orderId,
  ) {
    return agent
      .post("/api/payments/initiate")
      .send({ orderId: id });
  }

  async function createPaymentRecord(
    id: number,
    providerId = `order_${Date.now()}`,
  ) {
    return prisma.payment.create({
      data: {
        orderId: id,
        amountInPaise,
        currency: "INR",
        status: "PENDING",
        providerOrderId: providerId,
      },
    });
  }

  async function loginAgent(email: string) {
    const agent = request.agent(app);

    const response = await agent.post("/api/auth/login").send({
      email,
      password,
    });

    expect(response.status).toBe(200);

    return agent;
  }

  beforeAll(async () => {
    const passwordHash = await hashPassword(password);

    const customer = await prisma.user.create({
      data: {
        name: "Payment Test Customer",
        email: customerEmail,
        passwordHash,
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    });

    const secondCustomer = await prisma.user.create({
      data: {
        name: "Payment Test Customer Two",
        email: secondCustomerEmail,
        passwordHash,
        role: "CUSTOMER",
        status: "ACTIVE",
      },
    });

    const vendor = await prisma.user.create({
      data: {
        name: "Payment Test Vendor",
        email: vendorEmail,
        passwordHash,
        role: "VENDOR",
        status: "ACTIVE",
      },
    });

    customerId = customer.id;
    secondCustomerId = secondCustomer.id;
    vendorId = vendor.id;

    customerAgent = await loginAgent(customerEmail);
    secondCustomerAgent = await loginAgent(secondCustomerEmail);
    vendorAgent = await loginAgent(vendorEmail);
  });

  beforeEach(async () => {
    razorpayMocks.createOrder.mockReset();
    razorpayMocks.fetchPayments.mockReset();
    razorpayMocks.fetchPayment.mockReset();

    razorpayMocks.createOrder.mockResolvedValue({
      id: `order_${Date.now()}`,
      amount: amountInPaise,
      currency: "INR",
    });

    razorpayMocks.fetchPayments.mockResolvedValue({
      items: [],
    });
  });

  afterAll(async () => {
    // PaymentAttempt references Payment with onDelete: Restrict.
    await prisma.paymentAttempt.deleteMany({
      where: {
        payment: {
          order: {
            userId: {
              in: [customerId, secondCustomerId, vendorId],
            },
          },
        },
      },
    });

    await prisma.payment.deleteMany({
      where: {
        order: {
          userId: {
            in: [customerId, secondCustomerId, vendorId],
          },
        },
      },
    });

    await prisma.order.deleteMany({
      where: {
        userId: {
          in: [customerId, secondCustomerId, vendorId],
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

  describe("POST /api/payments/initiate", () => {
    beforeEach(async () => {
      const order = await createPendingOrder(customerId);
      orderId = order.id;
    });

    it("should reject unauthenticated requests", async () => {
      const response = await request(app)
        .post("/api/payments/initiate")
        .send({ orderId });

      expect(response.status).toBe(401);
    });

    it("should reject vendor accounts", async () => {
      const response = await initiatePaymentForOrder(vendorAgent);

      expect(response.status).toBe(403);
    });

    it("should reject invalid order IDs", async () => {
      const response = await customerAgent
        .post("/api/payments/initiate")
        .send({ orderId: -1 });

      expect(response.status).toBe(400);
    });

    it("should reject unexpected request fields", async () => {
      const response = await customerAgent
        .post("/api/payments/initiate")
        .send({
          orderId,
          amount: 1,
        });

      expect(response.status).toBe(400);
    });

    it("should reject orders belonging to another customer", async () => {
      const response = await initiatePaymentForOrder(
        customerAgent,
        (await createPendingOrder(secondCustomerId)).id,
      );

      expect(response.status).toBe(404);
    });

    it("should return 404 for a nonexistent order", async () => {
      const response = await initiatePaymentForOrder(
        customerAgent,
        99999999,
      );

      expect(response.status).toBe(404);
    });

    it("should reject an order that is not pending", async () => {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: "CONFIRMED" },
      });

      const response = await initiatePaymentForOrder();

      expect(response.status).toBe(409);
    });

    it("should reject a zero-value order", async () => {
      await prisma.order.update({
        where: { id: orderId },
        data: { totalInPaise: 0 },
      });

      const response = await initiatePaymentForOrder();

      expect(response.status).toBe(400);
    });

    it("should create a Razorpay order and local payment record", async () => {
      razorpayMocks.createOrder.mockResolvedValue({
        id: "order_test_123",
        amount: amountInPaise,
        currency: "INR",
      });

      const response = await initiatePaymentForOrder();

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        razorpayOrderId: "order_test_123",
        amount: amountInPaise,
        currency: "INR",
        keyId: env.RAZORPAY_KEY_ID,
      });

      expect(razorpayMocks.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: amountInPaise,
          currency: "INR",
          notes: {
            payflowOrderId: String(orderId),
            payflowUserId: String(customerId),
          },
        }),
      );

      const payment = await prisma.payment.findFirst({
        where: {
          orderId,
          providerOrderId: "order_test_123",
        },
      });

      expect(payment).not.toBeNull();
      expect(payment).toMatchObject({
        amountInPaise,
        currency: "INR",
        status: "PENDING",
      });

      paymentId = payment!.id;
      razorpayOrderId = "order_test_123";
    });

    it("should reuse an existing pending payment instead of creating another Razorpay order", async () => {
      const existing = await createPaymentRecord(
        orderId,
        "order_existing_123",
      );

      const response = await initiatePaymentForOrder();

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        paymentId: existing.id,
        razorpayOrderId: "order_existing_123",
        amount: amountInPaise,
        currency: "INR",
      });

      expect(razorpayMocks.createOrder).not.toHaveBeenCalled();

      const paymentCount = await prisma.payment.count({
        where: { orderId },
      });

      expect(paymentCount).toBe(1);
    });
  });

  describe("POST /api/payments/verify", () => {
    beforeEach(async () => {
      const order = await createPendingOrder(customerId);
      orderId = order.id;

      const payment = await createPaymentRecord(
        orderId,
        `order_verify_${Date.now()}`,
      );

      paymentId = payment.id;
      razorpayOrderId = payment.providerOrderId!;
    });

    it("should reject unauthenticated requests", async () => {
      const response = await request(app)
        .post("/api/payments/verify")
        .send({
          razorpayOrderId,
          razorpayPaymentId: "pay_test_123",
          razorpaySignature: "a".repeat(64),
        });

      expect(response.status).toBe(401);
    });

    it("should reject vendor accounts", async () => {
      const response = await vendorAgent
        .post("/api/payments/verify")
        .send({
          razorpayOrderId,
          razorpayPaymentId: "pay_test_123",
          razorpaySignature: "a".repeat(64),
        });

      expect(response.status).toBe(403);
    });

    it("should reject an invalid signature format", async () => {
      const response = await customerAgent
        .post("/api/payments/verify")
        .send({
          razorpayOrderId,
          razorpayPaymentId: "pay_test_123",
          razorpaySignature: "invalid",
        });

      expect(response.status).toBe(400);
    });

    it("should reject unexpected request fields", async () => {
      const response = await customerAgent
        .post("/api/payments/verify")
        .send({
          razorpayOrderId,
          razorpayPaymentId: "pay_test_123",
          razorpaySignature: "a".repeat(64),
          extra: true,
        });

      expect(response.status).toBe(400);
    });

    it("should return 404 when the payment does not belong to the customer", async () => {
      const response = await secondCustomerAgent
        .post("/api/payments/verify")
        .send({
          razorpayOrderId,
          razorpayPaymentId: "pay_test_123",
          razorpaySignature: generateSignature(
            razorpayOrderId,
            "pay_test_123",
          ),
        });

      expect(response.status).toBe(404);
    });

    it("should reject an invalid but correctly formatted signature", async () => {
      razorpayMocks.fetchPayment.mockResolvedValue({
        id: "pay_test_123",
        order_id: razorpayOrderId,
        amount: amountInPaise,
        currency: "INR",
        status: "captured",
      });

      const response = await customerAgent
        .post("/api/payments/verify")
        .send({
          razorpayOrderId,
          razorpayPaymentId: "pay_test_123",
          razorpaySignature: "a".repeat(64),
        });

      expect(response.status).toBe(400);
      expect(razorpayMocks.fetchPayment).not.toHaveBeenCalled();
    });

    it("should reject payment details that do not match the local payment", async () => {
      const paymentIdFromProvider = "pay_mismatch_123";

      razorpayMocks.fetchPayment.mockResolvedValue({
        id: paymentIdFromProvider,
        order_id: razorpayOrderId,
        amount: amountInPaise + 100,
        currency: "INR",
        status: "captured",
      });

      const response = await customerAgent
        .post("/api/payments/verify")
        .send({
          razorpayOrderId,
          razorpayPaymentId: paymentIdFromProvider,
          razorpaySignature: generateSignature(
            razorpayOrderId,
            paymentIdFromProvider,
          ),
        });

      expect(response.status).toBe(400);

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      expect(payment?.status).toBe("PENDING");
    });

    it("should reject a payment that has not been captured", async () => {
      const paymentIdFromProvider = "pay_authorized_123";

      razorpayMocks.fetchPayment.mockResolvedValue({
        id: paymentIdFromProvider,
        order_id: razorpayOrderId,
        amount: amountInPaise,
        currency: "INR",
        status: "authorized",
      });

      const response = await customerAgent
        .post("/api/payments/verify")
        .send({
          razorpayOrderId,
          razorpayPaymentId: paymentIdFromProvider,
          razorpaySignature: generateSignature(
            razorpayOrderId,
            paymentIdFromProvider,
          ),
        });

      expect(response.status).toBe(409);
    });

    it("should verify a captured payment and confirm the order", async () => {
      const paymentIdFromProvider = "pay_captured_123";

      razorpayMocks.fetchPayment.mockResolvedValue({
        id: paymentIdFromProvider,
        order_id: razorpayOrderId,
        amount: amountInPaise,
        currency: "INR",
        status: "captured",
        method: "card",
      });

      const response = await customerAgent
        .post("/api/payments/verify")
        .send({
          razorpayOrderId,
          razorpayPaymentId: paymentIdFromProvider,
          razorpaySignature: generateSignature(
            razorpayOrderId,
            paymentIdFromProvider,
          ),
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        paymentId,
        orderId,
        paymentStatus: "SUCCESS",
        orderStatus: "CONFIRMED",
      });

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      expect(payment).toMatchObject({
        status: "SUCCESS",
        providerPaymentId: paymentIdFromProvider,
      });

      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      expect(order?.status).toBe("CONFIRMED");

      const attempts = await prisma.paymentAttempt.findMany({
        where: { paymentId },
      });

      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({
        providerPaymentId: paymentIdFromProvider,
        status: "SUCCESS",
        amountInPaise,
        currency: "INR",
        method: "card",
      });
    });

    it("should allow an idempotent repeat for the same successful payment", async () => {
      const paymentIdFromProvider = "pay_repeat_123";

      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: "SUCCESS",
          providerPaymentId: paymentIdFromProvider,
        },
      });

      await prisma.order.update({
        where: { id: orderId },
        data: { status: "CONFIRMED" },
      });

      razorpayMocks.fetchPayment.mockResolvedValue({
        id: paymentIdFromProvider,
        order_id: razorpayOrderId,
        amount: amountInPaise,
        currency: "INR",
        status: "captured",
      });

      const response = await customerAgent
        .post("/api/payments/verify")
        .send({
          razorpayOrderId,
          razorpayPaymentId: paymentIdFromProvider,
          razorpaySignature: generateSignature(
            razorpayOrderId,
            paymentIdFromProvider,
          ),
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        paymentStatus: "SUCCESS",
        orderStatus: "CONFIRMED",
      });
    });

    it("should reject a different payment ID after payment has succeeded", async () => {
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: "SUCCESS",
          providerPaymentId: "pay_original_123",
        },
      });

      await prisma.order.update({
        where: { id: orderId },
        data: { status: "CONFIRMED" },
      });

      const differentPaymentId = "pay_different_123";

      razorpayMocks.fetchPayment.mockResolvedValue({
        id: differentPaymentId,
        order_id: razorpayOrderId,
        amount: amountInPaise,
        currency: "INR",
        status: "captured",
      });

      const response = await customerAgent
        .post("/api/payments/verify")
        .send({
          razorpayOrderId,
          razorpayPaymentId: differentPaymentId,
          razorpaySignature: generateSignature(
            razorpayOrderId,
            differentPaymentId,
          ),
        });

      expect(response.status).toBe(409);
    });
  });

  describe("POST /api/payments/reconcile", () => {
    beforeEach(async () => {
      const order = await createPendingOrder(customerId);
      orderId = order.id;

      const payment = await createPaymentRecord(
        orderId,
        `order_reconcile_${Date.now()}`,
      );

      paymentId = payment.id;
      razorpayOrderId = payment.providerOrderId!;
    });

    it("should reject unauthenticated requests", async () => {
      const response = await request(app)
        .post("/api/payments/reconcile")
        .send({ razorpayOrderId });

      expect(response.status).toBe(401);
    });

    it("should reject vendor accounts", async () => {
      const response = await vendorAgent
        .post("/api/payments/reconcile")
        .send({ razorpayOrderId });

      expect(response.status).toBe(403);
    });

    it("should reject a missing Razorpay order ID", async () => {
      const response = await customerAgent
        .post("/api/payments/reconcile")
        .send({});

      expect(response.status).toBe(400);
    });

    it("should return 404 when the payment belongs to another customer", async () => {
      const response = await secondCustomerAgent
        .post("/api/payments/reconcile")
        .send({ razorpayOrderId });

      expect(response.status).toBe(404);
    });

    it("should return 404 for an unknown Razorpay order", async () => {
      const response = await customerAgent
        .post("/api/payments/reconcile")
        .send({ razorpayOrderId: "order_unknown_123" });

      expect(response.status).toBe(404);
    });

    it("should reconcile a failed Razorpay attempt", async () => {
      razorpayMocks.fetchPayments.mockResolvedValue({
        items: [
          {
            id: "pay_failed_123",
            order_id: razorpayOrderId,
            amount: amountInPaise,
            currency: "INR",
            status: "failed",
            method: "card",
            error_code: "BAD_REQUEST_ERROR",
            error_description: "Payment failed",
          },
        ],
      });

      const response = await customerAgent
        .post("/api/payments/reconcile")
        .send({ razorpayOrderId });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        paymentId,
        failedAttemptsProcessed: 1,
        capturedAttemptsProcessed: 0,
        capturedAttemptsNeedingReview: 0,
      });

      const attempt = await prisma.paymentAttempt.findUnique({
        where: { providerPaymentId: "pay_failed_123" },
      });

      expect(attempt).toMatchObject({
        paymentId,
        status: "FAILED",
        failureCode: "BAD_REQUEST_ERROR",
        failureDescription: "Payment failed",
      });

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      expect(payment?.status).toBe("PENDING");
    });

    it("should reconcile a captured attempt and confirm the order", async () => {
      razorpayMocks.fetchPayments.mockResolvedValue({
        items: [
          {
            id: "pay_reconciled_123",
            order_id: razorpayOrderId,
            amount: amountInPaise,
            currency: "INR",
            status: "captured",
            method: "upi",
          },
        ],
      });

      const response = await customerAgent
        .post("/api/payments/reconcile")
        .send({ razorpayOrderId });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        paymentId,
        failedAttemptsProcessed: 0,
        capturedAttemptsProcessed: 1,
        capturedAttemptsNeedingReview: 0,
      });

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      expect(payment).toMatchObject({
        status: "SUCCESS",
        providerPaymentId: "pay_reconciled_123",
      });

      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      expect(order?.status).toBe("CONFIRMED");

      const attempt = await prisma.paymentAttempt.findUnique({
        where: { providerPaymentId: "pay_reconciled_123" },
      });

      expect(attempt).toMatchObject({
        status: "SUCCESS",
        method: "upi",
      });
    });

    it("should ignore attempts with mismatched amount, currency, or order ID", async () => {
      razorpayMocks.fetchPayments.mockResolvedValue({
        items: [
          {
            id: "pay_wrong_amount",
            order_id: razorpayOrderId,
            amount: amountInPaise + 100,
            currency: "INR",
            status: "captured",
          },
          {
            id: "pay_wrong_currency",
            order_id: razorpayOrderId,
            amount: amountInPaise,
            currency: "USD",
            status: "captured",
          },
          {
            id: "pay_wrong_order",
            order_id: "order_unrelated",
            amount: amountInPaise,
            currency: "INR",
            status: "captured",
          },
        ],
      });

      const response = await customerAgent
        .post("/api/payments/reconcile")
        .send({ razorpayOrderId });

      expect(response.status).toBe(200);
      expect(response.body.data.capturedAttemptsProcessed).toBe(0);

      expect(
        await prisma.paymentAttempt.count({
          where: { paymentId },
        }),
      ).toBe(0);

      expect(
        (await prisma.payment.findUnique({ where: { id: paymentId } }))
          ?.status,
      ).toBe("PENDING");
    });

    it("should not process non-terminal provider attempts", async () => {
      razorpayMocks.fetchPayments.mockResolvedValue({
        items: [
          {
            id: "pay_authorized_reconcile",
            order_id: razorpayOrderId,
            amount: amountInPaise,
            currency: "INR",
            status: "authorized",
          },
        ],
      });

      const response = await customerAgent
        .post("/api/payments/reconcile")
        .send({ razorpayOrderId });

      expect(response.status).toBe(200);
      expect(response.body.data.capturedAttemptsProcessed).toBe(0);
      expect(response.body.data.failedAttemptsProcessed).toBe(0);

      expect(
        await prisma.paymentAttempt.count({
          where: { paymentId },
        }),
      ).toBe(0);
    });

    it("should be idempotent when reconciling the same failed attempt again", async () => {
      razorpayMocks.fetchPayments.mockResolvedValue({
        items: [
          {
            id: "pay_failed_repeat",
            order_id: razorpayOrderId,
            amount: amountInPaise,
            currency: "INR",
            status: "failed",
            method: "card",
          },
        ],
      });

      const firstResponse = await customerAgent
        .post("/api/payments/reconcile")
        .send({ razorpayOrderId });

      const secondResponse = await customerAgent
        .post("/api/payments/reconcile")
        .send({ razorpayOrderId });

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);

      expect(
        await prisma.paymentAttempt.count({
          where: { paymentId },
        }),
      ).toBe(1);
    });
  });
});
