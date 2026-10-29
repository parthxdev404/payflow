import { Router } from "express";
import { validate } from "../../middlewares/validate";
import { loginSchema, registerSchema } from "./auth.schema";
import {
  getMeController,
  loginController,
  logOutController,
  refreshController,
  registerController,
} from "./auth.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { authRateLimiter } from "../../middlewares/rateLimiter";

const authRouter = Router();

authRouter.post(
  "/register",
  authRateLimiter,
  validate(registerSchema),
  registerController,
);
authRouter.post(
  "/login",
  authRateLimiter,
  validate(loginSchema),
  loginController,
);
authRouter.get("/me", authenticate, getMeController);

authRouter.get(
  "/admin-check",
  authenticate,
  authorize("CUSTOMER"),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Admin access granted",
      data: {
        user: req.user,
      },
    });
  },
);
authRouter.post("/refresh", refreshController);
authRouter.post("/logout", logOutController);
export default authRouter;
