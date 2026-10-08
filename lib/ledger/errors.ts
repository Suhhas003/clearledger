/**
 * ClearLedger Domain Error Definitions
 *
 * Strict financial errors preserving accounting boundaries and invariants.
 */

export abstract class LedgerError extends Error {
  public abstract readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidAmountError extends LedgerError {
  public readonly code = 'INVALID_AMOUNT';
  constructor(message: string = 'Amount must be a positive integer greater than zero (in minor currency units).') {
    super(message, 400);
  }
}

export class AccountNotFoundError extends LedgerError {
  public readonly code = 'ACCOUNT_NOT_FOUND';
  constructor(accountIdOrIban: string) {
    super(`Account not found: '${accountIdOrIban}'`, 404);
  }
}

export class AccountNotActiveError extends LedgerError {
  public readonly code = 'ACCOUNT_NOT_ACTIVE';
  constructor(accountId: string, status: string) {
    super(`Account '${accountId}' is not active (current status: ${status})`, 422);
  }
}

export class InsufficientFundsError extends LedgerError {
  public readonly code = 'INSUFFICIENT_FUNDS';
  public readonly availableBalance: bigint;
  public readonly requiredAmount: bigint;

  constructor(availableBalance: bigint, requiredAmount: bigint) {
    super(
      `Insufficient funds: available balance is ${availableBalance} minor units, but ${requiredAmount} is required.`,
      422
    );
    this.availableBalance = availableBalance;
    this.requiredAmount = requiredAmount;
  }
}

export class CurrencyMismatchError extends LedgerError {
  public readonly code = 'CURRENCY_MISMATCH';
  constructor(debtorCurrency: string, creditorCurrency: string) {
    super(`Currency mismatch: debtor account uses ${debtorCurrency}, but creditor account uses ${creditorCurrency}.`, 422);
  }
}

export class UnbalancedJournalError extends LedgerError {
  public readonly code = 'UNBALANCED_JOURNAL';
  public readonly totalDebits: bigint;
  public readonly totalCredits: bigint;

  constructor(totalDebits: bigint, totalCredits: bigint) {
    super(
      `Unbalanced journal entry: total debits (${totalDebits}) do not equal total credits (${totalCredits}). Double-entry invariant violated.`,
      500
    );
    this.totalDebits = totalDebits;
    this.totalCredits = totalCredits;
  }
}

export class LedgerInvariantViolationError extends LedgerError {
  public readonly code = 'LEDGER_INVARIANT_VIOLATION';
  constructor(message: string) {
    super(`Ledger invariant violation: ${message}`, 500);
  }
}

export class SameAccountTransferError extends LedgerError {
  public readonly code = 'SAME_ACCOUNT_TRANSFER';
  constructor(accountId: string) {
    super(`Cannot transfer money to the same account ('${accountId}')`, 400);
  }
}
