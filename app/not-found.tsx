import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#090a0f] flex items-center justify-center p-4">
      <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-6 max-w-sm w-full text-center">
        <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-neutral-200 mb-2">
          404 • Resource Not Found
        </h2>
        <p className="text-xs text-neutral-400 mb-5 leading-relaxed">
          The requested ledger entity, account or route does not exist.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-mono rounded transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
