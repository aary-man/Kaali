import { Card, Suit, Trick } from './types';

export function cardPoints(card: Card): number {
  if (card.rank === 'A') return 15;
  if (card.rank === '10') return 10;
  if (card.rank === '5') return 5;
  if (card.rank === 'Q' && card.suit === '♠') return 30;
  return 0;
}

function rankStrength(rank: string): number {
  const order = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  return order.indexOf(rank);
}

export function winnerOfTrick(trick: Trick, trumpSuit?: Suit): { winnerId: string; points: number } {
  if (trick.plays.length === 0) {
    throw new Error('Trick has no cards');
  }

  const leadingSuit = trick.plays[0].card.suit;
  let bestPlay = trick.plays[0];

  for (const play of trick.plays.slice(1)) {
    const c = play.card;
    const best = bestPlay.card;

    const cIsTrump = trumpSuit && c.suit === trumpSuit;
    const bestIsTrump = trumpSuit && best.suit === trumpSuit;

    if (cIsTrump && !bestIsTrump) {
      bestPlay = play;
    } else if (cIsTrump && bestIsTrump) {
      if (rankStrength(c.rank) > rankStrength(best.rank)) {
        bestPlay = play;
      }
    } else if (!cIsTrump && !bestIsTrump) {
      // no trump involved, compare only if same suit as lead
      if (c.suit === leadingSuit && best.suit === leadingSuit) {
        if (rankStrength(c.rank) > rankStrength(best.rank)) {
          bestPlay = play;
        }
      }
    }
  }

  const points = trick.plays.reduce((sum, p) => sum + cardPoints(p.card), 0);
  return { winnerId: bestPlay.playerId, points };
}

export function getTotalPoints(numDecks: 1 | 2): number {
  return numDecks === 1 ? 150 : 300;
}

export function getMinimumBid(numDecks: 1 | 2): number {
  return Math.floor(getTotalPoints(numDecks) / 2);
}

export function isValidBid(amount: number, currentHighBid: number | null, minBid: number): boolean {
  if (amount < minBid) return false;
  if (currentHighBid === null) return amount >= minBid;
  return amount > currentHighBid && (amount - currentHighBid) % 5 === 0;
}

export function canPlayCard(
  card: Card,
  hand: Card[],
  leadingSuit: Suit | null,
  trumpSuit?: Suit
): boolean {
  if (leadingSuit === null) return true; // first card of trick

  // Check if player has any card of the leading suit
  const hasLeadingSuit = hand.some((c) => c.suit === leadingSuit);

  if (hasLeadingSuit) {
    // Must play a card of the leading suit
    return card.suit === leadingSuit;
  } else {
    // Can play any card
    return true;
  }
}
