import { prisma } from "../../config/database";
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from "./product.schema";

type CreateProductOptions = {
  vendorId: number;
  input: CreateProductInput;
};

export const createProduct = async ({
  vendorId,
  input,
}: CreateProductOptions) => {
  const vendor = await prisma.user.findUnique({
    where: { id: vendorId },
    select: {
      id: true,
      role: true,
      status: true,
    },
  });

  if (!vendor || vendor.role !== "VENDOR") {
    const error = new Error("Only vendors can create products");
    Object.assign(error, { statusCode: 403 });
    throw error;
  }

  if (vendor.status !== "ACTIVE") {
    const error = new Error("Your account is not active");
    Object.assign(error, { statusCode: 403 });
    throw error;
  }

  return prisma.product.create({
    data: {
      vendorId: vendor.id,
      name: input.name,
      slug: input.slug,
      description: input.description,
      priceInPaise: input.priceInPaise,
      stock: input.stock,
    },
    select: {
      id: true,
      vendorId: true,
      name: true,
      slug: true,
      description: true,
      priceInPaise: true,
      stock: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

export const listProducts = async (query: ListProductsQuery) => {
  const { page, limit, search, sortBy, order } = query;

  const where = {
    status: "ACTIVE" as const,
    ...(search
      ? {
          name: {
            contains: search,
            mode: "insensitive" as const,
          },
        }
      : {}),
  };

  const skip = (page - 1) * limit;
  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        [sortBy === "price" ? "priceInPaise" : "createdAt"]: order,
      },
      select: {
        id: true,
        vendorId: true,
        name: true,
        slug: true,
        description: true,
        priceInPaise: true,
        stock: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.product.count({ where }),
  ]);
  return {
    products,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    },
  };
};

export const getProductById = async (id: number) => {
  const product = await prisma.product.findFirst({
    where: {
      id,
      status: "ACTIVE",
    },
    select: {
      id: true,
      vendorId: true,
      name: true,
      slug: true,
      description: true,
      priceInPaise: true,
      stock: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!product) {
    const error = new Error("Product not found");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }
  return product;
};

export const updateProduct = async (
  productId: number,
  vendorId: number,
  data: UpdateProductInput,
) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      vendorId: true,
      status: true,
    },
  });

  if (!product) {
    const error = new Error("Product not found");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }

  if (product.vendorId !== vendorId) {
    const error = new Error("You cannot update this product");
    Object.assign(error, { statusCode: 403 });
    throw error;
  }

  return prisma.product.update({
    where: { id: productId },
    data,
    select: {
      id: true,
      vendorId: true,
      name: true,
      slug: true,
      description: true,
      priceInPaise: true,
      stock: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

export const archiveProduct = async (productId: number, vendorId: number) => {
  const product = await prisma.product.findUnique({
    where: {
      id: productId,
    },
    select: {
      id: true,
      vendorId: true,
      status: true,
    },
  });

  if (!product) {
    const error = new Error("Product not found");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }

  if (product.vendorId !== vendorId) {
    const error = new Error("You cannot perform this action");
    Object.assign(error, { statusCode: 403 });
    throw error;
  }

  if (product.status === "ARCHIVED") {
    const error = new Error("Product is already archived");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      status: "ARCHIVED",
    },
    select: {
      id: true,
      vendorId: true,
      name: true,
      slug: true,
      description: true,
      priceInPaise: true,
      stock: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

export const activateProduct = async (productId: number, vendorId: number) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      vendorId: true,
      status: true,
    },
  });

  if (!product) {
    const error = new Error("Product not found");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }

  if (product.vendorId !== vendorId) {
    const error = new Error("You cannot activate this product");
    Object.assign(error, { statusCode: 403 });
    throw error;
  }

  if (product.status === "ACTIVE") {
    const error = new Error("Product is alreadt active");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }

  if (product.status === "ARCHIVED") {
    const error = new Error("Archived products cannot be activated");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      status: "ACTIVE",
    },
    select: {
      id: true,
      vendorId: true,
      name: true,
      slug: true,
      description: true,
      priceInPaise: true,
      stock: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};
