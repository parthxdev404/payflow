import swaggerUi from "swagger-ui-express";
import type { Express } from "express";
import type { OpenAPIV3 } from "openapi-types";

const swaggerDocument: OpenAPIV3.Document = {
  openapi: "3.0.3",

  info: {
    title: "PayFlow API",
    version: "1.0.0",
    description:
      "API documentation for PayFlow, a multi-vendor order and payment platform.",
  },

  servers: [
    {
      url: "http://localhost:3000",
      description: "Local development server",
    },
  ],

  tags: [
    { name: "Health", description: "Application health checks" },
    { name: "Auth", description: "Registration, login and authentication" },
    { name: "Products", description: "Product management" },
    { name: "Cart", description: "Customer cart operations" },
    { name: "Orders", description: "Order and checkout operations" },
    { name: "Payments", description: "Payment initiation and reconciliation" },
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
    },
  },

  paths: {
    "/health/live": {
      get: {
        tags: ["Health"],
        summary: "Check whether the application is running",
        responses: {
          "200": {
            description: "Application is running",
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
            description: "Validation failed",
          },
          "409": {
            description: "Email already exists",
          },
          "429": {
            description: "Too many registration attempts",
          },
        },
      },
    },

    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in to PayFlow",
        description:
          "Authenticates a user and establishes the authentication cookies.",
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
            description: "Validation failed",
          },
          "401": {
            description: "Invalid email or password",
          },
          "429": {
            description: "Too many login attempts",
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
            description: "Authentication required or access token invalid",
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
            description: "Authentication required",
          },
          "403": {
            description: "Insufficient role permissions",
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
            description: "Refresh token missing, invalid or expired",
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
        },
      },
    },
  },
};

export const setupSwagger = (app: Express) => {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
};
