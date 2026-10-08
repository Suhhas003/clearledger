import React from 'react';

interface StatusBadgeProps {
  status: string;
  type?: 'status' | 'role' | 'entry' | 'direction';
}

export function StatusBadge({ status, type = 'status' }: StatusBadgeProps) {
  const upper = status.toUpperCase();

  let colorClasses = 'bg-neutral-800 text-neutral-300 border-neutral-700';

  if (['ACTIVE', 'COMPLETED', 'CREDIT', 'ADMIN'].includes(upper)) {
    colorClasses = 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60';
  } else if (['FROZEN', 'FAILED', 'DEBIT'].includes(upper)) {
    colorClasses = 'bg-rose-950/40 text-rose-400 border-rose-800/60';
  } else if (['PENDING', 'TELLER', 'DORMANT'].includes(upper)) {
    colorClasses = 'bg-amber-950/40 text-amber-400 border-amber-800/60';
  } else if (['CLOSED', 'CUSTOMER'].includes(upper)) {
    colorClasses = 'bg-neutral-900 text-neutral-400 border-neutral-800';
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium tracking-wide border ${colorClasses}`}
    >
      {upper}
    </span>
  );
}
