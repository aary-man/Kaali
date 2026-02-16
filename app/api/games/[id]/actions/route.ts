import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { GameState } from '@/lib/game/types';
import {
  addBid,
  setTrumpAndPartners,
  playCard,
  calculateScores,
  startGame,
  restartGame,
} from '@/lib/game/gameState';

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
    if (!gameIdentifier) {
      return NextResponse.json(
        { error: 'Game ID is required', details: 'Missing id in URL' },
        { status: 400 }
      );
    }
    const { action, playerId, ...actionData } = await request.json();

    // Fetch current game state
    const { data: gameData, error: fetchError } = await getGameByIdentifier(gameIdentifier);

    if (fetchError || !gameData || !gameData.id) {
      return NextResponse.json(
        { error: 'Game not found', details: fetchError?.message ?? 'No game data' },
        { status: 404 }
      );
    }
    const resolvedGameId = gameData.id;

    let gameState: GameState = gameData.current_state;
    let updatedState: GameState;

    // Apply action
    try {
      switch (action) {
        case 'bid':
          updatedState = addBid(gameState, playerId, actionData.amount);
          break;

      case 'start_game':
        updatedState = startGame(gameState, playerId);
        break;

      case 'set_trump_and_partners':
        updatedState = setTrumpAndPartners(
          gameState,
          playerId,
          actionData.trumpSuit,
          actionData.partnerCards
        );
        break;

      case 'play_card':
        updatedState = playCard(gameState, playerId, actionData.cardId);
        if (updatedState.phase === 'scoring') {
          // Auto-finalize when the 10th trick ends so leaderboard updates immediately.
          updatedState = calculateScores(updatedState);
        }
        break;

      case 'calculate_scores':
        updatedState = calculateScores(gameState);
        break;

      case 'restart_game':
        updatedState = restartGame(gameState, playerId);
        break;

        default:
          return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }
    } catch (actionError: unknown) {
      const message = actionError instanceof Error ? actionError.message : 'Failed to process action';
      console.error('Action error:', actionError);
      return NextResponse.json(
        { error: message, details: String(actionError) },
        { status: 400 }
      );
    }

    // Update game state in database
    const status =
      updatedState.phase === 'finished'
        ? 'finished'
        : updatedState.phase === 'lobby'
        ? 'lobby'
        : 'in_progress';

    const { error: updateError } = await supabase
      .from('games')
      .update({
        current_state: updatedState,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', resolvedGameId);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update game', details: updateError.message ?? String(updateError) },
        { status: 500 }
      );
    }

    // Update player scores if in finished phase
    if (updatedState.phase === 'finished' && updatedState.scores) {
      for (const [playerId, score] of Object.entries(updatedState.scores)) {
        await supabase
          .from('game_players')
          .update({ score_total: score })
          .eq('game_id', resolvedGameId)
          .eq('player_id', playerId);
      }
    }

    return NextResponse.json({ gameState: updatedState });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error processing action:', error);
    return NextResponse.json(
      { error: message, details: String(error) },
      { status: 500 }
    );
  }
}
