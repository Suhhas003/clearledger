'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BalanceDisplay } from '@/components/ui/BalanceDisplay';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { formatIBAN } from '@/lib/iban';
import { formatMinorUnits, formatDateTime } from '@/lib/format';
import { StatementDownload } from '@/components/statements/StatementDownload';

export default function AccountDetailPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [account, setAccount] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStatement, setShowStatement] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  async function fetchAccountDetail() {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/accounts/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Account not found.');
        if (res.status === 403) throw new Error('Access denied: You are not authorized to view this account.');
        throw new Error(`Failed to load account details: HTTP ${res.status}`);
      }
      const data = await res.json();
      setAccount(data);
    } catch (err: any) {
      setError(err.message || 'Error loading account details');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === 'authenticated' && id) {
      fetchAccountDetail();
    }
  }, [status, id]);

  if (loading) {
    return (
      <AppShell>
        <LoadingState message="Loading Account Ledger Record..." />
      </AppShell>
    );
  }

  if (error || !account) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Link
            href="/accounts"
            className="text-xs font-mono text-neutral-400 hover:text-neutral-200"
          >
            ← Back to Accounts
          </Link>
          <ErrorState
            title="Account Lookup Error"
            message={error || 'Account could not be found'}
            onRetry={fetchAccountDetail}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs font-mono text-neutral-500">
          <Link href="/accounts" className="hover:text-neutral-300">
            Accounts
          </Link>
          <span>/</span>
          <span className="text-neutral-300 font-semibold">{account.accountNumber}</span>
        </div>

        {/* Account Header */}
        <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-neutral-800 gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-1">
                <h1 className="text-xl font-mono font-bold text-neutral-100">
                  {account.type} Account
                </h1>
                <StatusBadge status={account.status} />
              </div>
              <p className="text-xs font-mono text-neutral-400">
                Number: {account.accountNumber} • ID: {account.id}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Link
                href={`/transfers?from=${account.id}`}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-neutral-950 text-xs font-mono font-bold rounded transition-colors"
              >
                Transfer Funds
              </Link>
              <button
                onClick={() => setShowStatement(!showStatement)}
                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-xs font-mono rounded transition-colors"
              >
                {showStatement ? 'Hide Statement' : 'PDF Statement'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-5">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-1">
                Virtual IBAN Identifier
              </div>
              <div className="text-xs font-mono text-neutral-200 bg-neutral-900/60 p-2 rounded border border-neutral-800/80 select-all">
                {formatIBAN(account.iban)}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-1">
                Settled Balance
              </div>
              <BalanceDisplay
                amount={account.balance}
                currency={account.currency}
                size="xl"
                className="text-neutral-100"
              />
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-1">
                Account Holder
              </div>
              <div className="text-xs font-mono text-neutral-200">
                {account.user?.name || 'Primary User'}
              </div>
              <div className="text-[11px] font-mono text-neutral-500">
                {account.user?.email || 'N/A'}
              </div>
            </div>
          </div>
        </div>

        {/* Statement Download Drawer */}
        {showStatement && (
          <div className="max-w-xl">
            <StatementDownload
              accounts={[account]}
              defaultAccountId={account.id}
            />
          </div>
        )}

        {/* Postings History */}
        <section className="space-y-3">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
            Ledger Postings & Audit Trail ({account.postings?.length || 0})
          </h2>

          {account.postings && account.postings.length > 0 ? (
            <div className="border border-neutral-800 rounded-lg overflow-hidden bg-[#10121a]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#0c0e14] border-b border-neutral-800 text-neutral-400 uppercase text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Reference</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4 text-right">Direction</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-right">Balance Snapshot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/80 text-neutral-300">
                    {account.postings.map((posting: any) => {
                      const isCredit = posting.direction === 'CREDIT';
                      return (
                        <tr key={posting.id} className="hover:bg-neutral-900/40">
                          <td className="py-3 px-4 text-neutral-500 whitespace-nowrap">
                            {formatDateTime(posting.createdAt)}
                          </td>
                          <td className="py-3 px-4 font-semibold text-neutral-200 whitespace-nowrap">
                            {posting.journalEntry?.reference || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-neutral-400 max-w-xs truncate">
                            {posting.journalEntry?.description || 'Ledger Entry'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <StatusBadge status={posting.direction} type="direction" />
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-bold tabular-nums whitespace-nowrap ${
                              isCredit ? 'text-emerald-400' : 'text-neutral-200'
                            }`}
                          >
                            {isCredit ? '+' : '-'}
                            {formatMinorUnits(posting.amount, posting.currency)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-400 whitespace-nowrap">
                            {formatMinorUnits(posting.balanceAfter, posting.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs font-mono text-neutral-500 border border-neutral-800 rounded-lg bg-neutral-900/30">
              No historical postings recorded for this account.
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
