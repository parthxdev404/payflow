import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { validate } from "../../middlewares/validate";
import {
  createProductSchema,
  listProductsQuerySchema,
  productIdSchema,
  updateProductSchema,
} from "./product.schema";
import {
  activateProductController,
  archiveProductController,
  createProductController,
  getProductByIdController,
  listProductsController,
  updateProductController,
} from "./product.controller";

const productRouter = Router();

productRouter.post(
  "/",
  authenticate,
  authorize("VENDOR"),
  validate(createProductSchema),
  createProductController,
);

productRouter.get(
  "/",
  validate(listProductsQuerySchema, "query"),
  listProductsController,
);

productRouter.get(
  "/:id",
  validate(productIdSchema, "params"),
  getProductByIdController,
);

productRouter.patch(
  "/:id",
  authenticate,
  authorize("VENDOR"),
  validate(productIdSchema, "params"),
  validate(updateProductSchema),
  updateProductController,
);

productRouter.patch(
  "/:id/archive",
  authenticate,
  authorize("VENDOR"),
  validate(productIdSchema, "params"),
  archiveProductController,
);

productRouter.patch(
  "/:id/activate",
  authenticate,
  authorize("VENDOR"),
  validate(productIdSchema, "params"),
  activateProductController,
);

export default productRouter;
