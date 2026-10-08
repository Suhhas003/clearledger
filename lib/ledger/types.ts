import { EntryType, PostingDirection, AccountType } from '@prisma/client';

export interface PostingInstruction {
  accountId: string;
  direction: PostingDirection;
  amount: bigint; // In minor currency units (cents), strictly > 0n
  currency: string;
}

export interface JournalEntryDraft {
  reference?: string;
  type: EntryType;
  description: string;
  postings: PostingInstruction[];
}

export interface TransferParams {
  debtorAccountId: string;
  creditorAccountId: string;
  amount: bigint; // Minor currency units (e.g. 200000n for 2,000.00)
  description: string;
  reference?: string;
  idempotencyId?: string;
}

export interface TransferResult {
  journalEntryId: string;
  reference: string;
  debtorAccountId: string;
  creditorAccountId: string;
  amount: bigint;
  currency: string;
  debtorBalanceAfter: bigint;
  creditorBalanceAfter: bigint;
  postedAt: Date;
}

export interface InconsistentAccountDrift {
  accountId: string;
  accountNumber: string;
  iban: string;
  accountType: AccountType;
  materializedBalance: bigint;
  replayBalance: bigint;
  drift: bigint;
}

export interface UnbalancedJournalDrift {
  journalId: string;
  reference: string;
  debitSum: bigint;
  creditSum: bigint;
  drift: bigint;
}

export interface InvariantCheckResult {
  healthy: boolean;
  journalsChecked: number;
  postingsChecked: number;
  accountsChecked: number;
  totalSystemDrift: bigint; // 0n indicates perfect ledger conservation
  unbalancedJournals: UnbalancedJournalDrift[];
  inconsistentAccounts: InconsistentAccountDrift[];
  checkedAt: Date;
}
