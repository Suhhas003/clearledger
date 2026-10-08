# ClearLedger — Core-Banking Double-Entry Ledger Engine

> **IMPORTANT DISCLAIMER**: ClearLedger is a reference educational core-banking platform. All accounts, balances, transactions, currencies, and IBANs are strictly virtual simulations. ClearLedger does **NOT** handle real-world fiat currency, connect to payment rails (SEPA, SWIFT, Fedwire), or operate as a licensed financial institution.

---

## 1. Project Overview

**ClearLedger** is an enterprise-grade, immutable double-entry ledger platform and core-banking engine built with Next.js 14 App Router, TypeScript, PostgreSQL, and Prisma. It is designed around the highest standards of financial computing:

- **Mathematical Equilibrium**: Strict double-entry accounting where every transaction consists of balanced debit and credit legs.
- **ACID Transaction Isolation**: Row-level pessimistic locking (`SELECT ... FOR UPDATE`) preventing race conditions, balance drift, and double-spending.
- **Cryptographic Idempotency**: Safe API retry guarantees with SHA-256 request payload hashing and atomic idempotency state transitions.
- **Server-Authoritative RBAC**: Role-based access control (`CUSTOMER`, `TELLER`, `ADMIN`) where the server strictly enforces account ownership and operational boundaries.
- **Real-Time Invariant Auditing**: Built-in verification engine that reconstructs account balances from the raw immutable ledger to prove zero system drift.
- **Fintech UI**: High-density monochromatic banking dashboard, responsive transaction ledger, and streamed PDF mini-statements.

---

## 2. Architecture & Design Principles

```
  +-------------------------------------------------------------+
  |                   ClearLedger Web UI                        |
  |    (Next.js 14 App Router, Server Components & React)       |
  +------------------------------+------------------------------+
                                 |
                                 v
  +-------------------------------------------------------------+
  |              Server-Side API Route Handlers                 |
  |  - Session Authentication & RBAC Verification (Auth.js)     |
  |  - Input Validation & Parameter Normalization               |
  |  - Strict Integer / BigInt Minor Units Conversion (Cents)   |
  +------------------------------+------------------------------+
                                 |
                                 v
  +-------------------------------------------------------------+
  |             TransferService & LedgerService                 |
  |  - Idempotency State Machine (PENDING -> COMPLETED / FAILED)|
  |  - Deterministic Account Row-Locking (ID-sorted FOR UPDATE) |
  |  - Pre-transfer Status & Currency Compatibility Checks      |
  |  - Materialized Balance Settlement & Invariant Maintenance  |
  +------------------------------+------------------------------+
                                 |
                                 v
  +-------------------------------------------------------------+
  |                  Supabase PostgreSQL                       |
  |   ACID Transaction: IdempotencyKey + JournalEntry +         |
  |   LedgerPostings + Account Balances committed together      |
  +-------------------------------------------------------------+
```

### Key Engineering Invariants
1. **No Floating-Point Arithmetic**: All monetary values are handled and stored as 64-bit integer minor units (`BigInt` cents). Floating-point arithmetic is strictly forbidden in calculation routines to prevent fractional penny drift.
2. **Immutable Audit Trail**: `JournalEntry` and `LedgerPosting` rows are append-only. Once written, a posting is never updated or deleted. Corrections are modeled via reversing journal entries.
3. **Atomic Idempotency Commitment**: The transition of an idempotency key from `PENDING` to `COMPLETED` is committed inside the **exact same** database transaction as the ledger postings. A crash or rollback never leaves a falsely completed idempotency record.

---

## 3. Technology Stack

- **Framework**: Next.js 14 (App Router, Server Components, Route Handlers)
- **Language**: TypeScript 5 (Strict Mode, Zero `any` in business logic)
- **Database**: PostgreSQL (Supabase with Transaction Pooler & Direct Connection)
- **ORM**: Prisma 6 (`@prisma/client`) with native PostgreSQL row locks
- **Authentication**: Auth.js (`next-auth` v4) with Credentials Provider & JWT Sessions
- **Password Hashing**: `bcryptjs`
- **Document Generation**: `pdfkit`
- **Styling**: Tailwind CSS (Monochromatic fintech dark aesthetic)
- **Testing**: Vitest 3 (Unit, Invariant, Concurrency, and Integration tests)
- **API Specification**: OpenAPI 3.1.0 (`/api/docs` and `docs/openapi.yaml`)
- **Deployment**: Vercel Serverless & GitHub Actions CI

---

## 4. Double-Entry Accounting Principles

In ClearLedger, money cannot be created or destroyed within a transfer; it can only move between accounts.

### Account Classifications
- **Liabilities (`SAVINGS`, `CURRENT`, `SYSTEM_CLEARING`, `SYSTEM_FEES`)**:
  - Credit increases balance (`+`)
  - Debit decreases balance (`-`)
  - `Balance = SUM(Credits) - SUM(Debits)`
- **Assets (`SYSTEM_VAULT`)**:
  - Debit increases balance (`+`)
  - Credit decreases balance (`-`)
  - `Balance = SUM(Debits) - SUM(Credits)`

### Mathematical Invariants Enforced on Every Journal Entry
$$\sum \text{Debits} = \sum \text{Credits}$$

Whenever a transfer of \$50.00 occurs between Customer A and Customer B:
1. Debtor account (Customer A) is **debited** \$50.00 (5,000 cents).
2. Creditor account (Customer B) is **credited** \$50.00 (5,000 cents).
3. The sum of debits (5,000) equals the sum of credits (5,000).
4. Both materialized account balances and running balance snapshots (`balanceAfter`) update synchronously inside the ACID transaction.

---

## 5. Idempotency & Retry Safety

To guarantee safe execution across unstable network connections, network timeouts, and duplicate client submissions, ClearLedger implements a strict idempotency state machine:

1. **Header Identification**: The client provides an optional `Idempotency-Key` (UUIDv4) header.
2. **Deterministic Hash**: The server computes a SHA-256 hash of the request payload (`fromAccountId`, `toAccountId`, `amount`, `currency`, `description`).
3. **Scope**: Idempotency is uniquely scoped by `(userId, endpoint, key)`.
4. **First Request**: Creates an `IdempotencyKey` record in `PENDING` status.
5. **Atomic Commit**: If the transfer succeeds, the journal entry, postings, balance updates, and idempotency status update to `COMPLETED` are committed in **one single PostgreSQL transaction**.
6. **Identical Retry**: Returns the cached original HTTP 201 response with the `Idempotent-Replayed: true` header without touching the ledger.
7. **Payload Conflict**: If the same key is sent with a different payload, the API returns **HTTP 422 Unprocessable Entity**.
8. **Concurrent In-Flight Requests**: If an identical request arrives while the first is still `PENDING`, the API returns **HTTP 409 Conflict**.
9. **Transaction Rollback**: If the transfer fails (e.g. insufficient funds), the idempotency record is marked `FAILED` in a separate transaction, ensuring failed transactions never block subsequent attempts.

---

## 6. Authentication & Role-Based Access Control (RBAC)

ClearLedger implements server-authoritative role-based security:

| Role | Permissions |
|---|---|
| **CUSTOMER** | View and manage own accounts; originate transfers from owned accounts; view transaction history involving owned accounts; download monthly PDF statements for owned accounts. |
| **TELLER** | View all accounts; originate transfers across any customer accounts on behalf of clients; view all system transaction journals; download statements. |
| **ADMIN** | Full system privileges; run system-wide mathematical invariant audits (`/api/invariant/verify`); global account and transaction oversight. |

### Security Guarantees
- Client-supplied `x-user-id` headers or form roles are **never trusted**.
- Account ownership is enforced via session verification against the database in every route handler.
- Password hashes use standard bcrypt salt rounds.
- NextAuth session cookies are `HttpOnly` and `SameSite`.

---

## 7. Invariant Verification Engine

ClearLedger includes an automated auditing engine (`lib/ledger/invariant.ts`) accessible to administrators via `GET /api/invariant/verify`:

1. **Journal Equilibrium Check**: Scans all journal entries in the database and verifies that $\sum \text{Debits} - \sum \text{Credits} = 0$.
2. **Historical Balance Replay**: Queries all immutable ledger postings from the dawn of time for every account, recalculates theoretical balances according to account types, and verifies parity against the materialized `Account.balance`.
3. **System Drift Calculation**: Measures total absolute drift across the entire system. In a healthy state, total drift is exactly \$0.00.

---

## 8. PDF Mini-Statements

The `/api/statements/[accountId]?month=YYYY-MM` endpoint generates downloadable audited PDF statements using `pdfkit`:
- Computes opening balance by replaying historical postings up to the first moment of the target month.
- Lists each posting within the calendar month with date, debit, credit, and running balance.
- Computes and verifies the closing balance.
- Streams the generated PDF directly with `Content-Disposition: attachment; filename=...`.

---

## 9. Local Setup & Installation

### Prerequisites
- Node.js 18+ (Node.js 20 LTS recommended)
- npm 9+
- PostgreSQL database (local or Supabase)

### Step 1: Clone and Install
```bash
cd clearledger
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your database connection string and NextAuth secret.

### Step 3: Run Prisma Migrations
```bash
npx prisma db push
```

### Step 4: Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 10. Environment Variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL pooled connection string (port 6543 on Supabase) | `postgresql://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | PostgreSQL direct session string (port 5432 on Supabase) | `postgresql://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:5432/postgres` |
| `NEXTAUTH_URL` | Canonical URL of the application | `http://localhost:3000` or `https://clearledger.vercel.app` |
| `NEXTAUTH_SECRET` | 32+ character random secret for JWT signing | Generate with `openssl rand -base64 32` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (optional) | `https://[REF].supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Supabase anonymous API key (optional) | `eyJ...` |

---

## 11. Verification & Testing

ClearLedger includes an extensive Vitest suite covering double-entry accounting, row locking, race conditions, idempotency, and security.

### Run TypeScript Typecheck
```bash
npx tsc --noEmit
```

### Run Vitest Test Suite
```bash
npx vitest run
```
**Test Coverage Includes:**
- `tests/transfer.test.ts`: Debit/credit balance updates, insufficient funds rollback, currency compatibility, frozen account rejection.
- `tests/concurrency.test.ts`: Racing transfers against the same account proving prevention of double-spending via row locks.
- `tests/idempotency.test.ts`: Cached retries, 422 payload mismatches, concurrent race idempotency claims, failed rollback safety.
- `tests/auth-security.test.ts`: Unauthenticated rejection (401), cross-user transfer prevention (403), teller/admin delegation, header injection protection.
- `tests/invariant-verification.test.ts`: Admin audit authorization and equilibrium proof.
- `tests/iban.test.ts`: ISO 13616 and ISO 7064 MOD-97-10 virtual IBAN check digit verification.
- `tests/ledger-invariants.test.ts`: Pure unit invariant verification.

### Run Production Build
```bash
npm run build
```

---

## 12. Deployment on Vercel

ClearLedger is configured for zero-configuration serverless deployment on Vercel:

1. **Push Repository**: Push the code to your GitHub/GitLab repository.
2. **Import into Vercel**: Create a new project in the Vercel Dashboard and link your repository.
3. **Configure Build Settings**:
   - Framework Preset: `Next.js`
   - Build Command: `prisma generate && next build` (configured in `vercel.json` and `package.json`)
4. **Set Environment Variables**:
   In the Vercel Dashboard under **Project Settings &rarr; Environment Variables**, configure:
   - `DATABASE_URL` (Supabase transaction pooler URL with `?pgbouncer=true`)
   - `DIRECT_URL` (Supabase direct connection URL)
   - `NEXTAUTH_SECRET` (Secure random string)
   - `NEXTAUTH_URL` (Your production Vercel URL, e.g. `https://your-domain.vercel.app`)
5. **Deploy**: Trigger deployment. The application will build, generate Prisma Client, and deploy serverless App Router endpoints.

---

## 13. API Documentation & OpenAPI Specification

Full OpenAPI 3.1.0 documentation is maintained in [`docs/openapi.yaml`](file:///c:/Users/Suhas/clearledger/docs/openapi.yaml). The interactive schema is also available at the `/api/docs` route.

### Summary of Endpoints

| Method | Endpoint | Description | Access |
|---|---|---|---|
| `POST` | `/api/auth/[...nextauth]` | Authenticate credentials and manage sessions | Public |
| `GET` | `/api/accounts` | List accounts | Authenticated |
| `POST` | `/api/accounts` | Create new SAVINGS/CURRENT account | Authenticated |
| `GET` | `/api/accounts/:id` | Get account details and recent postings | Authorized Owner / Staff |
| `POST` | `/api/transfers` | Execute double-entry transfer with `Idempotency-Key` | Authorized Owner / Staff |
| `GET` | `/api/transactions` | Paginated newest-first transaction journals | Authorized Owner / Staff |
| `GET` | `/api/statements/:accountId` | Download monthly PDF mini-statement | Authorized Owner / Staff |
| `GET` | `/api/invariant/verify` | Verify mathematical equilibrium & zero drift | ADMIN Only |
| `GET` | `/api/docs` | OpenAPI 3.1.0 schema specification | Public |
