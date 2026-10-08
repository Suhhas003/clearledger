import React from 'react';
import { Navigation } from './Navigation';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#090a0f] text-neutral-100 flex flex-col md:flex-row">
      <Navigation />
      <main className="flex-1 md:ml-64 min-w-0 p-4 md:p-8 max-w-7xl">
        {children}
      </main>
    </div>
  );
}
