# RN FinTech Backend

A Node.js + Express backend for a FinTech platform, using Prisma ORM and PostgreSQL. Features include user auth, loan management, KYC, bank/loan type admin, and audit logging.

## Features

- User signup/login with JWT authentication
- Role-based access (CUSTOMER, MERCHANT, BANKER, ADMIN)
- Loan application, approval, analytics
- KYC document upload (Cloudinary), review, and verification
- Bank and loan type management (admin)
- Audit logging for all critical actions

## Getting Started

### 1. Clone and Install

```powershell
git clone <your-repo-url>
cd Backend
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your secrets:

```powershell
cp .env.example .env
# Edit .env with your DB, JWT, and Cloudinary credentials
```

### 3. Database Setup

Run migrations and seed test data:

```powershell
npm run db:migrate
node scripts/seed-integration.js
```

### 4. Start the Server

```powershell
npm run dev
# or for production
npm start
```

Server runs at `http://localhost:3000/api/v1` by default.

## Loan Workflow (Quickstart)

1. Seed integration data (LoanType + sample users)

- Merchant: integration.merchant@example.com / Password123!
- Banker: integration.banker@example.com / Password123!
- Customer: integration.customer@example.com / Password123!

The seed prints the `loanTypeId` to use.

2. Start the server

```powershell
node src/server.js
```

3. Run the E2E loan flow (optional)

This runs: merchant login → apply (self) → banker login → assign → approve → verify status.

```powershell
node scripts/test-loan-flow.js
```

4. Postman collection

Import `postman/backend-loans-collection.json` and use environment `postman/backend-auth-environment.json`.
Set `loanTypeId` in the environment (seed output). Then run requests in order.

Notes:

- Loan metadata is validated against `LoanType.schema` using AJV. Update schemas in Prisma to add/change fields without code changes.
- Direct document uploads: use `/api/v1/uploads/sign` then `/api/v1/uploads/loan/:id/register` after Cloudinary upload.

### Development quickstart (recommended)

If you're developing locally it's helpful to run Redis for rate-limits and lockouts, and to enable dev email logging so verification links are printed to the server log.

Start Redis (PowerShell):

```powershell
# Run a Redis container locally
docker run -p 6379:6379 -d --name rn-redis redis:7
```

Set env variables (copy `.env.example` -> `.env`) and then optionally enable dev email logging:

```powershell
# Example: enable dev email link printing (no external email provider required)
$env:DEV_SEND_EMAIL = 'true'
npm run dev
```

Run the e2e helper (in another terminal) after starting the server:

```powershell
# Load .env and run the runner
node -r dotenv/config scripts/e2e-runner.js
```

Postman:

- Import `postman/backend-auth-collection.json` and `postman/backend-auth-environment.json` and point `baseUrl` to `http://localhost:3000/api/v1`.

Cloudinary (file uploads):

- Provide the following env variables in your `.env` for signed uploads:
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
- Client flow: request signature from `GET /api/v1/uploads/sign?folder=rnfintech/loans/<loanId>&public_id=<name>` and then upload directly to Cloudinary using the returned `apiKey`, `signature`, and `timestamp`.

### 5. Run Integration Test

With the server running:

```powershell
node scripts/integration-test.js
```

## Developer Tools

### Linting & Formatting

We use ESLint and Prettier. Install deps then run:

```powershell
npm run lint
npm run format
```

### Seeds and E2E Loan Test

```powershell
npm run seed:integration
npm run test:loan
```

### Metrics

Basic Prometheus metrics are exposed at:

- GET `http://localhost:3000/api/v1/metrics`

Includes default Node metrics plus:

- http_requests_total{method,route,status_code}
- http_request_duration_seconds_bucket/sum/count

### Correlation IDs

Each request gets an `X-Request-Id` header and `req.id` for log correlation. You can also supply your own `X-Request-Id`.

## Key Endpoints

- `POST /api/v1/auth/signup` — Register
- `POST /api/v1/auth/login` — Login
- `POST /api/v1/loan/apply` — Apply for loan
- `POST /api/v1/loan/:id/approve` — Approve loan (BANKER)
- `POST /api/v1/kyc/upload-url` — Get Cloudinary signature
- `GET /api/v1/loan-types` — List loan types

## Project Structure

- `src/routes/` — Express routers
- `src/controllers/` — Thin HTTP handlers
- `src/services/` — Business logic, Prisma access
- `src/middleware/` — Auth, error, logging
- `src/utils/` — JWT, validation
- `prisma/` — DB schema and migrations
- `scripts/` — Seed and test scripts

## Development Notes

- All DB access via Prisma in services
- All input validated with Joi
- Errors handled by `src/middleware/errorHandler.js`
- Logs in `logs/` and `src/logs/`
- Sensitive files (`.env`, logs) are gitignored

## Troubleshooting

- If migrations fail, check your `DATABASE_URL` and Postgres is running
- For Cloudinary errors, check your API keys and folder config
- For JWT errors, ensure `JWT_SECRET` is set in `.env`

## License

MIT
