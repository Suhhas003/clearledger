'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { AccountCard, AccountData } from '@/components/accounts/AccountCard';
import { CreateAccountForm } from '@/components/accounts/CreateAccountForm';
import { LoadingState, EmptyState, ErrorState } from '@/components/ui/States';

export default function AccountsPage() {
  const { status } = useSession();
  const router = useRouter();

  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

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
      setError(err.message || 'Error fetching account list');
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
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-neutral-800 gap-4">
          <div>
            <h1 className="text-xl font-mono font-bold tracking-tight text-neutral-100">
              Account Management
            </h1>
            <p className="text-xs font-mono text-neutral-400 mt-1">
              Virtual IBAN accounts backed by double-entry ledger settlement
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-neutral-950 text-xs font-mono font-bold rounded transition-colors self-start md:self-auto"
          >
            {showCreateForm ? 'Close Form' : '+ Open New Account'}
          </button>
        </div>

        {error && (
          <ErrorState
            title="Account Service Error"
            message={error}
            onRetry={fetchAccounts}
          />
        )}

        {showCreateForm && (
          <div className="max-w-xl">
            <CreateAccountForm
              onAccountCreated={() => {
                fetchAccounts();
                setShowCreateForm(false);
              }}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        )}

        {loading ? (
          <LoadingState message="Querying account registry..." />
        ) : accounts.length === 0 ? (
          <EmptyState
            title="No Registered Accounts"
            description="You do not have any registered core-banking accounts yet. Create one to begin posting double-entry entries."
            action={
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-neutral-950 text-xs font-mono font-bold rounded"
              >
                Open Account Now
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
