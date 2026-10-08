import React from 'react';
import { LoadingState } from '@/components/ui/States';

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#090a0f] flex items-center justify-center p-4">
      <LoadingState message="Accessing Secure Double-Entry Ledger..." />
    </div>
  );
}
