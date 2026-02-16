import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const authUserId = (searchParams.get('authUserId') ?? '').trim();

    if (!isUuid(authUserId)) {
      return NextResponse.json({ error: 'Valid authUserId is required' }, { status: 400 });
    }

    const { data: rows, error } = await supabase
      .from('user_game_history')
      .select(
        'auth_user_id,game_id,game_code,hand_number,player_id,player_name,bid_amount,score_delta,running_total,trick_points_won,is_bidder,is_partner,did_win,created_at'
      )
      .eq('auth_user_id', authUserId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json(
        {
          error: 'Failed to fetch history',
          details: error.message,
          hint: 'Run the history schema migration first (supabase-history-schema.sql).',
        },
        { status: 500 }
      );
    }

    const history = rows ?? [];
    const gamesPlayed = history.length;
    const wins = history.filter((row) => !!row.did_win).length;
    const losses = gamesPlayed - wins;
    const totalPoints = history.reduce((sum, row) => sum + (row.score_delta ?? 0), 0);
    const bidRows = history.filter((row) => typeof row.bid_amount === 'number');
    const averageBid = bidRows.length
      ? Math.round(
          bidRows.reduce((sum, row) => sum + ((row.bid_amount as number) ?? 0), 0) / bidRows.length
        )
      : 0;
    const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

    const ordered = [...history].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const cumulativeTrend = ordered.map((row, index) => ({
      idx: index + 1,
      label: `H${row.hand_number}`,
      value: row.running_total ?? 0,
      created_at: row.created_at,
    }));

    const bidTrend = ordered
      .filter((row) => typeof row.bid_amount === 'number')
      .map((row, index) => ({
        idx: index + 1,
        game_code: row.game_code,
        hand_number: row.hand_number,
        value: row.bid_amount as number,
        created_at: row.created_at,
      }));

    const roleBreakdown = history.reduce(
      (acc, row) => {
        if (row.is_bidder) acc.bidder += 1;
        else if (row.is_partner) acc.partner += 1;
        else acc.opponent += 1;
        return acc;
      },
      { bidder: 0, partner: 0, opponent: 0 }
    );

    const byGameMap = new Map<
      string,
      { gameCode: string; hands: number; points: number; wins: number; losses: number; bids: number[] }
    >();
    for (const row of history) {
      const code = row.game_code ?? row.game_id.slice(0, 8);
      if (!byGameMap.has(code)) {
        byGameMap.set(code, { gameCode: code, hands: 0, points: 0, wins: 0, losses: 0, bids: [] });
      }
      const entry = byGameMap.get(code)!;
      entry.hands += 1;
      entry.points += row.score_delta ?? 0;
      if (row.did_win) entry.wins += 1;
      else entry.losses += 1;
      if (typeof row.bid_amount === 'number') entry.bids.push(row.bid_amount);
    }
    const gameSummary = [...byGameMap.values()]
      .map((g) => ({
        gameCode: g.gameCode,
        hands: g.hands,
        points: g.points,
        wins: g.wins,
        losses: g.losses,
        averageBid: g.bids.length ? Math.round(g.bids.reduce((s, b) => s + b, 0) / g.bids.length) : 0,
      }))
      .sort((a, b) => b.hands - a.hands || b.points - a.points);

    return NextResponse.json({
      stats: {
        gamesPlayed,
        wins,
        losses,
        winRate,
        averageBid,
        totalPoints,
      },
      analytics: {
        cumulativeTrend,
        bidTrend,
        roleBreakdown,
        gameSummary,
      },
      history,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

