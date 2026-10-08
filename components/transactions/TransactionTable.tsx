import React from 'react';
import { formatMinorUnits, formatDateTime } from '@/lib/format';
import { StatusBadge } from '@/components/ui/StatusBadge';

export interface LedgerPostingItem {
  id: string;
  journalEntryId: string;
  accountId: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: string;
  currency: string;
  balanceAfter: string;
  createdAt: string;
}

export interface JournalEntryItem {
  id: string;
  reference: string;
  type: string;
  description: string;
  postedAt: string;
  postings: LedgerPostingItem[];
}

interface TransactionTableProps {
  transactions: JournalEntryItem[];
  currentAccountId?: string;
}

export function TransactionTable({
  transactions,
  currentAccountId,
}: TransactionTableProps) {
  if (transactions.length === 0) {
    return (
      <div className="p-8 text-center text-xs font-mono text-neutral-500 border border-neutral-800 rounded-lg bg-neutral-900/30">
        No transaction records found.
      </div>
    );
  }

  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden bg-[#10121a]">
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#0c0e14] border-b border-neutral-800 text-neutral-400 font-mono uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Reference</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4 text-right">Direction</th>
              <th className="py-3 px-4 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/80 font-mono text-neutral-200">
            {transactions.map((tx) => {
              // Find the relevant posting for currentAccountId if specified, else show primary posting
              const relevantPosting = currentAccountId
                ? tx.postings.find((p) => p.accountId === currentAccountId) || tx.postings[0]
                : tx.postings[0];

              const direction = relevantPosting?.direction || 'DEBIT';
              const amount = relevantPosting?.amount || '0';
              const currency = relevantPosting?.currency || 'USD';
              const isCredit = direction === 'CREDIT';

              return (
                <tr key={tx.id} className="hover:bg-neutral-900/40 transition-colors">
                  <td className="py-3 px-4 text-neutral-400 whitespace-nowrap">
                    {formatDateTime(tx.postedAt)}
                  </td>
                  <td className="py-3 px-4 font-semibold text-neutral-300 whitespace-nowrap">
                    {tx.reference}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] px-2 py-0.5 rounded border border-neutral-800 bg-neutral-900 text-neutral-400">
                      {tx.type}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-neutral-300 max-w-xs truncate">
                    {tx.description}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <StatusBadge status={direction} type="direction" />
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-bold tabular-nums whitespace-nowrap ${
                      isCredit ? 'text-emerald-400' : 'text-neutral-200'
                    }`}
                  >
                    {isCredit ? '+' : '-'}
                    {formatMinorUnits(amount, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked Card View */}
      <div className="md:hidden divide-y divide-neutral-800">
        {transactions.map((tx) => {
          const relevantPosting = currentAccountId
            ? tx.postings.find((p) => p.accountId === currentAccountId) || tx.postings[0]
            : tx.postings[0];

          const direction = relevantPosting?.direction || 'DEBIT';
          const amount = relevantPosting?.amount || '0';
          const currency = relevantPosting?.currency || 'USD';
          const isCredit = direction === 'CREDIT';

          return (
            <div key={tx.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-mono font-bold text-neutral-200">
                    {tx.reference}
                  </div>
                  <div className="text-[11px] font-mono text-neutral-500">
                    {formatDateTime(tx.postedAt)}
                  </div>
                </div>
                <div
                  className={`text-sm font-mono font-bold tabular-nums ${
                    isCredit ? 'text-emerald-400' : 'text-neutral-200'
                  }`}
                >
                  {isCredit ? '+' : '-'}
                  {formatMinorUnits(amount, currency)}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-900">
                <span className="text-neutral-400 truncate max-w-[200px]">
                  {tx.description}
                </span>
                <StatusBadge status={direction} type="direction" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
