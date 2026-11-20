'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/auth-context';

interface EventItem {
  id: string;
  title: string;
  venueName: string;
  eventDate: string;
  status: string;
  isHighDemand: boolean;
  createdAt: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function OrganizerDashboardPage() {
  const { user, loading } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const fetchOrganizerEvents = useCallback(async () => {
    try {
      setLoadingEvents(true);
      const res = await fetch(`${API_BASE}/api/organizer/events`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'organizer') {
      fetchOrganizerEvents();
    }
  }, [user, fetchOrganizerEvents]);

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
      <div className="border-b border-[#334155] pb-6 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#F1F5F9]">Organizer Hub</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30">
              Organizer Authorized
            </span>
          </div>
          <p className="text-sm text-[#94A3B8] mt-1">
            Welcome back, {user.name}. Manage venues, seating tiers, and ticket validation.
          </p>
        </div>
        <Link
          href="/organizer/events/new"
          className="px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-semibold rounded-lg transition text-center"
        >
          + Create New Event
        </Link>
      </div>

      {/* Events List */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-[#F1F5F9] mb-4">Your Managed Events</h2>

        {loadingEvents ? (
          <p className="text-xs text-[#94A3B8]">Loading your events...</p>
        ) : events.length === 0 ? (
          <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-8 text-center">
            <p className="text-sm text-[#94A3B8] mb-4">You have not created any events yet.</p>
            <Link
              href="/organizer/events/new"
              className="px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-semibold rounded-lg transition inline-block"
            >
              Configure First Event Layout
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((evt) => (
              <div
                key={evt.id}
                className="bg-[#1E293B] border border-[#334155] rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#F1F5F9]">{evt.title}</h3>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-[#334155] text-[#94A3B8]">
                      {evt.status}
                    </span>
                    {evt.isHighDemand && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#F59E0B]/20 text-[#F59E0B]">
                        High Demand
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#94A3B8] mt-1">
                    {evt.venueName} &bull; {new Date(evt.eventDate).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Link
                    href={`/events/${evt.id}`}
                    className="text-xs font-semibold text-[#6366F1] hover:underline"
                  >
                    View Live Seat Map &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Feature Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-6">
          <h2 className="text-base font-semibold text-[#F1F5F9] mb-2">Automated Seat Matrix</h2>
          <p className="text-xs text-[#94A3B8] mb-4">
            Seat layouts are defined by sections, rows, and seats-per-row. The system calculates
            coordinates and enforces uniqueness across the venue.
          </p>
          <Link
            href="/organizer/events/new"
            className="text-xs text-[#6366F1] font-semibold hover:underline"
          >
            Create New Venue Map &rarr;
          </Link>
        </div>

        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-6">
          <h2 className="text-base font-semibold text-[#F1F5F9] mb-2">
            Part 9: Venue Ticket Scanner
          </h2>
          <p className="text-xs text-[#94A3B8] mb-4">
            Digital check-in validator for signed QR tickets. Validates admission tokens once,
            preventing duplicate scans and ticket fraud.
          </p>
          <div className="text-xs text-[#94A3B8] font-medium">Available in Part 9</div>
        </div>
      </div>
    </main>
  );
}
