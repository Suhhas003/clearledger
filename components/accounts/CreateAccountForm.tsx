'use client';

import React, { useState } from 'react';
import { formatIBAN } from '@/lib/iban';
import { AccountData } from './AccountCard';

interface CreateAccountFormProps {
  onAccountCreated?: (account: AccountData) => void;
  onCancel?: () => void;
}

export function CreateAccountForm({
  onAccountCreated,
  onCancel,
}: CreateAccountFormProps) {
  const [type, setType] = useState<'SAVINGS' | 'CURRENT'>('CURRENT');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAccount, setCreatedAccount] = useState<AccountData | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setCreatedAccount(null);

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, currency }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create account.');
        return;
      }

      setCreatedAccount(data);
      if (onAccountCreated) {
        onAccountCreated(data);
      }
    } catch (err: any) {
      setError(err.message || 'Network error while creating account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-6">
      <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-neutral-200 mb-4 pb-3 border-b border-neutral-800">
        Open New Core-Banking Account
      </h3>

      {error && (
        <div className="mb-4 p-3 rounded bg-rose-950/30 border border-rose-900/60 text-xs font-mono text-rose-300">
          {error}
        </div>
      )}

      {createdAccount ? (
        <div className="p-4 rounded bg-emerald-950/20 border border-emerald-900/60 space-y-3 mb-4">
          <div className="text-xs font-mono font-bold text-emerald-400">
            Account Created & Registered Successfully
          </div>
          <div className="space-y-1 font-mono text-xs text-neutral-300">
            <div>
              <span className="text-neutral-500">Account Number:</span>{' '}
              <span className="font-semibold">{createdAccount.accountNumber}</span>
            </div>
            <div>
              <span className="text-neutral-500">Virtual IBAN:</span>{' '}
              <span className="font-semibold text-emerald-300 select-all">
                {formatIBAN(createdAccount.iban)}
              </span>
            </div>
            <div>
              <span className="text-neutral-500">Account Type:</span> {createdAccount.type}
            </div>
            <div>
              <span className="text-neutral-500">Initial Settled Balance:</span>{' '}
              {createdAccount.currency} 0.00
            </div>
          </div>
          <div className="pt-2">
            <button
              onClick={() => {
                setCreatedAccount(null);
                if (onCancel) onCancel();
              }}
              className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded text-xs font-mono text-neutral-200"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-neutral-400 mb-1">
              Account Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'SAVINGS' | 'CURRENT')}
              disabled={loading}
              className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-neutral-600"
            >
              <option value="CURRENT">CURRENT (Standard Operating / Checking)</option>
              <option value="SAVINGS">SAVINGS (Interest Bearing / Vault)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-mono text-neutral-400 mb-1">
              Base Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={loading}
              className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-neutral-600"
            >
              <option value="USD">USD (United States Dollar)</option>
              <option value="EUR">EUR (Euro)</option>
              <option value="GBP">GBP (British Pound)</option>
            </select>
          </div>

          <div className="flex items-center space-x-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-neutral-950 font-mono font-bold text-xs rounded transition-colors flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                  <span>ISSUING VIRTUAL IBAN...</span>
                </>
              ) : (
                <span>CREATE ACCOUNT</span>
              )}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="py-2 px-4 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 text-xs font-mono rounded"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
