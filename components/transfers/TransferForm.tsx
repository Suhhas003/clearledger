'use client';

import React, { useState } from 'react';
import { AccountData } from '@/components/accounts/AccountCard';
import { formatMinorUnits } from '@/lib/format';
import { formatIBAN } from '@/lib/iban';

interface TransferFormProps {
  accounts: AccountData[];
  defaultFromAccountId?: string;
  onSuccess?: () => void;
}

export function TransferForm({
  accounts,
  defaultFromAccountId,
  onSuccess,
}: TransferFormProps) {
  const [fromAccountId, setFromAccountId] = useState(
    defaultFromAccountId || accounts[0]?.id || ''
  );
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any | null>(null);

  const selectedDebtorAccount = accounts.find((a) => a.id === fromAccountId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessResult(null);

    // Client-side pre-validation
    if (!fromAccountId) {
      setError('Source account is required.');
      return;
    }
    if (!toAccountId.trim()) {
      setError('Destination account identifier is required.');
      return;
    }
    if (fromAccountId === toAccountId.trim()) {
      setError('Source and destination accounts must be distinct.');
      return;
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Transfer amount must be greater than 0.');
      return;
    }

    // Check debtor account balance if available
    if (selectedDebtorAccount) {
      const balanceCents = BigInt(selectedDebtorAccount.balance);
      const inputCents = BigInt(Math.round(numericAmount * 100));
      if (inputCents > balanceCents) {
        setError(
          `Insufficient funds. Current balance: ${formatMinorUnits(
            selectedDebtorAccount.balance,
            selectedDebtorAccount.currency
          )}`
        );
        return;
      }
    }

    setLoading(true);

    try {
      // Generate a fresh UUIDv4 idempotency key for this transfer attempt
      const idempotencyKey = crypto.randomUUID();

      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          fromAccountId,
          toAccountId: toAccountId.trim(),
          amount: amount.trim(),
          currency: selectedDebtorAccount?.currency || 'USD',
          description: description.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setError('Session expired or unauthenticated. Please log in.');
        } else if (res.status === 403) {
          setError('Access denied: You do not have permission to transfer from this account.');
        } else if (res.status === 409) {
          setError('Idempotency conflict: A transfer with this key is already in progress.');
        } else if (res.status === 422) {
          setError(`Transfer rejected: ${data.error || 'Payload mismatch or validation error.'}`);
        } else {
          setError(data.error || `Transfer failed with status ${res.status}`);
        }
        return;
      }

      // Success
      setSuccessResult(data.transaction || data);
      setAmount('');
      setDescription('');
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Network error while executing transfer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-6">
      <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-neutral-200 mb-4 pb-3 border-b border-neutral-800">
        Execute Double-Entry Transfer
      </h3>

      {error && (
        <div className="mb-5 p-3 rounded bg-rose-950/30 border border-rose-900/60 text-xs font-mono text-rose-300">
          {error}
        </div>
      )}

      {successResult && (
        <div className="mb-5 p-4 rounded bg-emerald-950/20 border border-emerald-900/60 text-xs font-mono text-emerald-300 space-y-2">
          <div className="font-bold text-emerald-400">Transfer Completed Successfully</div>
          <div>Reference: {successResult.reference || successResult.journalEntryId}</div>
          <div>
            Debtor Balance After:{' '}
            {formatMinorUnits(successResult.fromBalanceAfter || '0', successResult.currency)}
          </div>
          <div>
            Creditor Balance After:{' '}
            {formatMinorUnits(successResult.toBalanceAfter || '0', successResult.currency)}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Source Account */}
        <div>
          <label className="block text-xs font-mono text-neutral-400 mb-1">
            Source Account (Debtor)
          </label>
          <select
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
            disabled={loading}
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-neutral-600"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.type} • {acc.accountNumber} ({formatIBAN(acc.iban)}) —{' '}
                {formatMinorUnits(acc.balance, acc.currency)}
              </option>
            ))}
          </select>
          {selectedDebtorAccount && (
            <p className="text-[11px] font-mono text-neutral-500 mt-1">
              Available Settled Balance:{' '}
              {formatMinorUnits(selectedDebtorAccount.balance, selectedDebtorAccount.currency)}
            </p>
          )}
        </div>

        {/* Destination Account */}
        <div>
          <label className="block text-xs font-mono text-neutral-400 mb-1">
            Destination Account ID / Number (Creditor)
          </label>
          {/* Quick select from own accounts if multiple exist */}
          {accounts.length > 1 && (
            <div className="mb-2">
              <span className="text-[10px] font-mono text-neutral-500 mr-2">Quick Select:</span>
              <div className="inline-flex flex-wrap gap-1">
                {accounts
                  .filter((a) => a.id !== fromAccountId)
                  .map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => setToAccountId(a.id)}
                      className="text-[11px] font-mono px-2 py-0.5 rounded border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                    >
                      {a.type} ({a.accountNumber})
                    </button>
                  ))}
              </div>
            </div>
          )}
          <input
            type="text"
            placeholder="Account ID (e.g. cmuzy...)"
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            disabled={loading}
            required
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-neutral-600"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-mono text-neutral-400 mb-1">
            Amount (USD)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-xs font-mono text-neutral-500">$</span>
            <input
              type="text"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={loading}
              required
              className="w-full bg-neutral-900 border border-neutral-800 rounded pl-7 pr-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-neutral-600"
            />
          </div>
          <p className="text-[10px] font-mono text-neutral-500 mt-1">
            Decimal dollars or minor units. Precision is strictly handled in integer cents on the backend.
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-mono text-neutral-400 mb-1">
            Description / Reference (Optional)
          </label>
          <input
            type="text"
            placeholder="Payment memo or reference"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={loading}
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-neutral-600"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 font-mono font-bold text-xs rounded transition-colors flex items-center justify-center space-x-2"
        >
          {loading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
              <span>COMMITTING TO ATOMIC LEDGER...</span>
            </>
          ) : (
            <span>AUTHORIZE & POST TRANSFER</span>
          )}
        </button>
      </form>
    </div>
  );
}
