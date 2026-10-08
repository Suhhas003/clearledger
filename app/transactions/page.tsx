'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { TransactionTable, JournalEntryItem } from '@/components/transactions/TransactionTable';
import { LoadingState, EmptyState, ErrorState } from '@/components/ui/States';

export default function TransactionsPage() {
  const { status } = useSession();
  const router = useRouter();

  const [transactions, setTransactions] = useState<JournalEntryItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  async function fetchTransactions(pageNum = 1) {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/transactions?page=${pageNum}&limit=${limit}`);
      if (!res.ok) {
        throw new Error(`Failed to load transactions: HTTP ${res.status}`);
      }

      const json = await res.json();
      setTransactions(json.data || []);
      setPage(json.page);
      setTotalPages(json.totalPages);
      setTotal(json.total);
    } catch (err: any) {
      setError(err.message || 'Error querying ledger transactions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === 'authenticated') {
      fetchTransactions(page);
    }
  }, [status, page]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-neutral-800 gap-4">
          <div>
            <h1 className="text-xl font-mono font-bold tracking-tight text-neutral-100">
              Transaction History
            </h1>
            <p className="text-xs font-mono text-neutral-400 mt-1">
              Immutable journal entries and double-entry postings
            </p>
          </div>
          <div className="text-xs font-mono text-neutral-400">
            Total Records: <span className="font-semibold text-neutral-200">{total}</span>
          </div>
        </div>

        {error && (
          <ErrorState
            title="Transaction Query Error"
            message={error}
            onRetry={() => fetchTransactions(page)}
          />
        )}

        {loading ? (
          <LoadingState message="Reconstructing ledger history..." />
        ) : transactions.length === 0 ? (
          <EmptyState
            title="No Transactions Found"
            description="There are no transaction records associated with your authorized accounts."
          />
        ) : (
          <div className="space-y-4">
            <TransactionTable transactions={transactions} />

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 text-xs font-mono">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 border border-neutral-800 rounded text-neutral-300"
                >
                  ← Previous
                </button>
                <span className="text-neutral-400">
                  Page <span className="text-neutral-200 font-semibold">{page}</span> of{' '}
                  <span className="text-neutral-200 font-semibold">{totalPages}</span>
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 border border-neutral-800 rounded text-neutral-300"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
