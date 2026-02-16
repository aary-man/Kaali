'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

export default function Home() {
  const [username, setUsername] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [numPlayers, setNumPlayers] = useState<number>(5);
  const [turnTimeSeconds, setTurnTimeSeconds] = useState<number>(30);
  const [minimumBid, setMinimumBid] = useState<number>(75);
  const [isCreating, setIsCreating] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const router = useRouter();

  const minimumAllowedBid = numPlayers === 5 ? 75 : 150;

  useEffect(() => {
    let mounted = true;

    const initializeSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setIsAuthLoading(false);

      const suggestedName =
        data.session?.user?.user_metadata?.full_name ||
        data.session?.user?.user_metadata?.name ||
        data.session?.user?.email?.split('@')[0] ||
        '';
      if (suggestedName && !username.trim()) {
        setUsername(String(suggestedName));
      }
    };

    void initializeSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      const suggestedName =
        nextSession?.user?.user_metadata?.full_name ||
        nextSession?.user?.user_metadata?.name ||
        nextSession?.user?.email?.split('@')[0] ||
        '';
      if (suggestedName && !username.trim()) {
        setUsername(String(suggestedName));
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [username]);

  const handleGoogleSignIn = async () => {
    setIsAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) {
        alert(`Google sign-in failed: ${error.message}`);
      }
    } catch (error) {
      alert(`Google sign-in failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setIsAuthBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        alert(`Sign out failed: ${error.message}`);
      }
    } catch (error) {
      alert(`Sign out failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAuthBusy(false);
    }
  };

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
          authUserId: session?.user?.id ?? null,
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
          body: JSON.stringify({
            username,
            authUserId: session?.user?.id ?? null,
          }),
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

        <div className="mb-6 rounded-md border border-gray-200 p-4">
          <h2 className="mb-2 text-sm font-semibold text-black">Account</h2>
          {isAuthLoading ? (
            <p className="text-sm text-gray-700">Checking login status...</p>
          ) : session?.user ? (
            <div className="space-y-2">
              <p className="text-sm text-black">
                Signed in as <span className="font-medium">{session.user.email ?? 'Google user'}</span>
              </p>
              <p className="text-xs text-gray-600">Use the dedicated /history page to view your full analytics dashboard.</p>
              <Link
                href="/history"
                className="block w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-center text-sm font-semibold text-black transition-colors hover:bg-gray-50"
              >
                Open History Dashboard
              </Link>
              <button
                onClick={handleSignOut}
                disabled={isAuthBusy}
                className="w-full rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-900 disabled:bg-gray-400"
              >
                {isAuthBusy ? 'Signing out...' : 'Sign Out'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-700">Sign in with Google to unlock game history and stats.</p>
              <button
                onClick={handleGoogleSignIn}
                disabled={isAuthBusy}
                className="w-full rounded-md bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-900 disabled:bg-gray-400"
              >
                {isAuthBusy ? 'Redirecting...' : 'Continue with Google'}
              </button>
              <p className="text-xs text-gray-600">You can still create/join games as a guest without signing in.</p>
            </div>
          )}
        </div>

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
