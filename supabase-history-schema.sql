-- History + OAuth mapping additions for Kaali ki Raani
-- Run this AFTER supabase-schema-simple.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Track authenticated user mapping for each game seat
ALTER TABLE game_players
ADD COLUMN IF NOT EXISTS auth_user_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_game_players_auth_user_id ON game_players(auth_user_id);

-- Per-hand history rows for signed-in users
CREATE TABLE IF NOT EXISTS user_game_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID NOT NULL,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  game_code TEXT,
  hand_number INTEGER NOT NULL DEFAULT 1,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_name TEXT,
  bid_amount INTEGER,
  score_delta INTEGER NOT NULL DEFAULT 0,
  running_total INTEGER NOT NULL DEFAULT 0,
  trick_points_won INTEGER NOT NULL DEFAULT 0,
  is_bidder BOOLEAN NOT NULL DEFAULT FALSE,
  is_partner BOOLEAN NOT NULL DEFAULT FALSE,
  did_win BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(auth_user_id, game_id, hand_number, player_id)
);

CREATE INDEX IF NOT EXISTS idx_user_game_history_auth_user_id_created
  ON user_game_history(auth_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_game_history_game_id
  ON user_game_history(game_id);

ALTER TABLE user_game_history ENABLE ROW LEVEL SECURITY;

-- Demo-friendly policies aligned with simplified schema style
CREATE POLICY "History is viewable by everyone" ON user_game_history
  FOR SELECT USING (true);

CREATE POLICY "Anyone can create history rows" ON user_game_history
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update history rows" ON user_game_history
  FOR UPDATE USING (true);

