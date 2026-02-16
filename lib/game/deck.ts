import { Card, Rank, Suit } from './types';

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

export function makeSingleDeck(): Card[] {
  const cards: Card[] = [];
  let idCounter = 0;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({
        id: `d0-${idCounter++}`,
        suit,
        rank,
        deckIndex: 0,
      });
    }
  }
  return cards;
}

export function makeTwoDecks(): Card[] {
  const cards: Card[] = [];
  let idCounter = 0;
  for (let deckIndex = 0; deckIndex < 2; deckIndex++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({
          id: `d${deckIndex}-${idCounter++}`,
          suit,
          rank,
          deckIndex,
        });
      }
    }
  }
  return cards;
}

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeckForPlayers(players: number, rng: () => number = Math.random): Card[] {
  if (players < 5 || players > 7) {
    throw new Error('Game supports 5–7 players only');
  }
  const cardsPerPlayer = 10;
  const target = players * cardsPerPlayer;

  if (players === 5) {
    // 1 deck, remove 2♥ and 2♦
    let deck = makeSingleDeck();
    deck = deck.filter(
      (c) => !(c.rank === '2' && (c.suit === '♥' || c.suit === '♦'))
    );
    // We'll have 50 cards; deal 10 to each player (50 total)
    return shuffle(deck, rng);
  }

  // 6–7 players → 2 decks, remove low cards (except 5s) until target
  let deck = makeTwoDecks();

  const removalOrder: Rank[] = ['2', '3', '4', '6', '7', '8', '9', 'J', 'Q', 'K', '10', 'A'];
  // 5 is intentionally not in this list.

  deck = shuffle(deck, rng); // randomize before removal to keep fairness

  let remaining = deck.length;
  for (const rank of removalOrder) {
    if (remaining <= target) break;
    if (rank === '5') continue; // just in case

    const newDeck: Card[] = [];
    for (const card of deck) {
      if (remaining <= target) {
        newDeck.push(card);
        continue;
      }
      if (card.rank === rank) {
        remaining--;
        // drop card
      } else {
        newDeck.push(card);
      }
    }
    deck = newDeck;
  }

  if (deck.length < target) {
    throw new Error('Removal overshot target size, check logic');
  }

  // If still more than target, trim extra off top to discard
  if (deck.length > target) {
    deck = deck.slice(0, target);
  }

  return shuffle(deck, rng);
}
