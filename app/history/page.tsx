'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

interface HistoryStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  averageBid: number;
  totalPoints: number;
}

interface HistoryRow {
  game_id: string;
  game_code: string | null;
  hand_number: number;
  player_name: string | null;
  bid_amount: number | null;
  score_delta: number;
  running_total: number;
  trick_points_won: number;
  is_bidder: boolean;
  is_partner: boolean;
  did_win: boolean;
  created_at: string;
}

interface TrendPoint {
  idx: number;
  label: string;
  value: number;
  created_at: string;
}

interface GameSummaryRow {
  gameCode: string;
  hands: number;
  points: number;
  wins: number;
  losses: number;
  averageBid: number;
}

interface DashboardPayload {
  stats: HistoryStats;
  analytics: {
    cumulativeTrend: TrendPoint[];
    bidTrend: TrendPoint[];
    roleBreakdown: { bidder: number; partner: number; opponent: number };
    gameSummary: GameSummaryRow[];
  };
  history: HistoryRow[];
}

function MiniLineChart({
  points,
  positiveColor = '#2563eb',
}: {
  points: TrendPoint[];
  positiveColor?: string;
}) {
  if (!points.length) {
    return <div className="text-sm text-gray-500">No data yet.</div>;
  }

  const width = 640;
  const height = 180;
  const minValue = Math.min(...points.map((p) => p.value));
  const maxValue = Math.max(...points.map((p) => p.value));
  const range = Math.max(1, maxValue - minValue);

  const path = points
    .map((p, i) => {
      const x = (i / Math.max(1, points.length - 1)) * (width - 20) + 10;
      const y = height - 10 - ((p.value - minValue) / range) * (height - 20);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full rounded bg-gray-50">
      <polyline fill="none" stroke={positiveColor} strokeWidth="3" points={path} />
    </svg>
  );
}

function RoleBar({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span>
          {value} ({pct}%)
        </span>
      </div>
      <div className="h-2 rounded bg-gray-200">
        <div className="h-2 rounded bg-gray-800" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function HistoryDashboardPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);

  const loadDashboard = async (authUserId: string) => {
    setLoadingDashboard(true);
    setError(null);
    try {
      const res = await fetch(`/api/history?authUserId=${encodeURIComponent(authUserId)}`);
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        const errorMsg = typeof data.error === 'string' ? data.error : 'Failed to fetch dashboard';
        const details = typeof data.details === 'string' ? data.details : '';
        setError([errorMsg, details].filter(Boolean).join(' - '));
        setPayload(null);
        return;
      }
      setPayload(data as DashboardPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard');
      setPayload(null);
    } finally {
      setLoadingDashboard(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setLoadingSession(false);
      if (data.session?.user?.id) {
        void loadDashboard(data.session.user.id);
      }
    };
    void init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_evt, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user?.id) {
        void loadDashboard(nextSession.user.id);
      } else {
        setPayload(null);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const latestRows = useMemo(() => payload?.history?.slice(0, 25) ?? [], [payload]);
  const roleTotal = payload
    ? payload.analytics.roleBreakdown.bidder +
      payload.analytics.roleBreakdown.partner +
      payload.analytics.roleBreakdown.opponent
    : 0;

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="mx-auto max-w-6xl rounded-lg bg-white p-6 shadow">Loading dashboard...</div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="mx-auto max-w-3xl rounded-lg bg-white p-6 shadow">
          <h1 className="text-2xl font-semibold text-black">Game History Dashboard</h1>
          <p className="mt-2 text-sm text-gray-700">Please sign in with Google first to view your dashboard.</p>
          <Link href="/" className="mt-4 inline-block rounded bg-black px-4 py-2 text-sm font-medium text-white">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4 shadow">
          <div>
            <h1 className="text-2xl font-semibold text-black">Game History Dashboard</h1>
            <p className="text-sm text-gray-600">{session.user.email ?? 'Signed-in user'}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (session.user.id) void loadDashboard(session.user.id);
              }}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              Refresh
            </button>
            <Link href="/" className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-black">
              Home
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {loadingDashboard && !payload ? (
          <div className="rounded-lg bg-white p-6 shadow">Loading data...</div>
        ) : payload ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="rounded-lg bg-white p-4 shadow">
                <div className="text-xs text-gray-500">Games Played</div>
                <div className="text-2xl font-semibold text-black">{payload.stats.gamesPlayed}</div>
              </div>
              <div className="rounded-lg bg-white p-4 shadow">
                <div className="text-xs text-gray-500">Wins</div>
                <div className="text-2xl font-semibold text-black">{payload.stats.wins}</div>
              </div>
              <div className="rounded-lg bg-white p-4 shadow">
                <div className="text-xs text-gray-500">Losses</div>
                <div className="text-2xl font-semibold text-black">{payload.stats.losses}</div>
              </div>
              <div className="rounded-lg bg-white p-4 shadow">
                <div className="text-xs text-gray-500">Win Rate</div>
                <div className="text-2xl font-semibold text-black">{payload.stats.winRate}%</div>
              </div>
              <div className="rounded-lg bg-white p-4 shadow">
                <div className="text-xs text-gray-500">Average Bid</div>
                <div className="text-2xl font-semibold text-black">{payload.stats.averageBid}</div>
              </div>
              <div className="rounded-lg bg-white p-4 shadow">
                <div className="text-xs text-gray-500">Total Points</div>
                <div className="text-2xl font-semibold text-black">{payload.stats.totalPoints}</div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg bg-white p-4 shadow">
                <h2 className="mb-2 text-sm font-semibold text-black">Cumulative Points Trend</h2>
                <MiniLineChart points={payload.analytics.cumulativeTrend} positiveColor="#1f2937" />
              </div>
              <div className="rounded-lg bg-white p-4 shadow">
                <h2 className="mb-3 text-sm font-semibold text-black">Role Breakdown</h2>
                <div className="space-y-3">
                  <RoleBar label="As Bidder" value={payload.analytics.roleBreakdown.bidder} total={roleTotal} />
                  <RoleBar label="As Partner" value={payload.analytics.roleBreakdown.partner} total={roleTotal} />
                  <RoleBar label="As Opponent" value={payload.analytics.roleBreakdown.opponent} total={roleTotal} />
                </div>
              </div>
            </section>

            <section className="rounded-lg bg-white p-4 shadow">
              <h2 className="mb-2 text-sm font-semibold text-black">Per-Game Summary</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                      <th className="px-2 py-2">Game</th>
                      <th className="px-2 py-2">Hands</th>
                      <th className="px-2 py-2">Points</th>
                      <th className="px-2 py-2">W/L</th>
                      <th className="px-2 py-2">Avg Bid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.analytics.gameSummary.length === 0 ? (
                      <tr>
                        <td className="px-2 py-3 text-gray-500" colSpan={5}>
                          No game summary yet.
                        </td>
                      </tr>
                    ) : (
                      payload.analytics.gameSummary.map((row) => (
                        <tr key={row.gameCode} className="border-b border-gray-100">
                          <td className="px-2 py-2 font-medium text-black">{row.gameCode}</td>
                          <td className="px-2 py-2">{row.hands}</td>
                          <td className="px-2 py-2">{row.points}</td>
                          <td className="px-2 py-2">
                            {row.wins}/{row.losses}
                          </td>
                          <td className="px-2 py-2">{row.averageBid}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg bg-white p-4 shadow">
              <h2 className="mb-2 text-sm font-semibold text-black">Recent Hands</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Game</th>
                      <th className="px-2 py-2">Hand</th>
                      <th className="px-2 py-2">Role</th>
                      <th className="px-2 py-2">Bid</th>
                      <th className="px-2 py-2">Trick Points</th>
                      <th className="px-2 py-2">Score Delta</th>
                      <th className="px-2 py-2">Running Total</th>
                      <th className="px-2 py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestRows.length === 0 ? (
                      <tr>
                        <td className="px-2 py-3 text-gray-500" colSpan={9}>
                          No hands recorded yet.
                        </td>
                      </tr>
                    ) : (
                      latestRows.map((row, idx) => {
                        const role = row.is_bidder ? 'Bidder' : row.is_partner ? 'Partner' : 'Opponent';
                        return (
                          <tr key={`${row.created_at}-${idx}`} className="border-b border-gray-100">
                            <td className="px-2 py-2">{new Date(row.created_at).toLocaleString()}</td>
                            <td className="px-2 py-2">{row.game_code ?? row.game_id.slice(0, 8)}</td>
                            <td className="px-2 py-2">{row.hand_number}</td>
                            <td className="px-2 py-2">{role}</td>
                            <td className="px-2 py-2">{row.bid_amount ?? '-'}</td>
                            <td className="px-2 py-2">{row.trick_points_won}</td>
                            <td className="px-2 py-2">
                              {row.score_delta >= 0 ? '+' : ''}
                              {row.score_delta}
                            </td>
                            <td className="px-2 py-2">{row.running_total}</td>
                            <td className="px-2 py-2">{row.did_win ? 'Win' : 'Loss'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <div className="rounded-lg bg-white p-6 shadow text-sm text-gray-600">No dashboard data yet.</div>
        )}
      </div>
    </div>
  );
}

