'use client';

import Link from 'next/link';
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
  const [joinUsername, setJoinUsername] = useState('');
  const [joiningSeatId, setJoiningSeatId] = useState<string | null>(null);

  useEffect(() => {
    const storedPlayerId = localStorage.getItem('playerId');
    if (storedPlayerId) {
      setPlayerId(storedPlayerId);
    }
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      setJoinUsername(storedUsername);
    }

    // Fetch game state
    fetchGameState();

    // Set up real-time subscription (simplified - in production use Supabase Realtime)
    const interval = setInterval(fetchGameState, 2000);
    return () => clearInterval(interval);
  }, [gameId]);

// Don't auto-assign playerId so users can choose a seat (join view when not in game)

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

  const handleJoinSeat = async (seatId: string) => {
    const username = joinUsername.trim() || undefined;
    if (!username) {
      alert('Please enter your name first.');
      return;
    }
    if (!gameId || gameId === 'undefined') {
      alert('Invalid game.');
      return;
    }
    setJoiningSeatId(seatId);
    try {
      const res = await fetch(`/api/games/${gameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, seatId }),
      });
      const rawText = await res.text();
      let data: { playerId?: string; error?: string; details?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        alert(`Join failed (${res.status}): ${rawText?.slice(0, 150) || 'Empty response'}`);
        return;
      }
      if (!res.ok || !data.playerId) {
        const errorMsg = typeof data.error === 'string' ? data.error : 'Failed to join game';
        const details = typeof data.details === 'string' ? data.details : '';
        alert([errorMsg, details].filter(Boolean).join('\n\n'));
        return;
      }
      localStorage.setItem('playerId', data.playerId);
      localStorage.setItem('username', username);
      setPlayerId(data.playerId);
      setJoiningSeatId(null);
      await fetchGameState();
    } catch (error) {
      alert(`Failed to join: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setJoiningSeatId(null);
    }
  };

  const isInGame = !!playerId && gameState?.players.includes(playerId);
  const showJoinView =
    !!gameState &&
    gameState.phase === 'lobby' &&
    (!playerId || !gameState.players.includes(playerId));

  if (!gameState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#141414] text-gray-100">
        <div className="text-xl">Loading game...</div>
      </div>
    );
  }

  if (showJoinView) {
    const openSeatIdsJoin = gameState.openSeatIds ?? [];
    return (
      <div className="min-h-dvh overflow-y-auto overflow-x-hidden bg-[#141414] p-4 text-gray-100 scrollbar-dark">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-2xl border border-[#2b2b2b] bg-[#1b1b1b] p-4">
            <h1 className="mb-2 text-xl font-semibold">Join this game</h1>
            <p className="mb-4 text-sm text-gray-400">
              Enter your name and click an open seat at the table to sit there.
            </p>
            <label className="mb-2 block text-sm font-medium text-gray-300">Your name</label>
            <input
              type="text"
              value={joinUsername}
              onChange={(e) => setJoinUsername(e.target.value)}
              placeholder="Enter your name"
              className="mb-4 w-full rounded-lg border border-gray-600 bg-[#111] px-3 py-2 text-gray-100 placeholder-gray-500"
            />
            <Link
              href="/"
              className="inline-block rounded-md border border-gray-500 bg-[#111] px-3 py-1.5 text-sm font-medium text-gray-100 hover:bg-[#1a1a1a]"
            >
              ← Back to home
            </Link>
          </div>
          <section className="rounded-2xl border border-[#2b2b2b] bg-[#1b1b1b] p-2 shadow-sm">
            <h2 className="mb-2 text-center text-base font-semibold text-gray-100">Table — click a seat to join</h2>
            <div className="relative mx-auto w-full max-w-[940px]">
              <div
                className="relative w-full rounded-[50%] p-[18px]"
                style={{
                  aspectRatio: '2.2 / 1',
                  background: 'linear-gradient(145deg, #3d2817 0%, #2a1810 40%, #1a0f08 100%)',
                  boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.3), 0 6px 20px rgba(0,0,0,0.4)',
                }}
              >
                <div
                  className="relative h-full w-full rounded-[50%] overflow-hidden"
                  style={{
                    background: 'radial-gradient(ellipse 80% 70% at 50% 45%, #2d8b4e 0%, #247a3d 25%, #1a5c2e 60%, #0f3d1f 100%)',
                    boxShadow: 'inset 0 2px 8px rgba(255,255,255,0.06), inset 0 -2px 6px rgba(0,0,0,0.2)',
                  }}
                >
                  {gameState.players.map((pid, idx) => {
                    const n = gameState.players.length;
                    const angle = (-90 + (360 / n) * idx) * (Math.PI / 180);
                    const radiusX = 44;
                    const radiusY = 36;
                    const x = 50 + radiusX * Math.cos(angle);
                    const y = 50 + radiusY * Math.sin(angle);
                    const isOpen = openSeatIdsJoin.includes(pid);
                    const isClaiming = joiningSeatId === pid;
                    return (
                      <div
                        key={pid}
                        role="button"
                        tabIndex={0}
                        onClick={() => isOpen && handleJoinSeat(pid)}
                        onKeyDown={(e) => isOpen && (e.key === 'Enter' || e.key === ' ') && handleJoinSeat(pid)}
                        className={`absolute flex h-[62px] w-[182px] -translate-x-1/2 -translate-y-1/2 flex-col justify-center rounded-lg border-2 px-3 py-2 text-xs shadow-md ${
                          isOpen
                            ? 'cursor-pointer border-amber-500/80 bg-amber-900/40 text-amber-100 hover:border-amber-400 hover:bg-amber-800/50'
                            : 'border-[#5c4a3a] bg-[#3d2817] text-gray-100'
                        } ${isClaiming ? 'animate-pulse opacity-80' : ''}`}
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          boxShadow: isOpen ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.4)',
                        }}
                      >
                        <div className="truncate text-center font-semibold">
                          {isOpen ? (isClaiming ? 'Joining…' : 'Click to join') : gameState.playerNames?.[pid] ?? `Seat ${idx + 1}`}
                        </div>
                        <div className="truncate text-center text-[10px] opacity-90">
                          {isOpen ? 'Open seat' : 'Taken'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!playerId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#141414] text-gray-100">
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
  const showActionPanel =
    gameState.phase === 'lobby' ||
    gameState.phase === 'bidding' ||
    (gameState.phase === 'choose_trump_and_partners' && gameState.bidderId === playerId) ||
    (gameState.phase === 'scoring' && gameState.bidderId === playerId) ||
    (gameState.phase === 'finished' && isHost);

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
        className={`relative rounded-md border bg-white shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition ${
          compact ? 'h-20 w-14 p-1.5' : 'h-28 w-18 p-2'
        } ${
          clickable && isMyTurn && isPlayable
            ? 'cursor-pointer hover:-translate-y-1 hover:border-gray-500'
            : clickable && isMyTurn && !isPlayable
            ? 'cursor-not-allowed opacity-45'
            : ''
        } ${selectedCard === card.id ? 'border-black ring-2 ring-gray-400' : 'border-gray-300'}`}
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
  const gameCodeDisplay = gameState.gameCode ?? gameId;
  return (
    <div className="min-h-dvh overflow-y-auto overflow-x-hidden bg-[#141414] p-1 text-gray-100 lg:p-2 scrollbar-dark">
      <div className="mx-auto min-h-dvh max-w-7xl">
        <div className="grid gap-1.5 lg:grid-cols-[1fr_320px] lg:items-start lg:gap-2">
          <div className="flex flex-col gap-1.5 lg:gap-2">
            <div className="rounded-2xl border border-[#2b2b2b] bg-[#1b1b1b] p-2.5 shadow-sm lg:p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h1 className="text-lg font-semibold lg:text-xl">Game {gameCodeDisplay} · Hand {gameState.handNumber ?? 1}</h1>
                  <p className="text-sm text-gray-300">Code: {gameCodeDisplay}</p>
                  <p className="text-sm text-gray-300">
                    {gameState.maxPlayers} players · {gameState.turnTimeSeconds}s turn · min bid {gameState.minimumBid}
                  </p>
                  <p className="text-sm text-gray-300">
                    Phase: <span className="font-medium uppercase">{gameState.phase}</span>
                    {gameState.trumpSuit ? ` • Trump ${gameState.trumpSuit}` : ''}
                    {gameState.winningBid ? ` • Bid ${gameState.winningBid.amount}` : ''}
                  </p>
                  {amSelectedPartner && !amRevealedPartner && (
                    <p className="inline-block rounded-full border border-gray-600 bg-[#2a2a2a] px-3 py-1 text-xs font-medium text-gray-100">
                      You are a partner (hidden until you play the called card)
                    </p>
                  )}
                  {amRevealedPartner && (
                    <p className="inline-block rounded-full border border-white bg-white px-3 py-1 text-xs font-medium text-black">
                      You are a revealed partner
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/history"
                    className="rounded-md border border-gray-500 bg-[#111] px-3 py-1 text-sm font-semibold text-gray-100 hover:bg-[#1a1a1a]"
                  >
                    Dashboard
                  </Link>
                  <button
                    onClick={() => setTestMode(!testMode)}
                    className={`rounded-md px-3 py-1 text-sm font-semibold ${
                      testMode ? 'bg-white text-black' : 'bg-[#2f2f2f] text-gray-100'
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
                      className="rounded-md border border-gray-600 bg-[#111] px-2 py-1 text-sm text-gray-100"
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

            {gameState.phase === 'finished' && gameState.scores && gameState.bidderId && (
              <div className="rounded-2xl border-2 border-[#3a3a3a] bg-[#1b1b1b] p-4 shadow-lg lg:p-5">
                <h2 className="mb-4 text-center text-xl font-bold text-white">Hand results</h2>
                {(() => {
                  const teamWon = (gameState.scores[gameState.bidderId] ?? 0) > 0;
                  const bidderName = displayName(gameState.bidderId);
                  const partnerNames = (gameState.partnerPlayerIds ?? []).map((pid) => displayName(pid));
                  return (
                    <>
                      <div
                        className={`mb-4 rounded-xl px-4 py-3 text-center text-lg font-semibold ${
                          teamWon ? 'bg-emerald-900/60 text-emerald-100' : 'bg-red-900/50 text-red-100'
                        }`}
                      >
                        {teamWon ? (
                          <>The bidder team won!</>
                        ) : (
                          <>The bidder team lost.</>
                        )}
                      </div>
                      <p className="mb-4 text-center text-sm text-gray-300">
                        <span className="font-medium text-white">{bidderName}</span>
                        {partnerNames.length > 0 && (
                          <> and partner{partnerNames.length > 1 ? 's' : ''} {partnerNames.join(', ')}</>
                        )}
                      </p>
                      <div className="space-y-2 rounded-lg border border-[#2b2b2b] bg-[#111] p-3">
                        <div className="grid grid-cols-3 gap-2 border-b border-gray-700 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                          <span>Player</span>
                          <span className="text-right">This hand</span>
                          <span className="text-right">Total points</span>
                        </div>
                        {gameState.players.map((pid) => {
                          const delta = gameState.scores?.[pid] ?? 0;
                          const total = gameState.runningScores?.[pid] ?? 0;
                          return (
                            <div
                              key={pid}
                              className="grid grid-cols-3 gap-2 text-sm"
                            >
                              <span className="font-medium text-gray-100">
                                {displayName(pid)}
                                {pid === playerId ? ' (You)' : ''}
                              </span>
                              <span className={`text-right font-medium ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {delta >= 0 ? '+' : ''}{delta}
                              </span>
                              <span className="text-right text-gray-300">{total}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {gameState.trumpSuit && gameState.partnerCards?.length > 0 && (
              <div className="rounded-xl border-2 border-amber-500/80 bg-gradient-to-r from-amber-900/90 to-amber-800/90 px-4 py-3 shadow-lg">
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-center">
                  <span className="text-sm font-medium uppercase tracking-wide text-amber-200">Trump</span>
                  <span className="text-2xl font-bold text-white drop-shadow-sm">{gameState.trumpSuit}</span>
                  <span className="text-amber-300/80">·</span>
                  <span className="text-sm font-medium uppercase tracking-wide text-amber-200">Partner card{gameState.partnerCards.length > 1 ? 's' : ''}</span>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {gameState.partnerCards.map((pc, i) => (
                      <span
                        key={`${pc.rank}-${pc.suit}-${i}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-400/60 bg-black/30 px-3 py-1.5 text-lg font-bold text-white"
                      >
                        <span className={pc.suit === '♥' || pc.suit === '♦' ? 'text-red-400' : 'text-gray-100'}>{pc.rank}</span>
                        <span className={pc.suit === '♥' || pc.suit === '♦' ? 'text-red-400' : 'text-gray-100'}>{pc.suit}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {trickJustEnded && currentTrick?.winnerId && (
              <div className="rounded-xl border border-[#2b2b2b] bg-[#1f1f1f] px-4 py-2 text-sm font-medium">
                Trick ended: {displayName(currentTrick.winnerId)} won {currentTrick.points ?? 0} points.
              </div>
            )}

            <section className="rounded-2xl border border-[#2b2b2b] bg-[#1b1b1b] p-2 shadow-sm lg:p-2.5">
              <h2 className="mb-2 text-center text-base font-semibold text-gray-100">Table</h2>

              {/* Poker Now style: oval table with dark rail and green felt */}
              <div className="relative mx-auto w-full max-w-[940px]">
                <div
                  className="relative w-full rounded-[50%] p-[18px] shadow-[inset_0_0_20px_rgba(0,0,0,0.4),0_4px_12px_rgba(0,0,0,0.5)]"
                  style={{
                    aspectRatio: '2.2 / 1',
                    background: 'linear-gradient(145deg, #3d2817 0%, #2a1810 40%, #1a0f08 100%)',
                    boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.3), 0 6px 20px rgba(0,0,0,0.4)',
                  }}
                >
                  {/* Green felt oval */}
                  <div
                    className="relative h-full w-full rounded-[50%] overflow-hidden"
                    style={{
                      background: 'radial-gradient(ellipse 80% 70% at 50% 45%, #2d8b4e 0%, #247a3d 25%, #1a5c2e 60%, #0f3d1f 100%)',
                      boxShadow: 'inset 0 2px 8px rgba(255,255,255,0.06), inset 0 -2px 6px rgba(0,0,0,0.2)',
                    }}
                  >
                    {gameState.players.map((pid, idx) => {
                      const n = gameState.players.length;
                      const angle = (-90 + (360 / n) * idx) * (Math.PI / 180);
                      const radiusX = 44;
                      const radiusY = 36;
                      const x = 50 + radiusX * Math.cos(angle);
                      const y = 50 + radiusY * Math.sin(angle);
                      const isOpen = openSeatIds.includes(pid);
                      const isCurrent = gameState.currentPlayerId === pid;
                      return (
                        <div
                          key={pid}
                          role={isOpen ? 'button' : undefined}
                          tabIndex={isOpen ? 0 : undefined}
                          onClick={
                            isOpen && gameState.phase === 'lobby'
                              ? () => sendAction('claim_seat', { seatId: pid })
                              : undefined
                          }
                          onKeyDown={
                            isOpen && gameState.phase === 'lobby'
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    sendAction('claim_seat', { seatId: pid });
                                  }
                                }
                              : undefined
                          }
                          className={`absolute flex h-[62px] w-[182px] -translate-x-1/2 -translate-y-1/2 flex-col justify-center rounded-lg border-2 px-3 py-2 text-xs shadow-md ${
                            isCurrent
                              ? 'border-amber-400 bg-amber-50 text-black ring-2 ring-amber-400/50'
                              : isOpen
                                ? 'cursor-pointer border-amber-500/70 bg-[#2a1810] text-amber-200/90 hover:border-amber-400 hover:bg-[#3d2817]'
                                : 'border-[#5c4a3a] bg-[#3d2817] text-gray-100'
                          }`}
                          style={{
                            left: `${x}%`,
                            top: `${y}%`,
                            boxShadow: isCurrent ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.4)',
                          }}
                        >
                          <div className="truncate text-center font-semibold">
                            {isOpen ? 'Open — click to sit' : displayName(pid)}
                          </div>
                          <div className="truncate text-center text-[10px] opacity-90">
                            {isOpen ? 'Waiting for player' : `${gameState.hands[pid]?.length ?? 0} cards`}
                            {pid === gameState.hostId ? ' • Host' : ''}
                            {pid === gameState.bidderId ? ' • Bidder' : ''}
                            {gameState.partnerPlayerIds.includes(pid) ? ' • Partner' : ''}
                          </div>
                        </div>
                      );
                    })}

                    {/* Center: current trick */}
                    <div
                      className="absolute left-1/2 top-1/2 w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#1a3d1a] bg-[#0a1f0a]/95 p-4 shadow-lg backdrop-blur-sm"
                      style={{ boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.3)' }}
                    >
                      <div className="mb-2 text-center text-xs text-green-200/90">
                        {lastCompletedTrick
                          ? `Last trick: ${displayName(lastCompletedTrick.winnerId || '')} won ${lastCompletedTrick.points ?? 0} pts`
                          : 'No completed tricks yet'}
                      </div>
                      <div className="flex min-h-24 flex-wrap items-center justify-center gap-2">
                        {trickInProgress?.plays?.length ? (
                          trickInProgress.plays.map((play) => (
                            <div key={`${play.playerId}-${play.card.id}`} className="text-center">
                              {renderCard(play.card, false, true)}
                              <div className="mt-1 text-[10px] text-green-100">{displayName(play.playerId)}</div>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-green-300/80">No active trick yet</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[#2b2b2b] bg-[#1b1b1b] p-2.5 shadow-sm lg:p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-200">
                  {testMode ? `${displayName(playerId)} Hand` : 'Your Hand'}
                </h3>
                {gameState.phase === 'playing' && (
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${isMyTurn ? 'bg-white text-black' : 'bg-[#2f2f2f] text-gray-100'}`}>
                    {isMyTurn ? 'Your Turn' : `Waiting for ${gameState.currentPlayerId ? displayName(gameState.currentPlayerId) : '-'}`}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <div className="flex min-w-max items-center gap-4 pb-1">
                  {groupedMyHand.map((group) => (
                    <div key={group.suit} className="inline-flex items-center gap-2">
                      <span className="rounded-full border border-gray-600 bg-[#2a2a2a] px-2 py-1 text-xs font-medium text-gray-100">
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
                    className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:bg-gray-500 disabled:text-gray-200"
                  >
                    Play Selected Card
                  </button>
                </div>
              )}
            </section>

            {showActionPanel && (
            <section className="max-h-48 overflow-y-auto rounded-2xl border border-[#2b2b2b] bg-[#1b1b1b] p-2.5 shadow-sm lg:max-h-52 lg:p-3">
              {gameState.phase === 'lobby' && (
                <div className="space-y-3">
                  <h2 className="text-base font-semibold">Lobby</h2>
                  <p className="text-sm text-gray-200">Joined: {joinedCount}/{gameState.maxPlayers}</p>
                  {isHost ? (
                    <button
                      onClick={() => sendAction('start_game', {})}
                      disabled={openSeatIds.length > 0}
                      className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:bg-gray-500 disabled:text-gray-200"
                    >
                      Start Game
                    </button>
                  ) : (
                    <p className="text-sm text-gray-300">Waiting for host to start.</p>
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
                        className="w-full rounded-md border border-gray-600 bg-[#111] px-3 py-2 text-gray-100"
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
                          className="flex-1 rounded-lg bg-white px-3 py-2 font-medium text-black"
                        >
                          Bid
                        </button>
                        <button
                          onClick={() => sendAction('bid', { amount: null })}
                          className="flex-1 rounded-lg bg-[#2f2f2f] px-3 py-2 font-medium text-gray-100"
                        >
                          Pass
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-300">Waiting for your turn…</p>
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
                    className="w-full rounded-lg border border-gray-600 bg-[#111] px-3 py-2 text-gray-100"
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
                      <div>
                        <label className="mb-1 block font-medium">
                          Partner {requiredPartners > 1 ? `${i + 1} ` : ''}suit
                        </label>
                        <select
                          value={partnerSelections[i].suit}
                          onChange={(e) =>
                            setPartnerSelections((prev) =>
                              prev.map((p, idx) => (idx === i ? { ...p, suit: e.target.value as Suit | '' } : p))
                            )
                          }
                          className="w-full rounded-lg border border-gray-600 bg-[#111] px-2 py-2 text-gray-100"
                        >
                          <option value="">Select suit</option>
                          {suitOptions.map((suit) => (
                            <option key={suit} value={suit}>
                              {suit}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block font-medium">
                          Partner {requiredPartners > 1 ? `${i + 1} ` : ''}card
                        </label>
                        <select
                          value={partnerSelections[i].rank}
                          onChange={(e) =>
                            setPartnerSelections((prev) =>
                              prev.map((p, idx) => (idx === i ? { ...p, rank: e.target.value as Rank | '' } : p))
                            )
                          }
                          className="w-full rounded-lg border border-gray-600 bg-[#111] px-2 py-2 text-gray-100"
                        >
                          <option value="">Select rank</option>
                          {rankOptions.map((rank) => (
                            <option key={rank} value={rank}>
                              {rank}
                            </option>
                          ))}
                        </select>
                      </div>
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
                    className="w-full rounded-lg bg-white px-3 py-2 font-medium text-black disabled:bg-gray-500 disabled:text-gray-200"
                  >
                    Confirm Trump & Partners
                  </button>
                </div>
              )}

              {gameState.phase === 'scoring' && gameState.bidderId === playerId && (
                <button
                  onClick={() => sendAction('calculate_scores', {})}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
                >
                  Calculate Scores
                </button>
              )}

              {gameState.phase === 'finished' && isHost && (
                <button
                  onClick={() => sendAction('restart_game', {})}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
                >
                  Restart (New Hand)
                </button>
              )}
            </section>
            )}

            {testMode && (
              <div className="rounded-xl border border-gray-600 bg-[#1f1f1f] p-3 text-sm text-gray-100">
                <strong>Test Mode:</strong> You can switch active player from header.
              </div>
            )}
          </div>

          <aside className="flex flex-col rounded-2xl border border-[#2b2b2b] bg-[#1b1b1b] p-2.5 shadow-sm lg:p-3">
            <h2 className="mb-3 text-base font-semibold">Leaderboard</h2>
            <div className="space-y-2">
              {gameState.players.map((pid) => {
                const totalPoints = gameState.runningScores?.[pid] ?? gameState.scores?.[pid] ?? 0;
                return (
                  <div key={pid} className="rounded-lg border border-gray-700 bg-[#111] p-2 text-sm">
                    <div className="font-medium">
                      {displayName(pid)}
                      {pid === playerId ? ' (You)' : ''}
                    </div>
                    <div className="text-xs text-gray-300">
                      Total points: {showLeaderboardTotals ? totalPoints : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
            {!showLeaderboardTotals && (
              <div className="mt-2 text-xs text-gray-400">
                Totals update after the 10th trick is scored.
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
