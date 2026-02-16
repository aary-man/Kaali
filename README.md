# Kaali ki Raani

An online multiplayer card game built with Next.js, React, Tailwind CSS, and Supabase.

## Game Rules

- **Players**: 5-7 players required
- **Decks**: 
  - 5 players: 1 deck (remove 2♥ and 2♦)
  - 6-7 players: 2 decks (remove cards starting from 2s, 3s, 4s, etc. until you have exactly `players × 10` cards. Never remove 5s.)
- **Scoring**: Aces = 15, 10s = 10, 5s = 5, Queen of Spades = 30, others = 0
- **Total Points**: 150 (1 deck) or 300 (2 decks)
- **Bidding**: Minimum bid is half the total points, increments of 5
- **Partners**: Hidden until partner card is played
- **Tricks**: Follow suit if possible, trump beats all non-trump

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Project Settings → API
3. Copy your Project URL and anon/public key
4. Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Set Up Database Schema

1. Go to your Supabase project SQL Editor
2. Copy and paste the contents of `supabase-schema.sql`
3. Run the SQL script to create all tables, indexes, and RLS policies

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
card-partner-game/
├── app/
│   ├── api/
│   │   └── games/          # API routes for game actions
│   ├── game/[id]/          # Game room page
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Landing page
├── lib/
│   ├── game/                # Core game engine
│   │   ├── types.ts         # TypeScript types
│   │   ├── deck.ts          # Deck building logic
│   │   ├── rules.ts         # Game rules and validation
│   │   └── gameState.ts     # Game state management
│   └── supabase/            # Supabase client
│       ├── client.ts
│       └── types.ts
└── supabase-schema.sql      # Database schema
```

## Features

- ✅ Complete game engine with all rules implemented
- ✅ Deck building for 5-7 players
- ✅ Bidding system
- ✅ Partner selection
- ✅ Trick-taking gameplay
- ✅ Scoring calculation
- ✅ Supabase integration for persistence
- ✅ Basic UI for all game phases

## Next Steps / Improvements

- [ ] Implement proper authentication with Supabase Auth
- [ ] Add real-time updates using Supabase Realtime subscriptions
- [ ] Create a lobby system for players to join before game starts
- [ ] Improve UI/UX with better card visuals and animations
- [ ] Add game history and statistics
- [ ] Implement multiple rounds/hands per game session
- [ ] Add sound effects and better visual feedback
- [ ] Mobile-responsive design improvements

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## License

MIT
