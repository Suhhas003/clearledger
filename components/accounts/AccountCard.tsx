import React from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BalanceDisplay } from '@/components/ui/BalanceDisplay';
import { formatIBAN } from '@/lib/iban';

export interface AccountData {
  id: string;
  accountNumber: string;
  iban: string;
  type: string;
  status: string;
  currency: string;
  balance: string;
  createdAt?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

interface AccountCardProps {
  account: AccountData;
  onSelectForTransfer?: (accountId: string) => void;
  onSelectForStatement?: (accountId: string) => void;
}

export function AccountCard({
  account,
  onSelectForTransfer,
  onSelectForStatement,
}: AccountCardProps) {
  const formattedIban = formatIBAN(account.iban);

  return (
    <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-5 flex flex-col justify-between hover:border-neutral-700 transition-colors">
      <div>
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-medium text-neutral-300">
                {account.type}
              </span>
              <span className="text-neutral-600">•</span>
              <span className="text-xs font-mono text-neutral-400">
                {account.accountNumber}
              </span>
            </div>
            {account.user && (
              <p className="text-[11px] text-neutral-400 mt-0.5 font-mono">
                Holder: {account.user.name} ({account.user.email})
              </p>
            )}
          </div>
          <StatusBadge status={account.status} />
        </div>

        {/* IBAN Display */}
        <div className="mb-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1">
            Virtual IBAN
          </div>
          <div className="font-mono text-xs text-neutral-200 tracking-wide select-all bg-neutral-900/60 px-2 py-1 rounded border border-neutral-800/80">
            {formattedIban}
          </div>
        </div>

        {/* Balance Display */}
        <div className="mb-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-1">
            Settled Ledger Balance
          </div>
          <BalanceDisplay
            amount={account.balance}
            currency={account.currency}
            size="xl"
            className="text-neutral-100"
          />
        </div>
      </div>

      {/* Card actions */}
      <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs font-mono">
        <Link
          href={`/accounts/${account.id}`}
          className="text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          Details →
        </Link>
        <div className="flex items-center space-x-2">
          {onSelectForTransfer ? (
            <button
              onClick={() => onSelectForTransfer(account.id)}
              className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded text-neutral-300 transition-colors"
            >
              Transfer
            </button>
          ) : (
            <Link
              href={`/transfers?from=${account.id}`}
              className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded text-neutral-300 transition-colors"
            >
              Transfer
            </Link>
          )}

          {onSelectForStatement && (
            <button
              onClick={() => onSelectForStatement(account.id)}
              className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded text-neutral-300 transition-colors"
            >
              Statement
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
