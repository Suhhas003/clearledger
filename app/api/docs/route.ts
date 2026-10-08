import { NextResponse } from 'next/server';

export async function GET() {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'ClearLedger Core-Banking API',
      version: '1.0.0',
      description:
        'Production-grade double-entry core-banking ledger engine API. Uses virtual money and virtual IBANs.',
    },
    paths: {
      '/api/auth/[...nextauth]': {
        post: { summary: 'Authenticate via NextAuth credentials' },
        get: { summary: 'Get active session or CSRF token' },
      },
      '/api/accounts': {
        get: { summary: 'List accounts for authenticated user' },
        post: { summary: 'Create new SAVINGS or CURRENT account' },
      },
      '/api/accounts/{id}': {
        get: { summary: 'Get account details and recent ledger postings' },
      },
      '/api/transfers': {
        post: { summary: 'Execute atomic double-entry transfer with idempotency' },
      },
      '/api/transactions': {
        get: { summary: 'Query paginated newest-first transaction journals' },
      },
      '/api/statements/{accountId}': {
        get: { summary: 'Download monthly PDF mini-statement' },
      },
      '/api/invariant/verify': {
        get: { summary: 'Run system-wide ledger invariant verification (ADMIN only)' },
      },
    },
  };

  return NextResponse.json(spec);
}
