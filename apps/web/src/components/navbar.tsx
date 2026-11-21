'use client';

import Link from 'next/link';
import { useAuth } from '../context/auth-context';

export function Navbar() {
  const { user, loading, logout } = useAuth();

  return (
    <header className="border-b border-[#334155] bg-[#0F172A]/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-bold text-lg text-[#F1F5F9] tracking-tight">EventPass</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#6366F1]/20 text-[#6366F1] border border-[#6366F1]/30">
            MVP
          </span>
        </Link>

        <nav className="flex items-center gap-4">
          <Link href="/" className="text-sm text-[#94A3B8] hover:text-[#F1F5F9] transition">
            System Status
          </Link>

          {!loading &&
            (user ? (
              <div className="flex items-center gap-4">
                {user.role === 'organizer' && (
                  <>
                    <Link
                      href="/organizer"
                      className="text-xs font-semibold px-2.5 py-1 rounded bg-[#6366F1] text-white hover:bg-[#6366F1]/90 transition"
                    >
                      Organizer Hub
                    </Link>
                    <Link
                      href="/organizer/scan"
                      className="text-xs text-[#94A3B8] hover:text-[#F1F5F9] transition"
                    >
                      Scan Ticket
                    </Link>
                  </>
                )}
                {user.role === 'attendee' && (
                  <Link
                    href="/dashboard"
                    className="text-xs text-[#94A3B8] hover:text-[#F1F5F9] transition"
                  >
                    My Tickets
                  </Link>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#F1F5F9] font-medium">{user.name}</span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#1E293B] border border-[#334155] text-[#94A3B8]">
                    {user.role}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => logout()}
                  className="text-xs text-[#94A3B8] hover:text-[#EF4444] transition"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-sm text-[#94A3B8] hover:text-[#F1F5F9] transition px-3 py-1.5"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#6366F1] text-white hover:bg-[#6366F1]/90 transition"
                >
                  Sign Up
                </Link>
              </div>
            ))}
        </nav>
      </div>
    </header>
  );
}
