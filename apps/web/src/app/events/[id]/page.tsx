'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface Seat {
  id: string;
  eventId: string;
  sectionId: string;
  rowLabel: string;
  seatNumber: number;
  seatLabel: string;
  price: number;
  sectionName: string;
  status: 'available' | 'held' | 'sold';
}

interface Section {
  id: string;
  name: string;
  price: number;
  rowsCount: number;
  seatsPerRow: number;
}

interface EventData {
  event: {
    id: string;
    title: string;
    description: string;
    venueName: string;
    venueAddress: string;
    eventDate: string;
    status: string;
    isHighDemand: boolean;
  };
  sections: Section[];
  seats: Seat[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [data, setData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [hoveredSeat, setHoveredSeat] = useState<Seat | null>(null);
  const [holding, setHolding] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [activeHoldId, setActiveHoldId] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const fetchEventData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/api/events/${eventId}`);
      if (!res.ok) {
        throw new Error('Event not found or unavailable');
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event details');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchEventData();
  }, [fetchEventData]);

  const toggleSeatSelection = (seat: Seat) => {
    if (seat.status !== 'available') return;

    setSelectedSeatIds((prev) => {
      if (prev.includes(seat.id)) {
        return prev.filter((id) => id !== seat.id);
      }
      return [...prev, seat.id];
    });
  };

  const reserveSeats = async () => {
    if (selectedSeatIds.length === 0) return;
    setHolding(true);
    setHoldError(null);

    try {
      const res = await fetch(`${API_BASE}/api/events/${eventId}/holds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ seatIds: selectedSeatIds }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Unable to reserve seats');
      }
      setActiveHoldId(body.hold.id);
      setSelectedSeatIds([]);
      await fetchEventData();
    } catch (err) {
      setHoldError(err instanceof Error ? err.message : 'Unable to reserve seats');
    } finally {
      setHolding(false);
    }
  };

  const initializeCheckout = async () => {
    if (!activeHoldId) return;
    setCheckoutError(null);

    try {
      const res = await fetch(`${API_BASE}/api/bookings/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ eventId, holdId: activeHoldId }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Unable to initialize checkout');
      }

      setCheckoutError(
        `Test checkout ready: ${body.checkout.razorpayOrderId} (${formatCurrency(body.checkout.amount)})`,
      );
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Unable to initialize checkout');
    }
  };

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-16 text-center text-[#94A3B8] text-sm">
        Loading event seat layout...
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="max-w-md mx-auto px-6 py-16 text-center">
        <div className="bg-[#1E293B] border border-[#EF4444]/30 rounded-xl p-8">
          <h1 className="text-lg font-bold text-[#F1F5F9] mb-2">Notice</h1>
          <p className="text-xs text-[#94A3B8] mb-6">{error || 'Event could not be found'}</p>
          <Link
            href="/"
            className="px-4 py-2 bg-[#6366F1] text-white text-xs font-semibold rounded-lg hover:bg-[#6366F1]/90"
          >
            &larr; Back to Events
          </Link>
        </div>
      </main>
    );
  }

  const { event, sections, seats } = data;
  const selectedSeats = seats.filter((s) => selectedSeatIds.includes(s.id));
  const subtotal = selectedSeats.reduce((sum, s) => sum + s.price, 0);

  // Group seats by section
  const sectionSeatsMap = new Map<string, Seat[]>();
  for (const s of seats) {
    const list = sectionSeatsMap.get(s.sectionId) || [];
    list.push(s);
    sectionSeatsMap.set(s.sectionId, list);
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      {/* Event Header */}
      <div className="mb-6">
        <Link href="/" className="text-xs text-[#6366F1] hover:underline mb-2 inline-block">
          &larr; Back to all events
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold text-[#F1F5F9]">{event.title}</h1>
              {event.isHighDemand && (
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30">
                  High Demand
                </span>
              )}
            </div>
            <p className="text-xs text-[#94A3B8] mt-1">
              {event.venueName} &bull; {event.venueAddress}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-[#94A3B8] block">Event Date</span>
            <span className="text-sm font-semibold text-[#F1F5F9]">
              {new Date(event.eventDate).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Main Seat Map Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* SVG Seat Layout Map */}
        <div className="lg:col-span-2 bg-[#1E293B] border border-[#334155] rounded-xl p-6 shadow-xl flex flex-col items-center">
          {/* Stage Element */}
          <div className="w-3/4 max-w-md h-8 bg-gradient-to-b from-[#334155] to-[#1E293B] border border-[#475569] rounded-t-xl flex items-center justify-center text-[11px] font-bold tracking-widest text-[#94A3B8] uppercase shadow-md mb-8">
            Stage / Screen
          </div>

          {/* Seat Legend */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[#94A3B8] mb-8 pb-4 border-b border-[#334155] w-full">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-[#334155] border border-slate-500" />
              <span>Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-[#6366F1] flex items-center justify-center text-white text-[9px] font-bold">
                ✓
              </div>
              <span>Selected by you</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-[#F59E0B] flex items-center justify-center text-black text-[9px] font-bold">
                ⌛
              </div>
              <span>Held by others</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-[#475569] opacity-40 flex items-center justify-center text-white text-[9px] font-bold">
                ✕
              </div>
              <span>Sold</span>
            </div>
          </div>

          {/* Dynamic SVG Map */}
          <div className="w-full overflow-x-auto pb-4 flex flex-col items-center">
            {sections.map((sec) => {
              const secSeats = sectionSeatsMap.get(sec.id) || [];
              const rowsMap = new Map<string, Seat[]>();
              for (const seat of secSeats) {
                const list = rowsMap.get(seat.rowLabel) || [];
                list.push(seat);
                rowsMap.set(seat.rowLabel, list);
              }
              const rowLabels = Array.from(rowsMap.keys()).sort();

              const seatSize = 30;
              const gap = 8;
              const sectionWidth = sec.seatsPerRow * (seatSize + gap) + 60;
              const sectionHeight = sec.rowsCount * (seatSize + gap) + 30;

              return (
                <div key={sec.id} className="mb-8 flex flex-col items-center">
                  <div className="text-center mb-2">
                    <span className="text-xs font-bold text-[#F1F5F9] uppercase tracking-wider">
                      {sec.name}
                    </span>
                    <span className="text-[11px] text-[#6366F1] font-semibold ml-2">
                      ({formatCurrency(sec.price)})
                    </span>
                  </div>

                  <svg
                    width={sectionWidth}
                    height={sectionHeight}
                    viewBox={`0 0 ${sectionWidth} ${sectionHeight}`}
                    className="select-none"
                    role="img"
                    aria-label={`Seat map for ${sec.name}`}
                  >
                    {rowLabels.map((rowLabel, rIndex) => {
                      const rowSeats = rowsMap.get(rowLabel) || [];
                      const y = rIndex * (seatSize + gap) + 15;

                      return (
                        <g key={rowLabel}>
                          {/* Row Label Left */}
                          <text
                            x={15}
                            y={y + seatSize / 2 + 4}
                            textAnchor="middle"
                            fill="#94A3B8"
                            fontSize="11"
                            fontWeight="bold"
                          >
                            {rowLabel}
                          </text>

                          {/* Row Seats */}
                          {rowSeats.map((seat, sIndex) => {
                            const x = 35 + sIndex * (seatSize + gap);
                            const isSelected = selectedSeatIds.includes(seat.id);
                            const isAvailable = seat.status === 'available';

                            let fillColor = '#334155';
                            let strokeColor = '#475569';
                            let opacity = 1;

                            if (isSelected) {
                              fillColor = '#6366F1';
                              strokeColor = '#818CF8';
                            } else if (seat.status === 'held') {
                              fillColor = '#F59E0B';
                              strokeColor = '#FBBF24';
                            } else if (seat.status === 'sold') {
                              fillColor = '#475569';
                              strokeColor = '#334155';
                              opacity = 0.4;
                            }

                            return (
                              <g
                                key={seat.id}
                                transform={`translate(${x}, ${y})`}
                                onClick={() => toggleSeatSelection(seat)}
                                onMouseEnter={() => setHoveredSeat(seat)}
                                onMouseLeave={() => setHoveredSeat(null)}
                                className={
                                  isAvailable
                                    ? 'cursor-pointer transition-transform'
                                    : 'cursor-not-allowed'
                                }
                                tabIndex={isAvailable ? 0 : -1}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    toggleSeatSelection(seat);
                                  }
                                }}
                                aria-label={`Seat ${seat.seatLabel}, Price ${formatCurrency(seat.price)}, Status ${isSelected ? 'Selected' : seat.status}`}
                              >
                                <rect
                                  width={seatSize}
                                  height={seatSize}
                                  rx={6}
                                  fill={fillColor}
                                  stroke={strokeColor}
                                  strokeWidth={isSelected ? 2 : 1}
                                  opacity={opacity}
                                />
                                {isSelected && (
                                  <text
                                    x={seatSize / 2}
                                    y={seatSize / 2 + 4}
                                    textAnchor="middle"
                                    fill="#ffffff"
                                    fontSize="12"
                                    fontWeight="bold"
                                  >
                                    ✓
                                  </text>
                                )}
                                {seat.status === 'held' && (
                                  <text
                                    x={seatSize / 2}
                                    y={seatSize / 2 + 4}
                                    textAnchor="middle"
                                    fill="#0F172A"
                                    fontSize="10"
                                    fontWeight="bold"
                                  >
                                    ⌛
                                  </text>
                                )}
                                {seat.status === 'sold' && (
                                  <text
                                    x={seatSize / 2}
                                    y={seatSize / 2 + 4}
                                    textAnchor="middle"
                                    fill="#94A3B8"
                                    fontSize="11"
                                    fontWeight="bold"
                                  >
                                    ✕
                                  </text>
                                )}
                              </g>
                            );
                          })}

                          {/* Row Label Right */}
                          <text
                            x={sectionWidth - 15}
                            y={y + seatSize / 2 + 4}
                            textAnchor="middle"
                            fill="#94A3B8"
                            fontSize="11"
                            fontWeight="bold"
                          >
                            {rowLabel}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              );
            })}
          </div>

          {/* Hover Tooltip Bar */}
          <div className="h-8 flex items-center justify-center text-xs text-[#94A3B8]">
            {hoveredSeat ? (
              <span className="text-[#F1F5F9] font-medium">
                Seat {hoveredSeat.seatLabel} &bull; {hoveredSeat.sectionName} &bull;{' '}
                {formatCurrency(hoveredSeat.price)}
                <span className="capitalize ml-2 text-[#22C55E]">({hoveredSeat.status})</span>
              </span>
            ) : (
              <span>Hover over a seat to view details & price</span>
            )}
          </div>
        </div>

        {/* Selected Seats & Order Preview Sidebar */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-6 h-fit shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#334155] mb-4">
              <h2 className="text-base font-bold text-[#F1F5F9]">Your Selection</h2>
              <span className="text-xs text-[#94A3B8]">
                {selectedSeats.length} {selectedSeats.length === 1 ? 'seat' : 'seats'}
              </span>
            </div>

            {selectedSeats.length === 0 ? (
              <p className="text-xs text-[#94A3B8] py-8 text-center">
                Click on any available seat on the seat map to start your reservation.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto mb-6 pr-1">
                {selectedSeats.map((seat) => (
                  <div
                    key={seat.id}
                    className="flex items-center justify-between p-2 rounded bg-[#0F172A] border border-[#334155] text-xs"
                  >
                    <div>
                      <span className="font-semibold text-[#F1F5F9] block">{seat.seatLabel}</span>
                      <span className="text-[10px] text-[#94A3B8]">{seat.sectionName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#F1F5F9]">{formatCurrency(seat.price)}</span>
                      <button
                        type="button"
                        onClick={() => toggleSeatSelection(seat)}
                        className="text-[#EF4444] hover:text-[#EF4444]/80 text-xs px-1"
                        aria-label={`Remove seat ${seat.seatLabel}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[#334155]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-[#94A3B8]">Subtotal:</span>
              <span className="text-xl font-bold text-[#F1F5F9]">{formatCurrency(subtotal)}</span>
            </div>

            <button
              type="button"
              onClick={reserveSeats}
              disabled={selectedSeats.length === 0 || holding}
              className="w-full py-2.5 px-4 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white font-medium text-xs rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {holding
                ? 'Reserving Seats...'
                : selectedSeats.length === 0
                  ? 'Select Seats Above'
                  : `Reserve ${selectedSeats.length} ${selectedSeats.length === 1 ? 'Seat' : 'Seats'} for 5 Minutes`}
            </button>

            {activeHoldId && (
              <button
                type="button"
                onClick={initializeCheckout}
                className="w-full mt-3 py-2.5 px-4 border border-[#6366F1] text-[#6366F1] hover:bg-[#6366F1]/10 font-medium text-xs rounded-lg transition"
              >
                Initialize Test Checkout
              </button>
            )}

            <p className="text-[11px] text-[#94A3B8] text-center mt-3 leading-relaxed">
              Clicking reserve initiates a 5-minute atomic Redis hold while you check out.
            </p>
            {holdError && (
              <p className="text-xs text-[#EF4444] text-center mt-3" role="alert">
                {holdError}
              </p>
            )}
            {checkoutError && (
              <output className="block text-xs text-[#22C55E] text-center mt-3">
                {checkoutError}
              </output>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
