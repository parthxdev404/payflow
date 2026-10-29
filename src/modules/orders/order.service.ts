import { prisma } from "../../config/database";

export const validateCheckout = async (userId: number) => {
  const cart = await prisma.cart.findUnique({
    where: {
      userId,
    },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              vendorId: true,
              name: true,
              slug: true,
              priceInPaise: true,
              stock: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!cart) {
    const error = new Error("Cart not found");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }

  if (cart.items.length === 0) {
    const error = new Error("Your cart is empty");
    Object.assign(error, { statusCode: 400 });
    throw error;
  }

  let totalInPaise = 0;

  for (const item of cart.items) {
    if (item.product.status !== "ACTIVE") {
      const error = new Error(`Product ${item.product.name} is not available`);
      Object.assign(error, { statusCode: 409 });
      throw error;
    }

    if (item.quantity > item.product.stock) {
      const error = new Error(
        `Insufficient stock for ${item.product.name}. Available : ${item.product.stock}`,
      );
      Object.assign(error, { statusCode: 409 });
      throw error;
    }
    totalInPaise += item.product.priceInPaise * item.quantity;
  }

  return {
    cartId: cart.id,
    items: cart.items,
    totalInPaise,
    currency: "INR" as const,
  };
};

export const checkOutOrder = async (userId: number) => {
  return prisma.$transaction(async (tx) => {
    // Lock this customer's cart for the duration of checkout.
    await tx.$queryRaw`
      SELECT id
      FROM "Cart"
      WHERE "userId" = ${userId}
      FOR UPDATE
    `;

    const cart = await tx.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                vendorId: true,
                name: true,
                slug: true,
                priceInPaise: true,
                stock: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!cart) {
      throw Object.assign(new Error("Cart not found"), { statusCode: 404 });
    }
    if (cart.items.length === 0) {
      throw Object.assign(new Error("Your cart is empty"), { statusCode: 400 });
    }

    let totalInPaise = 0;

    for (const item of cart.items) {
      const product = item.product;

      if (product.status !== "ACTIVE") {
        throw Object.assign(
          new Error(`Product ${product.name} is not available`),
          { statusCode: 409 },
        );
      }

      if (item.quantity > product.stock) {
        throw Object.assign(
          new Error(
            `Insufficient stock for ${product.name}. Available : ${product.stock}`,
          ),
          { statusCode: 409 },
        );
      }
      totalInPaise += product.priceInPaise * item.quantity;
    }

    for (const item of cart.items) {
      const result = await tx.product.updateMany({
        where: {
          id: item.product.id,
          status: "ACTIVE",
          stock: { gte: item.quantity },
        },
        data: {
          stock: { decrement: item.quantity },
        },
      });

      if (result.count !== 1) {
        throw Object.assign(
          new Error(`Stock changed for ${item.product.name}. Please try again`),
          { statusCode: 409 },
        );
      }
    }

    const order = await tx.order.create({
      data: {
        userId,
        totalInPaise,
        status: "PENDING",
        items: {
          create: cart.items.map((item) => ({
            productId: item.product.id,
            vendorId: item.product.vendorId,
            productName: item.product.name,
            productSlug: item.product.slug,
            unitPriceInPaise: item.product.priceInPaise,
            quantity: item.quantity,
            lineTotalInPaise: item.product.priceInPaise * item.quantity,
          })),
        },
      },

      include: {
        items: true,
      },
    });

    const clearedItems = await tx.cartItem.deleteMany({
      where: {
        cartId: cart.id,
        id: {
          in: cart.items.map((item) => item.id),
        },
      },
    });

    if (clearedItems.count !== cart.items.length) {
      throw Object.assign(
        new Error("Cart changed during checkout. Please try again"),
        {
          statusCode: 409,
        },
      );
    }
    return order;
  });
};

export const getMyOrders = async (userId: number) => {
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        select: {
          id: true,
          productId: true,
          vendorId: true,
          productName: true,
          productSlug: true,
          unitPriceInPaise: true,
          quantity: true,
          lineTotalInPaise: true,
        },
      },
    },
  });
  return orders;
};

export const getMyOrderById = async (userId: number, orderId: number) => {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      userId,
    },
    include: {
      items: {
        select: {
          id: true,
          productId: true,
          vendorId: true,
          productName: true,
          productSlug: true,
          unitPriceInPaise: true,
          quantity: true,
          lineTotalInPaise: true,
        },
      },
    },
  });

  if (!order) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }
  return order;
};

export const cancelMyOrder = async (userId: number, orderId: number) => {
  return prisma.$transaction(async (tx) => {
    // Find the order and verify that it belongs to this customer.
    const order = await tx.order.findFirst({
      where: {
        id: orderId,
        userId,
      },
      include: {
        items: {
          select: {
            id: true,
            productId: true,
            quantity: true,
          },
        },
      },
    });

    if (!order) {
      throw Object.assign(new Error("Order not found"), {
        statusCode: 404,
      });
    }

    // Only pending orders can be cancelled through this endpoint.
    if (order.status !== "PENDING") {
      throw Object.assign(new Error("Only pending orders can be cancelled"), {
        statusCode: 409,
      });
    }

    // Conditionally cancel the order to prevent duplicate cancellation.
    const result = await tx.order.updateMany({
      where: {
        id: orderId,
        userId,
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
      },
    });

    if (result.count !== 1) {
      throw Object.assign(
        new Error("Order status changed concurrently. Please try again"),
        { statusCode: 409 },
      );
    }

    // Mark every item as cancelled within the same transaction.
    await tx.orderItem.updateMany({
      where: {
        orderId: order.id,
      },
      data: {
        status: "CANCELLED",
      },
    });

    // Restore stock for products that still exist.
    // Deleted products have productId = null and are skipped.
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

    // Return the updated order and its items.
    return tx.order.findUniqueOrThrow({
      where: {
        id: orderId,
      },
      include: {
        items: true,
      },
    });
  });
};
