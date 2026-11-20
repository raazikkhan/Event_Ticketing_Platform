'use client';

import Link from 'next/link';
import { useAuth } from '../../context/auth-context';

export default function OrganizerDashboardPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-12">
        <p className="text-sm text-[#94A3B8]">Verifying session permissions...</p>
      </main>
    );
  }

  if (!user || user.role !== 'organizer') {
    return (
      <main className="max-w-md mx-auto px-6 py-16">
        <div className="bg-[#1E293B] border border-[#EF4444]/30 rounded-xl p-8 text-center shadow-lg">
          <div className="h-10 w-10 mx-auto rounded-full bg-[#EF4444]/20 flex items-center justify-center text-[#EF4444] mb-4 font-bold text-lg">
            !
          </div>
          <h1 className="text-xl font-bold text-[#F1F5F9] mb-2">Organizer Access Required</h1>
          <p className="text-xs text-[#94A3B8] mb-6">
            You must be logged into an organizer account to access the venue management hub.
          </p>
          <Link
            href="/login"
            className="inline-block py-2 px-4 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-semibold rounded-lg transition"
          >
            Switch to Organizer Account
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <div className="border-b border-[#334155] pb-6 mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F1F5F9]">Organizer Hub</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Welcome back, {user.name}. Manage venues, seating tiers, and ticket validation.
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30">
          Organizer Authorized
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-6">
          <h2 className="text-base font-semibold text-[#F1F5F9] mb-2">
            Part 4 Preparation: Create Event
          </h2>
          <p className="text-xs text-[#94A3B8] mb-4">
            Event creation, venue layouts, sections, and automated seat matrix generation will be
            implemented in Part 4.
          </p>
          <div className="text-xs text-[#6366F1] font-medium">Available in Part 4 &rarr;</div>
        </div>

        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-6">
          <h2 className="text-base font-semibold text-[#F1F5F9] mb-2">
            Part 9 Preparation: Ticket Scanner
          </h2>
          <p className="text-xs text-[#94A3B8] mb-4">
            Venue digital ticket scanner to validate signed QR tickets with anti-replay protection
            will be implemented in Part 9.
          </p>
          <div className="text-xs text-[#6366F1] font-medium">Available in Part 9 &rarr;</div>
        </div>
      </div>
    </main>
  );
}
