'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function Navigation() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const role = (session?.user as any)?.role || 'CUSTOMER';

  const navItems = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Accounts', href: '/accounts' },
    { label: 'Transactions', href: '/transactions' },
    ...(role === 'ADMIN' ? [{ label: 'System Health', href: '/system-health' }] : []),
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-neutral-800 bg-[#0d0f14] min-h-screen fixed left-0 top-0 z-30">
        {/* Brand */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm inline-block" />
              <span className="font-mono text-sm font-bold tracking-wider text-neutral-100">
                CLEARLEDGER
              </span>
            </div>
            <p className="text-[10px] font-mono tracking-widest text-neutral-500 mt-1 uppercase">
              Core Ledger Engine
            </p>
          </div>
        </div>

        {/* User Card */}
        <div className="p-4 border-b border-neutral-800/80 bg-neutral-900/30">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-neutral-200 truncate max-w-[130px]">
              {session?.user?.name || 'Operator'}
            </span>
            <StatusBadge status={role} type="role" />
          </div>
          <div className="text-[11px] font-mono text-neutral-400 truncate">
            {session?.user?.email || 'authenticated'}
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-3 py-2 text-xs font-mono rounded transition-colors ${
                  isActive
                    ? 'bg-neutral-800 text-neutral-100 font-semibold border-l-2 border-emerald-400 pl-2.5'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer actions */}
        <div className="p-4 border-t border-neutral-800">
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full flex items-center justify-center px-3 py-2 text-xs font-mono text-neutral-400 hover:text-neutral-200 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Header & Navigation */}
      <header className="md:hidden border-b border-neutral-800 bg-[#0d0f14] sticky top-0 z-40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm inline-block" />
          <span className="font-mono text-xs font-bold tracking-wider text-neutral-100">
            CLEARLEDGER
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <StatusBadge status={role} type="role" />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Navigation"
            className="p-1.5 rounded border border-neutral-800 bg-neutral-900 text-neutral-300 text-xs font-mono"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-neutral-800 bg-[#0d0f14] p-4 space-y-3 sticky top-[49px] z-30">
          <div className="text-xs font-mono text-neutral-400 pb-2 border-b border-neutral-800">
            {session?.user?.name} ({session?.user?.email})
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 text-xs font-mono rounded ${
                    isActive
                      ? 'bg-neutral-800 text-neutral-100 font-semibold'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full text-left px-3 py-2 text-xs font-mono text-rose-400 hover:bg-neutral-900 rounded"
          >
            Sign Out
          </button>
        </div>
      )}
    </>
  );
}
