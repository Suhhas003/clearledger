'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { TransferForm } from '@/components/transfers/TransferForm';
import { AccountData } from '@/components/accounts/AccountCard';
import { LoadingState, EmptyState, ErrorState } from '@/components/ui/States';

function TransfersContent() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get('from') || undefined;

  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  async function fetchAccounts() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/accounts');
      if (!res.ok) {
        throw new Error(`Failed to load accounts: HTTP ${res.status}`);
      }
      const data = await res.json();
      setAccounts(data);
    } catch (err: any) {
      setError(err.message || 'Error loading accounts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === 'authenticated') {
      fetchAccounts();
    }
  }, [status]);

  return (
    <AppShell>
      <div className="space-y-6 max-w-2xl">
        <div className="pb-4 border-b border-neutral-800">
          <h1 className="text-xl font-mono font-bold tracking-tight text-neutral-100">
            Initiate Transfer
          </h1>
          <p className="text-xs font-mono text-neutral-400 mt-1">
            ACID-compliant double-entry transfer with idempotency protection
          </p>
        </div>

        {error && (
          <ErrorState
            title="Account Loading Error"
            message={error}
            onRetry={fetchAccounts}
          />
        )}

        {loading ? (
          <LoadingState message="Fetching active accounts for transfer..." />
        ) : accounts.length === 0 ? (
          <EmptyState
            title="No Accounts Available"
            description="You must have at least one registered account to originate a transfer."
            action={
              <button
                onClick={() => router.push('/accounts')}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-neutral-950 text-xs font-mono font-bold rounded"
              >
                Create Account
              </button>
            }
          />
        ) : (
          <TransferForm
            accounts={accounts}
            defaultFromAccountId={fromParam}
            onSuccess={() => {
              fetchAccounts();
            }}
          />
        )}
      </div>
    </AppShell>
  );
}

export default function TransfersPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading transfers..." />}>
      <TransfersContent />
    </Suspense>
  );
}
