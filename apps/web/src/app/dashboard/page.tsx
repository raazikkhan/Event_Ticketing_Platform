'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../context/auth-context';

interface Ticket {
  id: string;
  seatId: string;
  ticketCode: string;
  status: 'issued' | 'used' | 'refunded';
}

interface Booking {
  id: string;
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'refunded';
  event: {
    title: string;
    venueName: string;
    eventDate: string;
  } | null;
  tickets: Ticket[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || user.role !== 'attendee') return;
    fetch(`${API_BASE}/api/dashboard/bookings`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load bookings');
        setBookings(body.bookings);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load'));
  }, [user]);

  const refund = async (bookingId: string) => {
    const response = await fetch(`${API_BASE}/api/bookings/${bookingId}/refund`, {
      method: 'POST',
      credentials: 'include',
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || 'Refund failed');
      return;
    }
    setBookings((current) =>
      current.map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              status: 'refunded',
              tickets: booking.tickets.map((ticket) => ({ ...ticket, status: 'refunded' })),
            }
          : booking,
      ),
    );
  };

  const downloadQr = async (ticketId: string) => {
    const response = await fetch(`${API_BASE}/api/tickets/${ticketId}/qr`, {
      credentials: 'include',
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || 'Unable to load QR ticket');
      return;
    }
    const link = document.createElement('a');
    link.href = body.qrCode;
    link.download = `ticket-${ticketId}.png`;
    link.click();
  };

  if (loading)
    return <main className="max-w-5xl mx-auto px-6 py-12 text-[#94A3B8]">Loading...</main>;
  if (!user || user.role !== 'attendee') {
    return (
      <main className="max-w-5xl mx-auto px-6 py-12 text-[#EF4444]">Attendee access required.</main>
    );
  }

  const now = Date.now();
  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-6">Upcoming and Past Bookings</h1>
      {error && <p className="text-[#EF4444] mb-4">{error}</p>}
      {bookings.length === 0 ? (
        <p className="text-[#94A3B8]">No bookings yet.</p>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const eventDate = booking.event ? new Date(booking.event.eventDate).getTime() : 0;
            const refundable =
              booking.status === 'confirmed' && eventDate - now > 24 * 60 * 60 * 1000;
            return (
              <section
                key={booking.id}
                className="bg-[#1E293B] border border-[#334155] rounded-xl p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-bold">{booking.event?.title ?? 'Event'}</h2>
                    <p className="text-xs text-[#94A3B8] mt-1">
                      {booking.event?.venueName} ·{' '}
                      {booking.event ? new Date(booking.event.eventDate).toLocaleString() : ''}
                    </p>
                    <p className="text-xs mt-2 uppercase text-[#94A3B8]">{booking.status}</p>
                  </div>
                  {refundable && (
                    <button
                      type="button"
                      onClick={() => refund(booking.id)}
                      className="text-xs px-3 py-2 border border-[#EF4444] text-[#EF4444] rounded-lg"
                    >
                      Request refund
                    </button>
                  )}
                </div>
                <div className="mt-4 grid sm:grid-cols-2 gap-2">
                  {booking.tickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="border border-[#334155] rounded-lg p-3 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs text-[#94A3B8]">Ticket</p>
                        <p className="text-sm font-semibold uppercase">{ticket.status}</p>
                      </div>
                      {ticket.status === 'issued' && (
                        <button
                          type="button"
                          onClick={() => downloadQr(ticket.id)}
                          className="text-xs text-[#6366F1]"
                        >
                          Download QR
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
