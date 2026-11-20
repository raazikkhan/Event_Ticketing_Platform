'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '../../context/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid login credentials');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="max-w-md mx-auto px-6 py-16">
      <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-[#F1F5F9] text-center mb-2">Sign In</h1>
        <p className="text-sm text-[#94A3B8] text-center mb-6">
          Access your attendee tickets or organizer events
        </p>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444] text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email-input" className="block text-xs font-medium text-[#94A3B8] mb-1">
              Email Address
            </label>
            <input
              id="email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] focus:outline-none focus:border-[#6366F1]"
            />
          </div>

          <div>
            <label
              htmlFor="password-input"
              className="block text-xs font-medium text-[#94A3B8] mb-1"
            >
              Password
            </label>
            <input
              id="password-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] focus:outline-none focus:border-[#6366F1]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white font-medium text-sm rounded-lg transition disabled:opacity-50 mt-2"
          >
            {submitting ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-6 text-xs text-center text-[#94A3B8]">
          Don't have an account?{' '}
          <Link href="/register" className="text-[#6366F1] hover:underline">
            Sign up here
          </Link>
        </p>
      </div>
    </main>
  );
}
