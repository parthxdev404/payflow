
import swaggerUi from "swagger-ui-express";
import type { Express } from "express";
import type { OpenAPIV3 } from "openapi-types";

const swaggerDocument: OpenAPIV3.Document = {
  openapi: "3.0.3",

  info: {
    title: "PayFlow API",
    version: "1.0.0",
    description: `
PayFlow is a multi-vendor commerce and payment platform.

This API provides authentication, product management, customer cart operations,
order processing, Razorpay payment integration, and administrative operations.

Authentication uses HTTP-only cookies.
Protected endpoints require a valid access token and, where applicable,
the required user role.
    `,
  },

  servers: [
    {
      url: "http://localhost:5000",
      description: "Local development server",
    },
  ],

  tags: [
    { name: "Health", description: "Application health checks" },
    { name: "Auth", description: "Registration, login and authentication" },
    { name: "Products", description: "Product management" },
    { name: "Cart", description: "Customer cart operations" },
    { name: "Orders", description: "Order and checkout operations" },
    { name: "Payments", description: "Payment initiation, verification and reconciliation" },
    { name: "Vendors", description: "Vendor order management" },
    { name: "Admin", description: "Administrative operations" },
  ],

  components: {
    securitySchemes: {
      accessCookie: {
        type: "apiKey",
        in: "cookie",
        name: "payflow_access",
        description:
          "HTTP-only access token cookie. Set automatically after login.",
      },
    },

    schemas: {
      RegisterRequest: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: {
            type: "string",
            minLength: 2,
            maxLength: 100,
            example: "Parth Sharma",
          },
          email: {
            type: "string",
            format: "email",
            example: "parth@example.com",
          },
          password: {
            type: "string",
            minLength: 8,
            maxLength: 100,
            example: "StrongPassword123",
          },
        },
      },

      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: {
            type: "string",
            format: "email",
            example: "parth@example.com",
          },
          password: {
            type: "string",
            minLength: 8,
            maxLength: 100,
            example: "StrongPassword123",
          },
        },
      },

      ErrorResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            example: false,
          },
          message: {
            type: "string",
            example: "Something went wrong",
          },
        },
      },

      SuccessResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            example: true,
          },
          message: {
            type: "string",
            example: "Operation completed successfully",
          },
          data: {
            type: "object",
            nullable: true,
            additionalProperties: true,
          },
        },
      },

      IdParameter: {
        type: "integer",
        minimum: 1,
        example: 1,
      },

      // Request-body fields for these modules should be expanded
      // using their actual Zod schemas.
      ValidatedObject: {
        type: "object",
        description:
          "Request object validated by the corresponding module Zod schema. See the implementation for exact fields.",
        additionalProperties: true,
      },
    },

    responses: {
      BadRequest: {
        description: "Request validation failed",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },

      Unauthorized: {
        description: "Authentication required or credentials invalid",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },

      Forbidden: {
        description: "User does not have permission to perform this operation",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },

      NotFound: {
        description: "Requested resource was not found",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },

      Conflict: {
        description: "Resource conflict",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },

      InternalServerError: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },
    },

    parameters: {
      ProductId: {
        name: "id",
        in: "path",
        required: true,
        description: "Product ID",
        schema: {
          type: "integer",
          minimum: 1,
        },
        example: 1,
      },

      CartItemId: {
        name: "itemId",
        in: "path",
        required: true,
        description: "Cart item ID",
        schema: {
          type: "integer",
          minimum: 1,
        },
        example: 1,
      },

      OrderId: {
        name: "orderId",
        in: "path",
        required: true,
        description: "Order ID",
        schema: {
          type: "integer",
          minimum: 1,
        },
        example: 1,
      },
    },

    requestBodies: {
      ValidatedRequest: {
        description:
          "Request body validated by the module's Zod schema. Exact fields are documented in the corresponding schema implementation.",
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ValidatedObject",
            },
          },
        },
      },
    },
  },

  paths: {
    // --------------------------------------------------
    // HEALTH
    // --------------------------------------------------

    "/health/live": {
      get: {
        tags: ["Health"],
        summary: "Check whether the application is running",
        responses: {
          "200": {
            description: "Application is running",
          },
          "500": {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },

    "/health/ready": {
      get: {
        tags: ["Health"],
        summary: "Check application and database readiness",
        responses: {
          "200": {
            description: "Application and database are ready",
          },
          "503": {
            description: "Database is unavailable",
          },
        },
      },
    },

    // --------------------------------------------------
    // AUTH
    // --------------------------------------------------

    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new customer",
        description:
          "Creates a new user account. Registration is protected by the authentication rate limiter.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/RegisterRequest",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "User registered successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "409": {
            $ref: "#/components/responses/Conflict",
          },
          "429": {
            description: "Too many registration attempts",
          },
          "500": {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },

    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in to PayFlow",
        description:
          "Authenticates a user and establishes authentication cookies.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/LoginRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Login successful. Authentication cookies are set.",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "429": {
            description: "Too many login attempts",
          },
          "500": {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },

    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get the authenticated user's profile",
        security: [{ accessCookie: [] }],
        responses: {
          "200": {
            description: "Authenticated user information",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },

    "/api/auth/admin-check": {
      get: {
        tags: ["Auth"],
        summary: "Check CUSTOMER role access",
        description:
          "Requires authentication and the CUSTOMER role, according to the current route middleware.",
        security: [{ accessCookie: [] }],
        responses: {
          "200": {
            description: "Role access granted",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
        },
      },
    },

    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh authentication tokens",
        description:
          "Uses the refresh-token cookie to obtain new authentication tokens.",
        responses: {
          "200": {
            description: "Tokens refreshed successfully",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
        },
      },
    },

    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out the current user",
        description:
          "Logs out the current session and clears authentication cookies.",
        responses: {
          "200": {
            description: "Logout successful",
          },
          "500": {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },

    // --------------------------------------------------
    // PRODUCTS
    // --------------------------------------------------

    "/api/products": {
      post: {
        tags: ["Products"],
        summary: "Create a product",
        description:
          "Creates a product for the authenticated vendor. Requires the VENDOR role.",
        security: [{ accessCookie: [] }],
        requestBody: {
          $ref: "#/components/requestBodies/ValidatedRequest",
        },
        responses: {
          "201": {
            description: "Product created successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "409": {
            $ref: "#/components/responses/Conflict",
          },
          "500": {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },

      get: {
        tags: ["Products"],
        summary: "List products",
        description:
          "Returns products using the supported listing, search and pagination query parameters.",
        responses: {
          "200": {
            description: "Products retrieved successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "500": {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },

    "/api/products/{id}": {
      get: {
        tags: ["Products"],
        summary: "Get product details",
        description: "Returns the details of a product by its ID.",
        parameters: [
          {
            $ref: "#/components/parameters/ProductId",
          },
        ],
        responses: {
          "200": {
            description: "Product retrieved successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },

      patch: {
        tags: ["Products"],
        summary: "Update a product",
        description:
          "Updates a product owned by the authenticated vendor. Requires the VENDOR role.",
        security: [{ accessCookie: [] }],
        parameters: [
          {
            $ref: "#/components/parameters/ProductId",
          },
        ],
        requestBody: {
          $ref: "#/components/requestBodies/ValidatedRequest",
        },
        responses: {
          "200": {
            description: "Product updated successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },

    "/api/products/{id}/archive": {
      patch: {
        tags: ["Products"],
        summary: "Archive a product",
        description:
          "Archives a product owned by the authenticated vendor. Requires the VENDOR role.",
        security: [{ accessCookie: [] }],
        parameters: [
          {
            $ref: "#/components/parameters/ProductId",
          },
        ],
        responses: {
          "200": {
            description: "Product archived successfully",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },

    "/api/products/{id}/activate": {
      patch: {
        tags: ["Products"],
        summary: "Activate a product",
        description:
          "Activates a product owned by the authenticated vendor. Requires the VENDOR role.",
        security: [{ accessCookie: [] }],
        parameters: [
          {
            $ref: "#/components/parameters/ProductId",
          },
        ],
        responses: {
          "200": {
            description: "Product activated successfully",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },

    // --------------------------------------------------
    // CART
    // --------------------------------------------------

    "/api/cart": {
      get: {
        tags: ["Cart"],
        summary: "Get customer cart",
        description:
          "Retrieves the cart belonging to the authenticated customer.",
        security: [{ accessCookie: [] }],
        responses: {
          "200": {
            description: "Cart retrieved successfully",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "500": {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },

    "/api/cart/items": {
      post: {
        tags: ["Cart"],
        summary: "Add an item to the cart",
        description:
          "Adds a product to the authenticated customer's cart. Requires the CUSTOMER role.",
        security: [{ accessCookie: [] }],
        requestBody: {
          $ref: "#/components/requestBodies/ValidatedRequest",
        },
        responses: {
          "200": {
            description: "Cart item added or cart updated successfully",
          },
          "201": {
            description: "Cart item created successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },

    "/api/cart/items/{itemId}": {
      patch: {
        tags: ["Cart"],
        summary: "Update cart item",
        description:
          "Updates an item in the authenticated customer's cart.",
        security: [{ accessCookie: [] }],
        parameters: [
          {
            $ref: "#/components/parameters/CartItemId",
          },
        ],
        requestBody: {
          $ref: "#/components/requestBodies/ValidatedRequest",
        },
        responses: {
          "200": {
            description: "Cart item updated successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },

      delete: {
        tags: ["Cart"],
        summary: "Remove cart item",
        description:
          "Removes an item from the authenticated customer's cart.",
        security: [{ accessCookie: [] }],
        parameters: [
          {
            $ref: "#/components/parameters/CartItemId",
          },
        ],
        responses: {
          "200": {
            description: "Cart item removed successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },

    // --------------------------------------------------
    // ORDERS
    // --------------------------------------------------

    "/api/orders/checkout": {
      post: {
        tags: ["Orders"],
        summary: "Checkout cart",
        description:
          "Creates an order from the authenticated customer's cart. Requires the CUSTOMER role.",
        security: [{ accessCookie: [] }],
        requestBody: {
          $ref: "#/components/requestBodies/ValidatedRequest",
        },
        responses: {
          "201": {
            description: "Order created successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "409": {
            $ref: "#/components/responses/Conflict",
          },
        },
      },
    },

    "/api/orders": {
      get: {
        tags: ["Orders"],
        summary: "Get customer orders",
        description:
          "Returns orders belonging to the authenticated customer.",
        security: [{ accessCookie: [] }],
        responses: {
          "200": {
            description: "Customer orders retrieved successfully",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
        },
      },
    },

    "/api/orders/{orderId}": {
      get: {
        tags: ["Orders"],
        summary: "Get order details",
        description:
          "Returns a specific order belonging to the authenticated customer.",
        security: [{ accessCookie: [] }],
        parameters: [
          {
            $ref: "#/components/parameters/OrderId",
          },
        ],
        responses: {
          "200": {
            description: "Order retrieved successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },

    "/api/orders/{orderId}/cancel": {
      post: {
        tags: ["Orders"],
        summary: "Cancel customer order",
        description:
          "Cancels an order belonging to the authenticated customer, subject to the order cancellation rules.",
        security: [{ accessCookie: [] }],
        parameters: [
          {
            $ref: "#/components/parameters/OrderId",
          },
        ],
        responses: {
          "200": {
            description: "Order cancelled successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
          "409": {
            $ref: "#/components/responses/Conflict",
          },
        },
      },
    },

    // --------------------------------------------------
    // PAYMENTS
    // --------------------------------------------------

    "/api/payments/initiate": {
      post: {
        tags: ["Payments"],
        summary: "Initiate payment",
        description:
          "Initiates payment for the authenticated customer's order using the payment provider. Requires the CUSTOMER role.",
        security: [{ accessCookie: [] }],
        requestBody: {
          $ref: "#/components/requestBodies/ValidatedRequest",
        },
        responses: {
          "200": {
            description: "Payment initiated successfully",
          },
          "201": {
            description: "Payment order created successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
          "500": {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },

    "/api/payments/verify": {
      post: {
        tags: ["Payments"],
        summary: "Verify payment",
        description:
          "Verifies payment information received from the payment provider. Requires the CUSTOMER role.",
        security: [{ accessCookie: [] }],
        requestBody: {
          $ref: "#/components/requestBodies/ValidatedRequest",
        },
        responses: {
          "200": {
            description: "Payment verified successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },

    "/api/payments/webhook": {
      post: {
        tags: ["Payments"],
        summary: "Handle payment provider webhook",
        description:
          "Receives asynchronous payment-provider events. This route does not use the application's authenticate or authorize middleware. Provider webhook signature verification should be performed by the webhook handler.",
        responses: {
          "200": {
            description: "Webhook event processed successfully",
          },
          "400": {
            description: "Invalid webhook request or signature",
          },
          "500": {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },

    "/api/payments/reconcile": {
      post: {
        tags: ["Payments"],
        summary: "Reconcile payment",
        description:
          "Runs payment reconciliation for the authenticated customer. Requires the CUSTOMER role.",
        security: [{ accessCookie: [] }],
        requestBody: {
          $ref: "#/components/requestBodies/ValidatedRequest",
        },
        responses: {
          "200": {
            description: "Payment reconciliation completed",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },

    // --------------------------------------------------
    // ADMIN
    // --------------------------------------------------

    "/api/admin/dashboard": {
      get: {
        tags: ["Admin"],
        summary: "Get admin dashboard statistics",
        description:
          "Returns administrative dashboard statistics. Requires authentication and the ADMIN role.",
        security: [{ accessCookie: [] }],
        responses: {
          "200": {
            description: "Dashboard statistics retrieved successfully",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "500": {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },

    "/api/admin/orders": {
      get: {
        tags: ["Admin"],
        summary: "List all orders",
        description:
          "Returns orders for administrative review with supported query filters. Requires the ADMIN role.",
        security: [{ accessCookie: [] }],
        responses: {
          "200": {
            description: "Orders retrieved successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
        },
      },
    },

    "/api/admin/orders/{orderId}": {
      get: {
        tags: ["Admin"],
        summary: "Get any order by ID",
        description:
          "Returns order details for administrative review. Requires the ADMIN role.",
        security: [{ accessCookie: [] }],
        parameters: [
          {
            $ref: "#/components/parameters/OrderId",
          },
        ],
        responses: {
          "200": {
            description: "Order details retrieved successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
        },
      },
    },

    "/api/admin/orders/{orderId}/cancel": {
      patch: {
        tags: ["Admin"],
        summary: "Cancel an order as admin",
        description:
          "Allows an administrator to cancel an order. Requires the ADMIN role.",
        security: [{ accessCookie: [] }],
        parameters: [
          {
            $ref: "#/components/parameters/OrderId",
          },
        ],
        responses: {
          "200": {
            description: "Order cancelled successfully",
          },
          "400": {
            $ref: "#/components/responses/BadRequest",
          },
          "401": {
            $ref: "#/components/responses/Unauthorized",
          },
          "403": {
            $ref: "#/components/responses/Forbidden",
          },
          "404": {
            $ref: "#/components/responses/NotFound",
          },
          "409": {
            $ref: "#/components/responses/Conflict",
          },
        },
      },
    },
  },
};

export const setupSwagger = (app: Express) => {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument),
  );
};
