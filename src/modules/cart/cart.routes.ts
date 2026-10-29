import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import {
  addCartItemController,
  getCartController,
  removeCartItemController,
  updateCartItemController,
} from "./cart.controller";
import { validate } from "../../middlewares/validate";
import {
  addCartItemsSchema,
  cartItemsIdSchema,
  updateCartItemsSchema,
} from "./cart.schema";

const cartRouter = Router();

cartRouter.get("/", authenticate, authorize("CUSTOMER"), getCartController);
cartRouter.post(
  "/items",
  authenticate,
  authorize("CUSTOMER"),
  validate(addCartItemsSchema),
  addCartItemController,
);
cartRouter.patch(
  "/items/:itemId",
  authenticate,
  authorize("CUSTOMER"),
  validate(updateCartItemsSchema),
  updateCartItemController,
);

cartRouter.delete(
  "/items/:itemId",
  authenticate,
  authorize("CUSTOMER"),
  validate(cartItemsIdSchema, "params"),
  removeCartItemController,
);

export default cartRouter;
