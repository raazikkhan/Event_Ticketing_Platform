'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '../../../../context/auth-context';

interface SectionDraft {
  id: string;
  name: string;
  priceDollars: string;
  rowsCount: number;
  seatsPerRow: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function NewEventPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [isHighDemand, setIsHighDemand] = useState(false);

  const [sections, setSections] = useState<SectionDraft[]>([
    { id: 'sec-1', name: 'VIP Orchestra', priceDollars: '75.00', rowsCount: 2, seatsPerRow: 6 },
    { id: 'sec-2', name: 'General Seating', priceDollars: '35.00', rowsCount: 4, seatsPerRow: 10 },
  ]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-12 text-[#94A3B8] text-sm">
        Verifying organizer permissions...
      </main>
    );
  }

  if (!user || user.role !== 'organizer') {
    return (
      <main className="max-w-md mx-auto px-6 py-16 text-center">
        <div className="bg-[#1E293B] border border-[#EF4444]/30 rounded-xl p-8">
          <h1 className="text-lg font-bold text-[#F1F5F9] mb-2">Organizer Access Only</h1>
          <p className="text-xs text-[#94A3B8] mb-6">
            You must be logged in as an organizer to create events.
          </p>
          <Link
            href="/login"
            className="px-4 py-2 bg-[#6366F1] text-white text-xs font-semibold rounded-lg hover:bg-[#6366F1]/90"
          >
            Sign In as Organizer
          </Link>
        </div>
      </main>
    );
  }

  const handleAddSection = () => {
    setSections((prev) => [
      ...prev,
      {
        id: `sec-${Date.now()}-${prev.length + 1}`,
        name: `Section ${prev.length + 1}`,
        priceDollars: '25.00',
        rowsCount: 3,
        seatsPerRow: 8,
      },
    ]);
  };

  const handleRemoveSection = (id: string) => {
    if (sections.length <= 1) return;
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSectionChange = (
    id: string,
    field: keyof Omit<SectionDraft, 'id'>,
    value: string | number,
  ) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const totalSeats = sections.reduce(
    (sum, s) => sum + (Number(s.rowsCount) || 0) * (Number(s.seatsPerRow) || 0),
    0,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const payload = {
        title,
        description,
        venueName,
        venueAddress,
        eventDate: new Date(eventDate).toISOString(),
        status: 'published',
        isHighDemand,
        sections: sections.map((s) => ({
          name: s.name,
          price: Math.round(Number.parseFloat(s.priceDollars) * 100),
          rowsCount: Number(s.rowsCount),
          seatsPerRow: Number(s.seatsPerRow),
        })),
      };

      const res = await fetch(`${API_BASE}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create event layout');
      }

      router.push(`/events/${data.event.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Event creation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-8">
        <Link
          href="/organizer"
          className="text-xs text-[#6366F1] hover:underline mb-2 inline-block"
        >
          &larr; Back to Organizer Hub
        </Link>
        <h1 className="text-2xl font-bold text-[#F1F5F9]">Create Event & Seating Map</h1>
        <p className="text-xs text-[#94A3B8] mt-1">
          Configure venue details and seating layout. The system will automatically generate all
          individual seat coordinates.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444] text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Event Details Card */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-6 shadow-md space-y-4">
          <h2 className="text-sm font-semibold text-[#F1F5F9] uppercase tracking-wider">
            1. Event Information
          </h2>

          <div>
            <label htmlFor="event-title" className="block text-xs font-medium text-[#94A3B8] mb-1">
              Event Title
            </label>
            <input
              id="event-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Moonlight Jazz Festival 2026"
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] focus:outline-none focus:border-[#6366F1]"
            />
          </div>

          <div>
            <label htmlFor="event-desc" className="block text-xs font-medium text-[#94A3B8] mb-1">
              Event Description
            </label>
            <textarea
              id="event-desc"
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide a detailed overview of the performance, schedule, and artists..."
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] focus:outline-none focus:border-[#6366F1]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="venue-name" className="block text-xs font-medium text-[#94A3B8] mb-1">
                Venue Name
              </label>
              <input
                id="venue-name"
                type="text"
                required
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                placeholder="e.g. Civic Auditorium"
                className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] focus:outline-none focus:border-[#6366F1]"
              />
            </div>

            <div>
              <label
                htmlFor="event-datetime"
                className="block text-xs font-medium text-[#94A3B8] mb-1"
              >
                Event Date & Time
              </label>
              <input
                id="event-datetime"
                type="datetime-local"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] focus:outline-none focus:border-[#6366F1]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="venue-address"
              className="block text-xs font-medium text-[#94A3B8] mb-1"
            >
              Venue Physical Address
            </label>
            <input
              id="venue-address"
              type="text"
              required
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
              placeholder="e.g. 450 Theater Row, Suite 100, City, State"
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F1F5F9] focus:outline-none focus:border-[#6366F1]"
            />
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[#94A3B8]">
              <input
                type="checkbox"
                checked={isHighDemand}
                onChange={(e) => setIsHighDemand(e.target.checked)}
                className="rounded border-[#334155] text-[#6366F1] focus:ring-0"
              />
              <span>
                Flag as <strong className="text-[#F1F5F9]">High Demand</strong> (enables Waiting
                Room & bot rate limiting in Part 10)
              </span>
            </label>
          </div>
        </div>

        {/* Seat Layout Sections Builder */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#334155]">
            <div>
              <h2 className="text-sm font-semibold text-[#F1F5F9] uppercase tracking-wider">
                2. Seating Layout & Price Tiers
              </h2>
              <span className="text-xs text-[#94A3B8]">
                Generated capacity: <strong className="text-[#22C55E]">{totalSeats} seats</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={handleAddSection}
              className="px-2.5 py-1 text-xs font-semibold bg-[#334155] hover:bg-[#475569] text-[#F1F5F9] rounded transition"
            >
              + Add Section
            </button>
          </div>

          <div className="space-y-4">
            {sections.map((sec, idx) => (
              <div
                key={sec.id}
                className="bg-[#0F172A] border border-[#334155] rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#F1F5F9]">Section #{idx + 1}</span>
                  {sections.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSection(sec.id)}
                      className="text-xs text-[#EF4444] hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-1">
                    <label
                      htmlFor={`sec-${sec.id}-name`}
                      className="block text-[10px] text-[#94A3B8] uppercase mb-1"
                    >
                      Name
                    </label>
                    <input
                      id={`sec-${sec.id}-name`}
                      type="text"
                      required
                      value={sec.name}
                      onChange={(e) => handleSectionChange(sec.id, 'name', e.target.value)}
                      placeholder="e.g. VIP"
                      className="w-full px-2.5 py-1.5 bg-[#1E293B] border border-[#334155] rounded text-xs text-[#F1F5F9] focus:outline-none focus:border-[#6366F1]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`sec-${sec.id}-price`}
                      className="block text-[10px] text-[#94A3B8] uppercase mb-1"
                    >
                      Price ($)
                    </label>
                    <input
                      id={`sec-${sec.id}-price`}
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      value={sec.priceDollars}
                      onChange={(e) => handleSectionChange(sec.id, 'priceDollars', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#1E293B] border border-[#334155] rounded text-xs text-[#F1F5F9] focus:outline-none focus:border-[#6366F1]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`sec-${sec.id}-rows`}
                      className="block text-[10px] text-[#94A3B8] uppercase mb-1"
                    >
                      Rows Count
                    </label>
                    <input
                      id={`sec-${sec.id}-rows`}
                      type="number"
                      min="1"
                      max="30"
                      required
                      value={sec.rowsCount}
                      onChange={(e) =>
                        handleSectionChange(sec.id, 'rowsCount', Number(e.target.value))
                      }
                      className="w-full px-2.5 py-1.5 bg-[#1E293B] border border-[#334155] rounded text-xs text-[#F1F5F9] focus:outline-none focus:border-[#6366F1]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`sec-${sec.id}-seats`}
                      className="block text-[10px] text-[#94A3B8] uppercase mb-1"
                    >
                      Seats / Row
                    </label>
                    <input
                      id={`sec-${sec.id}-seats`}
                      type="number"
                      min="1"
                      max="50"
                      required
                      value={sec.seatsPerRow}
                      onChange={(e) =>
                        handleSectionChange(sec.id, 'seatsPerRow', Number(e.target.value))
                      }
                      className="w-full px-2.5 py-1.5 bg-[#1E293B] border border-[#334155] rounded text-xs text-[#F1F5F9] focus:outline-none focus:border-[#6366F1]"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-[#94A3B8]">
                  Rows: {sec.rowsCount} &bull; Seats/row: {sec.seatsPerRow} &rarr;{' '}
                  <strong className="text-[#F1F5F9]">
                    {sec.rowsCount * sec.seatsPerRow} seats
                  </strong>{' '}
                  in this section
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 px-4 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white font-semibold text-sm rounded-lg transition disabled:opacity-50 shadow-lg"
        >
          {submitting
            ? 'Generating Matrix & Publishing Event...'
            : 'Publish Event & Generate Seat Map'}
        </button>
      </form>
    </main>
  );
}
