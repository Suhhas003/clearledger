import {
  PrismaClient,
  Prisma,
  Account,
  AccountStatus,
  AccountType,
  PostingDirection,
  EntryType,
} from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma';
import {
  JournalEntryDraft,
  TransferParams,
  TransferResult,
} from './types';
import {
  InvalidAmountError,
  AccountNotFoundError,
  AccountNotActiveError,
  InsufficientFundsError,
  CurrencyMismatchError,
  UnbalancedJournalError,
  SameAccountTransferError,
  LedgerInvariantViolationError,
} from './errors';

/**
 * Deterministically locks account rows in PostgreSQL using row-level locking
 * (SELECT ... FOR UPDATE).
 *
 * To avoid deadlocks between concurrent cross-account transactions, account IDs
 * are strictly sorted in lexicographical order and locked one by one.
 */
export async function lockAccountsForUpdate(
  tx: Prisma.TransactionClient,
  accountIds: string[]
): Promise<Map<string, Account>> {
  const uniqueSortedIds = Array.from(new Set(accountIds)).sort((a, b) =>
    a.localeCompare(b)
  );

  const lockedAccounts = new Map<string, Account>();

  for (const id of uniqueSortedIds) {
    const rows = await tx.$queryRaw<Account[]>`
      SELECT
        id,
        "userId",
        "accountNumber",
        iban,
        type,
        status,
        currency,
        balance,
        version,
        "createdAt",
        "updatedAt"
      FROM "Account"
      WHERE id = ${id}
      FOR UPDATE
    `;

    if (!rows || rows.length === 0) {
      throw new AccountNotFoundError(id);
    }

    lockedAccounts.set(id, rows[0]);
  }

  return lockedAccounts;
}

/**
 * Calculates new balance for an account given its type and posting direction.
 *
 * Accounting Rules:
 * - Customer Liabilities (SAVINGS, CURRENT, SYSTEM_CLEARING, SYSTEM_FEES):
 *   CREDIT increases balance; DEBIT decreases balance.
 * - Asset Accounts (SYSTEM_VAULT):
 *   DEBIT increases balance; CREDIT decreases balance.
 */
export function calculateNewBalance(
  accountType: AccountType,
  currentBalance: bigint,
  direction: PostingDirection,
  amount: bigint
): bigint {
  if (amount <= 0n) {
    throw new InvalidAmountError(
      'Posting amount must be strictly greater than 0.'
    );
  }

  if (accountType === AccountType.SYSTEM_VAULT) {
    return direction === PostingDirection.DEBIT
      ? currentBalance + amount
      : currentBalance - amount;
  }

  // Normal credit balance (Liabilities / Customer Deposit Accounts)
  return direction === PostingDirection.CREDIT
    ? currentBalance + amount
    : currentBalance - amount;
}

/**
 * Generates a unique transaction reference formatted as TXN-YYYYMMDD-XXXXXX
 */
export function generateTransactionReference(): string {
  const dateStr = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');

  const randomSuffix = Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();

  return `TXN-${dateStr}-${randomSuffix}`;
}

export class LedgerService {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  /**
   * Executes a transfer using an EXISTING Prisma transaction.
   *
   * IMPORTANT:
   * This method does NOT create its own $transaction().
   *
   * It allows TransferService to combine:
   *
   *   IdempotencyKey
   *   + JournalEntry
   *   + LedgerPostings
   *   + Account balances
   *
   * inside ONE PostgreSQL transaction.
   *
   * This closes the crash-consistency window between the ledger commit
   * and idempotency completion.
   */
  public async transferInTransaction(
    tx: Prisma.TransactionClient,
    params: TransferParams
  ): Promise<TransferResult> {
    const {
      debtorAccountId,
      creditorAccountId,
      amount,
      description,
    } = params;

    // 1. Validate amount
    if (amount <= 0n) {
      throw new InvalidAmountError(
        `Transfer amount must be strictly positive, received: ${amount}`
      );
    }

    // 2. Prevent self-transfer
    if (debtorAccountId === creditorAccountId) {
      throw new SameAccountTransferError(debtorAccountId);
    }

    // 3. Acquire deterministic row-level locks
    const lockedAccounts = await lockAccountsForUpdate(tx, [
      debtorAccountId,
      creditorAccountId,
    ]);

    const debtor = lockedAccounts.get(debtorAccountId)!;
    const creditor = lockedAccounts.get(creditorAccountId)!;

    // 4. Validate account statuses
    if (debtor.status !== AccountStatus.ACTIVE) {
      throw new AccountNotActiveError(
        debtor.id,
        debtor.status
      );
    }

    if (creditor.status !== AccountStatus.ACTIVE) {
      throw new AccountNotActiveError(
        creditor.id,
        creditor.status
      );
    }

    // 5. Validate currency compatibility
    if (debtor.currency !== creditor.currency) {
      throw new CurrencyMismatchError(
        debtor.currency,
        creditor.currency
      );
    }

    // 6. Validate sufficient funds
    if (debtor.balance < amount) {
      throw new InsufficientFundsError(
        debtor.balance,
        amount
      );
    }

    // 7. Calculate new balances
    const debtorNewBalance = debtor.balance - amount;
    const creditorNewBalance = creditor.balance + amount;

    // 8. Double-entry invariant
    const debitTotal = amount;
    const creditTotal = amount;

    if (debitTotal !== creditTotal) {
      throw new UnbalancedJournalError(
        debitTotal,
        creditTotal
      );
    }

    const reference =
      params.reference || generateTransactionReference();

    // 9. Create immutable JournalEntry
    const journalEntry = await tx.journalEntry.create({
      data: {
        reference,
        type: EntryType.TRANSFER,
        description:
          description ||
          `Transfer from ${debtor.accountNumber} to ${creditor.accountNumber}`,
        idempotencyId: params.idempotencyId,
        postedAt: new Date(),
      },
    });

    // 10. Create debtor DEBIT posting
    const debtorPosting = await tx.ledgerPosting.create({
      data: {
        journalEntryId: journalEntry.id,
        accountId: debtor.id,
        direction: PostingDirection.DEBIT,
        amount,
        currency: debtor.currency,
        balanceAfter: debtorNewBalance,
        sequence: 0,
      },
    });

    // 11. Create creditor CREDIT posting
    const creditorPosting = await tx.ledgerPosting.create({
      data: {
        journalEntryId: journalEntry.id,
        accountId: creditor.id,
        direction: PostingDirection.CREDIT,
        amount,
        currency: creditor.currency,
        balanceAfter: creditorNewBalance,
        sequence: 1,
      },
    });

    // 12. Update debtor materialized balance
    await tx.account.update({
      where: { id: debtor.id },
      data: {
        balance: debtorNewBalance,
        version: { increment: 1 },
      },
    });

    // 13. Update creditor materialized balance
    await tx.account.update({
      where: { id: creditor.id },
      data: {
        balance: creditorNewBalance,
        version: { increment: 1 },
      },
    });

   return {
  journalEntryId: journalEntry.id,
  reference: journalEntry.reference,
  debtorAccountId: debtor.id,
  creditorAccountId: creditor.id,
  amount,
  currency: debtor.currency,
  debtorBalanceAfter: debtorNewBalance,
  creditorBalanceAfter: creditorNewBalance,
  postedAt: journalEntry.postedAt,
};
  }

  /**
   * Executes an atomic internal transfer.
   *
   * This is the normal standalone ledger API.
   *
   * It creates its own transaction and delegates the actual transfer
   * implementation to transferInTransaction().
   */
  public async transfer(
    params: TransferParams
  ): Promise<TransferResult> {
    // Cheap validations before opening a transaction (helps with lightweight DB mocks)
    if (params.amount <= 0n) {
      throw new InvalidAmountError(
        `Transfer amount must be strictly positive, received: ${params.amount}`
      );
    }
    if (params.debtorAccountId === params.creditorAccountId) {
      throw new SameAccountTransferError(params.debtorAccountId);
    }
    return await this.db.$transaction(
      async (tx) => await this.transferInTransaction(tx, params),
      { timeout: 30000, maxWait: 10000 }
    );
  }

  /**
   * Commits a multi-legged journal entry draft ensuring double-entry balance.
   *
   * Requires:
   * - At least one DEBIT and at least one CREDIT.
   * - Total Debits === Total Credits.
   * - All amounts > 0n.
   * - Deterministic locking of all affected accounts.
   */
  public async postJournal(
    draft: JournalEntryDraft
  ): Promise<{
    journalEntryId: string;
    reference: string;
  }> {
    if (!draft.postings || draft.postings.length < 2) {
      throw new LedgerInvariantViolationError(
        'A journal entry must contain at least 2 postings.'
      );
    }

    let hasDebit = false;
    let hasCredit = false;
    let totalDebits = 0n;
    let totalCredits = 0n;

    for (const p of draft.postings) {
      if (p.amount <= 0n) {
        throw new InvalidAmountError(
          `Posting amount must be strictly greater than 0, received: ${p.amount}`
        );
      }

      if (p.direction === PostingDirection.DEBIT) {
        hasDebit = true;
        totalDebits += p.amount;
      } else if (p.direction === PostingDirection.CREDIT) {
        hasCredit = true;
        totalCredits += p.amount;
      }
    }

    if (!hasDebit || !hasCredit) {
      throw new LedgerInvariantViolationError(
        'A journal entry must contain at least one DEBIT and one CREDIT.'
      );
    }

    if (totalDebits !== totalCredits) {
      throw new UnbalancedJournalError(
        totalDebits,
        totalCredits
      );
    }

    const accountIds = draft.postings.map(
      (p) => p.accountId
    );

    return await this.db.$transaction(
      async (tx) => {
        const lockedAccounts = await lockAccountsForUpdate(
          tx,
          accountIds
        );

      // Verify all accounts are active
      for (const [id, account] of lockedAccounts) {
        if (account.status !== AccountStatus.ACTIVE) {
          throw new AccountNotActiveError(
            id,
            account.status
          );
        }
      }

      // Track running balance changes per account within this journal
      const balanceDeltas = new Map<string, bigint>();

      for (const [id, account] of lockedAccounts) {
        balanceDeltas.set(id, account.balance);
      }

      const reference =
        draft.reference || generateTransactionReference();

      const journalEntry = await tx.journalEntry.create({
        data: {
          reference,
          type: draft.type,
          description: draft.description,
          postedAt: new Date(),
        },
      });

      for (
        let i = 0;
        i < draft.postings.length;
        i++
      ) {
        const posting = draft.postings[i];

        const account =
          lockedAccounts.get(posting.accountId)!;

        const currentRunning =
          balanceDeltas.get(posting.accountId)!;

        const newRunning = calculateNewBalance(
          account.type,
          currentRunning,
          posting.direction,
          posting.amount
        );

        // Customer deposit accounts cannot become negative.
        if (
          (account.type === AccountType.SAVINGS ||
            account.type === AccountType.CURRENT) &&
          newRunning < 0n
        ) {
          throw new InsufficientFundsError(
            currentRunning,
            posting.amount
          );
        }

        balanceDeltas.set(
          posting.accountId,
          newRunning
        );

        await tx.ledgerPosting.create({
          data: {
            journalEntryId: journalEntry.id,
            accountId: posting.accountId,
            direction: posting.direction,
            amount: posting.amount,
            currency: posting.currency,
            balanceAfter: newRunning,
            sequence: i,
          },
        });
      }

      // Update materialized balances
      for (const [
        id,
        finalBalance,
      ] of balanceDeltas) {
        await tx.account.update({
          where: { id },
          data: {
            balance: finalBalance,
            version: { increment: 1 },
          },
        });
      }

      return {
        journalEntryId: journalEntry.id,
        reference,
      };
    },
    { timeout: 30000, maxWait: 10000 }
  );
  }
}