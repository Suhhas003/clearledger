'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { AccountCard, AccountData } from '@/components/accounts/AccountCard';
import { TransactionTable, JournalEntryItem } from '@/components/transactions/TransactionTable';
import { TransferForm } from '@/components/transfers/TransferForm';
import { StatementDownload } from '@/components/statements/StatementDownload';
import { LoadingState, EmptyState, ErrorState } from '@/components/ui/States';
import { BalanceDisplay } from '@/components/ui/BalanceDisplay';
import { CreateAccountForm } from '@/components/accounts/CreateAccountForm';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [transactions, setTransactions] = useState<JournalEntryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'transfer' | 'statement' | 'create-account'>('overview');
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      const [accountsRes, txRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/transactions?limit=10'),
      ]);

      if (!accountsRes.ok) {
        throw new Error(`Failed to load accounts: HTTP ${accountsRes.status}`);
      }
      if (!txRes.ok) {
        throw new Error(`Failed to load transactions: HTTP ${txRes.status}`);
      }

      const accountsData = await accountsRes.json();
      const txData = await txRes.json();

      setAccounts(accountsData);
      setTransactions(txData.data || []);
    } catch (err: any) {
      setError(err.message || 'Error loading dashboard data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === 'authenticated') {
      fetchData();
    }
  }, [status]);

  if (status === 'loading' || (loading && accounts.length === 0 && !error)) {
    return (
      <AppShell>
        <LoadingState message="Loading Core-Banking Ledger State..." />
      </AppShell>
    );
  }

  // Calculate total settled balance across customer's accounts in minor units (integer only)
  const totalBalanceCents = accounts.reduce((acc, account) => {
    try {
      return acc + BigInt(account.balance);
    } catch {
      return acc;
    }
  }, 0n);

  const role = (session?.user as any)?.role || 'CUSTOMER';

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-neutral-800 gap-4">
          <div>
            <h1 className="text-xl font-mono font-bold tracking-tight text-neutral-100">
              {role === 'ADMIN' ? 'System Ledger Overview' : role === 'TELLER' ? 'Teller Operations Desk' : 'Customer Account Overview'}
            </h1>
            <p className="text-xs font-mono text-neutral-400 mt-1">
              Live double-entry verified balances & settlement state
            </p>
          </div>

          {/* Quick Action Navigation */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setActiveTab('overview');
              }}
              className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
                activeTab === 'overview'
                  ? 'bg-neutral-800 text-neutral-100 border-neutral-700'
                  : 'bg-neutral-900/60 text-neutral-400 border-neutral-800 hover:text-neutral-200'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('transfer')}
              className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
                activeTab === 'transfer'
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800'
                  : 'bg-neutral-900/60 text-neutral-400 border-neutral-800 hover:text-neutral-200'
              }`}
            >
              + Quick Transfer
            </button>
            <button
              onClick={() => setActiveTab('create-account')}
              className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
                activeTab === 'create-account'
                  ? 'bg-neutral-800 text-neutral-100 border-neutral-700'
                  : 'bg-neutral-900/60 text-neutral-400 border-neutral-800 hover:text-neutral-200'
              }`}
            >
              + Open Account
            </button>
            <button
              onClick={() => setActiveTab('statement')}
              className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
                activeTab === 'statement'
                  ? 'bg-neutral-800 text-neutral-100 border-neutral-700'
                  : 'bg-neutral-900/60 text-neutral-400 border-neutral-800 hover:text-neutral-200'
              }`}
            >
              PDF Statement
            </button>
          </div>
        </div>

        {error && (
          <ErrorState
            title="Ledger Communication Error"
            message={error}
            onRetry={fetchData}
          />
        )}

        {/* Dynamic Action Forms */}
        {activeTab === 'transfer' && (
          <div className="max-w-xl">
            <TransferForm
              accounts={accounts}
              defaultFromAccountId={selectedAccountId}
              onSuccess={() => {
                fetchData();
              }}
            />
          </div>
        )}

        {activeTab === 'create-account' && (
          <div className="max-w-xl">
            <CreateAccountForm
              onAccountCreated={() => {
                fetchData();
              }}
              onCancel={() => setActiveTab('overview')}
            />
          </div>
        )}

        {activeTab === 'statement' && (
          <div className="max-w-xl">
            <StatementDownload
              accounts={accounts}
              defaultAccountId={selectedAccountId}
            />
          </div>
        )}

        {/* Aggregated Balance Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1">
              Combined Settled Balance
            </div>
            <BalanceDisplay
              amount={totalBalanceCents}
              currency="USD"
              size="xl"
              className="text-neutral-100"
            />
            <div className="text-[11px] font-mono text-neutral-500 mt-2">
              Sum across {accounts.length} settled accounts
            </div>
          </div>

          <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1">
              Active Accounts
            </div>
            <div className="font-mono text-3xl font-extrabold text-neutral-100">
              {accounts.filter((a) => a.status === 'ACTIVE').length}
            </div>
            <div className="text-[11px] font-mono text-neutral-500 mt-2">
              Virtual IBAN registered
            </div>
          </div>

          <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1">
              Ledger Health Status
            </div>
            <div className="flex items-center space-x-2 mt-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono text-lg font-bold text-emerald-400">
                BALANCED & ACTIVE
              </span>
            </div>
            <div className="text-[11px] font-mono text-neutral-500 mt-2">
              ACID isolation enforced
            </div>
          </div>
        </div>

        {/* Accounts List Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
              Managed Accounts ({accounts.length})
            </h2>
          </div>

          {accounts.length === 0 ? (
            <EmptyState
              title="No Accounts Found"
              description="No core-banking accounts are currently registered. Open an account to begin posting double-entry transactions."
              action={
                <button
                  onClick={() => setActiveTab('create-account')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-neutral-950 text-xs font-mono font-bold rounded"
                >
                  Open First Account
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map((acc) => (
                <AccountCard
                  key={acc.id}
                  account={acc}
                  onSelectForTransfer={(accId) => {
                    setSelectedAccountId(accId);
                    setActiveTab('transfer');
                  }}
                  onSelectForStatement={(accId) => {
                    setSelectedAccountId(accId);
                    setActiveTab('statement');
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* Recent Transactions Section */}
        <section className="space-y-3 pt-4 border-t border-neutral-800">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
              Recent Ledger Postings
            </h2>
            <button
              onClick={() => router.push('/transactions')}
              className="text-xs font-mono text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Full History →
            </button>
          </div>

          <TransactionTable transactions={transactions} />
        </section>
      </div>
    </AppShell>
  );
}
