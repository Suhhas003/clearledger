import { describe, it, expect } from 'vitest';
import { AccountType, PostingDirection } from '@prisma/client';
import {
  calculateReplayBalance,
  verifyLedgerInvariants,
} from '../lib/ledger/invariant';
import {
  InvalidAmountError,
  UnbalancedJournalError,
  SameAccountTransferError,
  CurrencyMismatchError,
  InsufficientFundsError,
} from '../lib/ledger/errors';
import { LedgerService, calculateNewBalance } from '../lib/ledger/ledger-service';

describe('Double-Entry Ledger Invariants & Mathematical Principles', () => {
  describe('Balance Replay Invariant (Historical Ledger Truth)', () => {
    it('correctly calculates replay balance for Liability / Customer deposit accounts (Credits - Debits)', () => {
      // Customer account starts with 0
      // Credit ₹5,000 (500000 cents), Debit ₹1,500 (150000 cents), Credit ₹500 (50000 cents)
      const postings = [
        { direction: PostingDirection.CREDIT, amount: 500000n },
        { direction: PostingDirection.DEBIT, amount: 150000n },
        { direction: PostingDirection.CREDIT, amount: 50000n },
      ];

      const expectedBalance = 500000n - 150000n + 50000n; // 400000n (₹4,000.00)
      const replay = calculateReplayBalance(AccountType.SAVINGS, postings);

      expect(replay).toBe(expectedBalance);
      expect(replay).toBe(400000n);
    });

    it('correctly calculates replay balance for Asset accounts (Debits - Credits)', () => {
      // System Vault (Asset account)
      const postings = [
        { direction: PostingDirection.DEBIT, amount: 1000000n }, // Inflow to vault
        { direction: PostingDirection.CREDIT, amount: 200000n }, // Outflow from vault
      ];

      const replay = calculateReplayBalance(AccountType.SYSTEM_VAULT, postings);
      expect(replay).toBe(800000n);
    });

    it('computes new balances without floating point distortion', () => {
      const current = 125050n; // ₹1,250.50
      const debit = 25050n; // ₹250.50

      const afterDebit = calculateNewBalance(AccountType.CURRENT, current, PostingDirection.DEBIT, debit);
      expect(afterDebit).toBe(100000n); // Exactly ₹1,000.00

      const afterCredit = calculateNewBalance(AccountType.CURRENT, afterDebit, PostingDirection.CREDIT, 50000n);
      expect(afterCredit).toBe(150000n); // Exactly ₹1,500.00
    });
  });

  describe('Journal Balance Invariant Verification', () => {
    it('verifies that a journal with balanced debits and credits has zero drift', async () => {
      // Mock db containing one balanced journal and matching account
      const mockJournal = {
        id: 'j-1',
        reference: 'TXN-20261008-001',
        postings: [
          { direction: PostingDirection.DEBIT, amount: 200000n },
          { direction: PostingDirection.CREDIT, amount: 200000n },
        ],
      };

      const mockDebtor = {
        id: 'acc-1',
        accountNumber: 'ACC001',
        iban: 'GB29CLRG04000400000001',
        type: AccountType.SAVINGS,
        balance: -200000n, // Net replay matches
        postings: [{ direction: PostingDirection.DEBIT, amount: 200000n }],
      };

      const mockCreditor = {
        id: 'acc-2',
        accountNumber: 'ACC002',
        iban: 'GB29CLRG04000400000002',
        type: AccountType.CURRENT,
        balance: 200000n,
        postings: [{ direction: PostingDirection.CREDIT, amount: 200000n }],
      };

      const fakeDb = {
        journalEntry: {
          findMany: async () => [mockJournal],
        },
        account: {
          findMany: async () => [mockDebtor, mockCreditor],
        },
      } as any;

      const result = await verifyLedgerInvariants(fakeDb);

      expect(result.healthy).toBe(true);
      expect(result.totalSystemDrift).toBe(0n);
      expect(result.unbalancedJournals.length).toBe(0);
      expect(result.inconsistentAccounts.length).toBe(0);
      expect(result.journalsChecked).toBe(1);
      expect(result.postingsChecked).toBe(2);
      expect(result.accountsChecked).toBe(2);
    });

    it('detects unbalanced journals where debits != credits', async () => {
      const unbalancedJournal = {
        id: 'j-err',
        reference: 'TXN-ERR',
        postings: [
          { direction: PostingDirection.DEBIT, amount: 200000n },
          { direction: PostingDirection.CREDIT, amount: 150000n }, // 50000n drift!
        ],
      };

      const fakeDb = {
        journalEntry: {
          findMany: async () => [unbalancedJournal],
        },
        account: {
          findMany: async () => [],
        },
      } as any;

      const result = await verifyLedgerInvariants(fakeDb);

      expect(result.healthy).toBe(false);
      expect(result.unbalancedJournals.length).toBe(1);
      expect(result.unbalancedJournals[0].drift).toBe(50000n);
      expect(result.totalSystemDrift).toBe(50000n);
    });

    it('detects materialized balance tampering (cache drift from ledger)', async () => {
      const tamperedAccount = {
        id: 'acc-tampered',
        accountNumber: 'ACC999',
        iban: 'GB29CLRG04000400000999',
        type: AccountType.SAVINGS,
        balance: 999999n, // Artificially inflated!
        postings: [
          { direction: PostingDirection.CREDIT, amount: 100000n }, // Actual ledger says 100000n
        ],
      };

      const fakeDb = {
        journalEntry: {
          findMany: async () => [],
        },
        account: {
          findMany: async () => [tamperedAccount],
        },
      } as any;

      const result = await verifyLedgerInvariants(fakeDb);

      expect(result.healthy).toBe(false);
      expect(result.inconsistentAccounts.length).toBe(1);
      expect(result.inconsistentAccounts[0].materializedBalance).toBe(999999n);
      expect(result.inconsistentAccounts[0].replayBalance).toBe(100000n);
      expect(result.inconsistentAccounts[0].drift).toBe(899999n);
    });
  });

  describe('Ledger Validation & Pre-Commit Guards', () => {
    const service = new LedgerService({} as any);

    it('rejects posting amounts <= 0n', () => {
      expect(() => {
        calculateNewBalance(AccountType.CURRENT, 100000n, PostingDirection.DEBIT, 0n);
      }).toThrow(InvalidAmountError);

      expect(() => {
        calculateNewBalance(AccountType.CURRENT, 100000n, PostingDirection.CREDIT, -500n);
      }).toThrow(InvalidAmountError);
    });

    it('rejects transfer with amount <= 0n immediately', async () => {
      await expect(
        service.transfer({
          debtorAccountId: 'acc-1',
          creditorAccountId: 'acc-2',
          amount: 0n,
          description: 'Zero amount transfer',
        })
      ).rejects.toThrow(InvalidAmountError);

      await expect(
        service.transfer({
          debtorAccountId: 'acc-1',
          creditorAccountId: 'acc-2',
          amount: -100n,
          description: 'Negative transfer',
        })
      ).rejects.toThrow(InvalidAmountError);
    });

    it('rejects same-account transfer immediately', async () => {
      await expect(
        service.transfer({
          debtorAccountId: 'acc-same',
          creditorAccountId: 'acc-same',
          amount: 10000n,
          description: 'Transfer to self',
        })
      ).rejects.toThrow(SameAccountTransferError);
    });

    it('rejects multi-legged journal post if unbalanced', async () => {
      await expect(
        service.postJournal({
          type: 'TRANSFER' as any,
          description: 'Unbalanced draft',
          postings: [
            { accountId: 'acc-1', direction: PostingDirection.DEBIT, amount: 100000n, currency: 'USD' },
            { accountId: 'acc-2', direction: PostingDirection.CREDIT, amount: 90000n, currency: 'USD' },
          ],
        })
      ).rejects.toThrow(UnbalancedJournalError);
    });
  });
});
