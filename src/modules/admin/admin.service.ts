import { prisma } from "../../config/database";
import { OrderStatus } from "../../generated/prisma/client";

function createAdminError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

// Existing functionality: dashboard statistics.
export async function getAdminDashboardStats() {
  const [
    totalUsers,
    totalProducts,
    totalOrders,
    totalPayments,
    pendingOrders,
    confirmedOrders,
    successfulPayments,
    failedPayments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.product.count(),
    prisma.order.count(),
    prisma.payment.count(),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { status: "CONFIRMED" } }),
    prisma.payment.count({ where: { status: "SUCCESS" } }),
    prisma.payment.count({ where: { status: "FAILED" } }),
  ]);

  return {
    users: { total: totalUsers },
    products: { total: totalProducts },
    orders: {
      total: totalOrders,
      pending: pendingOrders,
      confirmed: confirmedOrders,
    },
    payments: {
      total: totalPayments,
      successful: successfulPayments,
      failed: failedPayments,
    },
  };
}

// New functionality: list all orders with pagination and optional status filter.
export async function getAdminOrders(
  page: number,
  limit: number,
  status?: OrderStatus,
) {
  const where = status ? { status } : {};

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      select: {
        id: true,
        userId: true,
        status: true,
        totalInPaise: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: {
          select: {
            id: true,
            productName: true,
            quantity: true,
            unitPriceInPaise: true,
            lineTotalInPaise: true,
            status: true,
            vendor: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        payments: {
          select: {
            id: true,
            amountInPaise: true,
            currency: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// New functionality: retrieve one order and its associated records.
export async function getAdminOrderById(orderId: number) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      status: true,
      totalInPaise: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
        },
      },
      items: {
        select: {
          id: true,
          productId: true,
          vendorId: true,
          productName: true,
          productSlug: true,
          quantity: true,
          unitPriceInPaise: true,
          lineTotalInPaise: true,
          status: true,
          vendor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      payments: {
        select: {
          id: true,
          amountInPaise: true,
          currency: true,
          status: true,
          providerOrderId: true,
          providerPaymentId: true,
          createdAt: true,
          updatedAt: true,
          attempts: {
            select: {
              id: true,
              status: true,
              amountInPaise: true,
              currency: true,
              method: true,
              failureCode: true,
              failureDescription: true,
              needsReview: true,
              reviewReason: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  if (!order) {
    throw createAdminError("Order not found", 404);
  }

  return order;
}

// Cancel a pending order as an administrator and restore its stock.
export async function cancelAdminOrder(orderId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        items: {
          select: {
            productId: true,
            quantity: true,
            status: true,
          },
        },
      },
    });

    if (!order) {
      throw createAdminError("Order not found", 404);
    }

    if (order.status !== OrderStatus.PENDING) {
      throw createAdminError(
        "Only pending orders can be cancelled without refund handling",
        409,
      );
    }

    // Only one request can successfully cancel this pending order.
    const result = await tx.order.updateMany({
      where: {
        id: orderId,
        status: OrderStatus.PENDING,
      },
      data: {
        status: OrderStatus.CANCELLED,
      },
    });

    if (result.count !== 1) {
      throw createAdminError(
        "Order status changed concurrently; refresh and retry",
        409,
      );
    }

    // Restore stock for products that still exist.
    for (const item of order.items) {
      if (item.productId === null) {
        continue;
      }

      await tx.product.updateMany({
        where: {
          id: item.productId,
        },
        data: {
          stock: {
            increment: item.quantity,
          },
        },
      });
    }

    // Mark each fulfillment item cancelled as well.
    await tx.orderItem.updateMany({
      where: {
        orderId,
      },
      data: {
        status: "CANCELLED",
      },
    });

    return tx.order.findUniqueOrThrow({
      where: {
        id: orderId,
      },
      include: {
        items: true,
      },
    });
  });
}
