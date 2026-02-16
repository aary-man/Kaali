export type Suit = '♠' | '♥' | '♦' | '♣';

export type Rank =
  | 'A'
  | 'K'
  | 'Q'
  | 'J'
  | '10'
  | '9'
  | '8'
  | '7'
  | '6'
  | '5'
  | '4'
  | '3'
  | '2';

export interface Card {
  id: string; // unique per physical card, even in 2-deck games
  suit: Suit;
  rank: Rank;
  deckIndex: number; // 0 or 1 for multi-deck games
}

export interface PartnerCard {
  suit: Suit;
  rank: Rank;
}

export type PlayerId = string;

export interface Bid {
  playerId: PlayerId;
  amount: number; // in points
  passed: boolean;
  createdAt: number;
}

export type Phase =
  | 'lobby'
  | 'dealing'
  | 'bidding'
  | 'choose_trump_and_partners'
  | 'playing'
  | 'scoring'
  | 'finished';

export interface Trick {
  index: number; // 0..9
  leaderId: PlayerId;
  plays: { playerId: PlayerId; card: Card }[];
  winnerId?: PlayerId;
  points?: number;
}

export interface GameState {
  id: string;
  createdAt: number;
  handNumber: number;
  players: PlayerId[];
  playerNames: Record<PlayerId, string>;
  hostId: PlayerId;
  phase: Phase;
  currentPlayerId?: PlayerId;

  numDecks: 1 | 2;
  maxPlayers: number;
  turnTimeSeconds: number;
  minimumBid: number;
  trumpSuit?: Suit;

  bids: Bid[];
  winningBid?: Bid;
  bidderId?: PlayerId;

  partnerCards: PartnerCard[]; // chosen partner cards (rank+suit, not tied to bidder hand)
  partnerPlayerIds: PlayerId[]; // filled as partner cards are revealed

  hands: Record<PlayerId, Card[]>;
  tricks: Trick[];
  discardPile: Card[]; // undealt or removed cards

  scores?: Record<PlayerId, number>; // final scores after scoring phase
  runningScores?: Record<PlayerId, number>; // cumulative scores across hands
  pointsWonByPlayer?: Record<PlayerId, number>; // raw trick points won per player
  openSeatIds?: PlayerId[]; // internal seat placeholders that can be claimed by joiners
}
