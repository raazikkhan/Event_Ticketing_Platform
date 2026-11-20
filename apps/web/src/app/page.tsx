'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/auth-context';

interface EventItem {
  id: string;
  title: string;
  description: string;
  venueName: string;
  venueAddress: string;
  eventDate: string;
  status: string;
  isHighDemand: boolean;
  minPrice: number;
  maxPrice: number;
  totalSeats: number;
}

interface HealthState {
  status: string;
  timestamp?: string;
  uptimeSeconds?: number;
  services?: {
    database?: { healthy: boolean; latencyMs?: number; error?: string };
    redis?: { healthy: boolean; latencyMs?: number; error?: string };
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function HomePage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      setLoadingHealth(true);
      const res = await fetch(`${API_BASE}/health`);
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      setLoadingEvents(true);
      const res = await fetch(`${API_BASE}/api/events`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchEvents();
  }, [fetchHealth, fetchEvents]);

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      await fetch(`${API_BASE}/api/events/seed-demo`, {
        method: 'POST',
        credentials: 'include',
      });
      await fetchEvents();
    } finally {
      setSeeding(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      {/* Hero Banner */}
      <div className="border-b border-[#334155] pb-8 mb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#F1F5F9]">
              Live Events & Seat Reservations
            </h1>
            <p className="mt-2 text-[#94A3B8] max-w-xl text-sm leading-relaxed">
              Select seats on real-time SVG maps with guaranteed zero double-bookings under
              concurrent demand.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {user?.role === 'organizer' && (
              <Link
                href="/organizer/events/new"
                className="px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-semibold rounded-lg transition"
              >
                + Create Event
              </Link>
            )}
            {events.length === 0 && !loadingEvents && (
              <button
                type="button"
                onClick={handleSeedDemo}
                disabled={seeding}
                className="px-3.5 py-2 bg-[#334155] hover:bg-[#475569] text-[#F1F5F9] text-xs font-semibold rounded-lg transition disabled:opacity-50"
              >
                {seeding ? 'Seeding Demo Event...' : 'Load Sample Concert'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Published Events Catalog */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#F1F5F9]">Upcoming Events</h2>
          <span className="text-xs text-[#94A3B8]">
            {events.length} {events.length === 1 ? 'event' : 'events'} available
          </span>
        </div>

        {loadingEvents ? (
          <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-8 text-center text-sm text-[#94A3B8]">
            Loading scheduled events...
          </div>
        ) : events.length === 0 ? (
          <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-10 text-center">
            <h3 className="text-base font-semibold text-[#F1F5F9] mb-1">No Published Events Yet</h3>
            <p className="text-xs text-[#94A3B8] max-w-md mx-auto mb-6">
              Create your first event from the organizer dashboard or load the sample orchestral
              showcase.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleSeedDemo}
                disabled={seeding}
                className="px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-semibold rounded-lg transition"
              >
                {seeding ? 'Seeding...' : 'Load Demo Showcase'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {events.map((evt) => (
              <div
                key={evt.id}
                className="bg-[#1E293B] border border-[#334155] hover:border-[#6366F1]/50 rounded-xl p-6 transition flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="text-lg font-bold text-[#F1F5F9] line-clamp-1">{evt.title}</h3>
                    {evt.isHighDemand && (
                      <span className="shrink-0 text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30">
                        High Demand
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#94A3B8] line-clamp-2 mb-4 leading-relaxed">
                    {evt.description}
                  </p>

                  <div className="space-y-1.5 text-xs text-[#94A3B8] mb-6">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Venue:</span>
                      <span className="text-[#F1F5F9] font-medium">{evt.venueName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Date:</span>
                      <span className="text-[#F1F5F9] font-medium">
                        {new Date(evt.eventDate).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Capacity:</span>
                      <span className="text-[#F1F5F9] font-medium">{evt.totalSeats} seats</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#334155] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase text-[#94A3B8] block">Price from</span>
                    <span className="text-sm font-bold text-[#F1F5F9]">
                      {formatPrice(evt.minPrice)}
                      {evt.maxPrice > evt.minPrice && ` - ${formatPrice(evt.maxPrice)}`}
                    </span>
                  </div>
                  <Link
                    href={`/events/${evt.id}`}
                    className="px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-semibold rounded-lg transition"
                  >
                    Select Seats &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* System Status Panel */}
      <section className="bg-[#1E293B] border border-[#334155] rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#94A3B8]">
            Platform Infrastructure Health
          </h2>
          <button
            type="button"
            onClick={fetchHealth}
            className="text-xs text-[#6366F1] hover:underline"
          >
            Check status
          </button>
        </div>

        {health && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#0F172A] p-3 rounded-lg border border-[#334155]">
              <span className="text-[10px] text-[#94A3B8] uppercase block">Fastify API</span>
              <span className="text-xs font-semibold text-[#22C55E]">Operational</span>
            </div>
            <div className="bg-[#0F172A] p-3 rounded-lg border border-[#334155]">
              <span className="text-[10px] text-[#94A3B8] uppercase block">PostgreSQL</span>
              <span className="text-xs font-semibold text-[#22C55E]">
                {health.services?.database?.healthy
                  ? 'Connected (Source of truth)'
                  : 'Disconnected'}
              </span>
            </div>
            <div className="bg-[#0F172A] p-3 rounded-lg border border-[#334155]">
              <span className="text-[10px] text-[#94A3B8] uppercase block">Redis</span>
              <span className="text-xs font-semibold text-[#22C55E]">
                {health.services?.redis?.healthy ? 'Active (Atomic Locks & TTL)' : 'Disconnected'}
              </span>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
