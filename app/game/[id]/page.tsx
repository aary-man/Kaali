'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { GameState, Card, Rank, Suit } from '@/lib/game/types';
import { getMinimumBid, cardPoints } from '@/lib/game/rules';

export default function GamePage() {
  const params = useParams();
  const gameId = params.id as string;
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [trumpSuit, setTrumpSuit] = useState<string>('');
  const [partnerSelections, setPartnerSelections] = useState<
    Array<{ rank: Rank | ''; suit: Suit | '' }>
  >([
    { rank: '', suit: '' },
    { rank: '', suit: '' },
  ]);
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    const storedPlayerId = localStorage.getItem('playerId');
    if (storedPlayerId) {
      setPlayerId(storedPlayerId);
    }

    // Fetch game state
    fetchGameState();

    // Set up real-time subscription (simplified - in production use Supabase Realtime)
    const interval = setInterval(fetchGameState, 2000);
    return () => clearInterval(interval);
  }, [gameId]);

  // Update playerId when gameState loads (for test mode)
  useEffect(() => {
    if (gameState && gameState.players.length > 0 && !playerId) {
      // Use first player if no playerId set
      setPlayerId(gameState.players[0]);
    }
  }, [gameState]);

  useEffect(() => {
    if (gameState?.phase === 'choose_trump_and_partners') {
      setTrumpSuit('');
      setPartnerSelections([
        { rank: '', suit: '' },
        { rank: '', suit: '' },
      ]);
    }
  }, [gameState?.phase]);

  const fetchGameState = async () => {
    try {
      const res = await fetch(`/api/games?id=${gameId}`);
      const data = await res.json();
      if (data.game) {
        setGameState(data.game.current_state);
      }
    } catch (error) {
      console.error('Error fetching game state:', error);
    }
  };

  const sendAction = async (action: string, actionData: any) => {
    if (!playerId) {
      alert('Player ID not found. Please refresh the page.');
      return;
    }
    if (!gameId || gameId === 'undefined') {
      alert('Invalid game. Please create or join a game from the home page.');
      return;
    }

    try {
      const res = await fetch(`/api/games/${gameId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, playerId, ...actionData }),
      });

      const rawText = await res.text();
      let data: { gameState?: unknown; error?: string; details?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        alert(`Server error (${res.status}): ${rawText?.slice(0, 150) || 'Empty response'}`);
        return;
      }

      if (res.ok && data.gameState) {
        setGameState(data.gameState as GameState);
        return;
      }

      // Error path: show real message and raw response (log so we can debug)
      console.error('[sendAction] FAILED status:', res.status, 'raw response:', rawText?.slice(0, 500));
      const errorMsg = typeof data.error === 'string' && data.error ? data.error : `Request failed (${res.status})`;
      const details = typeof data.details === 'string' && data.details ? data.details : rawText?.slice(0, 200) || '';
      alert(details ? `${errorMsg}\n\nResponse: ${details}` : errorMsg);
    } catch (error) {
      console.error('Error sending action:', error);
      alert(`Failed to send action: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (!gameState || !playerId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-xl">Loading game...</div>
      </div>
    );
  }

  const myHand = gameState.hands[playerId] || [];
  const isMyTurn = gameState.currentPlayerId === playerId;
  const isHost = gameState.hostId === playerId;
  const amRevealedPartner = gameState.partnerPlayerIds.includes(playerId);
  const openSeatIds = gameState.openSeatIds ?? [];
  const joinedCount = gameState.maxPlayers - openSeatIds.length;
  const minBid = gameState.minimumBid ?? getMinimumBid(gameState.numDecks);
  const currentHighBid = gameState.bids
    .filter((b) => !b.passed)
    .sort((a, b) => b.amount - a.amount)[0]?.amount || null;
  const requiredPartners = gameState.numDecks === 1 ? 1 : 2;
  const rankOptions: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
  const suitOptions: Suit[] = ['♠', '♥', '♦', '♣'];
  const selectedPartnerCards = partnerSelections
    .slice(0, requiredPartners)
    .filter((p) => p.rank && p.suit)
    .map((p) => ({ rank: p.rank as Rank, suit: p.suit as Suit }));
  const selectedPartnerKeys = selectedPartnerCards.map((p) => `${p.rank}-${p.suit}`);
  const partnerSelectionValid =
    selectedPartnerCards.length === requiredPartners &&
    new Set(selectedPartnerKeys).size === selectedPartnerKeys.length;
  const rankOrderAscending: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const suitOrder: Suit[] = ['♣', '♦', '♥', '♠'];
  const sortCardsForDisplay = (cards: Card[]) =>
    [...cards].sort((a, b) => {
      const suitCmp = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
      if (suitCmp !== 0) return suitCmp;
      return rankOrderAscending.indexOf(a.rank) - rankOrderAscending.indexOf(b.rank);
    });
  const sortedMyHand = sortCardsForDisplay(myHand);
  const groupedMyHand = suitOrder
    .map((suit) => ({
      suit,
      cards: sortedMyHand.filter((c) => c.suit === suit),
    }))
    .filter((group) => group.cards.length > 0);
  const amSelectedPartner = gameState.partnerCards.some((partnerCard) =>
    sortedMyHand.some(
      (handCard) => handCard.rank === partnerCard.rank && handCard.suit === partnerCard.suit
    )
  );

  const shortId = (pid: string) => pid.slice(-4);
  const displayName = (pid: string) => gameState.playerNames?.[pid] || `Player ${shortId(pid)}`;
  const currentTrick = gameState.tricks[gameState.tricks.length - 1];
  const trickInProgress =
    currentTrick && currentTrick.plays.length < gameState.players.length ? currentTrick : null;
  const lastCompletedTrick = [...gameState.tricks].reverse().find((t) => !!t.winnerId);
  const trickJustEnded =
    !!currentTrick && !!currentTrick.winnerId && currentTrick.plays.length === gameState.players.length;
  const otherPlayers = gameState.players.filter((pid) => pid !== playerId);

  const renderCard = (card: Card, clickable: boolean = false, compact = false) => {
    const suitColors: Record<string, string> = {
      '♠': 'text-black',
      '♥': 'text-red-600',
      '♦': 'text-red-600',
      '♣': 'text-black',
    };

    let isPlayable = true;
    if (clickable && isMyTurn && gameState.phase === 'playing') {
      const leadingSuit = trickInProgress?.plays[0]?.card.suit || null;
      if (leadingSuit) {
        const hasLeadingSuit = sortedMyHand.some((c) => c.suit === leadingSuit);
        if (hasLeadingSuit) isPlayable = card.suit === leadingSuit;
      }
    }

    return (
      <div
        key={card.id}
        className={`relative rounded-xl border bg-white shadow-sm transition ${
          compact ? 'h-20 w-14 p-1.5' : 'h-28 w-18 p-2'
        } ${
          clickable && isMyTurn && isPlayable
            ? 'cursor-pointer hover:-translate-y-1 hover:border-gray-500'
            : clickable && isMyTurn && !isPlayable
            ? 'cursor-not-allowed opacity-45'
            : ''
        } ${selectedCard === card.id ? 'border-black ring-2 ring-gray-300' : 'border-gray-200'}`}
        onClick={() => clickable && isMyTurn && isPlayable && setSelectedCard(card.id)}
      >
        <div className={`text-xs font-bold leading-none ${suitColors[card.suit]}`}>
          {card.rank}
          <div className="text-sm">{card.suit}</div>
        </div>
        <div className={`mt-2 text-center text-xl ${suitColors[card.suit]}`}>{card.suit}</div>
        <div className={`absolute bottom-1 right-1 rotate-180 text-xs font-bold leading-none ${suitColors[card.suit]}`}>
          {card.rank}
          <div className="text-sm">{card.suit}</div>
        </div>
      </div>
    );
  };

  const showLeaderboardTotals = gameState.phase === 'finished';
  return (
    <div className="h-screen overflow-hidden bg-[#f5f6f8] p-3 text-black">
      <div className="mx-auto h-full max-w-7xl">
        <div className="grid h-full gap-3 lg:grid-cols-[1fr_320px]">
          <div className="flex min-h-0 flex-col gap-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h1 className="text-xl font-semibold">Game {gameId.slice(0, 8)} · Hand {gameState.handNumber ?? 1}</h1>
                  <p className="text-sm text-gray-600">Code: {gameId}</p>
                  <p className="text-sm text-gray-600">
                    {gameState.maxPlayers} players · {gameState.turnTimeSeconds}s turn · min bid {gameState.minimumBid}
                  </p>
                  <p className="text-sm text-gray-600">
                    Phase: <span className="font-medium uppercase">{gameState.phase}</span>
                    {gameState.trumpSuit ? ` • Trump ${gameState.trumpSuit}` : ''}
                    {gameState.winningBid ? ` • Bid ${gameState.winningBid.amount}` : ''}
                  </p>
                  {amSelectedPartner && !amRevealedPartner && (
                    <p className="inline-block rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-medium">
                      You are a partner (hidden until you play the called card)
                    </p>
                  )}
                  {amRevealedPartner && (
                    <p className="inline-block rounded-full border border-black bg-black px-3 py-1 text-xs font-medium text-white">
                      You are a revealed partner
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTestMode(!testMode)}
                    className={`rounded-md px-3 py-1 text-sm font-semibold ${
                      testMode ? 'bg-black text-white' : 'bg-gray-200 text-black'
                    }`}
                  >
                    {testMode ? 'Test Mode ON' : 'Test Mode OFF'}
                  </button>
                  {testMode && (
                    <select
                      value={playerId || ''}
                      onChange={(e) => {
                        setPlayerId(e.target.value);
                        localStorage.setItem('playerId', e.target.value);
                      }}
                      className="rounded-md border border-gray-400 bg-white px-2 py-1 text-sm text-black"
                    >
                      {gameState.players.map((pid) => (
                        <option key={pid} value={pid}>
                      {displayName(pid)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {trickJustEnded && currentTrick?.winnerId && (
              <div className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium shadow-sm">
                Trick ended: {displayName(currentTrick.winnerId)} won {currentTrick.points ?? 0} points.
              </div>
            )}

            <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              <h2 className="mb-3 text-center text-base font-semibold text-gray-800">Table</h2>

              <div className="relative mx-auto h-[360px] w-full max-w-[700px] rounded-[999px] border border-gray-300 bg-[#f7f7f8]">
                {gameState.players.map((pid, idx) => {
                  const n = gameState.players.length;
                  const angle = (-90 + (360 / n) * idx) * (Math.PI / 180);
                  const x = 50 + 42 * Math.cos(angle);
                  const y = 50 + 42 * Math.sin(angle);
                  const isOpen = openSeatIds.includes(pid);
                  const isCurrent = gameState.currentPlayerId === pid;
                  return (
                    <div
                      key={pid}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2.5 py-1.5 text-xs shadow-sm ${
                        isCurrent ? 'border-black bg-black text-white' : 'border-gray-300 bg-white text-black'
                      }`}
                      style={{ left: `${x}%`, top: `${y}%` }}
                    >
                      <div className="font-medium">
                        {isOpen ? 'Open Seat' : displayName(pid)}
                      </div>
                      <div className="text-[10px] opacity-80">
                        {isOpen ? '' : `${gameState.hands[pid]?.length ?? 0} cards`}
                        {pid === gameState.hostId ? ' • Host' : ''}
                        {pid === gameState.bidderId ? ' • Bidder' : ''}
                        {gameState.partnerPlayerIds.includes(pid) ? ' • Partner' : ''}
                      </div>
                    </div>
                  );
                })}

                <div className="absolute left-1/2 top-1/2 w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-300 bg-white p-3 shadow-sm">
                  <div className="mb-2 text-center text-xs text-gray-600">
                    {lastCompletedTrick
                      ? `Last trick: ${displayName(lastCompletedTrick.winnerId || '')} won ${lastCompletedTrick.points ?? 0} pts`
                      : 'No completed tricks yet'}
                  </div>
                  <div className="flex min-h-28 flex-wrap items-center justify-center gap-2">
                    {trickInProgress?.plays?.length ? (
                      trickInProgress.plays.map((play) => (
                        <div key={`${play.playerId}-${play.card.id}`} className="text-center">
                          {renderCard(play.card, false, true)}
                          <div className="mt-1 text-[10px] text-gray-700">{displayName(play.playerId)}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-gray-600">No active trick yet</div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                  {testMode ? `${displayName(playerId)} Hand` : 'Your Hand'}
                </h3>
                {gameState.phase === 'playing' && (
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${isMyTurn ? 'bg-black text-white' : 'bg-gray-300 text-black'}`}>
                    {isMyTurn ? 'Your Turn' : `Waiting for ${gameState.currentPlayerId ? displayName(gameState.currentPlayerId) : '-'}`}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <div className="flex min-w-max items-center gap-4 pb-1">
                  {groupedMyHand.map((group) => (
                    <div key={group.suit} className="inline-flex items-center gap-2">
                      <span className="rounded-full border border-gray-300 bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                        {group.suit}
                      </span>
                      <div className="flex items-center gap-2">
                        {group.cards.map((card) => renderCard(card, true))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {isMyTurn && gameState.phase === 'playing' && (
                <div className="mt-3">
                  <button
                    onClick={() => {
                      const leadingSuit = trickInProgress?.plays[0]?.card.suit || null;
                      const hasLeadingSuit = leadingSuit ? sortedMyHand.some((c) => c.suit === leadingSuit) : false;
                      const playableCards = leadingSuit && hasLeadingSuit ? sortedMyHand.filter((c) => c.suit === leadingSuit) : sortedMyHand;
                      if (selectedCard && playableCards.some((c) => c.id === selectedCard)) {
                        sendAction('play_card', { cardId: selectedCard });
                        setSelectedCard(null);
                      }
                    }}
                    disabled={!selectedCard}
                    className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:bg-gray-400"
                  >
                    Play Selected Card
                  </button>
                </div>
              )}
            </section>

            <section className="max-h-60 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              {gameState.phase === 'lobby' && (
                <div className="space-y-3">
                  <h2 className="text-base font-semibold">Lobby</h2>
                  <p className="text-sm">Joined: {joinedCount}/{gameState.maxPlayers}</p>
                  {isHost ? (
                    <button
                      onClick={() => sendAction('start_game', {})}
                      disabled={openSeatIds.length > 0}
                      className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:bg-gray-400"
                    >
                      Start Game
                    </button>
                  ) : (
                    <p className="text-sm text-gray-700">Waiting for host to start.</p>
                  )}
                </div>
              )}

              {gameState.phase === 'bidding' && (
                <div className="space-y-2 text-sm">
                  <h2 className="text-base font-semibold">Bidding</h2>
                  <p>Current high bid: {currentHighBid ?? `None (min ${minBid})`}</p>
                  <p>Turn: {gameState.currentPlayerId ? displayName(gameState.currentPlayerId) : '-'}</p>
                  {isMyTurn ? (
                    <div className="space-y-2">
                      <input
                        type="number"
                        value={bidAmount || ''}
                        onChange={(e) => setBidAmount(e.target.value === '' ? 0 : Number(e.target.value))}
                        min={currentHighBid ? currentHighBid + 5 : minBid}
                        step={5}
                        className="w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-black"
                        placeholder={`Min ${currentHighBid ? currentHighBid + 5 : minBid}`}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (!bidAmount || bidAmount === 0) {
                              alert(`Please enter a bid amount. Minimum is ${currentHighBid ? currentHighBid + 5 : minBid}`);
                              return;
                            }
                            sendAction('bid', { amount: bidAmount });
                            setBidAmount(0);
                          }}
                          className="flex-1 rounded-lg bg-black px-3 py-2 font-medium text-white"
                        >
                          Bid
                        </button>
                        <button
                          onClick={() => sendAction('bid', { amount: null })}
                          className="flex-1 rounded-lg bg-gray-600 px-3 py-2 font-medium text-white"
                        >
                          Pass
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-700">Waiting for your turn…</p>
                  )}
                </div>
              )}

              {gameState.phase === 'choose_trump_and_partners' && gameState.bidderId === playerId && (
                <div className="space-y-3 text-sm">
                  <h2 className="text-base font-semibold">Choose Trump & Partner Card(s)</h2>
                  <div>
                    <label className="mb-1 block font-medium">Trump suit</label>
                    <select
                      value={trumpSuit}
                      onChange={(e) => setTrumpSuit(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-black"
                    >
                      <option value="">Select...</option>
                      <option value="♠">♠ Spades</option>
                      <option value="♥">♥ Hearts</option>
                      <option value="♦">♦ Diamonds</option>
                      <option value="♣">♣ Clubs</option>
                    </select>
                  </div>

                  {Array.from({ length: requiredPartners }).map((_, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2">
                      <select
                        value={partnerSelections[i].suit}
                        onChange={(e) =>
                          setPartnerSelections((prev) =>
                            prev.map((p, idx) => (idx === i ? { ...p, suit: e.target.value as Suit | '' } : p))
                          )
                        }
                        className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-black"
                      >
                        <option value="">Suit</option>
                        {suitOptions.map((suit) => (
                          <option key={suit} value={suit}>
                            {suit}
                          </option>
                        ))}
                      </select>
                      <select
                        value={partnerSelections[i].rank}
                        onChange={(e) =>
                          setPartnerSelections((prev) =>
                            prev.map((p, idx) => (idx === i ? { ...p, rank: e.target.value as Rank | '' } : p))
                          )
                        }
                        className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-black"
                      >
                        <option value="">Rank</option>
                        {rankOptions.map((rank) => (
                          <option key={rank} value={rank}>
                            {rank}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}

                  <button
                    onClick={() =>
                      sendAction('set_trump_and_partners', {
                        trumpSuit,
                        partnerCards: selectedPartnerCards,
                      })
                    }
                    disabled={!trumpSuit || !partnerSelectionValid}
                    className="w-full rounded-lg bg-black px-3 py-2 font-medium text-white disabled:bg-gray-400"
                  >
                    Confirm Trump & Partners
                  </button>
                </div>
              )}

              {gameState.phase === 'scoring' && gameState.bidderId === playerId && (
                <button
                  onClick={() => sendAction('calculate_scores', {})}
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
                >
                  Calculate Scores
                </button>
              )}

              {gameState.phase === 'finished' && isHost && (
                <button
                  onClick={() => sendAction('restart_game', {})}
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
                >
                  Restart (New Hand)
                </button>
              )}
            </section>

            {testMode && (
              <div className="rounded-xl border border-gray-400 bg-gray-100 p-3 text-sm">
                <strong>Test Mode:</strong> You can switch active player from header.
              </div>
            )}
          </div>

          <aside className="h-full rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
            <h2 className="mb-3 text-base font-semibold">Leaderboard</h2>
            {showLeaderboardTotals ? (
              <div className="space-y-2">
                {gameState.players.map((pid) => {
                  const totalPoints = gameState.runningScores?.[pid] ?? gameState.scores?.[pid] ?? 0;
                  return (
                    <div key={pid} className="rounded-lg border border-gray-200 p-2 text-sm">
                      <div className="font-medium">
                        {displayName(pid)}
                        {pid === playerId ? ' (You)' : ''}
                      </div>
                      <div className="text-xs text-gray-700">Total points: {totalPoints}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-600">
                Total points appear here after all tricks are over.
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
