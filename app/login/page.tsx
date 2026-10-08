'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);

    try {
      const res = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (res?.error) {
        setError('Invalid credentials. Please verify your email and password.');
        setLoading(false);
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('An unexpected authentication error occurred. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#090a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 mb-2">
            <span className="w-3 h-3 bg-emerald-500 rounded-sm inline-block" />
            <h1 className="font-mono text-lg font-bold tracking-widest text-neutral-100">
              CLEARLEDGER
            </h1>
          </div>
          <p className="text-xs font-mono uppercase tracking-wider text-neutral-500">
            Core Ledger Platform Authentication
          </p>
        </div>

        {/* Login Box */}
        <div className="bg-[#10121a] border border-neutral-800 rounded-lg p-6 shadow-2xl">
          <div className="text-xs font-mono uppercase tracking-wider text-neutral-400 mb-5 pb-3 border-b border-neutral-800">
            Sign In with Operator Credentials
          </div>

          {error && (
            <div className="mb-4 p-3 rounded bg-rose-950/30 border border-rose-900/60 text-xs font-mono text-rose-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-neutral-400 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@clearledger.internal"
                disabled={loading}
                required
                className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-neutral-600 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-neutral-400 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                disabled={loading}
                required
                className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-neutral-600 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-neutral-950 font-mono font-bold text-xs rounded transition-colors flex items-center justify-center space-x-2 mt-2"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                  <span>AUTHENTICATING...</span>
                </>
              ) : (
                <span>SIGN IN</span>
              )}
            </button>
          </form>
        </div>

        {/* Security Notice */}
        <p className="text-[11px] font-mono text-center text-neutral-600 mt-6">
          Double-entry ledger with immutable audit logs and strict cryptographic idempotency.
        </p>
      </div>
    </div>
  );
}
