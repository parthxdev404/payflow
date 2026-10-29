import type { Request, Response, NextFunction } from "express";
import { ZodError, type ZodSchema } from "zod";

type ValidationTarget = "body" | "query" | "params";

export const validate = (
  schema: ZodSchema,
  target: ValidationTarget = "body",
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const value =
        target === "query"
          ? req.query
          : target === "params"
            ? req.params
            : req.body;

      const result = schema.parse(value);

      if (target === "body") {
        req.body = result;
      } else if (target === "query") {
        res.locals.validatedQuery = result;
      } else {
        res.locals.validatedParams = result;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: "Validation Failed",
          error: error.issues,
        });
        return;
      }

      next(error);
    }
  };
};
