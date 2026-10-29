import { NextFunction, Request, Response } from "express";
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from "./product.schema";
import {
  activateProduct,
  archiveProduct,
  createProduct,
  getProductById,
  listProducts,
  updateProduct,
} from "./product.service";

export const createProductController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const vendorId = req.user!.id;
    const input = req.body as CreateProductInput;

    const product = await createProduct({ vendorId, input });

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

export const listProductsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = res.locals.validatedQuery as ListProductsQuery;
    const result = await listProducts(query);

    res.status(200).json({
      success: true,
      message: "Product retrived successfully",
      date: result.products,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const getProductByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = res.locals.validatedParams as { id: number };
    const product = await getProductById(id);

    res.status(200).json({
      success: true,
      message: "Product retrieved successfully",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProductController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = res.locals.validatedParams as { id: number };
    const vendorId = req.user!.id;
    const data = req.body as UpdateProductInput;

    const product = await updateProduct(id, vendorId, data);
    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

export const archiveProductController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = res.locals.validatedParams as { id: number };
    const vendorId = req.user!.id;

    const product = await archiveProduct(id, vendorId);

    res.status(200).json({
      success: true,
      message: "Product archived successfully",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

export const activateProductController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = res.locals.validatedParams as { id: number };
    const vendorId = req.user!.id;
    const product = await activateProduct(id, vendorId);

    res.status(200).json({
      success: true,
      message: "Product activated successfully",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};
