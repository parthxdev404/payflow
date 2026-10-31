# PayFlow

A backend-first, multi-vendor commerce and payment platform built with
**Node.js, TypeScript, Express, PostgreSQL, Prisma, Redis, and
Razorpay**.

PayFlow is designed around the core workflows of a marketplace: user
authentication, role-based access, vendor product management, customer
shopping flows, order processing, and payment integration. The project
emphasizes maintainable backend structure, security, validation,
observability, automated tests, and CI.

> **Project status:** Core backend workflows and payment integration
> have been implemented. The GitHub Actions CI pipeline is passing,
> including Prisma generation and migrations, TypeScript checks,
> automated tests, and the production build.

------------------------------------------------------------------------

## Contents

-   [Overview](#overview)
-   [Features](#features)
-   [Technology stack](#technology-stack)
-   [Architecture](#architecture)
-   [Core backend concepts](#core-backend-concepts)
-   [Payments](#payments)
-   [Caching](#caching)
-   [API documentation](#api-documentation)
-   [Getting started](#getting-started)
-   [Environment variables](#environment-variables)
-   [Database workflow](#database-workflow)
-   [Testing](#testing)
-   [CI pipeline](#ci-pipeline)
-   [Logging and error handling](#logging-and-error-handling)
-   [Repository structure](#repository-structure)
-   [Security notes](#security-notes)

------------------------------------------------------------------------

## Overview

PayFlow is a REST API for a multi-vendor commerce application.

The backend separates responsibilities into focused modules and layers.
Express handles HTTP routing and middleware, service logic handles
application rules, Prisma provides database access, PostgreSQL stores
relational application data, Redis supports product-detail caching, and
Razorpay provides payment processing.

The project is built with a learning-through-engineering approach: each
feature is implemented with attention to its data model, request
lifecycle, validation, authorization, failure cases, and tests.

## Features

### Authentication and access control

-   User registration and login
-   Password hashing with bcrypt
-   Access-token and refresh-token authentication
-   HTTP-only authentication cookies
-   Refresh-token persistence and session handling
-   Logout and authenticated-user lookup
-   Role-based access control for customer, vendor, and admin workflows
-   Authentication and authorization middleware

### Marketplace and products

-   Vendor-owned product management
-   Product creation and input validation
-   Vendor-scoped slug uniqueness
-   Product activation and archival lifecycle
-   Product detail retrieval
-   Product listing, search, and pagination
-   Ownership checks for vendor operations

### Shopping and commerce

-   Customer cart and order workflows
-   Multi-vendor commerce domain
-   Order and payment integration

The exact request paths and payload contracts should be taken from the
current Express routers and schemas. See [API
documentation](#api-documentation).

### Payments

-   Razorpay integration
-   Payment initiation and verification workflows
-   Payment reconciliation support
-   Webhook-related configuration
-   Automated tests using mocked Razorpay interactions

### Platform and developer experience

-   PostgreSQL relational database
-   Prisma ORM and migrations
-   Redis-backed product-detail cache
-   Zod request validation
-   Pino application logging
-   Centralized error handling
-   Swagger/OpenAPI documentation
-   Automated tests
-   GitHub Actions CI

------------------------------------------------------------------------

## Technology stack

  Area                Technology
  ------------------- -------------------------------------
  Runtime             Node.js
  Language            TypeScript
  HTTP framework      Express 5
  Database            PostgreSQL 18
  ORM                 Prisma 7
  Cache               Redis
  Redis client        ioredis
  Validation          Zod
  Authentication      JWT-based access and refresh tokens
  Password hashing    bcrypt
  Payments            Razorpay
  Logging             Pino
  API documentation   Swagger / OpenAPI
  Testing             Vitest and Supertest
  CI                  GitHub Actions

------------------------------------------------------------------------

## Architecture

PayFlow follows a layered backend structure. A typical request moves
through the following stages:

``` text
Client
  |
  v
Express application
  |
  v
Router
  |
  v
Middleware
  |-- Request identification / logging
  |-- Authentication
  |-- Authorization
  |-- Request validation
  |
  v
Controller
  |
  v
Service / business logic
  |-- Prisma --------------------> PostgreSQL
  |-- Cache utility ------------> Redis
  |-- Payment integration ------> Razorpay
  |
  v
HTTP response
```

### Responsibilities

-   **Routes:** Declare HTTP methods, paths, and middleware order.
-   **Middleware:** Handle cross-cutting concerns such as
    authentication, authorization, validation, request context, and
    errors.
-   **Controllers:** Translate HTTP requests into service calls and
    shape HTTP responses.
-   **Services:** Implement business rules and coordinate database,
    cache, and external-service operations.
-   **Prisma:** Provides typed database access and schema-driven
    migrations.
-   **Redis utilities:** Encapsulate cache reads, writes, and
    invalidation.
-   **Central error handler:** Converts application errors into
    consistent HTTP responses.
-   **Pino:** Provides structured application logs.

### Design principles

-   Keep HTTP concerns separate from business logic.
-   Validate untrusted request data at the API boundary.
-   Enforce authorization on the server, not in the client.
-   Use database constraints and transactions where data consistency
    requires them.
-   Treat external payment-provider responses as untrusted until
    verified.
-   Test both successful and failure paths.

------------------------------------------------------------------------

## Core backend concepts

### Authentication versus authorization

Authentication answers **who is making the request?** The authentication
middleware validates the access token and attaches the authenticated
identity to the request context.

Authorization answers **what is this user allowed to do?** The
authorization middleware checks the user's role or permissions before
allowing access to a protected operation.

A valid login does not automatically grant permission to perform every
operation.

### Request validation

Zod schemas validate request data before it reaches business logic.
Invalid input should be rejected at the API boundary rather than being
allowed to cause unpredictable database or service errors.

### Refresh-token sessions

PayFlow uses access and refresh tokens. Access tokens are short-lived
credentials used to access protected endpoints. Refresh tokens support
session renewal and are persisted so sessions can be managed and
revoked.

Authentication cookies are configured as HTTP-only cookies. Production
cookie settings must be aligned with the deployed frontend/API origins
and HTTPS configuration.

### Product ownership

Vendor operations must verify ownership of the target product. A vendor
must not be able to update or archive another vendor's product merely by
supplying its ID.

------------------------------------------------------------------------

## Payments

PayFlow integrates with Razorpay for payment processing.

The intended payment lifecycle is:

1.  The authenticated customer initiates a payment for an application
    order.
2.  The backend creates or initiates the corresponding Razorpay payment
    order using server-side credentials.
3.  The client completes the payment through the payment provider's
    checkout flow.
4.  The backend verifies the payment details and provider signature
    before treating the payment as verified.
5.  Reconciliation logic can be used to compare application payment
    state with provider state.
6.  Webhook handling can support asynchronous provider events when
    configured and enabled.

**Important:** Never trust a client-side success screen as proof of
payment. The backend must verify provider data and maintain a consistent
relationship between the application order and payment record.

Razorpay credentials belong in environment variables and must never be
committed to the repository.

------------------------------------------------------------------------

## Caching

Redis is used for product-detail caching.

The current product-detail cache key follows this pattern:

``` text
product:{id}
```

The product detail cache uses a **300-second (5-minute) TTL**.

The cache-aside flow is:

1.  Check Redis for the product detail.
2.  If a cached value exists, return it.
3.  If not, load the product from PostgreSQL.
4.  Store the result in Redis with the configured TTL.
5.  Return the product response.

Product mutations invalidate the corresponding product cache entry so
stale product details are not kept after updates, activation changes, or
archival.

Cache helpers are centralized in the cache utility rather than
scattering Redis commands throughout controllers.

Redis is an optimization, not the source of truth. PostgreSQL remains
the persistent source of application data.

------------------------------------------------------------------------

## API documentation

Swagger/OpenAPI documentation is served by the running API at:

``` text
http://localhost:5000/api-docs
```

Open this URL after starting the application to inspect the registered
endpoints, request schemas, parameters, and response documentation.

### API areas

The backend includes these functional areas:

  -----------------------------------------------------------------------
  Area                                Purpose
  ----------------------------------- -----------------------------------
  Authentication                      Registration, login, logout,
                                      refresh/session and current-user
                                      operations

  Products                            Vendor product management, product
                                      details, search and pagination

  Cart                                Customer shopping-cart operations

  Orders                              Order lifecycle and order-related
                                      operations

  Payments                            Payment initiation, verification
                                      and reconciliation
  -----------------------------------------------------------------------

The exact route paths, HTTP methods, request bodies, and response
formats are defined by the current router and Swagger definitions. Use
the live Swagger page as the source of truth rather than relying on
guessed endpoint names.

### Authentication when calling protected APIs

1.  Register or log in through the authentication API.
2.  Preserve the authentication cookies returned by the API.
3.  Send the access cookie with protected requests.
4.  Use the refresh flow when the access token expires, according to the
    API documentation.
5.  Log out to revoke the session.

For browser-based clients, configure credential handling and CORS
origins consistently. Do not expose HTTP-only token cookies to frontend
JavaScript.

------------------------------------------------------------------------

## Getting started

### Prerequisites

Install the following before running PayFlow:

-   Node.js 22
-   npm
-   PostgreSQL 18
-   Redis
-   Git

You will also need Razorpay test credentials to exercise
payment-provider flows.

### 1. Clone the repository

``` bash
git clone https://github.com/parthxdev404/payflow.git
cd payflow
```

If the repository URL changes, use the current clone URL shown on the
GitHub repository page.

### 2. Install dependencies

``` bash
npm ci
```

### 3. Configure environment variables

Create a local `.env` file using the variable names in the [Environment
variables](#environment-variables) section.

Do not commit `.env`. Use `.env.example` for safe placeholder values if
you maintain one.

### 4. Start PostgreSQL and Redis

Make sure both services are running and that the connection strings in
`.env` point to the correct instances.

### 5. Generate Prisma Client

``` bash
npx prisma generate
```

### 6. Apply database migrations

``` bash
npx prisma migrate deploy
```

For local development where you are actively creating migrations, use
the Prisma migration workflow configured for the project. Do not use
production migration commands as a substitute for creating and reviewing
schema migrations.

### 7. Start the API

Use the development script defined in `package.json`. The API has been
run locally on port `5000` in the current project setup.

``` bash
npm run dev
```

If your `package.json` uses a different development script, follow that
script instead.

### 8. Open API documentation

``` text
http://localhost:5000/api-docs
```

------------------------------------------------------------------------

## Environment variables

Create a `.env` file in the project root. The following names are used
by the current project/CI configuration; confirm any additional
variables in the application configuration before deployment.

  ----------------------------------------------------------------------------------------------------
  Variable                    Purpose                 Example / guidance
  --------------------------- ----------------------- ------------------------------------------------
  `NODE_ENV`                  Runtime environment     `development`

  `PORT`                      API port                `5000`

  `DATABASE_URL`              PostgreSQL connection   `postgresql://USER:PASSWORD@HOST:5432/payflow`
                              string                  

  `REDIS_URL`                 Redis connection string `redis://localhost:6379` or a TLS Redis URL

  `JWT_ACCESS_SECRET`         Access-token signing    Use a long, random secret
                              secret                  

  `JWT_ACCESS_EXPIRESIN`      Access-token lifetime   `15m`

  `RAZORPAY_KEY_ID`           Razorpay key ID         Use a test key locally

  `RAZORPAY_KEY_SECRET`       Razorpay API secret     Keep private

  `RAZORPAY_WEBHOOK_SECRET`   Webhook signature       Keep private
                              secret                  

  `FRONTEND_URL`              Allowed frontend origin e.g. `http://localhost:5173`

  `LOG_LEVEL`                 Pino log level          `debug`, `info`, `warn`, `error`, or `silent`
  ----------------------------------------------------------------------------------------------------

Example local values (replace credentials and hosts with your own):

``` dotenv
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/payflow
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=replace-with-a-long-random-secret
JWT_ACCESS_EXPIRESIN=15m
RAZORPAY_KEY_ID=your_razorpay_test_key_id
RAZORPAY_KEY_SECRET=your_razorpay_test_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=debug
```

If your Redis provider requires TLS, use the TLS connection URL supplied
by that provider. Never paste real secrets into README files, source
code, screenshots, issue reports, or commits.

------------------------------------------------------------------------

## Database workflow

Prisma is used to define the relational schema and manage database
migrations.

Common commands:

``` bash
# Generate the Prisma Client
npx prisma generate

# Apply committed migrations
npx prisma migrate deploy

# Open Prisma Studio (if included in the installed Prisma setup)
npx prisma studio
```

The CI pipeline applies committed migrations against a clean PostgreSQL
service. This helps ensure the schema can be created consistently from
the repository's migration history.

Before changing the schema:

1.  Update the Prisma schema.
2.  Create and review a migration using the project's development
    migration workflow.
3.  Regenerate Prisma Client.
4.  Update the affected service logic and tests.
5.  Verify the migration against a clean database.

------------------------------------------------------------------------

## Testing

PayFlow uses automated tests with Vitest and Supertest.

Run the test suite:

``` bash
npm test
```

The integration tests exercise important API behavior, including
authentication, access control, product workflows, validation, and cache
behavior.

Tests that depend on external providers should use controlled test
doubles/mocks rather than real payment transactions.

For integration tests, ensure the required PostgreSQL and Redis services
are available and the test environment variables are configured.

------------------------------------------------------------------------

## CI pipeline

GitHub Actions runs the PayFlow CI workflow on pushes and pull requests.

The workflow currently checks:

1.  Repository checkout
2.  Node.js 22 setup
3.  Dependency installation with `npm ci`
4.  Prisma Client generation
5.  Database migrations against PostgreSQL 18
6.  TypeScript validation with `npx tsc --noEmit`
7.  Automated tests with `npm test`
8.  Production build with `npm run build`

PostgreSQL and Redis run as temporary GitHub Actions service containers.
CI uses test-only credentials and does not need access to the
developer's local database or Redis Cloud instance.

------------------------------------------------------------------------

## Logging and error handling

PayFlow uses Pino for structured application logging and centralized
error handling.

The backend uses a consistent error-handling path so that errors from
routes, middleware, services, and asynchronous operations can be handled
centrally.

Good operational practices:

-   Use structured logs with useful context.
-   Avoid logging passwords, tokens, payment secrets, or other sensitive
    data.
-   Use an appropriate log level for each environment.
-   Return safe error messages to clients; keep internal stack traces in
    server logs only.
-   Include request context when diagnosing production issues.

------------------------------------------------------------------------

## Repository structure

The application is organized by backend responsibility and feature
modules. The following is a conceptual guide; use the current repository
tree for exact filenames.

``` text
payflow/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── config/          # Environment and external-service configuration
│   ├── middlewares/     # Authentication, authorization, validation and errors
│   ├── modules/         # Feature routes, controllers, schemas and services
│   ├── utils/           # Shared utilities, including cache helpers
│   └── ...              # Application bootstrap and shared code
├── tests/               # API and integration tests
├── .github/
│   └── workflows/
│       └── ci.yml
├── prisma7.config.ts
├── package.json
└── README.md
```

------------------------------------------------------------------------

## Security notes

-   Never commit `.env` or production credentials.
-   Use strong, unique secrets for JWT signing and payment-provider
    configuration.
-   Keep authentication cookies HTTP-only and configure `Secure` and
    `SameSite` appropriately for the deployment topology.
-   Validate request bodies, query parameters, and route parameters.
-   Enforce role and resource ownership checks on the backend.
-   Verify payment signatures server-side.
-   Use HTTPS in production.
-   Apply least-privilege database credentials.
-   Avoid logging secrets or sensitive personal/payment information.
-   Rotate any credential that may have been exposed.

------------------------------------------------------------------------

## Author

**Parth Sharma**

-   GitHub: [@parthxdev404](https://github.com/parthxdev404)
-   LinkedIn: [parthh-sharma](https://linkedin.com/in/parthh-sharma)
-   Portfolio: [parthxdev.co.in](https://parthxdev.co.in)

------------------------------------------------------------------------

## License

Add a `LICENSE` file and specify the chosen license here before
presenting the repository as an openly licensed project.
