import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { createGame } from '@/lib/game/gameState';
import { v4 as uuidv4 } from 'uuid';

function generateId(): string {
  return uuidv4();
}

export async function POST(request: NextRequest) {
  try {
    const { hostId, numPlayers, username, turnTimeSeconds, minimumBid } = await request.json();

    if (!hostId || !numPlayers || numPlayers < 5 || numPlayers > 7) {
      return NextResponse.json(
        { error: 'Invalid request. Need 5-7 players.' },
        { status: 400 }
      );
    }

    // Generate UUIDs for all players (works with simplified schema)
    const hostProfileId = generateId();
    const playerProfileIds = [hostProfileId, ...Array(numPlayers - 1).fill(null).map(() => generateId())];
    
    // Create or update profile for host
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: hostProfileId,
        username: username || `Player-${hostProfileId.slice(0, 8)}`,
      }, {
        onConflict: 'id'
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      return NextResponse.json(
        { 
          error: 'Failed to create profile',
          details: profileError.message || JSON.stringify(profileError),
          code: profileError.code,
          hint: profileError.code === '23503' 
            ? 'Foreign key violation: Make sure you are using the simplified schema (supabase-schema-simple.sql) instead of the auth.users schema.'
            : 'Make sure you ran the SQL schema correctly. Use supabase-schema-simple.sql for easier setup.'
        },
        { status: 500 }
      );
    }

    const gameId = generateId();
    // Update gameState to use the new UUIDs
    const updatedPlayers = playerProfileIds;
    const gameState = createGame(updatedPlayers, gameId, {
      hostId: hostProfileId,
      hostUsername: username,
      maxPlayers: numPlayers,
      turnTimeSeconds,
      minimumBid,
    });

    // Upsert all player profiles
    const profileInserts = playerProfileIds.map((pid: string, idx: number) => ({
      id: pid,
      username: idx === 0 ? (username || `Player-${pid.slice(0, 8)}`) : `Player-${pid.slice(0, 8)}`,
    }));

    const { error: profilesError } = await supabase
      .from('profiles')
      .upsert(profileInserts, { onConflict: 'id' });

    if (profilesError) {
      console.error('Profiles creation error:', profilesError);
      // Continue anyway
    }

    // Save to Supabase
    const { data, error } = await supabase
      .from('games')
      .insert({
        id: gameId,
        host_id: hostProfileId,
        status: 'lobby',
        num_decks: gameState.numDecks,
        current_state: gameState,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { 
          error: 'Failed to create game',
          details: error.message || JSON.stringify(error),
          code: error.code,
          hint: error.code === '23503' 
            ? 'Foreign key violation: Make sure the host_id exists in the profiles table'
            : error.code === '42P01'
            ? 'Table does not exist: Make sure you ran the SQL schema'
            : 'Check the Supabase console for more details'
        },
        { status: 500 }
      );
    }

    // Create game_players entries
    const playerInserts = playerProfileIds.map((playerId: string, index: number) => ({
      game_id: gameId,
      player_id: playerId,
      seat_index: index,
      score_total: 0,
    }));

    const { error: playersError } = await supabase
      .from('game_players')
      .insert(playerInserts);

    if (playersError) {
      console.error('Supabase error:', playersError);
      // Continue anyway, game is created
    }

    return NextResponse.json({
      game: data,
      hostPlayerId: hostProfileId,
    });
  } catch (error: any) {
    console.error('Error creating game:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error?.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('id');

    if (!gameId) {
      return NextResponse.json({ error: 'Game ID required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (error) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Backward compatibility: hydrate player names for older game states
    // that were created before playerNames was added.
    const gameState = data.current_state ?? {};
    const players: string[] = Array.isArray(gameState.players) ? gameState.players : [];
    const existingNames: Record<string, string> = gameState.playerNames ?? {};
    const missingPlayerIds = players.filter((pid) => !existingNames[pid]);

    let hydratedNames: Record<string, string> = { ...existingNames };
    if (missingPlayerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id,username')
        .in('id', players);

      const profileById = new Map((profiles ?? []).map((p) => [p.id, p.username]));
      for (const pid of players) {
        if (!hydratedNames[pid]) {
          hydratedNames[pid] = profileById.get(pid) ?? `Player ${pid.slice(-4)}`;
        }
      }
    }

    return NextResponse.json({
      game: {
        ...data,
        current_state: {
          ...gameState,
          playerNames: hydratedNames,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching game:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
