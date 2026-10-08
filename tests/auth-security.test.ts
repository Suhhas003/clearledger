// auth-security.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/transfers/route';
import { NextRequest } from 'next/server';
import { getCurrentUser as getCurrentUserReal } from '@/lib/session';

// Mock getCurrentUser to control authentication
vi.mock('@/lib/session', async () => {
  const actual = await vi.importActual('@/lib/session');
  return {
    ...actual,
    getCurrentUser: vi.fn(),
  };
});

import { getCurrentUser } from '@/lib/session';

async function makeRequest(body: any, headers: Record<string, string> = {}) {
  const req = new Request('http://localhost/api/transfers', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  return await POST(req);
}

describe('Transfer API security', () => {
  let customerUser: any;
  let tellerUser: any;
  let adminUser: any;
  let otherUser: any;
  let customerAccount: any;
  let otherAccount: any;

  beforeAll(async () => {
    const { LedgerService } = await import('@/lib/ledger/ledger-service');
    const { AccountType, AccountStatus, EntryType, PostingDirection } = await import('@prisma/client');
    const { generateVirtualIBAN } = await import('@/lib/iban');
    const { randomUUID } = await import('crypto');

    const ledgerService = new LedgerService(prisma);

    // Create users with different roles
    const uid = randomUUID().slice(0, 8);
    customerUser = await prisma.user.create({ data: { email: `cust-${uid}@example.com`, name: 'Cust', role: 'CUSTOMER' } });
    tellerUser = await prisma.user.create({ data: { email: `teller-${uid}@example.com`, name: 'Teller', role: 'TELLER' } });
    adminUser = await prisma.user.create({ data: { email: `admin-${uid}@example.com`, name: 'Admin', role: 'ADMIN' } });
    otherUser = await prisma.user.create({ data: { email: `other-${uid}@example.com`, name: 'Other', role: 'CUSTOMER' } });

    const vaultAccount = await prisma.account.create({
      data: {
        accountNumber: `VAULT-${randomUUID().slice(0, 10).toUpperCase()}`,
        iban: generateVirtualIBAN({ accountNumber: Math.floor(10000000 + Math.random() * 89999999) }),
        type: AccountType.SYSTEM_VAULT,
        status: AccountStatus.ACTIVE,
        currency: 'USD',
        balance: 0n,
      },
    });

    // Accounts with 0 initial balance
    customerAccount = await prisma.account.create({
      data: {
        userId: customerUser.id,
        accountNumber: `CUST-${randomUUID().slice(0, 10).toUpperCase()}`,
        iban: generateVirtualIBAN({ accountNumber: Math.floor(10000000 + Math.random() * 89999999) }),
        type: AccountType.CURRENT,
        status: AccountStatus.ACTIVE,
        currency: 'USD',
        balance: 0n,
      },
    });
    otherAccount = await prisma.account.create({
      data: {
        userId: otherUser.id,
        accountNumber: `OTHER-${randomUUID().slice(0, 10).toUpperCase()}`,
        iban: generateVirtualIBAN({ accountNumber: Math.floor(10000000 + Math.random() * 89999999) }),
        type: AccountType.CURRENT,
        status: AccountStatus.ACTIVE,
        currency: 'USD',
        balance: 0n,
      },
    });

    // Seed initial funds properly through double-entry ledger engine
    await ledgerService.postJournal({
      type: EntryType.DEPOSIT,
      description: 'Seed funds for auth security tests',
      postings: [
        {
          accountId: vaultAccount.id,
          direction: PostingDirection.DEBIT,
          amount: 200000n,
          currency: 'USD',
        },
        {
          accountId: customerAccount.id,
          direction: PostingDirection.CREDIT,
          amount: 100000n,
          currency: 'USD',
        },
        {
          accountId: otherAccount.id,
          direction: PostingDirection.CREDIT,
          amount: 100000n,
          currency: 'USD',
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects unauthenticated transfer with 401', async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    const resp = await makeRequest({ fromAccountId: customerAccount.id, toAccountId: otherAccount.id, amount: '1000' });
    expect(resp.status).toBe(401);
  });

  it('CUSTOMER cannot transfer from another user account (403)', async () => {
    (getCurrentUser as any).mockResolvedValue({ id: customerUser.id, role: 'CUSTOMER' });
    const resp = await makeRequest({ fromAccountId: otherAccount.id, toAccountId: customerAccount.id, amount: '1000' });
    expect(resp.status).toBe(403);
  });

  it('CUSTOMER can transfer from own account (200)', async () => {
    (getCurrentUser as any).mockResolvedValue({ id: customerUser.id, role: 'CUSTOMER' });
    const resp = await makeRequest({ fromAccountId: customerAccount.id, toAccountId: otherAccount.id, amount: '500' });
    expect(resp.status).toBe(201);
    const data = await resp.json();
    expect(data.transaction || data).toHaveProperty('journalEntryId');
  });

  it('client‑supplied x‑user‑id header does not bypass auth (403 for CUSTOMER)', async () => {
    (getCurrentUser as any).mockResolvedValue({ id: customerUser.id, role: 'CUSTOMER' });
    const resp = await makeRequest({ fromAccountId: otherAccount.id, toAccountId: customerAccount.id, amount: '500' }, { 'x-user-id': customerUser.id });
    expect(resp.status).toBe(403);
  });

  it('TELLER can transfer from any account (200)', async () => {
    (getCurrentUser as any).mockResolvedValue({ id: tellerUser.id, role: 'TELLER' });
    const resp = await makeRequest({ fromAccountId: otherAccount.id, toAccountId: customerAccount.id, amount: '500' });
    expect(resp.status).toBe(201);
  });

  it('ADMIN can transfer from any account (200)', async () => {
    (getCurrentUser as any).mockResolvedValue({ id: adminUser.id, role: 'ADMIN' });
    const resp = await makeRequest({ fromAccountId: otherAccount.id, toAccountId: customerAccount.id, amount: '500' });
    expect(resp.status).toBe(201);
  });
});
