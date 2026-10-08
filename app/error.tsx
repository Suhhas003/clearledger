'use client';

import React from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#090a0f] flex items-center justify-center p-4">
      <div className="bg-[#10121a] border border-rose-900/60 rounded-lg p-6 max-w-md w-full text-center">
        <div className="w-8 h-8 rounded-full bg-rose-950/60 border border-rose-800 text-rose-400 mx-auto flex items-center justify-center text-xs font-mono font-bold mb-3">
          !
        </div>
        <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-neutral-100 mb-2">
          Service Interruption
        </h2>
        <p className="text-xs text-neutral-400 mb-5 leading-relaxed">
          The requested ledger operation could not be completed safely. All account balances and journal records remain intact under ACID guarantees.
        </p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-mono rounded transition-colors"
        >
          Retry Ledger Request
        </button>
      </div>
    </div>
  );
}
