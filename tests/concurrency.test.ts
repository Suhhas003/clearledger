import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, AccountStatus, AccountType, EntryType, PostingDirection } from '@prisma/client';
import { randomUUID } from 'crypto';
import { LedgerService } from '../lib/ledger/ledger-service';
import { InsufficientFundsError } from '../lib/ledger/errors';
import { generateVirtualIBAN } from '../lib/iban';
import { verifyLedgerInvariants } from '../lib/ledger/invariant';

const hasPostgres = Boolean(process.env.DATABASE_URL);

function uniqueAccountNumber(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}

function uniqueVirtualIBAN(): string {
  const accNum = Math.floor(10000000 + Math.random() * 89999999);
  return generateVirtualIBAN({ accountNumber: accNum });
}

describe.skipIf(!hasPostgres)('Concurrency & Double-Spending Protection (PostgreSQL Row Locks)', () => {
  let prisma: PrismaClient;
  let ledgerService: LedgerService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    ledgerService = new LedgerService(prisma);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('prevents double spending when two transfers race to spend the same funds', async () => {
    const testUser = await prisma.user.create({
      data: {
        email: `race-${randomUUID()}@clearledger.internal`,
        name: 'Race Condition Test User',
      },
    });

    // Create system vault account for funding
    const vaultAccount = await prisma.account.create({
      data: {
        accountNumber: uniqueAccountNumber('VAULT-RACE'),
        iban: uniqueVirtualIBAN(),
        type: AccountType.SYSTEM_VAULT,
        status: AccountStatus.ACTIVE,
        currency: 'USD',
        balance: 0n,
      },
    });

    // Create debtor with starting balance 0n
    const debtor = await prisma.account.create({
      data: {
        userId: testUser.id,
        accountNumber: uniqueAccountNumber('RACE-D'),
        iban: uniqueVirtualIBAN(),
        type: AccountType.CURRENT,
        status: AccountStatus.ACTIVE,
        currency: 'USD',
        balance: 0n,
      },
    });

    const creditor1 = await prisma.account.create({
      data: {
        userId: testUser.id,
        accountNumber: uniqueAccountNumber('RACE-C1'),
        iban: uniqueVirtualIBAN(),
        type: AccountType.SAVINGS,
        status: AccountStatus.ACTIVE,
        currency: 'USD',
        balance: 0n,
      },
    });

    const creditor2 = await prisma.account.create({
      data: {
        userId: testUser.id,
        accountNumber: uniqueAccountNumber('RACE-C2'),
        iban: uniqueVirtualIBAN(),
        type: AccountType.SAVINGS,
        status: AccountStatus.ACTIVE,
        currency: 'USD',
        balance: 0n,
      },
    });

    // Seed debtor with exactly $100.00 (10000 cents) through a balanced double-entry deposit
    await ledgerService.postJournal({
      type: EntryType.DEPOSIT,
      description: 'Initial funding for concurrency test',
      postings: [
        {
          accountId: vaultAccount.id,
          direction: PostingDirection.DEBIT,
          amount: 10000n,
          currency: 'USD',
        },
        {
          accountId: debtor.id,
          direction: PostingDirection.CREDIT,
          amount: 10000n,
          currency: 'USD',
        },
      ],
    });

    // Both transfers request $70.00 (7000 cents). Total requested = $140.00 > $100.00 available!
    const transferAmount = 7000n;

    const [tx1Result, tx2Result] = await Promise.allSettled([
      ledgerService.transfer({
        debtorAccountId: debtor.id,
        creditorAccountId: creditor1.id,
        amount: transferAmount,
        description: 'Concurrent race transfer 1',
      }),
      ledgerService.transfer({
        debtorAccountId: debtor.id,
        creditorAccountId: creditor2.id,
        amount: transferAmount,
        description: 'Concurrent race transfer 2',
      }),
    ]);

    // Exactly one must succeed, and exactly one must fail with InsufficientFundsError
    const fulfilled = [tx1Result, tx2Result].filter((r) => r.status === 'fulfilled');
    const rejected = [tx1Result, tx2Result].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const failureReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(failureReason).toBeInstanceOf(InsufficientFundsError);

    // Verify debtor's final balance is exactly $30.00 (10000 - 7000 = 3000)
    const finalDebtor = await prisma.account.findUnique({ where: { id: debtor.id } });
    expect(finalDebtor?.balance).toBe(3000n);

    // Verify full ledger invariant holds
    const invariant = await verifyLedgerInvariants(prisma);
    expect(invariant.healthy).toBe(true);
  });
});
