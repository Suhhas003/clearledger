import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, AccountStatus, AccountType, EntryType, PostingDirection, IdempotencyStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { TransferService } from '../lib/ledger/transfer-service';
import { LedgerService } from '../lib/ledger/ledger-service';
import { generateVirtualIBAN } from '../lib/iban';
import { verifyLedgerInvariants } from '../lib/ledger/invariant';
import {
  IdempotencyConflictError,
  IdempotencyPayloadMismatchError,
} from '../lib/idempotency/errors';
import { InsufficientFundsError } from '../lib/ledger/errors';

const hasPostgres = Boolean(process.env.DATABASE_URL);

function uniqueAccountNumber(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}

function uniqueVirtualIBAN(): string {
  const accNum = Math.floor(10000000 + Math.random() * 89999999);
  return generateVirtualIBAN({ accountNumber: accNum });
}

describe.skipIf(!hasPostgres)('Idempotency & Retry-Safe Transfers (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;
  let transferService: TransferService;
  let ledgerService: LedgerService;
  let testUser: any;
  let debtorAccount: any;
  let creditorAccount: any;

  beforeAll(async () => {
    prisma = new PrismaClient();
    transferService = new TransferService(prisma);
    ledgerService = new LedgerService(prisma);

    testUser = await prisma.user.create({
      data: {
        email: `idempotency-test-${randomUUID()}@clearledger.internal`,
        name: 'Idempotency Test User',
      },
    });

    const vault = await prisma.account.create({
      data: {
        accountNumber: uniqueAccountNumber('VAULT-IDEM'),
        iban: uniqueVirtualIBAN(),
        type: AccountType.SYSTEM_VAULT,
        status: AccountStatus.ACTIVE,
        currency: 'USD',
        balance: 0n,
      },
    });

    debtorAccount = await prisma.account.create({
      data: {
        userId: testUser.id,
        accountNumber: uniqueAccountNumber('IDEM-D'),
        iban: uniqueVirtualIBAN(),
        type: AccountType.CURRENT,
        status: AccountStatus.ACTIVE,
        currency: 'USD',
        balance: 0n,
      },
    });

    creditorAccount = await prisma.account.create({
      data: {
        userId: testUser.id,
        accountNumber: uniqueAccountNumber('IDEM-C'),
        iban: uniqueVirtualIBAN(),
        type: AccountType.SAVINGS,
        status: AccountStatus.ACTIVE,
        currency: 'USD',
        balance: 0n,
      },
    });

    // Seed debtor with $2,000.00 (200000 cents) via balanced ledger entry
    await ledgerService.postJournal({
      type: EntryType.DEPOSIT,
      description: 'Initial funding for idempotency integration tests',
      postings: [
        {
          accountId: vault.id,
          direction: PostingDirection.DEBIT,
          amount: 200000n,
          currency: 'USD',
        },
        {
          accountId: debtorAccount.id,
          direction: PostingDirection.CREDIT,
          amount: 200000n,
          currency: 'USD',
        },
      ],
    });

    debtorAccount = await prisma.account.findUniqueOrThrow({ where: { id: debtorAccount.id } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('first request succeeds and an exact retry returns the cached original response without creating new ledger records', async () => {
    const key = `idem-${randomUUID()}`;
    const transferAmount = 25000n; // $250.00

    // Initial counts
    const initialJournals = await prisma.journalEntry.count();
    const initialPostings = await prisma.ledgerPosting.count();

    // 1. First execution
    const firstResponse = await transferService.transfer({
      userId: testUser.id,
      idempotencyKey: key,
      endpoint: '/api/transfers',
      fromAccountId: debtorAccount.id,
      toAccountId: creditorAccount.id,
      amount: transferAmount,
      description: 'First attempt with idempotency key',
    });

    expect(firstResponse.isReplay).toBe(false);
    expect(firstResponse.statusCode).toBe(201);
    expect(firstResponse.data.success).toBe(true);
    expect(firstResponse.data.transaction.reference).toBeDefined();

    const journalsAfterFirst = await prisma.journalEntry.count();
    const postingsAfterFirst = await prisma.ledgerPosting.count();
    expect(journalsAfterFirst).toBe(initialJournals + 1);
    expect(postingsAfterFirst).toBe(initialPostings + 2);

    // 2. Exact retry with same idempotency key and same payload
    const retryResponse = await transferService.transfer({
      userId: testUser.id,
      idempotencyKey: key,
      endpoint: '/api/transfers',
      fromAccountId: debtorAccount.id,
      toAccountId: creditorAccount.id,
      amount: transferAmount,
      description: 'First attempt with idempotency key',
    });

    expect(retryResponse.isReplay).toBe(true);
    expect(retryResponse.statusCode).toBe(201);
    expect(retryResponse.data.success).toBe(true);
    // Verifies exact cached response equality
    expect(retryResponse.data.transaction.journalEntryId).toBe(
      firstResponse.data.transaction.journalEntryId
    );
    expect(retryResponse.data.transaction.reference).toBe(
      firstResponse.data.transaction.reference
    );

    // 3. Verify NO second JournalEntry or LedgerPostings were created
    const journalsAfterRetry = await prisma.journalEntry.count();
    const postingsAfterRetry = await prisma.ledgerPosting.count();
    expect(journalsAfterRetry).toBe(journalsAfterFirst);
    expect(postingsAfterRetry).toBe(postingsAfterFirst);

    // Verify debtor balance was deducted only ONCE
    const debtorLatest = await prisma.account.findUniqueOrThrow({ where: { id: debtorAccount.id } });
    expect(debtorLatest.balance).toBe(175000n); // 200000 - 25000
  });

  it('rejects same idempotency key with a different request payload with HTTP 422', async () => {
    const key = `idem-mismatch-${randomUUID()}`;

    // First request
    await transferService.transfer({
      userId: testUser.id,
      idempotencyKey: key,
      endpoint: '/api/transfers',
      fromAccountId: debtorAccount.id,
      toAccountId: creditorAccount.id,
      amount: 10000n,
      description: 'Original payload',
    });

    // Mismatched request with different amount
    await expect(
      transferService.transfer({
        userId: testUser.id,
        idempotencyKey: key,
        endpoint: '/api/transfers',
        fromAccountId: debtorAccount.id,
        toAccountId: creditorAccount.id,
        amount: 20000n, // Different amount!
        description: 'Original payload',
      })
    ).rejects.toThrow(IdempotencyPayloadMismatchError);
  });

  it('concurrent requests using the same idempotency key result in exactly one transfer', async () => {
    const raceKey = `idem-race-${randomUUID()}`;
    const raceAmount = 15000n; // $150.00

    const initialJournals = await prisma.journalEntry.count();

    // Fire 2 concurrent requests with identical key and payload
    const [req1, req2] = await Promise.allSettled([
      transferService.transfer({
        userId: testUser.id,
        idempotencyKey: raceKey,
        endpoint: '/api/transfers',
        fromAccountId: debtorAccount.id,
        toAccountId: creditorAccount.id,
        amount: raceAmount,
        description: 'Concurrent idempotency test',
      }),
      transferService.transfer({
        userId: testUser.id,
        idempotencyKey: raceKey,
        endpoint: '/api/transfers',
        fromAccountId: debtorAccount.id,
        toAccountId: creditorAccount.id,
        amount: raceAmount,
        description: 'Concurrent idempotency test',
      }),
    ]);

    // One must succeed as new or replay. The other may receive 409 Conflict or cached replay
    const results = [req1, req2];
    const successes = results.filter((r) => r.status === 'fulfilled');
    const conflicts = results.filter(
      (r) => r.status === 'rejected' && (r as PromiseRejectedResult).reason instanceof IdempotencyConflictError
    );

    // Exactly one journal entry was created
    const finalJournals = await prisma.journalEntry.count();
    expect(finalJournals).toBe(initialJournals + 1);

    expect(successes.length + conflicts.length).toBe(2);
    expect(successes.length).toBeGreaterThanOrEqual(1);
  });

  it('failed transfer does not become COMPLETED in the idempotency table', async () => {
    const failKey = `idem-fail-${randomUUID()}`;
    const excessiveAmount = 99999999n;

    await expect(
      transferService.transfer({
        userId: testUser.id,
        idempotencyKey: failKey,
        endpoint: '/api/transfers',
        fromAccountId: debtorAccount.id,
        toAccountId: creditorAccount.id,
        amount: excessiveAmount,
        description: 'Will fail due to insufficient funds',
      })
    ).rejects.toThrow(InsufficientFundsError);

    // Verify key status in database is NOT COMPLETED
    const keyRecord = await prisma.idempotencyKey.findUnique({
      where: {
        userId_endpoint_key: {
          userId: testUser.id,
          endpoint: '/api/transfers',
          key: failKey,
        },
      },
    });

    expect(keyRecord).not.toBeNull();
    expect(keyRecord?.status).toBe(IdempotencyStatus.FAILED);
    expect(keyRecord?.status).not.toBe(IdempotencyStatus.COMPLETED);
  });

  it('ledger invariants remain completely balanced and healthy after all idempotency tests', async () => {
    const invariant = await verifyLedgerInvariants(prisma);
    expect(invariant.healthy).toBe(true);
    expect(invariant.totalSystemDrift).toBe(0n);
    expect(invariant.unbalancedJournals.length).toBe(0);
    expect(invariant.inconsistentAccounts.length).toBe(0);
  });
});
