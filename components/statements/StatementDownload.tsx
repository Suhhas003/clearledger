'use client';

import React, { useState } from 'react';
import { AccountData } from '@/components/accounts/AccountCard';

interface StatementDownloadProps {
  accounts: AccountData[];
  defaultAccountId?: string;
}

export function StatementDownload({
  accounts,
  defaultAccountId,
}: StatementDownloadProps) {
  const [selectedAccountId, setSelectedAccountId] = useState(
    defaultAccountId || accounts[0]?.id || ''
  );

  // Default to current month YYYY-MM
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState(defaultMonth);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate list of the last 12 months for selector
  const availableMonths: { label: string; value: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    availableMonths.push({ label, value });
  }

  async function handleDownload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAccountId) {
      setError('Please select an account.');
      return;
    }

    setDownloading(true);
    setError(null);

    try {
      const res = await fetch(`/api/statements/${selectedAccountId}?month=${month}`);
      if (!res.ok) {
        const text = await res.text();
        let message = `Failed to download statement (HTTP ${res.status})`;
        try {
          const json = JSON.parse(text);
          if (json.error) message = json.error;
        } catch {}
        setError(message);
        return;
      }

      // Convert response into blob and download
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `statement-${month}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || 'Error downloading PDF statement');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-6">
      <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-neutral-200 mb-4 pb-3 border-b border-neutral-800">
        Generate Monthly Mini-Statement
      </h3>

      {error && (
        <div className="mb-4 p-3 rounded bg-rose-950/30 border border-rose-900/60 text-xs font-mono text-rose-300">
          {error}
        </div>
      )}

      <form onSubmit={handleDownload} className="space-y-4">
        <div>
          <label className="block text-xs font-mono text-neutral-400 mb-1">
            Account
          </label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            disabled={downloading}
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-neutral-600"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.type} • {acc.accountNumber} ({acc.currency})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-mono text-neutral-400 mb-1">
            Statement Period (Month)
          </label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={downloading}
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-neutral-600"
          >
            {availableMonths.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label} ({m.value})
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={downloading || !selectedAccountId}
          className="w-full py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 font-mono font-bold text-xs rounded transition-colors flex items-center justify-center space-x-2 border border-neutral-700"
        >
          {downloading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-neutral-300 border-t-transparent rounded-full animate-spin" />
              <span>GENERATING PDF STATEMENT...</span>
            </>
          ) : (
            <span>DOWNLOAD AUDITED PDF</span>
          )}
        </button>
      </form>
    </div>
  );
}
