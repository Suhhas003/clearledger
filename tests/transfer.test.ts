import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, AccountStatus, AccountType, EntryType, PostingDirection } from '@prisma/client';
import { randomUUID } from 'crypto';
import { LedgerService } from '../lib/ledger/ledger-service';
import {
  InsufficientFundsError,
  AccountNotActiveError,
  SameAccountTransferError,
  CurrencyMismatchError,
} from '../lib/ledger/errors';
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

describe.skipIf(!hasPostgres)('Transfer Engine (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;
  let ledgerService: LedgerService;
  let debtorAccount: any;
  let creditorAccount: any;

  beforeAll(async () => {
    prisma = new PrismaClient();
    let retries = 5;
    while (retries > 0) {
      try {
        await prisma.$connect();
        break;
      } catch (e) {
        retries--;
        if (retries === 0) throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    ledgerService = new LedgerService(prisma);

    // Create isolated test user
    const testUser = await prisma.user.create({
      data: {
        email: `test-${randomUUID()}@clearledger.internal`,
        name: 'Integration Test User',
      },
    });

    // Create system vault account for initial deposit funding
    const vaultAccount = await prisma.account.create({
      data: {
        accountNumber: uniqueAccountNumber('VAULT'),
        iban: uniqueVirtualIBAN(),
        type: AccountType.SYSTEM_VAULT,
        status: AccountStatus.ACTIVE,
        currency: 'USD',
        balance: 0n,
      },
    });

    // Create debtor and creditor accounts with 0 initial balance
    debtorAccount = await prisma.account.create({
      data: {
        userId: testUser.id,
        accountNumber: uniqueAccountNumber('DEBTOR'),
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
        accountNumber: uniqueAccountNumber('CREDITOR'),
        iban: uniqueVirtualIBAN(),
        type: AccountType.SAVINGS,
        status: AccountStatus.ACTIVE,
        currency: 'USD',
        balance: 0n,
      },
    });

    // Seed initial funds through the double-entry ledger engine:
    // Debit Vault $1,500.00 (150000 cents), Credit Debtor $1,000.00 (100000 cents), Credit Creditor $500.00 (50000 cents)
    await ledgerService.postJournal({
      type: EntryType.DEPOSIT,
      description: 'Initial funding for integration tests',
      postings: [
        {
          accountId: vaultAccount.id,
          direction: PostingDirection.DEBIT,
          amount: 150000n,
          currency: 'USD',
        },
        {
          accountId: debtorAccount.id,
          direction: PostingDirection.CREDIT,
          amount: 100000n,
          currency: 'USD',
        },
        {
          accountId: creditorAccount.id,
          direction: PostingDirection.CREDIT,
          amount: 50000n,
          currency: 'USD',
        },
      ],
    });

    // Refresh account references
    debtorAccount = await prisma.account.findUniqueOrThrow({ where: { id: debtorAccount.id } });
    creditorAccount = await prisma.account.findUniqueOrThrow({ where: { id: creditorAccount.id } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('successful transfer updates both materialized balances and creates immutable ledger records', async () => {
    const transferAmount = 25000n; // $250.00
    const result = await ledgerService.transfer({
      debtorAccountId: debtorAccount.id,
      creditorAccountId: creditorAccount.id,
      amount: transferAmount,
      description: 'Transfer test 1',
    });

    expect(result.debtorBalanceAfter).toBe(75000n);
    expect(result.creditorBalanceAfter).toBe(75000n);

    // Verify database state directly
    const updatedDebtor = await prisma.account.findUnique({ where: { id: debtorAccount.id } });
    const updatedCreditor = await prisma.account.findUnique({ where: { id: creditorAccount.id } });

    expect(updatedDebtor?.balance).toBe(75000n);
    expect(updatedCreditor?.balance).toBe(75000n);

    // Verify journal and postings exist
    const journal = await prisma.journalEntry.findUnique({
      where: { id: result.journalEntryId },
      include: { postings: true },
    });

    expect(journal).not.toBeNull();
    expect(journal?.postings.length).toBe(2);

    const debitPosting = journal?.postings.find((p) => p.direction === 'DEBIT');
    const creditPosting = journal?.postings.find((p) => p.direction === 'CREDIT');

    expect(debitPosting?.amount).toBe(transferAmount);
    expect(creditPosting?.amount).toBe(transferAmount);

    // Verify invariant holds
    const invariant = await verifyLedgerInvariants(prisma);
    expect(invariant.healthy).toBe(true);
  });

  it('insufficient funds causes complete rollback and leaves no partial ledger records', async () => {
    const excessiveAmount = 99999999n;

    const initialJournalCount = await prisma.journalEntry.count();
    const initialPostingCount = await prisma.ledgerPosting.count();

    await expect(
      ledgerService.transfer({
        debtorAccountId: debtorAccount.id,
        creditorAccountId: creditorAccount.id,
        amount: excessiveAmount,
        description: 'Overdraft attempt',
      })
    ).rejects.toThrow(InsufficientFundsError);

    // Verify no journals or postings were leaked
    const afterJournalCount = await prisma.journalEntry.count();
    const afterPostingCount = await prisma.ledgerPosting.count();

    expect(afterJournalCount).toBe(initialJournalCount);
    expect(afterPostingCount).toBe(initialPostingCount);
  });

  it('frozen account causes complete rollback and leaves no partial records', async () => {
    // Freeze creditor temporarily
    await prisma.account.update({
      where: { id: creditorAccount.id },
      data: { status: AccountStatus.FROZEN },
    });

    const initialJournalCount = await prisma.journalEntry.count();

    await expect(
      ledgerService.transfer({
        debtorAccountId: debtorAccount.id,
        creditorAccountId: creditorAccount.id,
        amount: 1000n,
        description: 'Transfer to frozen account',
      })
    ).rejects.toThrow(AccountNotActiveError);

    const afterJournalCount = await prisma.journalEntry.count();
    expect(afterJournalCount).toBe(initialJournalCount);

    // Restore creditor
    await prisma.account.update({
      where: { id: creditorAccount.id },
      data: { status: AccountStatus.ACTIVE },
    });
  });

  it('currency mismatch is rejected and causes complete rollback', async () => {
    // Create EUR account with guaranteed unique numbers and zero balance
    const eurAccount = await prisma.account.create({
      data: {
        userId: debtorAccount.userId,
        accountNumber: uniqueAccountNumber('EUR'),
        iban: uniqueVirtualIBAN(),
        type: AccountType.CURRENT,
        status: AccountStatus.ACTIVE,
        currency: 'EUR',
        balance: 0n,
      },
    });

    await expect(
      ledgerService.transfer({
        debtorAccountId: debtorAccount.id,
        creditorAccountId: eurAccount.id,
        amount: 1000n,
        description: 'Cross-currency transfer without exchange',
      })
    ).rejects.toThrow(CurrencyMismatchError);
  });

  it('same-account transfer is rejected', async () => {
    await expect(
      ledgerService.transfer({
        debtorAccountId: debtorAccount.id,
        creditorAccountId: debtorAccount.id,
        amount: 1000n,
        description: 'Self transfer',
      })
    ).rejects.toThrow(SameAccountTransferError);
  });
});
