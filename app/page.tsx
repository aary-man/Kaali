'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [username, setUsername] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [numPlayers, setNumPlayers] = useState<number>(5);
  const [turnTimeSeconds, setTurnTimeSeconds] = useState<number>(30);
  const [minimumBid, setMinimumBid] = useState<number>(75);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const minimumAllowedBid = numPlayers === 5 ? 75 : 150;

  const handleCreateGame = async () => {
    if (!username.trim()) {
      alert('Please enter a username');
      return;
    }
    if (numPlayers < 5 || numPlayers > 7) {
      alert('Number of players must be between 5 and 7');
      return;
    }
    if (turnTimeSeconds < 10 || turnTimeSeconds > 300) {
      alert('Turn time must be between 10 and 300 seconds');
      return;
    }
    if (minimumBid < minimumAllowedBid || minimumBid % 5 !== 0) {
      alert(`Minimum bid must be at least ${minimumAllowedBid} and in increments of 5`);
      return;
    }

    setIsCreating(true);
    // For now, we'll use a simple player ID
    // In production, you'd authenticate with Supabase first
    const playerId = `player-${Date.now()}`;
    localStorage.setItem('playerId', playerId);
    localStorage.setItem('username', username);

    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: playerId,
          numPlayers,
          username,
          turnTimeSeconds,
          minimumBid,
        }),
      });

      const rawText = await res.text();
      let data: { game?: { id: string }; gameCode?: string; hostPlayerId?: string; error?: string; details?: string; hint?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        alert(`Server error (${res.status}): ${rawText?.slice(0, 150) || 'Empty response'}`);
        return;
      }

      if (!res.ok) {
        const errorMsg = typeof data.error === 'string' ? data.error : 'Failed to create game';
        const details = typeof data.details === 'string' ? data.details : '';
        const hint = typeof data.hint === 'string' ? data.hint : '';
        alert([errorMsg, details, hint].filter(Boolean).join('\n\n'));
        console.error('Create game failed:', res.status, rawText?.slice(0, 400));
        return;
      }

      if (data.game) {
        if (data.hostPlayerId) {
          localStorage.setItem('playerId', data.hostPlayerId);
        }
        const roomCode = data.gameCode || data.game.id;
        router.push(`/game/${roomCode}`);
      } else {
        alert('Unexpected response from server');
        console.error('Unexpected response:', data);
      }
    } catch (error) {
      console.error('Error creating game:', error);
      alert(`Failed to create game: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinGame = () => {
    if (!username.trim()) {
      alert('Please enter a username');
      return;
    }
    if (!gameCode.trim()) {
      alert('Please enter a game code');
      return;
    }

    void (async () => {
      try {
        const res = await fetch(`/api/games/${gameCode}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
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
        router.push(`/game/${gameCode}`);
      } catch (error) {
        alert(`Failed to join game: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    })();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-xl">
        <h1 className="mb-6 text-center text-3xl font-bold text-black">
          Kaali ki Raani
        </h1>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-black">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-4 py-2 text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Enter your username"
          />
        </div>

        <div className="mb-6 rounded-md border border-gray-200 p-4">
          <h2 className="mb-3 text-sm font-semibold text-black">Host Settings</h2>
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium text-black">Number of players</label>
            <select
              value={numPlayers}
              onChange={(e) => {
                const nextPlayers = Number(e.target.value);
                setNumPlayers(nextPlayers);
                const nextMinAllowed = nextPlayers === 5 ? 75 : 150;
                if (minimumBid < nextMinAllowed) {
                  setMinimumBid(nextMinAllowed);
                }
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
            >
              <option value={5}>5 players (1 deck)</option>
              <option value={6}>6 players (2 decks)</option>
              <option value={7}>7 players (2 decks)</option>
            </select>
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium text-black">Time allowed per turn (seconds)</label>
            <input
              type="number"
              min={10}
              max={300}
              step={5}
              value={turnTimeSeconds}
              onChange={(e) => setTurnTimeSeconds(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-black">Minimum bid</label>
            <input
              type="number"
              min={minimumAllowedBid}
              step={5}
              value={minimumBid}
              onChange={(e) => setMinimumBid(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
            />
            <p className="mt-1 text-xs text-black">
              Must be at least {minimumAllowedBid} and in increments of 5.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleCreateGame}
            disabled={isCreating}
            className="w-full rounded-md bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isCreating ? 'Creating...' : 'Create New Game'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-black">OR</span>
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-black">
              Game Code
            </label>
            <input
              type="text"
              value={gameCode}
              onChange={(e) => setGameCode(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-4 py-2 text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Enter game code"
            />
          </div>

          <button
            onClick={handleJoinGame}
            className="w-full rounded-md bg-green-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-green-700"
          >
            Join Game
          </button>
        </div>
      </div>
    </div>
  );
}
