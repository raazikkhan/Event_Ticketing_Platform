'use client';

import { useCallback, useEffect, useState } from 'react';

interface HealthState {
  status: string;
  timestamp?: string;
  uptimeSeconds?: number;
  services?: {
    database?: { healthy: boolean; latencyMs?: number; error?: string };
    redis?: { healthy: boolean; latencyMs?: number; error?: string };
  };
}

export default function HomePage() {
  const [health, setHealth] = useState<HealthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/health`);
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach API server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="border-b border-[#334155] pb-8 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#F1F5F9]">
              Event Ticketing Platform
            </h1>
            <p className="mt-2 text-[#94A3B8]">
              High-concurrency reservation engine with zero double-booking guarantee.
            </p>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#6366F1]/20 text-[#6366F1] border border-[#6366F1]/30">
            MVP Engine
          </span>
        </div>
      </div>

      {/* System Status Panel */}
      <section className="bg-[#1E293B] border border-[#334155] rounded-xl p-6 mb-8 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#F1F5F9]">System Health Status</h2>
          <button
            type="button"
            onClick={checkHealth}
            className="px-3 py-1.5 text-xs font-medium bg-[#334155] hover:bg-[#475569] text-[#F1F5F9] rounded transition"
          >
            Refresh Status
          </button>
        </div>

        {loading && <p className="text-sm text-[#94A3B8]">Querying /health endpoint...</p>}

        {error && (
          <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444] rounded-lg p-4 text-sm">
            <strong>Connection Notice:</strong> {error}
            <div className="text-xs text-[#94A3B8] mt-1">
              Ensure the Fastify API server is running on port 4000.
            </div>
          </div>
        )}

        {health && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#0F172A] border border-[#334155] rounded-lg p-4">
              <span className="text-xs font-medium text-[#94A3B8] uppercase">API Status</span>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    health.status === 'ok' ? 'bg-[#22C55E]' : 'bg-[#EF4444]'
                  }`}
                />
                <span className="text-sm font-semibold capitalize text-[#F1F5F9]">
                  {health.status}
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">Uptime: {health.uptimeSeconds ?? 0}s</p>
            </div>

            <div className="bg-[#0F172A] border border-[#334155] rounded-lg p-4">
              <span className="text-xs font-medium text-[#94A3B8] uppercase">PostgreSQL</span>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    health.services?.database?.healthy ? 'bg-[#22C55E]' : 'bg-[#EF4444]'
                  }`}
                />
                <span className="text-sm font-semibold text-[#F1F5F9]">
                  {health.services?.database?.healthy ? 'Connected' : 'Unavailable'}
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">
                {health.services?.database?.latencyMs !== undefined
                  ? `Latency: ${health.services.database.latencyMs}ms`
                  : health.services?.database?.error || 'Source of truth'}
              </p>
            </div>

            <div className="bg-[#0F172A] border border-[#334155] rounded-lg p-4">
              <span className="text-xs font-medium text-[#94A3B8] uppercase">
                Redis Cache & Locks
              </span>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    health.services?.redis?.healthy ? 'bg-[#22C55E]' : 'bg-[#EF4444]'
                  }`}
                />
                <span className="text-sm font-semibold text-[#F1F5F9]">
                  {health.services?.redis?.healthy ? 'Connected' : 'Unavailable'}
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">
                {health.services?.redis?.latencyMs !== undefined
                  ? `Latency: ${health.services.redis.latencyMs}ms`
                  : health.services?.redis?.error || 'Atomic holds & queues'}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Seat State Legend Preview */}
      <section className="bg-[#1E293B] border border-[#334155] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-[#F1F5F9] mb-4">Seat State Design Tokens</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-3 bg-[#0F172A] p-3 rounded-lg border border-[#334155]">
            <div className="w-6 h-6 rounded bg-[#334155] border border-slate-500" />
            <div>
              <div className="text-xs font-medium text-[#F1F5F9]">Available</div>
              <div className="text-[10px] text-[#94A3B8]">#334155</div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-[#0F172A] p-3 rounded-lg border border-[#334155]">
            <div className="w-6 h-6 rounded bg-[#6366F1]" />
            <div>
              <div className="text-xs font-medium text-[#F1F5F9]">Selected</div>
              <div className="text-[10px] text-[#94A3B8]">#6366F1</div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-[#0F172A] p-3 rounded-lg border border-[#334155]">
            <div className="w-6 h-6 rounded bg-[#F59E0B]" />
            <div>
              <div className="text-xs font-medium text-[#F1F5F9]">Held</div>
              <div className="text-[10px] text-[#94A3B8]">#F59E0B</div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-[#0F172A] p-3 rounded-lg border border-[#334155]">
            <div className="w-6 h-6 rounded bg-[#475569] opacity-50" />
            <div>
              <div className="text-xs font-medium text-[#F1F5F9]">Sold</div>
              <div className="text-[10px] text-[#94A3B8]">#475569</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
