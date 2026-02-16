import { buildDeckForPlayers } from './deck';
import { getMinimumBid, getTotalPoints, isValidBid, winnerOfTrick } from './rules';
import { Bid, Card, GameState, PartnerCard, Phase, PlayerId, Trick } from './types';

interface CreateGameOptions {
  hostId: PlayerId;
  hostUsername?: string;
  gameCode?: string;
  maxPlayers?: number;
  turnTimeSeconds?: number;
  minimumBid?: number;
}

function dealHands(players: PlayerId[]): { hands: Record<PlayerId, Card[]>; discardPile: Card[]; numDecks: 1 | 2 } {
  const numDecks = players.length === 5 ? 1 : 2;
  const deck = buildDeckForPlayers(players.length);
  const hands: Record<PlayerId, Card[]> = {};
  const discardPile: Card[] = [];

  players.forEach((pid, index) => {
    hands[pid] = deck.slice(index * 10, (index + 1) * 10);
  });
  discardPile.push(...deck.slice(players.length * 10));

  return { hands, discardPile, numDecks };
}

export function createGame(players: PlayerId[], gameId: string, options: CreateGameOptions): GameState {
  if (players.length < 5 || players.length > 7) {
    throw new Error('Game requires 5–7 players');
  }

  const numDecks = players.length === 5 ? 1 : 2;
  const defaultMinBid = getMinimumBid(numDecks);
  const configuredMinBid = options.minimumBid ?? defaultMinBid;
  if (configuredMinBid < defaultMinBid) {
    throw new Error(`Minimum bid cannot be less than ${defaultMinBid} for ${players.length} players`);
  }
  if (configuredMinBid % 5 !== 0) {
    throw new Error('Minimum bid must be in increments of 5');
  }
  const playerNames: Record<PlayerId, string> = {};
  players.forEach((pid, idx) => {
    if (pid === options.hostId) {
      playerNames[pid] = options.hostUsername?.trim() || `Host-${pid.slice(-4)}`;
    } else {
      playerNames[pid] = `Open Seat ${idx + 1}`;
    }
  });

  return {
    id: gameId,
    gameCode: options.gameCode,
    createdAt: Date.now(),
    handNumber: 1,
    players,
    playerNames,
    hostId: options.hostId,
    phase: 'lobby',
    currentPlayerId: undefined,
    numDecks,
    maxPlayers: options.maxPlayers ?? players.length,
    turnTimeSeconds: options.turnTimeSeconds ?? 30,
    minimumBid: configuredMinBid,
    bids: [],
    hands: {},
    tricks: [],
    discardPile: [],
    partnerCards: [],
    partnerPlayerIds: [],
    runningScores: Object.fromEntries(players.map((pid) => [pid, 0])),
    openSeatIds: players.slice(1),
  };
}

export function startGame(state: GameState, playerId: PlayerId): GameState {
  if (state.phase !== 'lobby') {
    throw new Error('Game has already started');
  }
  if (state.hostId !== playerId) {
    throw new Error('Only the host can start the game');
  }
  if ((state.openSeatIds?.length ?? 0) > 0) {
    throw new Error('Cannot start game until all players have joined');
  }

  const { hands, discardPile, numDecks } = dealHands(state.players);

  const minAllowedBid = getMinimumBid(numDecks);
  const configuredMinBid = state.minimumBid < minAllowedBid ? minAllowedBid : state.minimumBid;

  return {
    ...state,
    phase: 'bidding',
    currentPlayerId: state.players[0],
    numDecks,
    minimumBid: configuredMinBid,
    bids: [],
    winningBid: undefined,
    bidderId: undefined,
    hands,
    tricks: [],
    discardPile,
    partnerCards: [],
    partnerPlayerIds: [],
    scores: undefined,
    pointsWonByPlayer: undefined,
  };
}

export function restartGame(state: GameState, playerId: PlayerId): GameState {
  if (state.phase !== 'finished') {
    throw new Error('Game must be finished before restart');
  }
  if (state.hostId !== playerId) {
    throw new Error('Only the host can restart the game');
  }

  const { hands, discardPile, numDecks } = dealHands(state.players);
  const minAllowedBid = getMinimumBid(numDecks);
  const configuredMinBid = state.minimumBid < minAllowedBid ? minAllowedBid : state.minimumBid;

  return {
    ...state,
    handNumber: (state.handNumber ?? 1) + 1,
    phase: 'bidding',
    currentPlayerId: state.players[0],
    numDecks,
    minimumBid: configuredMinBid,
    bids: [],
    winningBid: undefined,
    bidderId: undefined,
    trumpSuit: undefined,
    partnerCards: [],
    partnerPlayerIds: [],
    hands,
    tricks: [],
    discardPile,
    scores: undefined,
    pointsWonByPlayer: undefined,
    openSeatIds: [],
  };
}

export function addBid(state: GameState, playerId: PlayerId, amount: number | null): GameState {
  if (state.phase !== 'bidding') {
    throw new Error('Game is not in bidding phase');
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error('Not your turn to bid');
  }

  const minBid = state.minimumBid ?? getMinimumBid(state.numDecks);
  const maxBid = getTotalPoints(state.numDecks);
  const currentHighBid = state.bids
    .filter((b) => !b.passed)
    .sort((a, b) => b.amount - a.amount)[0]?.amount || null;

  const newBids = [...state.bids];

  if (amount === null) {
    // Pass
    newBids.push({
      playerId,
      amount: 0,
      passed: true,
      createdAt: Date.now(),
    });
  } else {
    if (amount > maxBid) {
      throw new Error(`Invalid bid amount. Maximum possible bid is ${maxBid}.`);
    }
    if (!isValidBid(amount, currentHighBid, minBid)) {
      throw new Error(`Invalid bid amount. Must be at least ${minBid} and higher than current bid in 5-point increments.`);
    }

    newBids.push({
      playerId,
      amount,
      passed: false,
      createdAt: Date.now(),
    });
  }

  // Check if bidding is complete
  const allPassedAfterLastBid = checkBiddingComplete(newBids, state.players);
  const latestBid = newBids[newBids.length - 1];
  const reachedMaxBid = !latestBid.passed && latestBid.amount >= maxBid;

  let newPhase: Phase = state.phase;
  let winningBid: Bid | undefined = state.winningBid;
  let bidderId: PlayerId | undefined = state.bidderId;
  let nextPlayerId: PlayerId | undefined;

  if (reachedMaxBid || allPassedAfterLastBid) {
    // Bidding complete
    winningBid = getLastActiveBid(newBids);
    if (!winningBid) {
      throw new Error('Bidding completion reached without a valid winning bid');
    }
    bidderId = winningBid.playerId;
    newPhase = 'choose_trump_and_partners';
    nextPlayerId = bidderId;
  } else {
    // Move to next player
    const currentIndex = state.players.indexOf(playerId);
    nextPlayerId = state.players[(currentIndex + 1) % state.players.length];
  }

  return {
    ...state,
    bids: newBids,
    winningBid,
    bidderId,
    currentPlayerId: nextPlayerId,
    phase: newPhase,
  };
}

function checkBiddingComplete(bids: Bid[], players: PlayerId[]): boolean {
  // Need at least one full round so everyone has had a turn
  if (bids.length < players.length) return false;

  // Find the LAST (most recent) active bid in the array - that's the current high bid
  let lastActiveBidIndex = -1;
  for (let i = bids.length - 1; i >= 0; i--) {
    if (!bids[i].passed) {
      lastActiveBidIndex = i;
      break;
    }
  }
  if (lastActiveBidIndex === -1) return false;

  // After that bid, everyone else must have passed (one pass from each of the other n-1 players)
  const bidsAfterLastActive = bids.slice(lastActiveBidIndex + 1);
  if (bidsAfterLastActive.length < players.length - 1) return false;

  return bidsAfterLastActive.every((b) => b.passed);
}

function getLastActiveBid(bids: Bid[]): Bid | undefined {
  for (let i = bids.length - 1; i >= 0; i--) {
    if (!bids[i].passed) {
      return bids[i];
    }
  }
  return undefined;
}

export function setTrumpAndPartners(
  state: GameState,
  playerId: PlayerId,
  trumpSuit: string,
  partnerCards: PartnerCard[]
): GameState {
  if (state.phase !== 'choose_trump_and_partners') {
    throw new Error('Game is not in partner selection phase');
  }

  if (state.bidderId !== playerId) {
    throw new Error('Only the bid winner can choose trump and partners');
  }

  const expectedPartnerCount = state.numDecks === 1 ? 1 : 2;
  if (partnerCards.length !== expectedPartnerCount) {
    throw new Error(`Must select ${expectedPartnerCount} partner card(s)`);
  }

  // Partner cards can be ANY valid cards in the active deck (after removals),
  // not only cards in bidder's hand.
  const allActiveCards = [...Object.values(state.hands).flat(), ...state.discardPile];
  const availableKeys = new Set(allActiveCards.map((c) => `${c.rank}-${c.suit}`));

  const selectedKeys = partnerCards.map((c) => `${c.rank}-${c.suit}`);
  if (new Set(selectedKeys).size !== selectedKeys.length) {
    throw new Error('Partner cards must be distinct');
  }

  for (const key of selectedKeys) {
    if (!availableKeys.has(key)) {
      throw new Error('Selected partner card is not available in this game deck');
    }
  }

  return {
    ...state,
    phase: 'playing',
    trumpSuit: trumpSuit as any,
    partnerCards,
    currentPlayerId: playerId, // Bidder starts first trick
  };
}

export function playCard(state: GameState, playerId: PlayerId, cardId: string): GameState {
  if (state.phase !== 'playing') {
    throw new Error('Game is not in playing phase');
  }

  if (state.currentPlayerId !== playerId) {
    throw new Error('Not your turn to play');
  }

  const hand = state.hands[playerId];
  const cardIndex = hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) {
    throw new Error('Card not in hand');
  }

  const card = hand[cardIndex];
  const currentTrick = state.tricks[state.tricks.length - 1];
  const trickInProgress =
    currentTrick && currentTrick.plays.length < state.players.length
      ? currentTrick
      : null;
  const leadingSuit = trickInProgress?.plays[0]?.card.suit || null;

  // Validate card can be played
  const canPlay = leadingSuit === null || 
    !hand.some((c) => c.suit === leadingSuit) || 
    card.suit === leadingSuit;

  if (!canPlay) {
    throw new Error('Must follow suit if you have it');
  }

  // Remove card from hand
  const newHand = [...hand];
  newHand.splice(cardIndex, 1);

  // Add to current trick or create new trick
  let newTricks = [...state.tricks];
  const trickIndex = newTricks.length - 1;

  if (currentTrick && currentTrick.plays.length < state.players.length) {
    // Add to existing trick
    newTricks[trickIndex] = {
      ...currentTrick,
      plays: [...currentTrick.plays, { playerId, card }],
    };
  } else {
    // Create new trick
    newTricks.push({
      index: newTricks.length,
      leaderId: playerId,
      plays: [{ playerId, card }],
    });
  }

  const updatedTrick = newTricks[newTricks.length - 1];
  let newPhase: Phase = state.phase;
  let nextPlayerId: PlayerId | undefined;

  // Check if trick is complete
  if (updatedTrick.plays.length === state.players.length) {
    // Determine winner
    const { winnerId, points } = winnerOfTrick(updatedTrick, state.trumpSuit);
    updatedTrick.winnerId = winnerId;
    updatedTrick.points = points;

    // Check if all tricks are complete
    if (newTricks.length === 10) {
      newPhase = 'scoring';
      nextPlayerId = undefined;
    } else {
      // Winner of trick leads next trick
      nextPlayerId = winnerId;
    }
  } else {
    // Move to next player
    const currentIndex = state.players.indexOf(playerId);
    nextPlayerId = state.players[(currentIndex + 1) % state.players.length];
  }

  // Check if partner card was played (reveal partner)
  let newPartnerPlayerIds = [...state.partnerPlayerIds];
  if (state.partnerCards.some((pc) => pc.rank === card.rank && pc.suit === card.suit)) {
    if (!newPartnerPlayerIds.includes(playerId)) {
      newPartnerPlayerIds.push(playerId);
    }
  }

  return {
    ...state,
    hands: {
      ...state.hands,
      [playerId]: newHand,
    },
    tricks: newTricks,
    currentPlayerId: nextPlayerId,
    phase: newPhase,
    partnerPlayerIds: newPartnerPlayerIds,
  };
}

export function calculateScores(state: GameState): GameState {
  if (state.phase !== 'scoring') {
    throw new Error('Game is not in scoring phase');
  }

  if (!state.bidderId || !state.winningBid) {
    throw new Error('Missing bidder or winning bid');
  }

  // Calculate raw trick points won by each player
  const pointsWonByPlayer: Record<PlayerId, number> = {};
  for (const playerId of state.players) {
    pointsWonByPlayer[playerId] = 0;
  }
  for (const trick of state.tricks) {
    if (trick.winnerId) {
      pointsWonByPlayer[trick.winnerId] += trick.points || 0;
    }
  }

  // Calculate points won by bidder and partners
  const teamPlayerIds = [state.bidderId, ...state.partnerPlayerIds];
  let teamPoints = 0;

  for (const trick of state.tricks) {
    if (trick.winnerId && teamPlayerIds.includes(trick.winnerId)) {
      teamPoints += trick.points || 0;
    }
  }

  const bidAmount = state.winningBid.amount;
  const scores: Record<PlayerId, number> = {};

  if (teamPoints >= bidAmount) {
    // Team wins
    state.players.forEach((playerId) => {
      if (playerId === state.bidderId) {
        scores[playerId] = bidAmount * 2;
      } else if (state.partnerPlayerIds.includes(playerId)) {
        scores[playerId] = bidAmount * 1;
      } else {
        scores[playerId] = 0;
      }
    });
  } else {
    // Team loses
    state.players.forEach((playerId) => {
      if (playerId === state.bidderId) {
        scores[playerId] = -bidAmount * 2;
      } else if (state.partnerPlayerIds.includes(playerId)) {
        scores[playerId] = -bidAmount * 1;
      } else {
        scores[playerId] = 0;
      }
    });
  }

  const runningScores: Record<PlayerId, number> = {};
  for (const playerId of state.players) {
    const prev = state.runningScores?.[playerId] ?? 0;
    runningScores[playerId] = prev + (scores[playerId] ?? 0);
  }

  return {
    ...state,
    phase: 'finished',
    scores,
    runningScores,
    pointsWonByPlayer,
  };
}
