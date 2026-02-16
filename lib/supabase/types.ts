export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          created_at?: string;
        };
      };
      games: {
        Row: {
          id: string;
          host_id: string;
          status: 'lobby' | 'in_progress' | 'finished';
          num_decks: number;
          current_state: any; // JSONB GameState
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          host_id: string;
          status?: 'lobby' | 'in_progress' | 'finished';
          num_decks: number;
          current_state?: any;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          host_id?: string;
          status?: 'lobby' | 'in_progress' | 'finished';
          num_decks?: number;
          current_state?: any;
          created_at?: string;
          updated_at?: string;
        };
      };
      game_players: {
        Row: {
          id: string;
          game_id: string;
          player_id: string;
          seat_index: number;
          score_total: number;
          auth_user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          player_id: string;
          seat_index: number;
          score_total?: number;
          auth_user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          player_id?: string;
          seat_index?: number;
          score_total?: number;
          auth_user_id?: string | null;
          created_at?: string;
        };
      };
      user_game_history: {
        Row: {
          id: string;
          auth_user_id: string;
          game_id: string;
          game_code: string | null;
          hand_number: number;
          player_id: string;
          player_name: string | null;
          bid_amount: number | null;
          score_delta: number;
          running_total: number;
          trick_points_won: number;
          is_bidder: boolean;
          is_partner: boolean;
          did_win: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          game_id: string;
          game_code?: string | null;
          hand_number?: number;
          player_id: string;
          player_name?: string | null;
          bid_amount?: number | null;
          score_delta?: number;
          running_total?: number;
          trick_points_won?: number;
          is_bidder?: boolean;
          is_partner?: boolean;
          did_win?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string;
          game_id?: string;
          game_code?: string | null;
          hand_number?: number;
          player_id?: string;
          player_name?: string | null;
          bid_amount?: number | null;
          score_delta?: number;
          running_total?: number;
          trick_points_won?: number;
          is_bidder?: boolean;
          is_partner?: boolean;
          did_win?: boolean;
          created_at?: string;
        };
      };
    };
  };
}
