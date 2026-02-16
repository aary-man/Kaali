import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import { Bid, GameState, PlayerId, Trick } from '@/lib/game/types';

function remapByPlayerId<T extends { playerId: PlayerId }>(items: T[], oldId: PlayerId, newId: PlayerId): T[] {
  return items.map((item) => ({
    ...item,
    playerId: item.playerId === oldId ? newId : item.playerId,
  }));
}

function remapBid(bid: Bid | undefined, oldId: PlayerId, newId: PlayerId): Bid | undefined {
  if (!bid) return bid;
  if (bid.playerId !== oldId) return bid;
  return { ...bid, playerId: newId };
}

function remapTricks(tricks: Trick[], oldId: PlayerId, newId: PlayerId): Trick[] {
  return tricks.map((trick) => ({
    ...trick,
    leaderId: trick.leaderId === oldId ? newId : trick.leaderId,
    winnerId: trick.winnerId === oldId ? newId : trick.winnerId,
    plays: remapByPlayerId(trick.plays, oldId, newId),
  }));
}

function remapRecordKeys(record: Record<string, number> | undefined, oldId: PlayerId, newId: PlayerId) {
  if (!record) return record;
  const entries = Object.entries(record).map(([key, value]) => [key === oldId ? newId : key, value] as const);
  return Object.fromEntries(entries);
}

function remapStringRecordKeys(record: Record<string, string>, oldId: PlayerId, newId: PlayerId) {
  const entries = Object.entries(record).map(([key, value]) => [key === oldId ? newId : key, value] as const);
  return Object.fromEntries(entries);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameId } = await context.params;
    const body = await request.json();
    const requestedUsername = typeof body?.username === 'string' ? body.username.trim() : '';

    if (!gameId) {
      return NextResponse.json({ error: 'Game ID is required' }, { status: 400 });
    }

    const { data: gameData, error: fetchError } = await supabase
      .from('games')
      .select('current_state')
      .eq('id', gameId)
      .single();

    if (fetchError || !gameData?.current_state) {
      return NextResponse.json({ error: 'Game not found', details: fetchError?.message }, { status: 404 });
    }

    const gameState = gameData.current_state as GameState;
    const openSeatIds = gameState.openSeatIds ?? [];

    if (openSeatIds.length === 0) {
      return NextResponse.json({ error: 'Game is full' }, { status: 400 });
    }

    // Joining is only allowed while waiting in lobby.
    if (gameState.phase !== 'lobby') {
      return NextResponse.json(
        { error: 'Game already started. Joining is only allowed in lobby.' },
        { status: 400 }
      );
    }

    const seatIdToClaim = openSeatIds[0];
    const joinedPlayerId = uuidv4();
    let username = requestedUsername || `Player-${joinedPlayerId.slice(0, 8)}`;

    let { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: joinedPlayerId, username }, { onConflict: 'id' });

    // Handle duplicate username with simple suffix retry.
    if (profileError?.code === '23505') {
      username = `${username}-${joinedPlayerId.slice(0, 4)}`;
      const retry = await supabase
        .from('profiles')
        .upsert({ id: joinedPlayerId, username }, { onConflict: 'id' });
      profileError = retry.error;
    }

    if (profileError) {
      return NextResponse.json(
        { error: 'Failed to create joining profile', details: profileError.message },
        { status: 500 }
      );
    }

    const updatedPlayers = gameState.players.map((pid) => (pid === seatIdToClaim ? joinedPlayerId : pid));
    const updatedHands: Record<PlayerId, GameState['hands'][PlayerId]> = {};
    Object.entries(gameState.hands).forEach(([pid, hand]) => {
      updatedHands[pid === seatIdToClaim ? joinedPlayerId : pid] = hand;
    });

    const updatedState: GameState = {
      ...gameState,
      players: updatedPlayers,
      playerNames: {
        ...remapStringRecordKeys(gameState.playerNames ?? {}, seatIdToClaim, joinedPlayerId),
        [joinedPlayerId]: username,
      },
      hostId: gameState.hostId === seatIdToClaim ? joinedPlayerId : gameState.hostId,
      currentPlayerId:
        gameState.currentPlayerId === seatIdToClaim ? joinedPlayerId : gameState.currentPlayerId,
      bidderId: gameState.bidderId === seatIdToClaim ? joinedPlayerId : gameState.bidderId,
      bids: remapByPlayerId(gameState.bids, seatIdToClaim, joinedPlayerId),
      winningBid: remapBid(gameState.winningBid, seatIdToClaim, joinedPlayerId),
      hands: updatedHands,
      tricks: remapTricks(gameState.tricks, seatIdToClaim, joinedPlayerId),
      partnerPlayerIds: gameState.partnerPlayerIds.map((pid) =>
        pid === seatIdToClaim ? joinedPlayerId : pid
      ),
      scores: remapRecordKeys(gameState.scores, seatIdToClaim, joinedPlayerId),
      pointsWonByPlayer: remapRecordKeys(gameState.pointsWonByPlayer, seatIdToClaim, joinedPlayerId),
      openSeatIds: openSeatIds.filter((pid) => pid !== seatIdToClaim),
    };

    const { error: updateGameError } = await supabase
      .from('games')
      .update({ current_state: updatedState, updated_at: new Date().toISOString() })
      .eq('id', gameId);

    if (updateGameError) {
      return NextResponse.json(
        { error: 'Failed to update game state for join', details: updateGameError.message },
        { status: 500 }
      );
    }

    const { error: updateSeatError } = await supabase
      .from('game_players')
      .update({ player_id: joinedPlayerId })
      .eq('game_id', gameId)
      .eq('player_id', seatIdToClaim);

    if (updateSeatError) {
      return NextResponse.json(
        { error: 'Failed to claim seat', details: updateSeatError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      gameId,
      playerId: joinedPlayerId,
      username,
      gameState: updatedState,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message, details: String(error) }, { status: 500 });
  }
}

