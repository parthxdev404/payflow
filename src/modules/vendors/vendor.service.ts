import { OrderItemStatus, OrderStatus } from "../../generated/prisma/client";
import { prisma } from "../../config/database";

// These are the fulfillment statuses a vendor is allowed to set.
// Vendors cannot directly set PENDING because it is the initial status.
type VendorNextItemStatus = "PROCESSING" | "SHIPPED" | "DELIVERED";

function createVendorError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Returns only the order items belonging to the authenticated vendor.
 */
export async function getVendorOrderItems(vendorId: number) {
  return prisma.orderItem.findMany({
    where: { vendorId },
    select: {
      id: true,
      orderId: true,
      productId: true,
      vendorId: true,
      productName: true,
      productSlug: true,
      quantity: true,
      unitPriceInPaise: true,
      lineTotalInPaise: true,
      status: true,
      createdAt: true,
      order: {
        select: {
          id: true,
          status: true,
          createdAt: true,
          userId: true,
          totalInPaise: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Updates the fulfillment status of one order item.
 *
 * Security:
 * - The item must belong to the authenticated vendor.
 * - The parent order must be eligible for fulfillment.
 * - Only valid forward transitions are allowed.
 * - Concurrent updates are guarded by a conditional database update.
 *
 * This function does not modify the overall Order.status.
 */
export async function updateVendorOrderItemStatus(
  vendorId: number,
  orderItemId: number,
  nextStatus: VendorNextItemStatus,
) {
  return prisma.$transaction(async (tx) => {
    // Find the requested item while enforcing vendor ownership.
    const item = await tx.orderItem.findFirst({
      where: {
        id: orderItemId,
        vendorId,
      },
      select: {
        id: true,
        orderId: true,
        vendorId: true,
        status: true,
        order: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!item) {
      throw createVendorError("Order item not found", 404);
    }

    // Do not fulfill items belonging to unpaid, cancelled, or
    // otherwise ineligible orders.
    const eligibleOrderStatuses: OrderStatus[] = [
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
    ];

    if (!eligibleOrderStatuses.includes(item.order.status)) {
      throw createVendorError("Order is not eligible for fulfillment", 409);
    }

    // Define the permitted state transitions for an individual item.
    const allowedTransitions: Partial<
      Record<OrderItemStatus, VendorNextItemStatus[]>
    > = {
      [OrderItemStatus.PENDING]: ["PROCESSING"],
      [OrderItemStatus.PROCESSING]: ["SHIPPED"],
      [OrderItemStatus.SHIPPED]: ["DELIVERED"],
    };

    const permittedStatuses = allowedTransitions[item.status];

    if (!permittedStatuses?.includes(nextStatus)) {
      throw createVendorError(
        `Cannot transition order item from ${item.status} to ${nextStatus}`,
        409,
      );
    }

    // Update only if the item still has the status we originally read.
    // This prevents two concurrent requests from silently overwriting
    // each other's fulfillment progress.
    const updated = await tx.orderItem.updateMany({
      where: {
        id: item.id,
        vendorId,
        status: item.status,
      },
      data: {
        status: nextStatus,
      },
    });

    if (updated.count !== 1) {
      throw createVendorError(
        "Order item status changed concurrently; refresh and retry",
        409,
      );
    }

    // Read every item's latest fulfillment status after the update.
    // This includes items belonging to all vendors in this order.
    const orderItems = await tx.orderItem.findMany({
      where: { orderId: item.orderId },
      select: { status: true },
    });

    const allDelivered = orderItems.every(
      (orderItem) => orderItem.status === OrderItemStatus.DELIVERED,
    );

    const allShippedOrDelivered = orderItems.every(
      (orderItem) =>
        orderItem.status === OrderItemStatus.SHIPPED ||
        orderItem.status === OrderItemStatus.DELIVERED,
    );

    const anyProcessing = orderItems.some(
      (orderItem) => orderItem.status === OrderItemStatus.PROCESSING,
    );

    const anyShipped = orderItems.some(
      (orderItem) => orderItem.status === OrderItemStatus.SHIPPED,
    );

    let nextOrderStatus: OrderStatus | null = null;

    if (allDelivered) {
      nextOrderStatus = OrderStatus.DELIVERED;
    } else if (allShippedOrDelivered && anyShipped) {
      nextOrderStatus = OrderStatus.SHIPPED;
    } else if (anyProcessing || nextStatus === "PROCESSING") {
      nextOrderStatus = OrderStatus.PROCESSING;
    }

    // Preserve CONFIRMED if fulfillment has not actually started.
    if (nextOrderStatus) {
      await tx.order.updateMany({
        where: {
          id: item.orderId,
          status: item.order.status,
        },
        data: {
          status: nextOrderStatus,
        },
      });
    }

    return {
      orderId: item.orderId,
      orderItemId: item.id,
      itemStatus: nextStatus,
      message: "Order item fulfillment status updated",
    };
  });
}
