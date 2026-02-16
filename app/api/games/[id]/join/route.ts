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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getGameByIdentifier(identifier: string) {
  const byId = await supabase
    .from('games')
    .select('id,current_state')
    .eq('id', identifier)
    .maybeSingle();

  if (byId.data) {
    return { data: byId.data, error: null };
  }

  const byCode = await supabase
    .from('games')
    .select('id,current_state')
    .eq('current_state->>gameCode', identifier)
    .maybeSingle();

  if (byCode.data) {
    return { data: byCode.data, error: null };
  }

  return { data: null, error: byCode.error ?? byId.error };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gameIdentifier } = await context.params;
    const body = await request.json();
    const requestedUsername = typeof body?.username === 'string' ? body.username.trim() : '';
    const normalizedAuthUserId = typeof body?.authUserId === 'string' ? body.authUserId.trim() : '';
    const hasAuthUser = isUuid(normalizedAuthUserId);

    if (!gameIdentifier) {
      return NextResponse.json({ error: 'Game ID is required' }, { status: 400 });
    }

    const { data: gameData, error: fetchError } = await getGameByIdentifier(gameIdentifier);

    if (fetchError || !gameData?.current_state || !gameData?.id) {
      return NextResponse.json({ error: 'Game not found', details: fetchError?.message }, { status: 404 });
    }
    const resolvedGameId = gameData.id;

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
    const fallbackId = uuidv4();
    let joinedPlayerId = hasAuthUser ? normalizedAuthUserId : fallbackId;
    let username = requestedUsername || `Player-${fallbackId.slice(0, 8)}`;

    if (hasAuthUser) {
      let profileUsername = username;
      const upsertResult = await supabase
        .from('profiles')
        .upsert({ id: joinedPlayerId, username: profileUsername }, { onConflict: 'id' });

      let profileError = upsertResult.error;
      if (profileError?.code === '23505') {
        profileUsername = `${username}-${joinedPlayerId.slice(-4)}`;
        const retry = await supabase
          .from('profiles')
          .upsert({ id: joinedPlayerId, username: profileUsername }, { onConflict: 'id' });
        profileError = retry.error;
      }

      if (profileError) {
        return NextResponse.json(
          { error: 'Failed to create joining OAuth profile', details: profileError.message },
          { status: 500 }
        );
      }
      username = profileUsername;
    } else {
      // Guest mode fallback: resolve by username.
      const { data: existingProfiles, error: lookupError } = await supabase
        .from('profiles')
        .select('id,username')
        .eq('username', username)
        .limit(1);

      if (lookupError) {
        return NextResponse.json(
          { error: 'Failed to look up profile', details: lookupError.message },
          { status: 500 }
        );
      }

      if (existingProfiles && existingProfiles.length > 0) {
        joinedPlayerId = existingProfiles[0].id;
        username = existingProfiles[0].username;
      } else {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({ id: joinedPlayerId, username });

        if (profileError) {
          return NextResponse.json(
            { error: 'Failed to create joining profile', details: profileError.message },
            { status: 500 }
          );
        }
      }
    }

    if (gameState.players.includes(joinedPlayerId)) {
      return NextResponse.json(
        { error: 'This username has already joined this game.' },
        { status: 400 }
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
      .eq('id', resolvedGameId);

    if (updateGameError) {
      return NextResponse.json(
        { error: 'Failed to update game state for join', details: updateGameError.message },
        { status: 500 }
      );
    }

    const { error: updateSeatError } = await supabase
      .from('game_players')
      .update({ player_id: joinedPlayerId, auth_user_id: hasAuthUser ? normalizedAuthUserId : null })
      .eq('game_id', resolvedGameId)
      .eq('player_id', seatIdToClaim);

    if (updateSeatError) {
      return NextResponse.json(
        { error: 'Failed to claim seat', details: updateSeatError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      gameId: updatedState.gameCode ?? resolvedGameId,
      playerId: joinedPlayerId,
      username,
      gameState: updatedState,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message, details: String(error) }, { status: 500 });
  }
}

