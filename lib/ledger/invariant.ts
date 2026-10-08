import { PrismaClient, Prisma, PostingDirection, AccountType } from '@prisma/client';
import { InvariantCheckResult, UnbalancedJournalDrift, InconsistentAccountDrift } from './types';

/**
 * Reconstructs the theoretical balance of an account from its immutable ledger postings.
 *
 * For Liability accounts (SAVINGS, CURRENT, SYSTEM_CLEARING, SYSTEM_FEES):
 *   Balance = SUM(Credits) - SUM(Debits)
 * For Asset accounts (SYSTEM_VAULT):
 *   Balance = SUM(Debits) - SUM(Credits)
 */
export function calculateReplayBalance(
  accountType: AccountType,
  postings: Array<{ direction: PostingDirection; amount: bigint }>
): bigint {
  let debits = 0n;
  let credits = 0n;

  for (const posting of postings) {
    if (posting.direction === PostingDirection.DEBIT) {
      debits += posting.amount;
    } else if (posting.direction === PostingDirection.CREDIT) {
      credits += posting.amount;
    }
  }

  if (accountType === AccountType.SYSTEM_VAULT) {
    // Normal debit balance (Asset)
    return debits - credits;
  }

  // Normal credit balance (Liability / Customer Deposit / Clearing)
  return credits - debits;
}

/**
 * Executes a comprehensive audit of the double-entry ledger.
 *
 * Checks:
 * 1. Journal Balance Invariant: For every JournalEntry, SUM(Debits) == SUM(Credits).
 * 2. Account Historical Replay Invariant: Account.balance == Replay from LedgerPosting.
 * 3. Total System Drift: Total discrepancy across all journals and accounts.
 *
 * @param prisma PrismaClient or Prisma.TransactionClient instance
 */
export async function verifyLedgerInvariants(
  prisma: PrismaClient | Prisma.TransactionClient
): Promise<InvariantCheckResult> {
  const journals = await prisma.journalEntry.findMany({
    include: {
      postings: true,
    },
    orderBy: { postedAt: 'asc' },
  });

  const accounts = await prisma.account.findMany({
    include: {
      postings: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const unbalancedJournals: UnbalancedJournalDrift[] = [];
  let totalJournalDrift = 0n;
  let totalPostingsChecked = 0;

  for (const journal of journals) {
    let debitSum = 0n;
    let creditSum = 0n;

    for (const posting of journal.postings) {
      totalPostingsChecked++;
      if (posting.direction === PostingDirection.DEBIT) {
        debitSum += posting.amount;
      } else if (posting.direction === PostingDirection.CREDIT) {
        creditSum += posting.amount;
      }
    }

    const diff = debitSum - creditSum;
    if (diff !== 0n) {
      const absDiff = diff < 0n ? -diff : diff;
      totalJournalDrift += absDiff;
      unbalancedJournals.push({
        journalId: journal.id,
        reference: journal.reference,
        debitSum,
        creditSum,
        drift: diff,
      });
    }
  }

  const inconsistentAccounts: InconsistentAccountDrift[] = [];
  let totalAccountDrift = 0n;

  for (const account of accounts) {
    const replayBalance = calculateReplayBalance(account.type, account.postings);
    const drift = account.balance - replayBalance;

    if (drift !== 0n) {
      const absDrift = drift < 0n ? -drift : drift;
      totalAccountDrift += absDrift;
      inconsistentAccounts.push({
        accountId: account.id,
        accountNumber: account.accountNumber,
        iban: account.iban,
        accountType: account.type,
        materializedBalance: account.balance,
        replayBalance,
        drift,
      });
    }
  }

  const totalSystemDrift = totalJournalDrift + totalAccountDrift;
  const isHealthy = unbalancedJournals.length === 0 && inconsistentAccounts.length === 0;

  return {
    healthy: isHealthy,
    journalsChecked: journals.length,
    postingsChecked: totalPostingsChecked,
    accountsChecked: accounts.length,
    totalSystemDrift,
    unbalancedJournals,
    inconsistentAccounts,
    checkedAt: new Date(),
  };
}
