import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { createGame } from '@/lib/game/gameState';
import { v4 as uuidv4 } from 'uuid';

function generateId(): string {
  return uuidv4();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function generateGameCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function getGameByIdentifier(identifier: string) {
  const byId = await supabase
    .from('games')
    .select('*')
    .eq('id', identifier)
    .maybeSingle();

  if (byId.data) {
    return { data: byId.data, error: null };
  }

  const byCode = await supabase
    .from('games')
    .select('*')
    .eq('current_state->>gameCode', identifier)
    .maybeSingle();

  if (byCode.data) {
    return { data: byCode.data, error: null };
  }

  return { data: null, error: byCode.error ?? byId.error };
}

async function generateUniqueGameCode(): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const code = generateGameCode();
    const { data, error } = await supabase
      .from('games')
      .select('id')
      .eq('current_state->>gameCode', code)
      .limit(1);

    if (error) {
      // If lookup fails, still proceed with a random code instead of blocking game creation.
      return code;
    }

    if (!data || data.length === 0) {
      return code;
    }
  }

  return generateGameCode();
}

export async function POST(request: NextRequest) {
  try {
    const { hostId, numPlayers, username, turnTimeSeconds, minimumBid, authUserId } = await request.json();
    const normalizedAuthUserId = typeof authUserId === 'string' ? authUserId.trim() : '';
    const hasAuthUser = isUuid(normalizedAuthUserId);

    if ((!hostId && !hasAuthUser) || !numPlayers || numPlayers < 5 || numPlayers > 7) {
      return NextResponse.json(
        { error: 'Invalid request. Need 5-7 players.' },
        { status: 400 }
      );
    }

    const hostUsername = typeof username === 'string' && username.trim()
      ? username.trim()
      : `Player-${(typeof hostId === 'string' ? hostId : generateId()).slice(0, 8)}`;

    let hostProfileId: string | undefined;

    if (hasAuthUser) {
      hostProfileId = normalizedAuthUserId;
      let profileUsername = hostUsername;
      const profileResult = await supabase
        .from('profiles')
        .upsert(
          {
            id: hostProfileId,
            username: profileUsername,
          },
          { onConflict: 'id' }
        );

      let profileError = profileResult.error;
      if (profileError?.code === '23505') {
        profileUsername = `${hostUsername}-${hostProfileId.slice(-4)}`;
        const retry = await supabase
          .from('profiles')
          .upsert({ id: hostProfileId, username: profileUsername }, { onConflict: 'id' });
        profileError = retry.error;
      }

      if (profileError) {
        return NextResponse.json(
          {
            error: 'Failed to create OAuth profile',
            details: profileError.message || JSON.stringify(profileError),
          },
          { status: 500 }
        );
      }
    } else {
      // Guest mode fallback: reuse existing profile by username when present.
      const { data: existingProfiles, error: existingProfileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', hostUsername)
        .limit(1);

      if (existingProfileError) {
        return NextResponse.json(
          {
            error: 'Failed to look up existing profile',
            details: existingProfileError.message || JSON.stringify(existingProfileError),
          },
          { status: 500 }
        );
      }

      hostProfileId = existingProfiles?.[0]?.id as string | undefined;

      if (!hostProfileId) {
        hostProfileId = generateId();
        const { error: createProfileError } = await supabase
          .from('profiles')
          .insert({
            id: hostProfileId,
            username: hostUsername,
          });

        if (createProfileError) {
          console.error('Profile creation error:', createProfileError);
          return NextResponse.json(
            {
              error: 'Failed to create profile',
              details: createProfileError.message || JSON.stringify(createProfileError),
              code: createProfileError.code,
              hint: createProfileError.code === '23503'
                ? 'Foreign key violation: Make sure you are using the simplified schema (supabase-schema-simple.sql) instead of the auth.users schema.'
                : 'Make sure you ran the SQL schema correctly. Use supabase-schema-simple.sql for easier setup.'
            },
            { status: 500 }
          );
        }
      }
    }

    if (!hostProfileId) {
      return NextResponse.json({ error: 'Failed to resolve host profile id' }, { status: 500 });
    }

    // Generate UUIDs for all players (works with simplified schema)
    const playerProfileIds = [hostProfileId, ...Array(numPlayers - 1).fill(null).map(() => generateId())];

    const gameId = generateId();
    const gameCode = await generateUniqueGameCode();
    // Update gameState to use the new UUIDs
    const updatedPlayers = playerProfileIds;
    const gameState = createGame(updatedPlayers, gameId, {
      hostId: hostProfileId,
      hostUsername,
      gameCode,
      maxPlayers: numPlayers,
      turnTimeSeconds,
      minimumBid,
    });

    // Upsert all player profiles
    const profileInserts = playerProfileIds.map((pid: string, idx: number) => ({
      id: pid,
      username: idx === 0 ? hostUsername : `Player-${pid.slice(0, 8)}`,
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
      auth_user_id: index === 0 && hasAuthUser ? normalizedAuthUserId : null,
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
      gameCode,
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
    const gameIdentifier = searchParams.get('id');

    if (!gameIdentifier) {
      return NextResponse.json({ error: 'Game ID required' }, { status: 400 });
    }

    const { data, error } = await getGameByIdentifier(gameIdentifier);

    if (error || !data) {
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
