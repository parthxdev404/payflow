import { prisma } from "../../config/database";
import type { AddCartItemInput, UpdateCartItemInput } from "./cart.schema";

export const getOrCreateCart = async (userId: number) => {
  return prisma.cart.upsert({
    where: {
      userId,
    },
    create: {
      userId,
    },
    update: {},
    select: {
      id: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          product: {
            select: {
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
};

export const addCartItem = async (userId: number, input: AddCartItemInput) => {
  const product = await prisma.product.findFirst({
    where: {
      id: input.productId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      stock: true,
    },
  });

  if (!product) {
    const error = new Error("Product not found");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }

  if (input.quantity > product.stock) {
    const error = new Error("Requested quantity exceeds available stock");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }

  const cart = await getOrCreateCart(userId);
  const existingItem = await prisma.cartItem.findUnique({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId: product.id,
      },
    },
    select: {
      id: true,
      quantity: true,
    },
  });

  const newQuantity = (existingItem?.quantity ?? 0) + input.quantity;

  if (newQuantity > product.stock) {
    const error = new Error("Total cart quantity exceeds available stock");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }

  return prisma.cartItem.upsert({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId: product.id,
      },
    },
    create: {
      cartId: cart.id,
      productId: product.id,
      quantity: input.quantity,
    },
    update: {
      quantity: newQuantity,
    },
    select: {
      id: true,
      cartId: true,
      productId: true,
      quantity: true,
      product: {
        select: {
          name: true,
          priceInPaise: true,
          stock: true,
          status: true,
        },
      },
    },
  });
};

export const updateCartItem = async (
  userId: number,
  itemId: number,
  input: UpdateCartItemInput,
) => {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!cart) {
    const error = new Error("Cart item not found");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }

  const items = await prisma.cartItem.findFirst({
    where: {
      id: itemId,
      cartId: cart.id,
    },
    select: {
      id: true,
      productId: true,
      quantity: true,
    },
  });

  if (!items) {
    const error = new Error("Cart item not found");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }

  const product = await prisma.product.findFirst({
    where: {
      id: items.productId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      stock: true,
    },
  });

  if (!product) {
    const error = new Error("Product is no longer available");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }

  if (input.quantity > product.stock) {
    const error = new Error("Requested quantity exceeds available stock");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }

  return prisma.cartItem.update({
    where: { id: items.id },
    data: { quantity: input.quantity },
    select: {
      id: true,
      cartId: true,
      productId: true,
      quantity: true,
      product: {
        select: {
          name: true,
          priceInPaise: true,
          stock: true,
          status: true,
        },
      },
    },
  });
};

export const removeCartItem = async (userId: number, itemsId: number) => {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!cart) {
    const error = new Error("Cart item not found");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }

  const item = await prisma.cartItem.findFirst({
    where: {
      id: itemsId,
      cartId: cart.id,
    },
    select: { id: true },
  });

  if (!item) {
    const error = new Error("Cart item not found");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }

  await prisma.cartItem.delete({
    where: { id: item.id },
  });

  return {
    message: "Cart item removed successfully",
  };
};

export const getCart = async (userId: number) => {
  const cart = await getOrCreateCart(userId);

  const items = cart.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    name: item.product.name,
    slug: item.product.slug,
    priceInPaise: item.product.priceInPaise,
    quantity: item.quantity,
    availableStock: item.product.stock,
    status: item.product.status,
    isAvailable:
      item.product.status === "ACTIVE" && item.product.stock >= item.quantity,
    itemTotalInPaise:
      item.product.status === "ACTIVE"
        ? item.product.priceInPaise * item.quantity
        : 0,
  }));

  const subtotalInPaise = items.reduce(
    (total, item) => total + item.itemTotalInPaise,
    0,
  );

  return {
    id: cart.id,
    userId: cart.userId,
    items,
    itemCount: items.length,
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
    subtotalInPaise,
    currency: "INR",
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
};
