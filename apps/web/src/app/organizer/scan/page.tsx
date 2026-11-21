'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useAuth } from '../../../context/auth-context';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function TicketScannerPage() {
  const { user, loading } = useAuth();
  const [ticketCode, setTicketCode] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const scan = async (event: FormEvent) => {
    event.preventDefault();
    setResult('');
    setError('');
    const response = await fetch(`${API_BASE}/api/organizer/tickets/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ticketCode }),
    });
    const body = await response.json();
    if (!response.ok) setError(body.error || 'Ticket validation failed');
    else setResult(`Ticket accepted for seat ${body.ticket.seatId}`);
  };

  if (loading)
    return <main className="max-w-xl mx-auto px-6 py-12 text-[#94A3B8]">Loading...</main>;
  if (!user || user.role !== 'organizer') {
    return (
      <main className="max-w-xl mx-auto px-6 py-12 text-[#EF4444]">Organizer access required.</main>
    );
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-6">Venue Ticket Scanner</h1>
      <form
        onSubmit={scan}
        className="bg-[#1E293B] border border-[#334155] rounded-xl p-6 space-y-4"
      >
        <label className="block text-sm text-[#94A3B8]" htmlFor="ticket-code">
          Ticket code
        </label>
        <textarea
          id="ticket-code"
          value={ticketCode}
          onChange={(event) => setTicketCode(event.target.value)}
          className="w-full h-28 rounded-lg border border-[#334155] bg-[#0F172A] p-3 text-xs"
          required
        />
        <button type="submit" className="w-full py-2.5 rounded-lg bg-[#6366F1] text-white text-sm">
          Validate Ticket
        </button>
      </form>
      {result && <p className="mt-4 text-[#22C55E]">{result}</p>}
      {error && <p className="mt-4 text-[#EF4444]">{error}</p>}
    </main>
  );
}
