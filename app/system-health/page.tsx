'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatMinorUnits, formatDateTime } from '@/lib/format';

interface InvariantAuditData {
  healthy: boolean;
  journalsChecked: number;
  postingsChecked: number;
  accountsChecked: number;
  totalSystemDrift: string;
  unbalancedJournals: Array<{
    journalId: string;
    reference: string;
    debitSum: string;
    creditSum: string;
    drift: string;
  }>;
  inconsistentAccounts: Array<{
    accountId: string;
    accountNumber: string;
    iban: string;
    accountType: string;
    materializedBalance: string;
    replayBalance: string;
    drift: string;
  }>;
  checkedAt: string;
}

export default function SystemHealthPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [auditResult, setAuditResult] = useState<InvariantAuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = (session?.user as any)?.role;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status === 'authenticated' && role !== 'ADMIN') {
      router.push('/dashboard');
    }
  }, [status, role, router]);

  async function runVerification() {
    try {
      setRunning(true);
      setError(null);
      const res = await fetch('/api/invariant/verify');
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Access denied: System health audit requires ADMIN role.');
        }
        throw new Error(`Audit failed: HTTP ${res.status}`);
      }
      const data = await res.json();
      setAuditResult(data);
    } catch (err: any) {
      setError(err.message || 'Error executing ledger invariant audit');
    } finally {
      setRunning(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === 'authenticated' && role === 'ADMIN') {
      runVerification();
    }
  }, [status, role]);

  if (status === 'loading' || (loading && !auditResult && !error)) {
    return (
      <AppShell>
        <LoadingState message="Auditing ledger invariant mathematics..." />
      </AppShell>
    );
  }

  if (role !== 'ADMIN') {
    return (
      <AppShell>
        <div className="p-8 text-center text-xs font-mono text-rose-400 border border-rose-900 rounded-lg bg-rose-950/20">
          Access Denied: Only administrators are authorized to access the system health invariant inspector.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-neutral-800 gap-4">
          <div>
            <div className="flex items-center space-x-3 mb-1">
              <h1 className="text-xl font-mono font-bold tracking-tight text-neutral-100">
                System Invariant Health
              </h1>
              {auditResult && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-mono font-bold border ${
                    auditResult.healthy
                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
                      : 'bg-rose-950/40 text-rose-400 border-rose-800'
                  }`}
                >
                  {auditResult.healthy ? 'PASS • HEALTHY' : 'FAIL • DRIFT DETECTED'}
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-neutral-400">
              Full mathematical proof of double-entry ledger equilibrium & materialized balance parity
            </p>
          </div>

          <button
            onClick={runVerification}
            disabled={running}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-neutral-950 text-xs font-mono font-bold rounded transition-colors flex items-center space-x-2"
          >
            {running ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                <span>RUNNING AUDIT...</span>
              </>
            ) : (
              <span>RUN INVARIANT VERIFICATION</span>
            )}
          </button>
        </div>

        {error && (
          <ErrorState
            title="Invariant Audit Error"
            message={error}
            onRetry={runVerification}
          />
        )}

        {auditResult && (
          <>
            {/* Health Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1">
                  Journal Entries Checked
                </div>
                <div className="font-mono text-2xl font-bold text-neutral-100">
                  {auditResult.journalsChecked}
                </div>
                <div className="text-[11px] font-mono text-neutral-500 mt-1">
                  Every entry balanced: debits == credits
                </div>
              </div>

              <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1">
                  Ledger Postings Checked
                </div>
                <div className="font-mono text-2xl font-bold text-neutral-100">
                  {auditResult.postingsChecked}
                </div>
                <div className="text-[11px] font-mono text-neutral-500 mt-1">
                  Immutable debit & credit records
                </div>
              </div>

              <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1">
                  Accounts Audited
                </div>
                <div className="font-mono text-2xl font-bold text-neutral-100">
                  {auditResult.accountsChecked}
                </div>
                <div className="text-[11px] font-mono text-neutral-500 mt-1">
                  Historical replay vs materialized balance
                </div>
              </div>

              <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1">
                  Total System Drift
                </div>
                <div
                  className={`font-mono text-2xl font-bold ${
                    auditResult.totalSystemDrift === '0'
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {formatMinorUnits(auditResult.totalSystemDrift, 'USD')}
                </div>
                <div className="text-[11px] font-mono text-neutral-500 mt-1">
                  Target: $0.00 zero-drift
                </div>
              </div>
            </div>

            {/* Audit Details */}
            <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-5 font-mono text-xs text-neutral-400 space-y-1">
              <div>
                <span className="text-neutral-500">Last Verified Timestamp:</span>{' '}
                <span className="text-neutral-200">{formatDateTime(auditResult.checkedAt)}</span>
              </div>
              <div>
                <span className="text-neutral-500">Unbalanced Journals Count:</span>{' '}
                <span className="text-neutral-200">{auditResult.unbalancedJournals.length}</span>
              </div>
              <div>
                <span className="text-neutral-500">Inconsistent Accounts Count:</span>{' '}
                <span className="text-neutral-200">{auditResult.inconsistentAccounts.length}</span>
              </div>
            </div>

            {/* Inconsistent Accounts Detail if any */}
            {auditResult.inconsistentAccounts.length > 0 && (
              <div className="border border-rose-900/60 rounded-lg overflow-hidden bg-rose-950/10">
                <div className="p-4 bg-rose-950/30 border-b border-rose-900/40 text-xs font-mono font-bold text-rose-300">
                  Inconsistent Account Drift Detected ({auditResult.inconsistentAccounts.length})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-rose-950/20 text-rose-400 uppercase text-[11px]">
                      <tr>
                        <th className="py-2.5 px-4">Account Number</th>
                        <th className="py-2.5 px-4">Type</th>
                        <th className="py-2.5 px-4 text-right">Materialized Balance</th>
                        <th className="py-2.5 px-4 text-right">Replayed Balance</th>
                        <th className="py-2.5 px-4 text-right">Drift</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-900/30 text-rose-200">
                      {auditResult.inconsistentAccounts.map((acc) => (
                        <tr key={acc.accountId}>
                          <td className="py-2.5 px-4">{acc.accountNumber}</td>
                          <td className="py-2.5 px-4">{acc.accountType}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums">
                            {formatMinorUnits(acc.materializedBalance, 'USD')}
                          </td>
                          <td className="py-2.5 px-4 text-right tabular-nums">
                            {formatMinorUnits(acc.replayBalance, 'USD')}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-rose-400 tabular-nums">
                            {formatMinorUnits(acc.drift, 'USD')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Unbalanced Journals Detail if any */}
            {auditResult.unbalancedJournals.length > 0 && (
              <div className="border border-rose-900/60 rounded-lg overflow-hidden bg-rose-950/10">
                <div className="p-4 bg-rose-950/30 border-b border-rose-900/40 text-xs font-mono font-bold text-rose-300">
                  Unbalanced Journal Entries Detected ({auditResult.unbalancedJournals.length})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-rose-950/20 text-rose-400 uppercase text-[11px]">
                      <tr>
                        <th className="py-2.5 px-4">Journal Reference</th>
                        <th className="py-2.5 px-4 text-right">Debits</th>
                        <th className="py-2.5 px-4 text-right">Credits</th>
                        <th className="py-2.5 px-4 text-right">Drift</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-900/30 text-rose-200">
                      {auditResult.unbalancedJournals.map((j) => (
                        <tr key={j.journalId}>
                          <td className="py-2.5 px-4">{j.reference}</td>
                          <td className="py-2.5 px-4 text-right tabular-nums">
                            {formatMinorUnits(j.debitSum, 'USD')}
                          </td>
                          <td className="py-2.5 px-4 text-right tabular-nums">
                            {formatMinorUnits(j.creditSum, 'USD')}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-rose-400 tabular-nums">
                            {formatMinorUnits(j.drift, 'USD')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
